#!/usr/bin/env bash
# Guarda como evidencia el ultimo resultado del pipeline de seguridad (GitHub Actions + Trivy)
# en la rama main: estado de cada trabajo y totales de vulnerabilidades que reporta Trivy.
#
# Uso: infra/collect-ci.sh   (despues: infra/deploy.sh evidence)
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

OUT_DIR="$GEN_DIR/evidence"
TMP="$GEN_DIR/ci-raw"
mkdir -p "$OUT_DIR/files" "$TMP"

RUN_ID="$(gh run list --branch main --workflow seguridad.yml --status completed --limit 1 --json databaseId --jq '.[0].databaseId')"
[ -n "$RUN_ID" ] || { echo "No hay ejecuciones terminadas del pipeline en main" >&2; exit 1; }
gh run view "$RUN_ID" --json databaseId,headSha,conclusion,createdAt,url,jobs > "$TMP/run.json"
gh run view "$RUN_ID" --log > "$TMP/run.log" 2>/dev/null || true

RAW="$(cygpath -w "$TMP")" OUT="$(cygpath -w "$OUT_DIR/tests.json")" python - <<'PY'
import json, os, re
from collections import defaultdict

raw = os.environ["RAW"]
run = json.load(open(os.path.join(raw, "run.json"), encoding="utf-8"))
log = open(os.path.join(raw, "run.log"), encoding="utf-8", errors="replace").read()

# Lineas de resumen de Trivy por trabajo: "Total: N (HIGH: x, CRITICAL: y)".
totals = defaultdict(list)
for line in log.splitlines():
    job, _, rest = line.partition("\t")
    match = re.search(r"Total: (\d+) \(([^)]*)\)", rest)
    if match:
        totals[job].append(f"{match.group(1)} ({match.group(2)})")

tests = []
for job in run["jobs"]:
    name = job["name"]
    found = totals.get(name, [])
    blocking = not name.startswith("third-party")
    tests.append({
        "id": "trivy-" + re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-"),
        "clase": "Sesión 7 · DevSecOps (GitHub Actions + Trivy)",
        "titulo": f"Trivy: {name}",
        "comando": "trivy " + ("fs + config (repositorio)" if name == "repo-scan" else "image") +
                   (" --severity CRITICAL,HIGH --ignore-unfixed --exit-code 1" if blocking else " --exit-code 0 (informativo)"),
        "esperado": "Sin hallazgos CRITICAL/HIGH corregibles (el trabajo falla si los hay)" if blocking
                    else "Informe de la imagen de terceros; no bloquea el pipeline",
        "observado": f'{job["conclusion"]} · ' + ("; ".join(found) if found else "sin hallazgos reportados"),
        "ok": job["conclusion"] == "success",
        "fecha": job.get("completedAt") or run["createdAt"],
        "origen": "GitHub Actions",
    })

tests.insert(0, {
    "id": "trivy-ci",
    "clase": "Sesión 7 · DevSecOps (GitHub Actions + Trivy)",
    "titulo": "Pipeline de seguridad en main",
    "comando": f'.github/workflows/seguridad.yml · ejecución {run["databaseId"]} · commit {run["headSha"][:7]}',
    "esperado": "Todos los trabajos en verde",
    "observado": f'{run["conclusion"]}: {sum(t["ok"] for t in tests)}/{len(tests)} trabajos correctos · {run["url"]}',
    "ok": run["conclusion"] == "success",
    "fecha": run["createdAt"],
    "origen": "GitHub Actions",
})

with open(os.environ["OUT"], "w", encoding="utf-8", newline="\n") as handle:
    json.dump({"generated_at": run["createdAt"], "tests": tests, "files": {}}, handle, ensure_ascii=False, indent=1)
print(f"{len(tests)} resultados del pipeline guardados")
PY
rm -rf "$TMP"
log "Resultado del pipeline guardado en infra/generated/evidence/tests.json"
