import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Sparkline } from "@/components/Sparkline";
import { Bool, Empty, HostStatus, Kpi, Meter, PageHead, Section, Status, Tag } from "@/components/ui";
import { bytes, duration, number, probeResult, time } from "@/lib/format";
import { HOST_IDS, hostMeta } from "@/lib/hosts";
import { ageSeconds, history, hostEntry, hostState } from "@/lib/store";

const ACTIVITY_LABELS: Record<string, string> = {
  token_issued: "Tokens emitidos",
  token_denied: "Tokens denegados",
  token_rate_limited: "Bloqueos por límite",
  events_sent: "Eventos enviados a Kafka",
  token_failures: "Fallos al pedir token",
  kafka_errors: "Errores de Kafka",
  events_processed: "Eventos procesados",
  invalid_tokens: "Tokens inválidos descartados",
  alerts_dispatched: "Eventos entregados al dashboard",
  fail2ban_currently_banned: "IPs bloqueadas ahora (fail2ban)",
  fail2ban_total_banned: "IPs bloqueadas en total",
  fail2ban_total_failed: "Intentos fallidos registrados",
  ssh_failed_attempts: "Intentos SSH fallidos (60 min)",
  ssh_accepted: "Accesos SSH con clave (60 min)",
  admin_sessions: "Sesiones abiertas",
};

export default async function HostPage({ params }: { params: Promise<{ host: string }> }) {
  await connection();
  const { host } = await params;
  const meta = hostMeta(host);
  if (!meta || !HOST_IDS.includes(host)) notFound();

  const entry = hostEntry(host);
  const state = hostState(entry);
  const age = ageSeconds(entry);
  const series = history(host);

  if (!entry) {
    return (
      <>
        <PageHead kicker={`${meta.zone} · ${meta.ip}`} title={meta.name} lead={meta.role} />
        <Empty>Esta máquina todavía no ha enviado ningún reporte. Revisa el agente: <code>systemctl status st-agent.timer</code>.</Empty>
      </>
    );
  }

  const r = entry.report;
  const failed = r.checks.filter((c) => !c.ok);
  const activity = Object.entries(r.activity).filter(([, v]) => typeof v === "number") as [string, number][];
  const statuses = (r.activity.http_status ?? {}) as Record<string, number>;
  const users = (r.activity.rabbitmq_users ?? []) as { user: string; tags: string[] | string }[];
  const perms = (r.activity.rabbitmq_permissions ?? []) as { user: string; configure: string; write: string; read: string }[];
  const conns = (r.activity.rabbitmq_connections ?? []) as { user: string; peer_host: string; ssl: boolean; ssl_protocol: string; ssl_cipher: string }[];
  const queues = (r.activity.rabbitmq_queues ?? []) as { name: string; messages: number; consumers: number }[];
  const kafkaPeers = (r.activity.kafka_peers ?? []) as { port: number; peer: string; connections: number }[];
  const tokensByClient = (r.activity.tokens_by_client ?? {}) as Record<string, number>;

  return (
    <>
      <PageHead
        kicker={`${meta.zone} · ${meta.subnet} · ${meta.type}`}
        title={meta.name}
        lead={meta.role}
      />

      <div className="grid grid-kpi">
        <Kpi label="Estado" value={<HostStatus state={state} />} hint={`último reporte hace ${duration(age)}`} />
        <Kpi label="Controles" value={`${r.checks.length - failed.length}/${r.checks.length}`} tone={failed.length ? "warn" : "ok"} />
        <Kpi label="Activa desde hace" value={duration(r.system.uptime_s)} hint={r.system.os} />
        <Kpi label="Carga (1/5/15 min)" value={r.system.load.join(" · ")} hint={`${r.system.cpus} vCPU`} />
        <Kpi label="Paquetes descartados" value={number(r.firewall.chains.reduce((s, c) => s + c.dropped_packets, 0))} hint="nftables desde el arranque" />
        <Kpi label="Entrega del reporte" value={`${r.last_delivery.ms ?? "—"} ms`} hint={`recogido en ${r.collect_ms} ms · ${bytes(entry.delivery.bytes)}`} />
      </div>

      <div className="grid grid-2">
        <Section title="Controles de seguridad" kicker="Evaluados por el agente">
          <ul className="checks">
            {r.checks.map((c) => (
              <li key={c.id} className="check">
                <Status ok={c.ok} />
                <div>
                  <div className="check-label">{c.label}</div>
                  <div className="check-detail">{c.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <div className="grid">
          <Section title="Recursos" kicker="Sistema">
            <div className="card">
              <Meter label="CPU" value={r.system.cpu_pct} />
              <Meter label="Memoria" value={(100 * r.system.mem.used_mb) / r.system.mem.total_mb} />
              <Meter label="Swap" value={r.system.swap.total_mb ? (100 * r.system.swap.used_mb) / r.system.swap.total_mb : 0} />
              <Meter label="Disco" value={r.system.disk.pct} />
              <div className="muted small mono">
                {r.system.mem.used_mb}/{r.system.mem.total_mb} MB RAM · {r.system.disk.used_gb}/{r.system.disk.size_gb} GB disco · kernel {r.system.kernel}
              </div>
              <div className="grid grid-2">
                <Sparkline label="CPU %" unit="%" max={100} values={series.map((p) => p.cpu)} />
                <Sparkline label="Memoria %" unit="%" max={100} values={series.map((p) => p.mem)} />
              </div>
              <Sparkline label="Paquetes descartados (acumulado)" values={series.map((p) => p.drops)} />
            </div>
          </Section>

          <Section title="Identidad del reporte" kicker="TLS mutuo">
            <div className="card">
              <dl className="kv">
                <dt>Certificado</dt><dd>{entry.delivery.certSubject}</dd>
                <dt>Huella</dt><dd>{entry.delivery.certFingerprint || "—"}</dd>
                <dt>IP de origen</dt><dd>{entry.delivery.sourceIp}</dd>
                <dt>Recibido</dt><dd>{time(entry.delivery.receivedAt)}</dd>
                <dt>Hostname</dt><dd>{r.hostname}</dd>
                <dt>Agente</dt><dd>v{r.agent_version}</dd>
              </dl>
            </div>
          </Section>
        </div>
      </div>

      <Section title="Conexiones probadas desde esta máquina" kicker="Segmentación en la práctica">
        <div className="table-wrap">
          <table className="matrix">
            <thead>
              <tr>
                <th>Prueba</th>
                <th>Desde</th>
                <th>Destino</th>
                <th>Esperado</th>
                <th>Resultado</th>
                <th>Tiempo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {r.probes.map((p, i) => (
                <tr key={i}>
                  <td>{p.desc}</td>
                  <td className="mono">{p.from}</td>
                  <td className="mono">{p.host}:{p.port}</td>
                  <td>{p.expect === "allow" ? <Tag tone="info">permitido</Tag> : <Tag>bloqueado</Tag>}</td>
                  <td className="mono">{probeResult(p.result)}</td>
                  <td className="num">{p.ms} ms</td>
                  <td><Status ok={p.ok} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid grid-2">
        <Section title="Firewall nftables" kicker="Tabla inet hostfw">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Cadena</th><th>Hook</th><th>Política</th><th>Reglas</th><th>Descartados</th></tr>
              </thead>
              <tbody>
                {r.firewall.chains.map((c) => (
                  <tr key={c.name}>
                    <td className="mono">{c.name}</td>
                    <td className="mono">{c.hook} ({c.priority})</td>
                    <td><Tag tone={c.policy === "drop" ? "ok" : "fail"}>{c.policy}</Tag></td>
                    <td className="num">{c.rules}</td>
                    <td className="num">{number(c.dropped_packets)} · {bytes(c.dropped_bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details>
            <summary>Ver reglas cargadas (nft list table inet hostfw)</summary>
            <pre>{r.firewall.rules_text}</pre>
          </details>
          {r.firewall.other_tables?.length ? (
            <p className="muted small">Otras tablas (Docker, intactas): {r.firewall.other_tables.join(", ")}</p>
          ) : null}
        </Section>

        <Section title="Puertos en escucha" kicker="ss -tlnp">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Dirección</th><th>Puerto</th><th>Proceso</th></tr></thead>
              <tbody>
                {r.listening.map((l) => (
                  <tr key={`${l.addr}:${l.port}`}>
                    <td className="mono">{l.addr}</td>
                    <td className="num">{l.port}</td>
                    <td className="mono">{l.process}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">Las direcciones 127.x solo son accesibles desde la propia máquina.</p>
        </Section>
      </div>

      {r.containers.length ? (
        <Section title="Contenedores" kicker="Bastionado de Docker">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Contenedor</th><th>Estado</th><th>Usuario</th><th>Solo lectura</th><th>Capacidades</th>
                  <th>no-new-priv</th><th>Memoria</th><th>Procesos</th><th>Puertos</th><th>Reinicios</th>
                </tr>
              </thead>
              <tbody>
                {r.containers.map((c) => (
                  <tr key={c.name}>
                    <td className="mono">{c.name}<div className="muted">{c.image}</div></td>
                    <td>
                      <Tag tone={c.status === "running" ? "ok" : "fail"}>{c.status}</Tag>
                      {c.health ? <div><Tag tone={c.health === "healthy" ? "ok" : "warn"}>{c.health}</Tag></div> : null}
                    </td>
                    <td className="mono">{c.user}</td>
                    <td><Bool value={c.read_only} /></td>
                    <td className="mono">{c.cap_drop.length ? `drop ${c.cap_drop.join(",")}` : "—"}{c.cap_add.length ? ` add ${c.cap_add.join(",")}` : ""}</td>
                    <td><Bool value={c.no_new_privileges} /></td>
                    <td className="num">{c.mem_limit_mb ? `${c.mem_limit_mb} MB` : "sin límite"}</td>
                    <td className="num">{c.pids_limit ?? "—"}</td>
                    <td className="mono">{c.ports.join(" ") || "ninguno"}</td>
                    <td className="num">{c.restarts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      {r.certificates.length ? (
        <Section title="Certificados" kicker="PKI interna">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Sujeto</th><th>Emisor</th><th>Clave</th><th>Firma</th><th>SAN</th><th>Uso</th><th>Vence</th></tr></thead>
              <tbody>
                {r.certificates.map((c) => (
                  <tr key={c.fingerprint ?? c.file}>
                    <td className="mono">{c.subject}<div className="muted">{c.file}</div></td>
                    <td className="mono">{c.issuer}</td>
                    <td className="mono">{c.key}{c.curve ? ` · ${c.curve}` : ""}{c.key_bits ? ` · ${c.key_bits} bits` : ""}</td>
                    <td className="mono">{c.signature}</td>
                    <td className="mono">{c.san ?? "—"}</td>
                    <td className="mono">{c.usage ?? "—"}</td>
                    <td><Tag tone={(c.days_left ?? 0) > 30 ? "ok" : "warn"}>{c.days_left} días</Tag></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      <div className="grid grid-3">
        <Section title="SSH efectivo" kicker="sshd -T">
          <div className="card">
            <dl className="kv">
              {Object.entries(r.ssh).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Section>
        <Section title="Kernel" kicker="sysctl">
          <div className="card">
            <dl className="kv">
              {Object.entries(r.sysctl).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt>{k.replace("net.ipv4.", "").replace("conf.all.", "")}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Section>
        <Section title="Parches, hora y servicios" kicker="Sistema base">
          <div className="card">
            <dl className="kv">
              <dt>Actualizables</dt><dd>{r.patching.upgradable} ({r.patching.security} de seguridad)</dd>
              <dt>Reinicio pendiente</dt><dd>{r.patching.reboot_required ? "sí" : "no"}</dd>
              <dt>Último apt</dt><dd>{r.patching.last_apt_run ?? "—"}</dd>
              <dt>Fuente de hora</dt><dd>{r.time.source ?? "—"} (estrato {r.time.stratum ?? "—"})</dd>
              <dt>Desfase</dt><dd>{r.time.offset_ms ?? "—"} ms</dd>
              <dt>auditd</dt><dd>{r.audit.enabled ? "activo" : "inactivo"} · {r.audit.rules} reglas</dd>
              {Object.entries(r.services).map(([name, s]) => (
                <div key={name} className="contents">
                  <dt>{name}</dt>
                  <dd>{s.active} · {s.enabled}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Section>
      </div>

      {activity.length || Object.keys(statuses).length || users.length ? (
        <Section title="Actividad" kicker={`Ventana de ${String(r.activity.window ?? "10m")}`}>
          <div className="grid grid-kpi">
            {activity.map(([k, v]) => (
              <Kpi key={k} label={ACTIVITY_LABELS[k] ?? k} value={number(v)} />
            ))}
            {Object.entries(statuses).map(([code, n]) => (
              <Kpi key={code} label={`Respuestas HTTP ${code}`} value={number(n)} tone={code === "429" ? "warn" : undefined} hint={code === "429" ? "rate limiting" : code === "401" ? "sin credenciales" : undefined} />
            ))}
            {Object.entries(tokensByClient).map(([client, n]) => (
              <Kpi key={client} label={`Tokens para ${client}`} value={number(n)} />
            ))}
          </div>
          {users.length ? (
            <div className="grid grid-2">
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Usuario RabbitMQ</th><th>Configurar</th><th>Escribir</th><th>Leer</th></tr></thead>
                  <tbody>
                    {perms.map((p) => (
                      <tr key={p.user}>
                        <td className="mono">{p.user}</td>
                        <td className="mono">{p.configure}</td>
                        <td className="mono">{p.write}</td>
                        <td className="mono">{p.read}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Conexión</th><th>Desde</th><th>TLS</th><th>Cifrado</th></tr></thead>
                  <tbody>
                    {conns.map((c, i) => (
                      <tr key={i}>
                        <td className="mono">{c.user}</td>
                        <td className="mono">{c.peer_host}</td>
                        <td><Tag tone={c.ssl ? "ok" : "fail"}>{c.ssl ? c.ssl_protocol : "sin TLS"}</Tag></td>
                        <td className="mono">{c.ssl_cipher}</td>
                      </tr>
                    ))}
                    {kafkaPeers.map((k) => (
                      <tr key={`k-${k.peer}`}>
                        <td className="mono">kafka:{k.port}</td>
                        <td className="mono">{k.peer}</td>
                        <td><Tag tone="ok">TLS mutuo</Tag></td>
                        <td className="mono">{k.connections} conexiones</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {queues.length ? (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Cola</th><th>Mensajes</th><th>Consumidores</th></tr></thead>
                    <tbody>
                      {queues.map((q) => (
                        <tr key={q.name}><td className="mono">{q.name}</td><td className="num">{q.messages}</td><td className="num">{q.consumers}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}
        </Section>
      ) : null}
    </>
  );
}
