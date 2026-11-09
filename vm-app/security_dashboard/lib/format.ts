export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 60) return `${seconds} s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${m % 60} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

export function number(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("es-CO").format(n);
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function time(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-CO", { timeZone: "America/Bogota", hour12: false });
}

export function pct(part: number, total: number): number {
  return total ? Math.round((100 * part) / total) : 0;
}

// Resultado de una sonda TCP del agente, en palabras.
export function probeResult(result: string): string {
  if (result === "open") return "conecta";
  if (result === "blocked") return "bloqueado (sin respuesta)";
  if (result === "refused") return "rechazado";
  return result.replace(/^error:/, "error: ");
}
