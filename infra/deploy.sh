#!/usr/bin/env bash
# Despliega codigo, secretos y firewall en las maquinas.
# Requiere salida a internet (infra/nat.sh up) la primera vez o al reconstruir imagenes.
#
# Uso: infra/deploy.sh [firewall|data|auth|core|ingest|app|agent|evidence ...]   (por defecto: todo)
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

SSH_EXE=/c/Windows/System32/OpenSSH/ssh.exe
CFG="$(cygpath -m "$GEN_DIR/ssh_config")"   # ssh.exe de Windows no entiende rutas /c/...
PKI="$KEYS_DIR/pki"
SEC="$KEYS_DIR/secrets"
REMOTE=/opt/smart-traffic

rssh() { "$SSH_EXE" -F "$CFG" -o BatchMode=yes "$@"; }

# shellcheck disable=SC1091
source "$GEN_DIR/public_ips.env"   # define bastion= y app=
"$ROOT/infra/gen-secrets.sh" "$app"
# shellcheck disable=SC1091
source "$SEC/secrets.env"

push_code() { # host vm_dir
  # Se borra el codigo anterior (no los secretos, evidencias ni .env) para que no queden
  # archivos que ya no existen en el repositorio.
  rssh "$1" "sudo mkdir -p $REMOTE/$2 &&
    sudo find $REMOTE/$2 -mindepth 1 -maxdepth 1 ! -name secrets ! -name evidence ! -name .env -exec rm -rf {} + &&
    sudo chown -R ubuntu:ubuntu $REMOTE/$2"
  tar czf - --exclude=node_modules --exclude=.next --exclude=secrets --exclude=evidence --exclude=.env -C "$ROOT" "$2" \
    | rssh "$1" "tar xzf - -C $REMOTE"
}

# Copia un directorio preparado como secrets/ con el propietario que usa el contenedor.
push_secrets() { # host vm_dir staging
  # Se borran los archivos pero no los directorios: un contenedor que no se recrea sigue
  # montando el mismo directorio y ve los archivos nuevos.
  tar czf - -C "$3" . | rssh "$1" "
    sudo mkdir -p $REMOTE/$2/secrets && sudo find $REMOTE/$2/secrets -mindepth 1 -type f -delete &&
    sudo tar xzf - --no-same-owner -C $REMOTE/$2/secrets"
}

push_env() { # host vm_dir (contenido por stdin)
  rssh "$1" "sudo tee $REMOTE/$2/.env >/dev/null && sudo chown root:root $REMOTE/$2/.env && sudo chmod 600 $REMOTE/$2/.env"
}

stage() { # nombre -> directorio temporal limpio
  local d="$GEN_DIR/staging/$1"
  rm -rf "$d"
  mkdir -p "$d"
  echo "$d"
}

compose_up() { # host vm_dir
  rssh "$1" "cd $REMOTE/$2 && sudo docker compose up -d --build --remove-orphans" 2>&1 | tr -d '\r' | tail -5
}

deploy_data() {
  log "== data =="
  push_code data vm-data
  local d
  d="$(stage data)"
  mkdir -p "$d/kafka" "$d/rabbitmq"
  cat "$PKI/kafka.key" "$PKI/kafka.crt" > "$d/kafka/keystore.pem"
  cp "$PKI/ca.pem" "$d/kafka/ca.pem"
  cp "$PKI/ca.pem" "$d/rabbitmq/ca.pem"
  cp "$PKI/rabbitmq.crt" "$d/rabbitmq/server.crt"
  cp "$PKI/rabbitmq.key" "$d/rabbitmq/server.key"
  push_secrets data vm-data "$d"
  # Kafka corre como uid 1000 y RabbitMQ como uid 999.
  rssh data "sudo sh -c 'cd $REMOTE/vm-data/secrets && chown -R 1000:1000 kafka && chown -R 999:999 rabbitmq &&
             chmod 500 kafka rabbitmq && chmod 400 kafka/* rabbitmq/*'"
  printf 'RABBITMQ_ADMIN_PASSWORD=%s\n' "$RABBITMQ_ADMIN_PASSWORD" | push_env data vm-data
  compose_up data vm-data

  log "Esperando a RabbitMQ..."
  rssh data 'for i in $(seq 1 40); do sudo docker exec rabbitmq rabbitmqctl await_startup --timeout 5 >/dev/null 2>&1 && exit 0; sleep 5; done; exit 1'

  # Un usuario por servicio, con permisos solo sobre lo que usa (minimo privilegio).
  rssh data 'sudo bash -s' <<EOF
set -e
rmq() { docker exec rabbitmq rabbitmqctl --quiet "\$@"; }
user() {
  rmq add_user "\$1" "\$2" 2>/dev/null || rmq change_password "\$1" "\$2"
  rmq set_permissions -p / "\$1" "\$3" "\$4" "\$5"
}
user core '$RABBITMQ_CORE_PASSWORD' '^traffic\.events\$' '^traffic\.events\$' '^\$'
user dispatcher '$RABBITMQ_DISPATCHER_PASSWORD' '^(alerts|traffic\.events)\$' '^alerts\$' '^(alerts|traffic\.events)\$'
user query '$RABBITMQ_QUERY_PASSWORD' '^(query_traffic_queue|query_answers)\$' '^(query_traffic_queue|amq\.default)\$' '^query_answers\$'
# Nadie consume query_traffic_queue todavia: se limita para que no crezca sin fin.
rmq set_policy query-limit '^query_' '{"max-length":1000}' --apply-to queues
EOF
}

deploy_auth() {
  log "== auth =="
  push_code auth vm-auth
  local d
  d="$(stage auth)"
  cp "$PKI/auth.crt" "$d/server.crt"
  cp "$PKI/auth.key" "$d/server.key"
  cp "$PKI/jwt-private.pem" "$SEC/clients.json" "$d/"
  push_secrets auth vm-auth "$d"
  rssh auth "sudo sh -c 'cd $REMOTE/vm-auth/secrets && chown -R 1000:1000 . && chmod 500 . && chmod 400 *'"
  compose_up auth vm-auth
}

deploy_core() {
  log "== core =="
  push_code core vm-core
  local d
  d="$(stage core)"
  cp "$PKI/ca.pem" "$PKI/jwt-public.pem" "$d/"
  cp "$PKI/core-kafka.crt" "$d/kafka-client.crt"
  cp "$PKI/core-kafka.key" "$d/kafka-client.key"
  push_secrets core vm-core "$d"
  rssh core "sudo sh -c 'cd $REMOTE/vm-core/secrets && chown -R 1000:1000 . && chmod 500 . && chmod 400 *'"
  printf 'RABBITMQ_CORE_PASSWORD=%s\n' "$RABBITMQ_CORE_PASSWORD" | push_env core vm-core
  compose_up core vm-core
}

deploy_ingest() {
  log "== ingest =="
  push_code ingest vm-ingest
  local d
  d="$(stage ingest)"
  cp "$PKI/ca.pem" "$d/"
  cp "$PKI/ingest-kafka.crt" "$d/kafka-client.crt"
  cp "$PKI/ingest-kafka.key" "$d/kafka-client.key"
  push_secrets ingest vm-ingest "$d"
  rssh ingest "sudo sh -c 'cd $REMOTE/vm-ingest/secrets && chown -R 1000:1000 . && chmod 500 . && chmod 400 *'"
  printf 'AUTH_CLIENT_SECRET=%s\n' "$AUTH_SENSOR_SECRET" | push_env ingest vm-ingest
  compose_up ingest vm-ingest
}

deploy_app() {
  log "== app =="
  # El dashboard estatico anterior se sustituyo por security_dashboard (Next.js).
  rssh app "sudo rm -rf $REMOTE/vm-app/nginx/html"
  push_code app vm-app
  local d token
  d="$(stage app)"
  token="$(tr -d '\r\n' < "$SEC/gateway-token")"
  mkdir -p "$d/nginx" "$d/dashboard"
  cp "$PKI/ca.pem" "$d/ca.pem"
  cat "$PKI/nginx.crt" "$PKI/ca.pem" > "$d/nginx/server.crt"
  cp "$PKI/nginx.key" "$d/nginx/server.key"
  cp "$SEC/htpasswd" "$d/nginx/htpasswd"
  # Pasarela de agentes: certificado para 10.0.1.10 y CA para verificar a los clientes.
  cat "$PKI/report.crt" "$PKI/ca.pem" > "$d/nginx/report.crt"
  cp "$PKI/report.key" "$d/nginx/report.key"
  cp "$PKI/ca.pem" "$d/nginx/ca.pem"
  printf 'proxy_set_header X-Gateway-Token "%s";\n' "$token" > "$d/nginx/gateway-token.conf"
  cp "$PKI/ca.pem" "$d/dashboard/ca.pem"
  printf '%s\n' "$token" > "$d/dashboard/gateway-token"
  push_secrets app vm-app "$d"
  # Nginx sin privilegios corre como uid 101; los servicios Node (uid 1000) solo leen lo suyo.
  rssh app "sudo sh -c 'cd $REMOTE/vm-app/secrets && chown -R 101:101 nginx && chmod 500 nginx && chmod 400 nginx/* &&
            chown -R 1000:1000 dashboard && chmod 500 dashboard && chmod 400 dashboard/* &&
            chown 1000:1000 ca.pem && chmod 444 ca.pem'"
  {
    printf 'AUTH_DISPATCHER_SECRET=%s\n' "$AUTH_DISPATCHER_SECRET"
    printf 'RABBITMQ_DISPATCHER_PASSWORD=%s\n' "$RABBITMQ_DISPATCHER_PASSWORD"
    printf 'RABBITMQ_QUERY_PASSWORD=%s\n' "$RABBITMQ_QUERY_PASSWORD"
    printf 'PUBLIC_IP=%s\n' "$app"
  } | push_env app vm-app
  deploy_evidence
  compose_up app vm-app
}

# Evidencias generadas en el equipo de administracion (pruebas e inventario de AWS).
deploy_evidence() {
  local src="$GEN_DIR/evidence"
  mkdir -p "$src/files"
  # El directorio se conserva (el contenedor lo tiene montado); solo se reemplaza su contenido.
  tar czf - -C "$src" . | rssh app "
    sudo mkdir -p $REMOTE/vm-app/evidence && sudo find $REMOTE/vm-app/evidence -mindepth 1 -delete &&
    sudo tar xzf - --no-same-owner -C $REMOTE/vm-app/evidence &&
    sudo chown -R root:root $REMOTE/vm-app/evidence && sudo chmod -R a+rX,go-w $REMOTE/vm-app/evidence"
  log "Evidencias copiadas a app-ec2"
}

# Agente de monitoreo: script, certificado propio, configuracion y timer de systemd.
deploy_agent() {
  local host d
  for host in bastion app auth ingest core data; do
    d="$(stage "agent-$host")"
    cp "$ROOT/infra/agent/st-agent.py" "$ROOT/infra/agent/st-agent.service" "$ROOT/infra/agent/st-agent.timer" "$d/"
    cp "$PKI/ca.pem" "$d/ca.pem"
    cp "$PKI/agent-$host.crt" "$d/agent.crt"
    cp "$PKI/agent-$host.key" "$d/agent.key"
    HOSTS_FILE="$(cygpath -w "$ROOT/infra/agent/hosts.json")" OUT="$(cygpath -w "$d/agent.json")" H="$host" python - <<'PY'
import json, os
data = json.load(open(os.environ["HOSTS_FILE"], encoding="utf-8"))
conf = {**data["defaults"], **data["hosts"][os.environ["H"]], "host": os.environ["H"]}
with open(os.environ["OUT"], "w", encoding="utf-8", newline="\n") as handle:
    json.dump(conf, handle, ensure_ascii=False, indent=1)
PY
    tar czf - -C "$d" . | rssh "$host" "sudo sh -c '
      set -e
      tmp=\$(mktemp -d) && tar xzf - --no-same-owner -C \$tmp
      install -o root -g root -m 0750 \$tmp/st-agent.py /usr/local/sbin/st-agent
      install -o root -g root -m 0644 \$tmp/st-agent.service \$tmp/st-agent.timer /etc/systemd/system/
      install -d -o root -g root -m 0700 /etc/st-agent
      install -o root -g root -m 0644 \$tmp/ca.pem \$tmp/agent.crt \$tmp/agent.json /etc/st-agent/
      install -o root -g root -m 0600 \$tmp/agent.key /etc/st-agent/agent.key
      rm -rf \$tmp
      systemctl daemon-reload
      systemctl enable --now st-agent.timer >/dev/null 2>&1
      systemctl start st-agent.service || true
      journalctl -u st-agent.service -n 1 -o cat --no-pager'" 2>&1 | tr -d '\r' | tail -1 | sed "s/^/[$host] /"
  done
}

# Aplica el firewall con reversion automatica: si cortara el SSH, se retira a los 2 minutos.
deploy_firewall() {
  local host conf
  for pair in app:vm-app data:vm-data auth:vm-auth ingest:vm-ingest core:vm-core bastion:vm-bastion; do
    host="${pair%%:*}"
    conf="${pair##*:}"
    log "Firewall $host"
    rssh "$host" 'sudo tee /tmp/nftables.new >/dev/null' < "$ROOT/common/$conf.conf"
    rssh "$host" 'sudo nft -c -f /tmp/nftables.new'
    rssh "$host" 'sudo systemctl stop fw-rollback.timer 2>/dev/null; sudo systemd-run --quiet --unit=fw-rollback --on-active=120 /usr/sbin/nft delete table inet hostfw; sudo nft -f /tmp/nftables.new'
    # Una conexion nueva demuestra que el firewall no bloquea el acceso.
    rssh "$host" 'sudo systemctl stop fw-rollback.timer && sudo cp /tmp/nftables.new /etc/nftables.conf && sudo systemctl enable nftables >/dev/null 2>&1 && echo aplicado' 2>&1 | tr -d '\r' | tail -1
  done
}

TARGETS=("$@")
[ "${#TARGETS[@]}" -gt 0 ] || TARGETS=(data auth core ingest app firewall agent)

for target in "${TARGETS[@]}"; do
  case "$target" in
    data)     deploy_data ;;
    auth)     deploy_auth ;;
    core)     deploy_core ;;
    ingest)   deploy_ingest ;;
    app)      deploy_app ;;
    firewall) deploy_firewall ;;
    agent)    deploy_agent ;;
    evidence) deploy_evidence ;;
    *) echo "Destino desconocido: $target" >&2; exit 2 ;;
  esac
done

rm -rf "$GEN_DIR/staging"
log "Despliegue terminado."
