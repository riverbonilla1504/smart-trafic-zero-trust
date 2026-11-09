#!/usr/bin/env bash
# Genera la CA interna, los certificados y los secretos. Nada de esto se versiona.
# Se puede volver a ejecutar: conserva lo que ya existe, salvo el certificado publico
# de Nginx, que se renueva si cambia la IP de app-ec2.
#
# Uso: infra/gen-secrets.sh <ip_publica_app>
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

APP_PUBLIC_IP="${1:?Indica la IP publica de app-ec2}"
PKI="$KEYS_DIR/pki"
SEC="$KEYS_DIR/secrets"
mkdir -p "$PKI" "$SEC"
cd "$PKI"

gen_key() { # archivo
  [ -s "$1" ] || openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out "$1" 2>/dev/null
}

sign_cert() { # nombre cn san usos
  local name="$1" cn="$2" san="$3" usage="$4"
  gen_key "$name.key"
  openssl req -new -key "$name.key" -subj "/O=SmartTraffic/CN=$cn" -out "$name.csr"
  cat > "$name.ext" <<EOF
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=$usage
subjectAltName=$san
EOF
  openssl x509 -req -in "$name.csr" -CA ca.pem -CAkey ca.key -CAcreateserial \
    -days 365 -sha256 -extfile "$name.ext" -out "$name.crt" 2>/dev/null
  rm -f "$name.csr" "$name.ext"
  log "Certificado $name ($san)"
}

if [ ! -s ca.pem ]; then
  gen_key ca.key
  openssl req -x509 -new -key ca.key -sha256 -days 825 \
    -subj "/O=SmartTraffic/CN=SmartTraffic Internal CA" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -out ca.pem
  log "CA interna creada"
fi

[ -s auth.crt ]         || sign_cert auth         auth-ec2     "IP:10.0.2.10" serverAuth
[ -s kafka.crt ]        || sign_cert kafka        kafka        "IP:10.0.5.10" serverAuth,clientAuth
[ -s rabbitmq.crt ]     || sign_cert rabbitmq     rabbitmq     "IP:10.0.5.10" serverAuth
[ -s ingest-kafka.crt ] || sign_cert ingest-kafka ingest-ec2   "IP:10.0.3.10" clientAuth
[ -s core-kafka.crt ]   || sign_cert core-kafka   core-ec2     "IP:10.0.4.10" clientAuth

if [ "$(cat nginx.ip 2>/dev/null)" != "$APP_PUBLIC_IP" ]; then
  sign_cert nginx "$APP_PUBLIC_IP" "IP:$APP_PUBLIC_IP" serverAuth
  echo "$APP_PUBLIC_IP" > nginx.ip
fi

# Par RS256: auth firma con la privada; core solo tiene la publica y no puede emitir tokens.
if [ ! -s jwt-private.pem ]; then
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out jwt-private.pem 2>/dev/null
  openssl pkey -in jwt-private.pem -pubout -out jwt-public.pem
  log "Par de claves JWT creado"
fi

ENV_FILE="$SEC/secrets.env"
if [ ! -s "$ENV_FILE" ]; then
  rnd() { openssl rand -hex 24; }
  cat > "$ENV_FILE" <<EOF
AUTH_SENSOR_SECRET=$(rnd)
AUTH_DISPATCHER_SECRET=$(rnd)
RABBITMQ_ADMIN_PASSWORD=$(rnd)
RABBITMQ_CORE_PASSWORD=$(rnd)
RABBITMQ_DISPATCHER_PASSWORD=$(rnd)
RABBITMQ_QUERY_PASSWORD=$(rnd)
DASHBOARD_USER=admin
DASHBOARD_PASSWORD=$(openssl rand -base64 18 | tr -d '/+=')
EOF
  log "Secretos creados en keys/secrets/secrets.env"
fi
# shellcheck disable=SC1090
source "$ENV_FILE"

# Clase 1: en auth solo se guarda el hash con sal de cada secreto de cliente.
if [ ! -s "$SEC/clients.json" ]; then
  AUTH_SENSOR_SECRET="$AUTH_SENSOR_SECRET" AUTH_DISPATCHER_SECRET="$AUTH_DISPATCHER_SECRET" \
  OUT_FILE="$(cygpath -w "$SEC/clients.json")" python - <<'PY'
import hashlib, json, os, secrets

def scrypt_hash(secret):
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(secret.encode(), salt=salt, n=16384, r=8, p=1, dklen=64)
    return f"scrypt:{salt.hex()}:{derived.hex()}"

clients = {
    "sensor": {"hash": scrypt_hash(os.environ["AUTH_SENSOR_SECRET"]), "scope": "events:publish"},
    "dispatcher": {"hash": scrypt_hash(os.environ["AUTH_DISPATCHER_SECRET"]), "scope": "events:consume"},
}
with open(os.environ["OUT_FILE"], "w", newline="\n") as handle:
    json.dump(clients, handle)
PY
  log "Hashes de clientes creados"
fi

if [ ! -s "$SEC/htpasswd" ]; then
  printf '%s:%s\n' "$DASHBOARD_USER" "$(openssl passwd -6 "$DASHBOARD_PASSWORD")" > "$SEC/htpasswd"
  log "Usuario del dashboard creado"
fi
