import crypto from "node:crypto";
import fs from "node:fs";
import { hostMeta } from "@/lib/hosts";
import { recordRejected, saveReport } from "@/lib/store";
import type { AgentReport } from "@/lib/types";

// Recibe el reporte de un agente. Solo llega aqui a traves de la pasarela de Nginx en 10.0.1.10:9443,
// que ya verifico el certificado de cliente con la CA interna. Aqui se comprueba, ademas:
//   1. el token de pasarela (otro contenedor no puede saltarse Nginx),
//   2. que el CN del certificado coincide con la maquina del reporte (nadie reporta por otra),
//   3. que la IP de origen es la de esa maquina.

const TOKEN_FILE = process.env.GATEWAY_TOKEN_FILE ?? "/run/app-secrets/gateway-token";
const MAX_BYTES = 512 * 1024;

function gatewayToken(): Buffer | null {
  try {
    return Buffer.from(fs.readFileSync(/*turbopackIgnore: true*/ TOKEN_FILE, "utf8").trim());
  } catch {
    return null;
  }
}

function sameSecret(a: Buffer, b: Buffer) {
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function deny(status: number, ip: string, reason: string) {
  recordRejected(ip, reason);
  console.warn(JSON.stringify({ ts: new Date().toISOString(), event: "report_rejected", ip, reason }));
  return Response.json({ error: reason }, { status });
}

function looksLikeReport(body: unknown): body is AgentReport {
  const r = body as AgentReport;
  return (
    !!r && typeof r === "object" && r.schema === 1 && typeof r.host === "string" &&
    typeof r.system === "object" && Array.isArray(r.checks) && Array.isArray(r.probes) &&
    Array.isArray(r.containers) && typeof r.firewall === "object"
  );
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-real-ip") ?? "desconocida";
  const expected = gatewayToken();
  const given = Buffer.from(request.headers.get("x-gateway-token") ?? "");
  if (!expected || !sameSecret(given, expected)) {
    return deny(403, ip, "token de pasarela ausente o incorrecto");
  }
  if (request.headers.get("x-agent-verify") !== "SUCCESS") {
    return deny(403, ip, "certificado de cliente no verificado");
  }

  const subject = request.headers.get("x-agent-dn") ?? "";
  const cn = /(?:^|,)CN=agent-([a-z]+)(?:,|$)/.exec(subject)?.[1];
  const meta = cn ? hostMeta(cn) : undefined;
  if (!meta) return deny(403, ip, `certificado sin identidad de agente: ${subject}`);

  const raw = await request.text();
  if (raw.length > MAX_BYTES) return deny(413, ip, "reporte demasiado grande");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return deny(400, ip, "JSON no valido");
  }
  if (!looksLikeReport(body)) return deny(400, ip, "estructura de reporte no valida");
  if (body.host !== meta.id) {
    return deny(403, ip, `el certificado agent-${meta.id} intento reportar como ${body.host}`);
  }
  // app-ec2 se reporta a si misma; Docker puede presentar esa conexion desde la puerta de enlace del puente.
  const ipOk = ip === meta.ip || (meta.id === "app" && /^172\.(1[6-9]|2\d|3[01])\./.test(ip));
  if (!ipOk) return deny(403, ip, `agent-${meta.id} reporto desde ${ip}, se esperaba ${meta.ip}`);

  saveReport(body, {
    receivedAt: new Date().toISOString(),
    sourceIp: ip,
    certSubject: subject,
    certFingerprint: (request.headers.get("x-agent-fingerprint") ?? "").slice(0, 23),
    bytes: raw.length,
  });
  return Response.json({ ok: true });
}
