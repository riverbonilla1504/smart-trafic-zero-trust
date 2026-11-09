import Link from "next/link";
import { connection } from "next/server";
import { ClassChips } from "@/components/Nav";
import { PageHead, Score } from "@/components/ui";
import { CLASSES } from "@/lib/classes";
import { CLASS_NAV } from "@/lib/navigation";
import { evidenceContext, resolveEvidence, score } from "@/lib/resolve";

export default async function ClassesPage() {
  await connection();
  const ctx = await evidenceContext();
  return (
    <>
      <PageHead
        kicker="Clases aplicadas"
        title="De cada documento de clase a una medida comprobable"
        lead="Para cada sesión: qué conceptos se vieron, cómo se aplicaron en el proyecto (con los archivos donde está) y qué evidencia en vivo lo demuestra."
      />
      <ClassChips items={CLASS_NAV} />
      <div className="grid grid-2">
        {CLASSES.map((c) => {
          const s = score(c.evidence.map((ref) => resolveEvidence(ref, ctx)));
          return (
            <Link key={c.slug} href={`/clases/${c.slug}`} prefetch={false} className="card class-card">
              <div className="kicker">{c.label} · {c.date}</div>
              <h3>
                {c.title} <Score ok={s.ok} total={s.total} />
              </h3>
              <ul className="concepts small">
                {c.applied.map((a) => (
                  <li key={a.title}>{a.title}</li>
                ))}
              </ul>
              <p className="muted small">Documento: {c.pdf}</p>
            </Link>
          );
        })}
      </div>
    </>
  );
}
