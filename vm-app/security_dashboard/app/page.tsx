import Link from "next/link";
import { connection } from "next/server";
import { Architecture } from "@/components/Architecture";
import { HostStatus, Kpi, PageHead, Score, Section, Status } from "@/components/ui";
import { CLASSES } from "@/lib/classes";
import { duration, number } from "@/lib/format";
import { hostMeta } from "@/lib/hosts";
import { evidenceContext, resolveEvidence, score } from "@/lib/resolve";
import { summary } from "@/lib/store";

export default async function Home() {
  await connection();
  const s = summary();
  const ctx = await evidenceContext();

  const nodes = Object.fromEntries(
    s.hosts.map((h) => [
      h.id,
      {
        state: h.state,
        checksOk: h.entry?.report.checks.filter((c) => c.ok).length ?? 0,
        checksTotal: h.entry?.report.checks.length ?? 0,
      },
    ]),
  );

  const coverage = CLASSES.map((c) => {
    const items = c.evidence.map((ref) => resolveEvidence(ref, ctx));
    return { c, ...score(items) };
  });
  const totalEvidence = coverage.reduce((a, x) => a + x.total, 0);
  const okEvidence = coverage.reduce((a, x) => a + x.ok, 0);

  const alerts = [
    ...s.hosts.filter((h) => h.state !== "online").map((h) => ({
      key: `host-${h.id}`,
      text: `${hostMeta(h.id)?.name}: ${h.state === "never" ? "nunca ha reportado" : `sin reporte desde hace ${duration(h.age)}`}`,
      href: `/maquinas/${h.id}`,
    })),
    ...s.hosts.flatMap((h) =>
      (h.entry?.report.checks ?? []).filter((c) => !c.ok).map((c) => ({
        key: `${h.id}-${c.id}`,
        text: `${hostMeta(h.id)?.name}: ${c.label} — ${c.detail}`,
        href: `/maquinas/${h.id}`,
      })),
    ),
    ...ctx.live.filter((l) => !l.ok).map((l) => ({ key: `live-${l.id}`, text: `En vivo: ${l.title} — ${l.observed}`, href: "/pruebas" })),
    ...(ctx.tests?.tests ?? []).filter((t) => !t.ok).map((t) => ({ key: `test-${t.id}`, text: `Prueba: ${t.titulo} — ${t.observado}`, href: `/pruebas#${t.id}` })),
  ];

  return (
    <>
      <PageHead
        kicker="Proyecto final · Seguridad informática"
        title="Smart Traffic: arquitectura Zero Trust en AWS"
        lead={
          <>
            Sistema de monitoreo de tráfico desplegado en 6 máquinas EC2 aisladas por zonas. Cada conexión va cifrada y autenticada, cada mensaje
            lleva un token firmado y cada máquina reporta sus controles de seguridad a este panel cada 30 s por TLS mutuo. Todo lo que ves aquí
            sale de datos reales de la infraestructura.
          </>
        }
      />

      <div className="grid grid-kpi">
        <Kpi label="Máquinas reportando" value={`${s.online}/${s.total}`} tone={s.online === s.total ? "ok" : "fail"} hint="latido cada 30 s · caída a los 90 s" />
        <Kpi label="Controles cumplidos" value={`${s.checksOk}/${s.checksTotal}`} tone={s.checksOk === s.checksTotal ? "ok" : "warn"} hint="evaluados por los agentes" />
        <Kpi label="Evidencias de clase" value={`${okEvidence}/${totalEvidence}`} tone={okEvidence === totalEvidence ? "ok" : "warn"} hint="10 documentos de clase" />
        <Kpi label="Segmentación" value={`${s.probesOk}/${s.probesTotal}`} tone={s.probesOk === s.probesTotal ? "ok" : "fail"} hint="conexiones probadas entre zonas" />
        <Kpi label="Contenedores" value={`${s.containersRunning}/${s.containersTotal}`} tone={s.containersRunning === s.containersTotal ? "ok" : "warn"} hint="en ejecución y bastionados" />
        <Kpi label="Paquetes descartados" value={number(s.drops)} hint="por nftables desde el arranque" />
        <Kpi label="Eventos procesados" value={number(s.eventsProcessed)} hint={`últimos 10 min · ${number(s.eventsSent)} enviados`} />
        <Kpi label="Tokens JWT" value={number(s.tokensIssued)} hint={`emitidos en 10 min · ${number(s.tokensDenied)} denegados`} />
      </div>

      <Section title="Arquitectura en vivo" kicker="Estado de cada zona">
        <Architecture nodes={nodes} />
        <p className="muted small">
          Recorrido de un dato: ① el sensor pide un token a auth · ② lo publica en Kafka con TLS mutuo · ③ core verifica el token y publica en
          RabbitMQ · ④ la DMZ consume por AMQPS · ⑤ el navegador lo recibe por HTTPS/WSS. Haz clic en una máquina para ver su detalle.
        </p>
      </Section>

      <div className="grid grid-2">
        <Section title="Máquinas" kicker="Latido de los agentes">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Máquina</th>
                  <th>Estado</th>
                  <th>Último reporte</th>
                  <th>Controles</th>
                </tr>
              </thead>
              <tbody>
                {s.hosts.map((h) => {
                  const ok = h.entry?.report.checks.filter((c) => c.ok).length ?? 0;
                  const total = h.entry?.report.checks.length ?? 0;
                  return (
                    <tr key={h.id}>
                      <td>
                        <Link href={`/maquinas/${h.id}`} prefetch={false}>{hostMeta(h.id)?.name}</Link>
                        <div className="muted small mono">{hostMeta(h.id)?.ip}</div>
                      </td>
                      <td><HostStatus state={h.state} /></td>
                      <td className="mono">{h.age === null ? "—" : `hace ${duration(h.age)}`}</td>
                      <td><Score ok={ok} total={total} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Alertas activas" kicker="Lo que no cumple ahora mismo">
          {alerts.length === 0 ? (
            <div className="card">
              <Status ok={true} label="Sin alertas" />
              <p className="muted">Todas las máquinas reportan, todos los controles cumplen y todas las comprobaciones en vivo pasan.</p>
            </div>
          ) : (
            <ul className="checks">
              {alerts.slice(0, 12).map((a) => (
                <li key={a.key} className="check">
                  <Status ok={false} />
                  <Link href={a.href} prefetch={false} className="check-label">{a.text}</Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Cobertura de las clases" kicker="Qué se aplicó de cada documento">
        <div className="grid grid-3">
          {coverage.map(({ c, ok, known, total }) => (
            <Link key={c.slug} href={`/clases/${c.slug}`} prefetch={false} className="card class-card">
              <div className="kicker">{c.label} · {c.date}</div>
              <h3>
                {c.title} <Score ok={ok} total={total} />
              </h3>
              <p className="muted small">
                {c.applied.length} medidas aplicadas · {known < total ? `${total - known} evidencias pendientes` : "todas las evidencias con datos"}
              </p>
            </Link>
          ))}
        </div>
      </Section>
    </>
  );
}
