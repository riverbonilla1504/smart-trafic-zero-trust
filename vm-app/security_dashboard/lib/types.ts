// Estructura del reporte que envia infra/agent/st-agent.py desde cada maquina.

export type Check = { id: string; label: string; ok: boolean; detail: string };

export type Probe = {
  host: string;
  port: number;
  expect: "allow" | "deny";
  desc: string;
  from: string;
  result: string;
  ms: number;
  ok: boolean;
};

export type Chain = {
  name: string;
  hook: string | null;
  policy: string | null;
  priority: number | null;
  rules: number;
  dropped_packets: number;
  dropped_bytes: number;
};

export type Container = {
  name: string;
  image: string;
  status: string;
  health: string | null;
  started_at: string;
  restarts: number;
  user: string;
  read_only: boolean;
  cap_drop: string[];
  cap_add: string[];
  no_new_privileges: boolean;
  privileged: boolean;
  mem_limit_mb: number;
  pids_limit: number | null;
  restart_policy: string;
  ports: string[];
  networks: string[];
  docker_socket: boolean;
  secret_mounts_ro: boolean;
};

export type Cert = {
  file: string;
  subject: string | null;
  issuer: string | null;
  not_after: string | null;
  days_left: number | null;
  key: string | null;
  curve: string | null;
  key_bits: string | null;
  signature: string | null;
  san: string | null;
  usage: string | null;
  fingerprint: string | null;
};

export type AgentReport = {
  schema: number;
  agent_version: string;
  host: string;
  role: string;
  private_ip: string;
  hostname: string;
  collected_at: string;
  collect_ms: number;
  system: {
    os: string;
    kernel: string;
    uptime_s: number;
    load: number[];
    cpus: number;
    cpu_pct: number;
    mem: { total_mb: number; avail_mb: number; used_mb: number };
    swap: { total_mb: number; used_mb: number };
    disk: { size_gb: number; used_gb: number; pct: number };
  };
  patching: { upgradable: number; security: number; reboot_required: boolean; last_apt_run: string | null };
  ssh: Record<string, string>;
  sysctl: Record<string, string>;
  time: { synced: boolean; source?: string; stratum?: number; offset_ms?: number };
  services: Record<string, { active: string; enabled: string }>;
  audit: { enabled: boolean; rules: number };
  firewall: { loaded: boolean; chains: Chain[]; rules_text: string; other_tables?: string[]; persisted: boolean };
  listening: { addr: string; port: number; process: string }[];
  containers: Container[];
  certificates: Cert[];
  probes: Probe[];
  activity: Record<string, unknown>;
  last_delivery: { ok?: boolean; status?: number; ms?: number; at?: string; error?: string };
  checks: Check[];
};

export type Delivery = {
  receivedAt: string;
  sourceIp: string;
  certSubject: string;
  certFingerprint: string;
  bytes: number;
};

export type HostEntry = { report: AgentReport; delivery: Delivery };

export type HistoryPoint = {
  t: number;
  cpu: number;
  mem: number;
  load: number;
  drops: number;
  checksOk: number;
  checksTotal: number;
};

export type HostState = "online" | "late" | "offline" | "never";

export type TestResult = {
  id: string;
  grupo: string;
  titulo: string;
  comando: string;
  esperado: string;
  observado: string;
  ok: boolean;
  salida?: string;
  fecha: string;
  origen?: string;
};

export type TestsFile = { generated_at: string; tests: TestResult[]; files?: Record<string, string> };
