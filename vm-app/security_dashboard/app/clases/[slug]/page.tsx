import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ClassChips } from "@/components/Nav";
import { EvidenceList, PageHead, Score, Section, Tag } from "@/components/ui";
import { CLASSES, classBySlug } from "@/lib/classes";
import { CLASS_NAV } from "@/lib/navigation";
import { evidenceContext, resolveEvidence, score } from "@/lib/resolve";

export default async function ClassPage({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  const c = classBySlug(slug);
  if (!c) notFound();

  const ctx = await evidenceContext();
  const evidence = c.evidence.map((ref) => resolveEvidence(ref, ctx));
  const s = score(evidence);
  const index = CLASSES.findIndex((x) => x.slug === slug);
  const prev = CLASSES[index - 1];
  const next = CLASSES[index + 1];

  return (
    <>
      <ClassChips items={CLASS_NAV} />
      <PageHead
        kicker={`${c.label} · ${c.date} · ${c.pdf}`}
        title={c.title}
        lead={
          <>
            Evidencias que cumplen ahora mismo: <Score ok={s.ok} total={s.total} />
            {s.known < s.total ? <span className="muted"> · {s.total - s.known} sin datos todavía</span> : null}
          </>
        }
      />

      <div className="grid grid-2">
        <Section title="Qué se vio en clase" kicker="Conceptos">
          <div className="card">
            <ul className="concepts">
              {c.concepts.map((x) => (
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

      <nav className="pager" aria-label="Otras clases">
        {prev ? <Link href={`/clases/${prev.slug}`} prefetch={false}>← {prev.label}: {prev.title}</Link> : <span />}
        {next ? <Link href={`/clases/${next.slug}`} prefetch={false}>{next.label}: {next.title} →</Link> : <Link href="/pruebas" prefetch={false}>Pruebas y evidencias →</Link>}
      </nav>
    </>
  );
}
