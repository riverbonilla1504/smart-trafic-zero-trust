// Grafica minima en SVG (sin estilos inline, compatible con la CSP).
export function Sparkline({
  values,
  max,
  label,
  unit = "",
}: {
  values: number[];
  max?: number;
  label: string;
  unit?: string;
}) {
  const w = 240;
  const h = 48;
  const top = max ?? Math.max(1, ...values);
  const last = values.at(-1);
  if (values.length < 2) {
    return (
      <figure className="spark">
        <figcaption>
          {label} <strong>{last ?? "—"}{last !== undefined ? unit : ""}</strong>
        </figcaption>
        <div className="spark-empty">Acumulando historial…</div>
      </figure>
    );
  }
  const step = w / (values.length - 1);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (Math.min(v, top) / top) * (h - 4)).toFixed(1)}`);
  return (
    <figure className="spark">
      <figcaption>
        {label} <strong>{last}{unit}</strong>
      </figcaption>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`${label}: último valor ${last}${unit}`}>
        <polygon className="spark-area" points={`0,${h} ${points.join(" ")} ${w},${h}`} />
        <polyline className="spark-line" points={points.join(" ")} />
      </svg>
    </figure>
  );
}
