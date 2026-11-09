#!/usr/bin/env bash
# Prepara todas las maquinas en paralelo y reinicia las que lo pidan.
# Requiere el NAT activo (infra/nat.sh up) para las subredes privadas.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
set +e

SSH=/c/Windows/System32/OpenSSH/ssh.exe
CFG="$(cygpath -m "$GEN_DIR/ssh_config")"   # ssh.exe de Windows no entiende rutas /c/...
OUT="$GEN_DIR/bootstrap"
mkdir -p "$OUT"

run() { # host rol swap_mb
  "$SSH" -F "$CFG" -o BatchMode=yes "$1" "sudo bash -s -- $2 $3" \
    < "$ROOT/infra/bootstrap-host.sh" > "$OUT/$1.log" 2>&1
  echo "$1 exit=$? $(grep -a BOOTSTRAP_OK "$OUT/$1.log" | tr -d '\r')"
}

run bastion bastion 512  &
run app     app     2048 &
run auth    auth    1024 &
run ingest  ingest  1024 &
run core    core    1024 &
run data    data    2048 &
wait

log "Reiniciando las maquinas que lo requieren..."
for h in bastion app auth ingest core data; do
  [ "$h" = "bastion" ] && continue
  if grep -aq 'reboot=required' "$OUT/$h.log"; then
    "$SSH" -F "$CFG" -o BatchMode=yes "$h" 'sudo systemctl reboot' >/dev/null 2>&1
    echo "$h reiniciando"
  fi
done
# El bastion va al final: las demas conexiones pasan por el.
if grep -aq 'reboot=required' "$OUT/bastion.log"; then
  sleep 5
  "$SSH" -F "$CFG" -o BatchMode=yes bastion 'sudo systemctl reboot' >/dev/null 2>&1
  echo "bastion reiniciando"
fi

sleep 45
for h in bastion app auth ingest core data; do
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if "$SSH" -F "$CFG" -o BatchMode=yes "$h" true 2>/dev/null; then break; fi
    sleep 15
  done
  printf '%-8s ' "$h"
  "$SSH" -F "$CFG" -o BatchMode=yes "$h" \
    'echo "kernel=$(uname -r) swap=$(free -m | awk "/Swap:/{print \$2}")MB docker=$(docker --version 2>/dev/null | cut -d" " -f3 | tr -d ,) compose=$(docker compose version --short 2>/dev/null) nft=$(nft --version | cut -d" " -f2) snap=$(command -v snap || echo no) reboot=$([ -f /var/run/reboot-required ] && echo pending || echo no)"' 2>&1 | tr -d '\r' | tail -1
done
