import { connection } from "next/server";
import { Empty, Kpi, PageHead, Section, Status, Tag } from "@/components/ui";
import { testsFile } from "@/lib/evidence";
import { time } from "@/lib/format";
import { liveChecks } from "@/lib/live";

export default async function TestsPage() {
  await connection();
  const { at, checks } = await liveChecks();
  const tests = testsFile();
  const groups = new Map<string, NonNullable<typeof tests>["tests"]>();
  for (const t of tests?.tests ?? []) {
    if (!groups.has(t.clase)) groups.set(t.clase, []);
    groups.get(t.clase)!.push(t);
  }

  return (
    <>
      <PageHead
        kicker="Pruebas y evidencias"
        title="Verificaciones en vivo y resultados del pipeline"
        lead="Dos fuentes: las comprobaciones que hace este servidor desde la DMZ cada 30 s (cifrado, segmentación, cabeceras, autenticación) y el último resultado del pipeline de seguridad de GitHub Actions con Trivy, recogido con infra/collect-ci.sh."
      />

      <div className="grid grid-kpi">
        <Kpi label="En vivo" value={`${checks.filter((c) => c.ok).length}/${checks.length}`} tone={checks.every((c) => c.ok) ? "ok" : "fail"} hint={`ejecutadas ${time(new Date(at).toISOString())}`} />
        <Kpi
          label="Pruebas de clase"
          value={tests ? `${tests.tests.filter((t) => t.ok).length}/${tests.tests.length}` : "—"}
          tone={tests ? (tests.tests.every((t) => t.ok) ? "ok" : "warn") : undefined}
          hint={tests ? `ejecutadas ${time(tests.generated_at)}` : "sin ejecutar"}
        />
      </div>

      <Section title="Comprobaciones en vivo" kicker="Desde app-ec2, cada 30 s">
        <div className="grid grid-2">
          {checks.map((c) => (
            <article key={c.id} id={`vivo-${c.id}`} className="card test">
              <div className="test-head">
                <h3>{c.title}</h3>
                <Status ok={c.ok} />
              </div>
              <dl className="kv">
                <dt>Destino</dt><dd>{c.target}</dd>
                <dt>Esperado</dt><dd>{c.expect}</dd>
                <dt>Observado</dt><dd>{c.observed}</dd>
                <dt>Tiempo</dt><dd>{c.ms} ms</dd>
                {Object.entries(c.details).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt>{k}</dt>
                    <dd>{String(v ?? "—")}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      </Section>

      {tests ? (
        [...groups.entries()].map(([clase, list]) => (
          <Section key={clase} title={clase} kicker="Pruebas de clase">
            <div className="grid">
              {list.map((t) => (
                <article key={t.id} id={t.id} className="card test">
                  <div className="test-head">
                    <div>
                      <h3>{t.titulo}</h3>
                      <div className="muted small">{time(t.fecha)}{t.origen ? ` · desde ${t.origen}` : ""}</div>
                    </div>
                    <Status ok={t.ok} />
                  </div>
                  <div className="test-cmd">{t.comando}</div>
                  <dl className="kv">
                    <dt>Esperado</dt><dd>{t.esperado}</dd>
                    <dt>Observado</dt><dd>{t.observado}</dd>
                  </dl>
                  {t.salida ? (
                    <details>
                      <summary>Salida</summary>
                      <pre>{t.salida}</pre>
                    </details>
                  ) : null}
                </article>
              ))}
            </div>
          </Section>
        ))
      ) : (
        <Empty>El resultado del pipeline aún no se ha recogido. Desde el equipo de administración: <code>infra/collect-ci.sh</code>.</Empty>
      )}

    </>
  );
}
