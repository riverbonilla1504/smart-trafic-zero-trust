import { connection } from "next/server";
import { Empty, Kpi, PageHead, Section, Status, Tag } from "@/components/ui";
import { awsChecks, awsInventory } from "@/lib/evidence";
import { number, probeResult, time } from "@/lib/format";
import { hostByIp, hostMeta } from "@/lib/hosts";
import { liveChecks } from "@/lib/live";
import { allHosts } from "@/lib/store";

export default async function NetworkPage() {
  await connection();
  const hosts = allHosts();
  const inv = awsInventory();
  const aws = awsChecks(inv);
  const { checks: live } = await liveChecks();

  const probes = hosts.flatMap((h) =>
    (h.entry?.report.probes ?? []).map((p) => ({ ...p, origin: h.id })),
  );
  const liveDeny = live.filter((l) => l.id.startsWith("deny-"));

  return (
    <>
      <PageHead
        kicker="Red y cortafuegos"
        title="Segmentación en tres capas: subred, grupo de seguridad y nftables"
        lead="Una conexión entre zonas solo funciona si la permiten a la vez el grupo de seguridad de origen (salida), el de destino (entrada) y el firewall de ambos hosts. Las pruebas de abajo lo comprueban en vivo desde cada máquina."
      />

      <div className="grid grid-kpi">
        <Kpi label="Conexiones probadas" value={`${probes.filter((p) => p.ok).length}/${probes.length}`} tone={probes.every((p) => p.ok) ? "ok" : "fail"} hint="cada 30 s desde los agentes" />
        <Kpi label="Permitidas que conectan" value={probes.filter((p) => p.expect === "allow" && p.ok).length} hint="flujos de la aplicación" />
        <Kpi label="Prohibidas bloqueadas" value={probes.filter((p) => p.expect === "deny" && p.ok).length} hint="intentos fuera de diseño" />
        <Kpi
          label="Descartados por nftables"
          value={number(hosts.reduce((s, h) => s + (h.entry?.report.firewall.chains.reduce((a, c) => a + c.dropped_packets, 0) ?? 0), 0))}
          hint="suma de las 6 máquinas"
        />
      </div>

      <Section id="matriz" title="Matriz de conexiones" kicker="Lo permitido conecta, lo demás se bloquea">
        {probes.length ? (
          <div className="table-wrap">
            <table className="matrix">
              <thead>
                <tr><th>Origen</th><th>Desde</th><th>Destino</th><th>Qué se prueba</th><th>Esperado</th><th>Resultado</th><th>Estado</th></tr>
              </thead>
              <tbody>
                {probes.map((p, i) => (
                  <tr key={i}>
                    <td className="mono">{hostMeta(p.origin)?.name}</td>
                    <td className="mono small">{p.from}</td>
                    <td className="mono">{hostByIp(p.host)?.name ?? p.host}:{p.port}</td>
                    <td>{p.desc}</td>
                    <td>{p.expect === "allow" ? <Tag tone="info">permitido</Tag> : <Tag>bloqueado</Tag>}</td>
                    <td className={`mono ${p.ok ? "cell-ok" : "cell-fail"}`}>{probeResult(p.result)} · {p.ms} ms</td>
                    <td><Status ok={p.ok} /></td>
                  </tr>
                ))}
                {liveDeny.map((l) => (
                  <tr key={l.id}>
                    <td className="mono">app-ec2</td>
                    <td className="mono small">dashboard (en vivo)</td>
                    <td className="mono">{l.target}</td>
                    <td>{l.title}</td>
                    <td><Tag>bloqueado</Tag></td>
                    <td className={`mono ${l.ok ? "cell-ok" : "cell-fail"}`}>{l.observed} · {l.ms} ms</td>
                    <td><Status ok={l.ok} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Aún no hay reportes de los agentes.</Empty>
        )}
        <p className="muted small">
          «bloqueado (sin respuesta)» significa que un cortafuegos descartó el paquete en silencio; «rechazado» significa que el destino respondió
          que no hay servicio en ese puerto. En ambos casos no hay conexión.
        </p>
      </Section>

      <Section title="Cortafuegos por máquina" kicker="nftables · política y descartes">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Máquina</th><th>input</th><th>forward</th><th>output</th><th>Reglas</th><th>Persistente</th></tr></thead>
            <tbody>
              {hosts.map((h) => {
                const fw = h.entry?.report.firewall;
                const chain = (name: string) => fw?.chains.find((c) => c.name === name);
                const cell = (name: string) => {
                  const c = chain(name);
                  return c ? (
                    <>
                      <Tag tone={c.policy === "drop" ? "ok" : "fail"}>{c.policy}</Tag> <span className="mono small">{number(c.dropped_packets)} desc.</span>
                    </>
                  ) : "—";
                };
                return (
                  <tr key={h.id}>
                    <td className="mono">{hostMeta(h.id)?.name}</td>
                    <td>{cell("input")}</td>
                    <td>{cell("forward")}</td>
                    <td>{cell("output")}</td>
                    <td className="num">{fw?.chains.reduce((s, c) => s + c.rules, 0) ?? "—"}</td>
                    <td>{fw ? <Tag tone={fw.persisted ? "ok" : "fail"}>{fw.persisted ? "sí" : "no"}</Tag> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Controles en AWS" kicker={inv ? `Inventario capturado ${time(inv.generated_at)}` : "Inventario de la cuenta"}>
        {aws.length ? (
          <ul className="checks">
            {aws.map((c) => (
              <li key={c.id} className="check">
                <Status ok={c.ok} />
                <div>
                  <div className="check-label">{c.label}</div>
                  <div className="check-detail">{c.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Inventario no cargado. Se genera con <code>infra/collect-aws.sh</code>.</Empty>
        )}
      </Section>

      {inv ? (
        <>
          <Section title="Subredes" kicker={`VPC ${inv.vpc.cidr}`}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Subred</th><th>CIDR</th><th>Tipo</th><th>Ruta por defecto</th></tr></thead>
                <tbody>
                  {inv.subnets.map((s) => (
                    <tr key={s.id}>
                      <td className="mono">{s.name}</td>
                      <td className="mono">{s.cidr}</td>
                      <td>{s.public ? <Tag tone="warn">pública</Tag> : <Tag tone="ok">privada</Tag>}</td>
                      <td className="mono">{s.route}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Grupos de seguridad" kicker="Reglas reales de la cuenta">
            <div className="grid grid-2">
              {inv.security_groups.map((g) => (
                <div key={g.id} className="card">
                  <h3>
                    <span className="mono">{g.name}</span> <span className="muted small">{g.rules.length} reglas</span>
                  </h3>
                  <p className="muted small">{g.description}</p>
                  {g.rules.length ? (
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>Sentido</th><th>Puerto</th><th>Origen/destino</th><th>Motivo</th></tr></thead>
                        <tbody>
                          {g.rules.map((r, i) => (
                            <tr key={i}>
                              <td>{r.direction}</td>
                              <td className="mono">{r.protocol}/{r.ports}</td>
                              <td className="mono">{r.peer}</td>
                              <td className="small">{r.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="small">Sin reglas: no permite ningún tráfico.</p>
                  )}
                </div>
              ))}
            </div>
          </Section>

          <Section title="Instancias" kicker="EC2">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Instancia</th><th>Tipo</th><th>IP privada</th><th>IP pública</th><th>IMDSv2</th><th>Disco</th><th>Grupos</th></tr></thead>
                <tbody>
                  {inv.instances.map((i) => (
                    <tr key={i.id}>
                      <td className="mono">{i.name}<div className="muted">{i.id} · {i.state}</div></td>
                      <td className="mono">{i.type} · {i.vcpu} vCPU</td>
                      <td className="mono">{i.private_ip}</td>
                      <td className="mono">{i.public_ip ?? "—"}</td>
                      <td><Tag tone={i.imdsv2 ? "ok" : "fail"}>{i.imdsv2 ? "obligatorio" : "opcional"}</Tag></td>
                      <td className="mono">{i.ebs.map((v) => `${v.size} GB ${v.type}${v.encrypted ? " cifrado" : ""}`).join(", ")}</td>
                      <td className="mono small">{i.groups.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      ) : null}
    </>
  );
}
