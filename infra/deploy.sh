#!/usr/bin/env bash
# Despliega codigo, secretos y firewall en las maquinas.
# Requiere salida a internet (infra/nat.sh up) la primera vez o al reconstruir imagenes.
#
# Uso: infra/deploy.sh [firewall|data|auth|core|ingest|app ...]   (por defecto: todo)
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
  rssh "$1" "sudo mkdir -p $REMOTE/$2 && sudo chown -R ubuntu:ubuntu $REMOTE/$2"
  tar czf - --exclude=node_modules --exclude=secrets --exclude=.env -C "$ROOT" "$2" \
    | rssh "$1" "tar xzf - -C $REMOTE"
}

# Copia un directorio preparado como secrets/ con el propietario que usa el contenedor.
push_secrets() { # host vm_dir staging
  tar czf - -C "$3" . | rssh "$1" "
    sudo rm -rf $REMOTE/$2/secrets && sudo mkdir -p $REMOTE/$2/secrets &&
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
  push_code app vm-app
  local d
  d="$(stage app)"
  mkdir -p "$d/nginx"
  cp "$PKI/ca.pem" "$d/ca.pem"
  cat "$PKI/nginx.crt" "$PKI/ca.pem" > "$d/nginx/server.crt"
  cp "$PKI/nginx.key" "$d/nginx/server.key"
  cp "$SEC/htpasswd" "$d/nginx/htpasswd"
  push_secrets app vm-app "$d"
  # Nginx sin privilegios corre como uid 101; los servicios Node solo leen ca.pem.
  rssh app "sudo sh -c 'cd $REMOTE/vm-app/secrets && chown -R 101:101 nginx && chmod 500 nginx && chmod 400 nginx/* &&
            chown 1000:1000 ca.pem && chmod 444 ca.pem'"
  {
    printf 'AUTH_DISPATCHER_SECRET=%s\n' "$AUTH_DISPATCHER_SECRET"
    printf 'RABBITMQ_DISPATCHER_PASSWORD=%s\n' "$RABBITMQ_DISPATCHER_PASSWORD"
    printf 'RABBITMQ_QUERY_PASSWORD=%s\n' "$RABBITMQ_QUERY_PASSWORD"
  } | push_env app vm-app
  compose_up app vm-app
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
[ "${#TARGETS[@]}" -gt 0 ] || TARGETS=(data auth core ingest app firewall)

for target in "${TARGETS[@]}"; do
  case "$target" in
    data)     deploy_data ;;
    auth)     deploy_auth ;;
    core)     deploy_core ;;
    ingest)   deploy_ingest ;;
    app)      deploy_app ;;
    firewall) deploy_firewall ;;
    *) echo "Destino desconocido: $target" >&2; exit 2 ;;
  esac
done

rm -rf "$GEN_DIR/staging"
log "Despliegue terminado."
