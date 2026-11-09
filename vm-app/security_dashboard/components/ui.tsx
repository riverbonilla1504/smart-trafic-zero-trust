import Link from "next/link";
import type { ReactNode } from "react";
import type { ResolvedEvidence } from "@/lib/resolve";
import type { HostState } from "@/lib/types";

export function Status({ ok, label }: { ok: boolean | null; label?: string }) {
  const cls = ok === null ? "status pending" : ok ? "status ok" : "status fail";
  const text = label ?? (ok === null ? "Pendiente" : ok ? "Cumple" : "Falla");
  return (
    <span className={cls}>
      <span className="status-dot" aria-hidden="true" />
      {text}
    </span>
  );
}

const STATE_TEXT: Record<HostState, string> = {
  online: "En línea",
  late: "Retrasado",
  offline: "Sin reportar",
  never: "Sin datos",
};

export function HostStatus({ state }: { state: HostState }) {
  return (
    <span className={`status host-${state}`}>
      <span className="status-dot" aria-hidden="true" />
      {STATE_TEXT[state]}
    </span>
  );
}

export function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "ok" | "warn" | "fail" }) {
  return (
    <div className={`kpi ${tone ? `kpi-${tone}` : ""}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {hint ? <div className="kpi-hint">{hint}</div> : null}
    </div>
  );
}

export function Meter({ value, max = 100, label, suffix = "%" }: { value: number; max?: number; label: string; suffix?: string }) {
  return (
    <div className="meter-row">
      <span className="meter-label">{label}</span>
      <meter min={0} max={max} low={max * 0.7} high={max * 0.9} optimum={0} value={value} />
      <span className="meter-value">
        {Math.round(value * 10) / 10}
        {suffix}
      </span>
    </div>
  );
}

export function Section({ id, title, kicker, children, actions }: { id?: string; title: string; kicker?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="section" id={id}>
      <header className="section-head">
        <div>
          {kicker ? <div className="kicker">{kicker}</div> : null}
          <h2>{title}</h2>
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function PageHead({ kicker, title, lead }: { kicker: string; title: string; lead?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="kicker">{kicker}</div>
      <h1>{title}</h1>
      {lead ? <p className="lead">{lead}</p> : null}
    </header>
  );
}

export function Tag({ children, tone }: { children: ReactNode; tone?: "ok" | "fail" | "warn" | "info" }) {
  return <span className={`tag ${tone ? `tag-${tone}` : ""}`}>{children}</span>;
}

export function Bool({ value, yes = "sí", no = "no", invert = false }: { value: boolean; yes?: string; no?: string; invert?: boolean }) {
  const good = invert ? !value : value;
  return <Tag tone={good ? "ok" : "fail"}>{value ? yes : no}</Tag>;
}

export function EvidenceList({ items }: { items: ResolvedEvidence[] }) {
  return (
    <ul className="evidence">
      {items.map((e) => (
        <li key={e.key} className="evidence-item">
          <Status ok={e.ok} />
          <div className="evidence-body">
            <div className="evidence-title">
              <span className="evidence-source">{e.source}</span>
              {e.href ? <Link href={e.href} prefetch={false}>{e.label}</Link> : e.label}
            </div>
            <div className="evidence-detail">{e.detail}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Score({ ok, total }: { ok: number; total: number }) {
  const tone = total === 0 ? "pending" : ok === total ? "ok" : ok / total >= 0.8 ? "warn" : "fail";
  return (
    <span className={`score score-${tone}`}>
      {ok}/{total}
    </span>
  );
}
