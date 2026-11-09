#!/usr/bin/env bash
# Utilidades compartidas por los scripts de infraestructura.
set -euo pipefail

export MSYS_NO_PATHCONV=1   # Git Bash no debe reescribir rutas como /dev/sda1
export AWS_PAGER=""

# Otros programas (p. ej. PostgreSQL ODBC) pueden dejar OPENSSL_CONF apuntando a un
# archivo inexistente; se usa la configuracion que trae Git for Windows.
if [ -f /mingw64/etc/ssl/openssl.cnf ]; then
  OPENSSL_CONF="$(cygpath -m /mingw64/etc/ssl/openssl.cnf)"   # openssl.exe necesita ruta Windows
  export OPENSSL_CONF
fi

PROJECT="smart-traffic"
REGION="us-east-1"
AZ="us-east-1a"
VPC_CIDR="10.0.0.0/16"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEYS_DIR="$ROOT/keys"
GEN_DIR="$ROOT/infra/generated"
mkdir -p "$KEYS_DIR" "$GEN_DIR"

if command -v aws >/dev/null 2>&1; then
  AWS_BIN="aws"
else
  AWS_BIN="/c/Program Files/Amazon/AWSCLIV2/aws.exe"
fi

# En Windows aws.exe termina las lineas con CRLF; se limpia para usar los valores.
aw() { "$AWS_BIN" --region "$REGION" "$@" | tr -d '\r'; }

tags() { # tipo_recurso nombre
  echo "ResourceType=$1,Tags=[{Key=Name,Value=$2},{Key=Project,Value=$PROJECT}]"
}

# A stderr: varias funciones devuelven IDs por stdout dentro de $(...).
log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*" >&2; }

vpc_id() {
  aw ec2 describe-vpcs --filters "Name=tag:Project,Values=$PROJECT" \
    --query 'Vpcs[0].VpcId' --output text
}

sg_id() { # nombre
  aw ec2 describe-security-groups \
    --filters "Name=group-name,Values=$1" "Name=vpc-id,Values=$(vpc_id)" \
    --query 'SecurityGroups[0].GroupId' --output text
}

subnet_id() { # nombre
  aw ec2 describe-subnets \
    --filters "Name=tag:Name,Values=$1" "Name=tag:Project,Values=$PROJECT" \
    --query 'Subnets[0].SubnetId' --output text
}

private_rt_id() {
  aw ec2 describe-route-tables \
    --filters "Name=tag:Name,Values=st-rt-private" "Name=tag:Project,Values=$PROJECT" \
    --query 'RouteTables[0].RouteTableId' --output text
}

# Instancias del proyecto con su nombre: "id nombre"
project_instances() {
  aw ec2 describe-instances \
    --filters "Name=tag:Project,Values=$PROJECT" \
              "Name=instance-state-name,Values=pending,running,stopping,stopped" \
    --query 'Reservations[].Instances[].[InstanceId,Tags[?Key==`Name`]|[0].Value]' \
    --output text
}
