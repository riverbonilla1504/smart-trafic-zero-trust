import type { EvidenceRef } from "./classes";
import { awsChecks, awsInventory, testsFile } from "./evidence";
import { liveChecks } from "./live";
import { allHosts } from "./store";

export type ResolvedEvidence = {
  key: string;
  source: "Agentes" | "Prueba" | "En vivo" | "AWS" | "Segmentación";
  label: string;
  ok: boolean | null; // null = aun no hay datos
  detail: string;
  href?: string;
};

// Junta todas las fuentes una vez por render y resuelve cada referencia de evidencia.
export async function evidenceContext() {
  const [{ checks: live }] = await Promise.all([liveChecks()]);
  const tests = testsFile();
  const aws = awsChecks(awsInventory());
  const hosts = allHosts().filter((h) => h.entry && h.state !== "offline");
  return { live, tests, aws, hosts };
}

export type EvidenceCtx = Awaited<ReturnType<typeof evidenceContext>>;

export function resolveEvidence(ref: EvidenceRef, ctx: EvidenceCtx): ResolvedEvidence {
  switch (ref.kind) {
    case "check": {
      const found = ctx.hosts
        .map((h) => ({ host: h.id, check: h.entry!.report.checks.find((c) => c.id === ref.id) }))
        .filter((x) => x.check);
      const failing = found.filter((x) => !x.check!.ok);
      return {
        key: `check:${ref.id}`,
        source: "Agentes",
        label: found[0]?.check?.label ?? ref.id,
        ok: found.length ? failing.length === 0 : null,
        detail: found.length
          ? failing.length
            ? `Falla en ${failing.map((f) => `${f.host} (${f.check!.detail})`).join(", ")}`
            : `${found.length}/${found.length} máquinas · ${found[0].check!.detail}`
          : "Sin reportes de los agentes todavía",
        href: "/maquinas",
      };
    }
    case "test": {
      const test = ctx.tests?.tests.find((t) => t.id === ref.id);
      return {
        key: `test:${ref.id}`,
        source: "Prueba",
        label: test?.titulo ?? ref.id,
        ok: test ? test.ok : null,
        detail: test ? test.observado : "Resultado aún no recogido (infra/collect-ci.sh)",
        href: `/pruebas#${ref.id}`,
      };
    }
    case "live": {
      const check = ctx.live.find((c) => c.id === ref.id);
      return {
        key: `live:${ref.id}`,
        source: "En vivo",
        label: check?.title ?? ref.id,
        ok: check ? check.ok : null,
        detail: check ? `${check.target} → ${check.observed}` : "Comprobación no disponible",
        href: `/pruebas#vivo-${ref.id}`,
      };
    }
    case "aws": {
      const check = ctx.aws.find((c) => c.id === ref.id);
      return {
        key: `aws:${ref.id}`,
        source: "AWS",
        label: check?.label ?? ref.id,
        ok: check ? check.ok : null,
        detail: check?.detail ?? "Inventario de AWS no cargado (infra/collect-aws.sh)",
        href: "/red",
      };
    }
    case "probes": {
      const probes = ctx.hosts.flatMap((h) => h.entry!.report.probes.map((p) => ({ ...p, origin: h.id })));
      const failing = probes.filter((p) => !p.ok);
      const allowed = probes.filter((p) => p.expect === "allow").length;
      return {
        key: "probes",
        source: "Segmentación",
        label: "Matriz de conexiones entre zonas",
        ok: probes.length ? failing.length === 0 : null,
        detail: probes.length
          ? failing.length
            ? `Fallan: ${failing.map((p) => `${p.origin}→${p.host}:${p.port}`).join(", ")}`
            : `${probes.length} intentos: ${allowed} permitidos conectan y ${probes.length - allowed} prohibidos quedan bloqueados`
          : "Sin reportes de los agentes todavía",
        href: "/red#matriz",
      };
    }
  }
}

export function score(items: ResolvedEvidence[]) {
  const known = items.filter((i) => i.ok !== null);
  return { ok: known.filter((i) => i.ok).length, known: known.length, total: items.length };
}
