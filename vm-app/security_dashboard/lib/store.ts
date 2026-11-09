import fs from "node:fs";
import path from "node:path";
import { HOST_IDS } from "./hosts";
import type { AgentReport, Delivery, HistoryPoint, HostEntry, HostState } from "./types";

// Ultimo reporte de cada maquina y un historial corto para las graficas.
// Se guarda en /data (volumen propio) para no perder el estado si el contenedor se reinicia.

const DATA_DIR = process.env.DATA_DIR ?? "/data";
const STATE_FILE = path.join(DATA_DIR, "state.json");
const HISTORY_POINTS = 240; // 2 horas con un reporte cada 30 s

export const REPORT_INTERVAL_S = 30;
const LATE_AFTER_S = 90;
const OFFLINE_AFTER_S = 180;

type State = {
  hosts: Record<string, HostEntry>;
  history: Record<string, HistoryPoint[]>;
  rejected: { at: string; ip: string; reason: string }[];
};

const globalRef = globalThis as unknown as { __stState?: State };

function load(): State {
  try {
    const parsed = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ STATE_FILE, "utf8")) as State;
    return { hosts: parsed.hosts ?? {}, history: parsed.history ?? {}, rejected: parsed.rejected ?? [] };
  } catch {
    return { hosts: {}, history: {}, rejected: [] };
  }
}

function state(): State {
  globalRef.__stState ??= load();
  return globalRef.__stState;
}

function persist() {
  try {
    fs.mkdirSync(/*turbopackIgnore: true*/ DATA_DIR, { recursive: true });
    const tmp = `${STATE_FILE}.tmp`;
    fs.writeFileSync(/*turbopackIgnore: true*/ tmp, JSON.stringify(state()));
    fs.renameSync(/*turbopackIgnore: true*/ tmp, STATE_FILE);
  } catch (err) {
    console.error("[store] no se pudo guardar el estado:", (err as Error).message);
  }
}

export function saveReport(report: AgentReport, delivery: Delivery) {
  const s = state();
  s.hosts[report.host] = { report, delivery };
  const drops = report.firewall.chains.reduce((sum, c) => sum + (c.dropped_packets || 0), 0);
  const point: HistoryPoint = {
    t: Date.parse(delivery.receivedAt),
    cpu: report.system.cpu_pct,
    mem: report.system.mem.total_mb ? Math.round((100 * report.system.mem.used_mb) / report.system.mem.total_mb) : 0,
    load: report.system.load[0] ?? 0,
    drops,
    checksOk: report.checks.filter((c) => c.ok).length,
    checksTotal: report.checks.length,
  };
  const series = (s.history[report.host] ??= []);
  series.push(point);
  if (series.length > HISTORY_POINTS) series.splice(0, series.length - HISTORY_POINTS);
  persist();
}

export function recordRejected(ip: string, reason: string) {
  const s = state();
  s.rejected.unshift({ at: new Date().toISOString(), ip, reason });
  s.rejected.splice(20);
  persist();
}

export function rejectedReports() {
  return state().rejected;
}

export function hostEntry(id: string): HostEntry | undefined {
  return state().hosts[id];
}

export function history(id: string): HistoryPoint[] {
  return state().history[id] ?? [];
}

export function ageSeconds(entry?: HostEntry): number | null {
  if (!entry) return null;
  return Math.max(0, Math.round((Date.now() - Date.parse(entry.delivery.receivedAt)) / 1000));
}

export function hostState(entry?: HostEntry): HostState {
  const age = ageSeconds(entry);
  if (age === null) return "never";
  if (age <= LATE_AFTER_S) return "online";
  if (age <= OFFLINE_AFTER_S) return "late";
  return "offline";
}

export function allHosts() {
  return HOST_IDS.map((id) => {
    const entry = hostEntry(id);
    return { id, entry, state: hostState(entry), age: ageSeconds(entry) };
  });
}

// Resumen global para la cabecera y la portada.
export function summary() {
  const hosts = allHosts();
  const reports = hosts.map((h) => h.entry?.report).filter(Boolean) as AgentReport[];
  const checks = reports.flatMap((r) => r.checks);
  const probes = reports.flatMap((r) => r.probes);
  const containers = reports.flatMap((r) => r.containers);
  const drops = reports.reduce(
    (sum, r) => sum + r.firewall.chains.reduce((s, c) => s + (c.dropped_packets || 0), 0),
    0,
  );
  const activity = (id: string) => hosts.find((h) => h.id === id)?.entry?.report.activity ?? {};
  return {
    hosts,
    online: hosts.filter((h) => h.state === "online").length,
    total: hosts.length,
    checksOk: checks.filter((c) => c.ok).length,
    checksTotal: checks.length,
    probesOk: probes.filter((p) => p.ok).length,
    probesTotal: probes.length,
    containersRunning: containers.filter((c) => c.status === "running").length,
    containersTotal: containers.length,
    drops,
    eventsSent: Number(activity("ingest").events_sent ?? 0),
    eventsProcessed: Number(activity("core").events_processed ?? 0),
    tokensIssued: Number(activity("auth").token_issued ?? 0),
    tokensDenied: Number(activity("auth").token_denied ?? 0),
    lastReport: hosts
      .map((h) => h.entry?.delivery.receivedAt)
      .filter(Boolean)
      .sort()
      .at(-1) as string | undefined,
  };
}
