import Link from "next/link";
import { connection } from "next/server";
import { Empty, HostStatus, Meter, PageHead, Score } from "@/components/ui";
import { duration } from "@/lib/format";
import { HOSTS } from "@/lib/hosts";
import { allHosts } from "@/lib/store";

export default async function MachinesPage() {
  await connection();
  const hosts = allHosts();

  return (
    <>
      <PageHead
        kicker="Máquinas"
        title="Estado y controles de cada máquina"
        lead="Cada tarjeta muestra el último reporte que la propia máquina envió por TLS mutuo. Una máquina que deja de reportar pasa a «Retrasado» a los 90 s y a «Sin reportar» a los 180 s."
      />
      <div className="grid grid-3">
        {HOSTS.map((meta) => {
          const h = hosts.find((x) => x.id === meta.id)!;
          const r = h.entry?.report;
          const failed = r?.checks.filter((c) => !c.ok) ?? [];
          return (
            <Link key={meta.id} href={`/maquinas/${meta.id}`} prefetch={false} className="card">
              <div className="kicker">{meta.zone} · {meta.subnet}</div>
              <h3>
                {meta.name} <HostStatus state={h.state} />
              </h3>
              <p className="muted small">{meta.role}</p>
              {r ? (
                <>
                  <div className="mono small muted">
                    {meta.type} · {r.system.cpus} vCPU · activo {duration(r.system.uptime_s)} · reporte hace {duration(h.age)}
                  </div>
                  <Meter label="CPU" value={r.system.cpu_pct} />
                  <Meter label="Memoria" value={(100 * r.system.mem.used_mb) / r.system.mem.total_mb} />
                  <Meter label="Disco" value={r.system.disk.pct} />
                  <div className="test-head">
                    <span>Controles <Score ok={r.checks.length - failed.length} total={r.checks.length} /></span>
                    <span className="muted small">
                      {r.containers.length} contenedores · {r.probes.filter((p) => p.ok).length}/{r.probes.length} conexiones
                    </span>
                  </div>
                  {failed.length ? <p className="small">Falla: {failed.map((c) => c.label).join(", ")}</p> : null}
                </>
              ) : (
                <Empty>Esta máquina aún no ha enviado ningún reporte.</Empty>
              )}
            </Link>
          );
        })}
      </div>
    </>
  );
}
