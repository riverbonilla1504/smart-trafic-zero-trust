import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ControlChips } from "@/components/Nav";
import { EvidenceList, PageHead, Score, Section, Tag } from "@/components/ui";
import { CONTROLS, controlBySlug } from "@/lib/controls";
import { CONTROL_NAV } from "@/lib/navigation";
import { evidenceContext, resolveEvidence, score } from "@/lib/resolve";

export default async function ControlPage({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  const c = controlBySlug(slug);
  if (!c) notFound();

  const ctx = await evidenceContext();
  const evidence = c.evidence.map((ref) => resolveEvidence(ref, ctx));
  const s = score(evidence);
  const index = CONTROLS.findIndex((x) => x.slug === slug);
  const prev = CONTROLS[index - 1];
  const next = CONTROLS[index + 1];

  return (
    <>
      <ControlChips items={CONTROL_NAV} />
      <PageHead
        kicker={`Controles aplicados · ${c.area}`}
        title={c.title}
        lead={
          <>
            Evidencias que cumplen ahora mismo: <Score ok={s.ok} total={s.total} />
            {s.known < s.total ? <span className="muted"> · {s.total - s.known} sin datos todavía</span> : null}
          </>
        }
      />

      <div className="grid grid-2">
        <Section title="Qué riesgo cubre" kicker="Objetivo del control">
          <div className="card">
            <ul className="concepts">
              {c.risks.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
          {c.limits ? <p className="note">{c.limits}</p> : null}
        </Section>

        <Section title="Evidencia" kicker="Comprobado en la infraestructura">
          <EvidenceList items={evidence} />
        </Section>
      </div>

      <Section title="Cómo se aplicó" kicker="Implementación">
        <div className="applied">
          {c.applied.map((a) => (
            <article key={a.title} className="applied-item">
              <h3>{a.title}</h3>
              <p>{a.detail}</p>
              <div className="files">
                {a.files.map((f) => (
                  <Tag key={f}>{f}</Tag>
                ))}
              </div>
            </article>
          ))}
        </div>
      </Section>

      <nav className="pager" aria-label="Otros controles">
        {prev ? <Link href={`/controles/${prev.slug}`} prefetch={false}>← {prev.title}</Link> : <span />}
        {next ? (
          <Link href={`/controles/${next.slug}`} prefetch={false}>{next.title} →</Link>
        ) : (
          <Link href="/pruebas" prefetch={false}>Pruebas y evidencias →</Link>
        )}
      </nav>
    </>
  );
}
