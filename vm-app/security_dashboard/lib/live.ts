import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";

// Comprobaciones que el propio servidor del dashboard hace en vivo desde la DMZ.
// Muestran el comportamiento real de la red y del cifrado, no lo que dice la configuracion.

const CA_FILE = process.env.CA_FILE ?? "/run/app-secrets/ca.pem";
const PUBLIC_IP = process.env.PUBLIC_IP ?? "";
const NGINX_HOST = process.env.NGINX_HOST ?? "nginx";
const CACHE_MS = 30_000;

export type LiveCheck = {
  id: string;
  title: string;
  target: string;
  expect: string;
  ok: boolean;
  observed: string;
  details: Record<string, string | number | boolean | null>;
  ms: number;
};

function ca(): Buffer | undefined {
  try {
    return fs.readFileSync(/*turbopackIgnore: true*/ CA_FILE);
  } catch {
    return undefined;
  }
}

type TlsResult = {
  ok: boolean;
  error?: string;
  protocol?: string | null;
  cipher?: string;
  subject?: string;
  issuer?: string;
  validTo?: string;
  keyType?: string;
  fingerprint?: string;
  ms: number;
};

function tlsHandshake(host: string, port: number, opts: tls.ConnectionOptions = {}): Promise<TlsResult> {
  const start = Date.now();
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port, ca: ca(), timeout: 3000, ...opts }, () => {
      const cert = socket.getPeerCertificate();
      const cipher = socket.getCipher();
      resolve({
        ok: socket.authorized,
        error: socket.authorized ? undefined : String(socket.authorizationError),
        protocol: socket.getProtocol(),
        cipher: cipher?.standardName ?? cipher?.name,
        subject: cert?.subject?.CN ? String(cert.subject.CN) : undefined,
        issuer: cert?.issuer?.CN ? String(cert.issuer.CN) : undefined,
        validTo: cert?.valid_to,
        keyType: cert?.asn1Curve ? `ECDSA ${cert.asn1Curve}` : cert?.bits ? `RSA ${cert.bits}` : undefined,
        fingerprint: cert?.fingerprint256?.slice(0, 23),
        ms: Date.now() - start,
      });
      socket.end();
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ ok: false, error: "tiempo agotado (bloqueado)", ms: Date.now() - start });
    });
    socket.on("error", (err: NodeJS.ErrnoException) => {
      resolve({ ok: false, error: err.code ?? err.message, ms: Date.now() - start });
    });
  });
}

function tcpConnect(host: string, port: number): Promise<{ result: string; ms: number }> {
  const start = Date.now();
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: 2500 });
    socket.on("connect", () => {
      socket.destroy();
      resolve({ result: "abierto", ms: Date.now() - start });
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ result: "bloqueado (sin respuesta)", ms: Date.now() - start });
    });
    socket.on("error", (err: NodeJS.ErrnoException) =>
      resolve({ result: err.code === "ECONNREFUSED" ? "rechazado" : err.code ?? "error", ms: Date.now() - start }),
    );
  });
}

function httpsRequest(
  options: https.RequestOptions & { body?: string },
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; ms: number; error?: string }> {
  const start = Date.now();
  return new Promise((resolve) => {
    const req = https.request({ timeout: 4000, ca: ca(), ...options }, (res) => {
      res.resume();
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, ms: Date.now() - start }));
    });
    req.on("timeout", () => req.destroy(new Error("tiempo agotado")));
    req.on("error", (err) => resolve({ status: 0, headers: {}, ms: Date.now() - start, error: err.message }));
    if (options.body) req.write(options.body);
    req.end();
  });
}

function httpHead(host: string, port: number): Promise<{ status: number; location: string; ms: number; error?: string }> {
  const start = Date.now();
  return new Promise((resolve) => {
    const req = http.request({ host, port, path: "/", method: "HEAD", timeout: 3000 }, (res) => {
      res.resume();
      resolve({ status: res.statusCode ?? 0, location: String(res.headers.location ?? ""), ms: Date.now() - start });
    });
    req.on("timeout", () => req.destroy(new Error("tiempo agotado")));
    req.on("error", (err) => resolve({ status: 0, location: "", ms: Date.now() - start, error: err.message }));
    req.end();
  });
}

// El certificado de la pasarela de agentes lleva la IP privada de app-ec2.
const checkGatewayIdentity = (_host: string, cert: tls.PeerCertificate) => tls.checkServerIdentity("10.0.1.10", cert);

// El certificado de Nginx lleva la IP publica; se valida contra ella aunque se conecte por la red interna.
const checkPublicIdentity = (_host: string, cert: tls.PeerCertificate) =>
  PUBLIC_IP ? tls.checkServerIdentity(PUBLIC_IP, cert) : undefined;

const SECURITY_HEADERS = [
  "strict-transport-security",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "content-security-policy",
];

// Las sondas de login generan registros token_denied en auth: se repiten solo cada 5 minutos.
const AUTH_PROBE_MS = 300_000;
const authRef = globalThis as unknown as { __stAuthProbe?: { at: number; data: ReturnType<typeof authProbes> } };

function authProbes() {
  const post = (body: object) =>
    httpsRequest({
      host: "10.0.2.10", port: 443, path: "/token", method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
  return Promise.all([
    post({ client_id: "sonda-dashboard", client_secret: "incorrecto" }),
    post({ client_id: "sensor' OR '1'='1", client_secret: "' OR '1'='1' --" }),
  ]);
}

function cachedAuthProbes() {
  const cached = authRef.__stAuthProbe;
  if (!cached || Date.now() - cached.at > AUTH_PROBE_MS) {
    authRef.__stAuthProbe = { at: Date.now(), data: authProbes() };
  }
  return authRef.__stAuthProbe!.data;
}

async function runAll(): Promise<LiveCheck[]> {
  const [redirect, gateway] = await Promise.all([
    httpHead(NGINX_HOST, 8080),
    httpsRequest({ host: NGINX_HOST, port: 9443, path: "/report", method: "POST", checkServerIdentity: checkGatewayIdentity }),
  ]);
  const [authTls, authOld, rabbitTls, kafka, coreSsh, internet, nginxTls, headers, [badLogin, sqli]] = await Promise.all([
    tlsHandshake("10.0.2.10", 443),
    tlsHandshake("10.0.2.10", 443, { maxVersion: "TLSv1.1", minVersion: "TLSv1" }),
    tlsHandshake("10.0.5.10", 5671),
    tcpConnect("10.0.5.10", 9092),
    tcpConnect("10.0.4.10", 22),
    tcpConnect("1.1.1.1", 443),
    tlsHandshake(NGINX_HOST, 8443, { checkServerIdentity: checkPublicIdentity }),
    httpsRequest({ host: NGINX_HOST, port: 8443, path: "/", method: "HEAD", checkServerIdentity: checkPublicIdentity }),
    cachedAuthProbes(),
  ]);

  const presentHeaders = SECURITY_HEADERS.filter((h) => headers.headers[h]);
  const server = headers.headers["server"];

  return [
    {
      id: "tls-auth",
      title: "TLS hacia el servidor de identidad",
      target: "10.0.2.10:443 (auth-ec2)",
      expect: "Certificado firmado por la CA interna y TLS 1.2 o superior",
      ok: authTls.ok && /TLSv1\.[23]/.test(authTls.protocol ?? ""),
      observed: authTls.ok ? `${authTls.protocol} · ${authTls.cipher}` : `falló: ${authTls.error}`,
      details: {
        certificado: authTls.subject ?? null, emisor: authTls.issuer ?? null, clave: authTls.keyType ?? null,
        caduca: authTls.validTo ?? null, huella_sha256: authTls.fingerprint ?? null,
      },
      ms: authTls.ms,
    },
    {
      id: "tls-legacy",
      title: "Protocolos obsoletos rechazados",
      target: "10.0.2.10:443 con TLS 1.0/1.1",
      expect: "El servidor rechaza la negociación",
      ok: !authOld.ok,
      observed: authOld.ok ? `aceptó ${authOld.protocol}` : `rechazado (${authOld.error})`,
      details: {},
      ms: authOld.ms,
    },
    {
      id: "tls-rabbitmq",
      title: "AMQPS hacia RabbitMQ",
      target: "10.0.5.10:5671 (data-ec2)",
      expect: "Solo AMQP sobre TLS con certificado de la CA interna",
      ok: rabbitTls.ok,
      observed: rabbitTls.ok ? `${rabbitTls.protocol} · ${rabbitTls.cipher}` : `falló: ${rabbitTls.error}`,
      details: { certificado: rabbitTls.subject ?? null, clave: rabbitTls.keyType ?? null, caduca: rabbitTls.validTo ?? null },
      ms: rabbitTls.ms,
    },
    {
      id: "deny-kafka",
      title: "La DMZ no llega a Kafka",
      target: "10.0.5.10:9092 desde app-ec2",
      expect: "Bloqueado: Kafka solo acepta ingest y core",
      ok: kafka.result !== "abierto",
      observed: kafka.result,
      details: { capas: "grupo de seguridad st-data + nftables de app y data" },
      ms: kafka.ms,
    },
    {
      id: "deny-ssh",
      title: "La DMZ no administra otras máquinas",
      target: "10.0.4.10:22 desde app-ec2",
      expect: "Bloqueado: SSH solo desde el bastión",
      ok: coreSsh.result !== "abierto",
      observed: coreSsh.result,
      details: {},
      ms: coreSsh.ms,
    },
    {
      id: "deny-internet",
      title: "Sin salida a internet",
      target: "1.1.1.1:443 desde app-ec2",
      expect: "Bloqueado: el grupo de seguridad no permite salida",
      ok: internet.result !== "abierto",
      observed: internet.result,
      details: {},
      ms: internet.ms,
    },
    {
      id: "tls-nginx",
      title: "HTTPS público de Nginx",
      target: `${PUBLIC_IP || "IP pública"}:443`,
      expect: "TLS 1.2/1.3 con certificado válido para la IP pública",
      ok: nginxTls.ok,
      observed: nginxTls.ok ? `${nginxTls.protocol} · ${nginxTls.cipher}` : `falló: ${nginxTls.error}`,
      details: { certificado: nginxTls.subject ?? null, clave: nginxTls.keyType ?? null, caduca: nginxTls.validTo ?? null },
      ms: nginxTls.ms,
    },
    {
      id: "headers",
      title: "Cabeceras de seguridad (curl -I)",
      target: "Respuesta de Nginx sin credenciales",
      expect: "401 con HSTS, X-Frame-Options, nosniff, Referrer-Policy y CSP; sin versión en Server",
      ok: headers.status === 401 && presentHeaders.length === SECURITY_HEADERS.length && server === "nginx",
      observed: `HTTP ${headers.status || "error"} · ${presentHeaders.length}/${SECURITY_HEADERS.length} cabeceras · Server: ${server ?? "-"}`,
      details: Object.fromEntries(SECURITY_HEADERS.map((h) => [h, String(headers.headers[h] ?? "falta")])),
      ms: headers.ms,
    },
    {
      id: "http-redirect",
      title: "HTTP redirige a HTTPS",
      target: "http://nginx (puerto 80 público)",
      expect: "301 hacia https://",
      ok: redirect.status === 301 && redirect.location.startsWith("https://"),
      observed: redirect.status ? `HTTP ${redirect.status} → ${redirect.location || "sin Location"}` : `falló: ${redirect.error}`,
      details: {},
      ms: redirect.ms,
    },
    {
      id: "gateway-no-cert",
      title: "Pasarela de agentes sin certificado",
      target: "10.0.1.10:9443/report sin certificado de cliente",
      expect: "Rechazada: solo entran agentes con certificado de la CA interna",
      // 400 = Nginx rechazo la peticion por falta de certificado; un error de handshake tambien es un rechazo.
      // Un tiempo agotado o una conexion rechazada no cuentan: significarian que la pasarela no esta.
      ok: gateway.status === 400 || /certificate|handshake|alert/i.test(gateway.error ?? ""),
      observed: gateway.status ? `HTTP ${gateway.status} (no se envió certificado)` : `conexión cortada: ${gateway.error}`,
      details: {},
      ms: gateway.ms,
    },
    {
      id: "auth-deny",
      title: "Credenciales inválidas rechazadas",
      target: "POST https://10.0.2.10/token",
      expect: "401 y registro token_denied en la auditoría",
      ok: badLogin.status === 401,
      observed: `HTTP ${badLogin.status || badLogin.error}`,
      details: {},
      ms: badLogin.ms,
    },
    {
      id: "auth-sqli",
      title: "Inyección en el login (clase 8)",
      target: "client_id = sensor' OR '1'='1",
      expect: "401: el valor se compara como texto, no se interpreta",
      ok: sqli.status === 401,
      observed: `HTTP ${sqli.status || sqli.error}`,
      details: {},
      ms: sqli.ms,
    },
  ];
}

const globalRef = globalThis as unknown as { __stLive?: { at: number; data: Promise<LiveCheck[]> } };

export async function liveChecks(): Promise<{ at: number; checks: LiveCheck[] }> {
  const cached = globalRef.__stLive;
  if (!cached || Date.now() - cached.at > CACHE_MS) {
    globalRef.__stLive = { at: Date.now(), data: runAll().catch(() => []) };
  }
  const entry = globalRef.__stLive!;
  return { at: entry.at, checks: await entry.data };
}
