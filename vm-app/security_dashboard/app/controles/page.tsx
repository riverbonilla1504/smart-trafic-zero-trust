import Link from "next/link";
import { connection } from "next/server";
import { ControlChips } from "@/components/Nav";
import { PageHead, Score } from "@/components/ui";
import { CONTROLS } from "@/lib/controls";
import { CONTROL_NAV } from "@/lib/navigation";
import { evidenceContext, resolveEvidence, score } from "@/lib/resolve";

export default async function ControlsPage() {
  await connection();
  const ctx = await evidenceContext();
  return (
    <>
      <PageHead
        kicker="Controles aplicados"
        title="Cada control de seguridad, con su evidencia en vivo"
        lead="Los controles están agrupados por familia. Para cada una: qué riesgo cubre, cómo se implementó (con los archivos donde está) y qué dato real de la infraestructura demuestra que funciona."
      />
      <ControlChips items={CONTROL_NAV} />
      <div className="grid grid-2">
        {CONTROLS.map((c) => {
          const s = score(c.evidence.map((ref) => resolveEvidence(ref, ctx)));
          return (
            <Link key={c.slug} href={`/controles/${c.slug}`} prefetch={false} className="card class-card">
              <div className="kicker">{c.area}</div>
              <h3>
                {c.title} <Score ok={s.ok} total={s.total} />
              </h3>
              <ul className="concepts small">
                {c.applied.map((a) => (
                  <li key={a.title}>{a.title}</li>
                ))}
              </ul>
              <p className="muted small">
                {c.applied.length} medidas · {c.evidence.length} evidencias
              </p>
            </Link>
          );
        })}
      </div>
    </>
  );
}
