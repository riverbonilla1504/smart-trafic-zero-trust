#!/usr/bin/env bash
# Crea VPC, subredes, grupos de seguridad, claves y EC2 del proyecto.
# Se puede volver a ejecutar: reutiliza lo que ya existe (busca por etiquetas).
#
# Uso: infra/provision.sh <ip_admin>      ej. infra/provision.sh 203.0.113.25
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

ADMIN_IP="${1:?Indica la IP publica desde la que administras}"
AMI="ami-0d6dd9e8265d48906"   # Ubuntu 24.04 LTS amd64 (2026-10-23)

# ---------- Red ----------
VPC="$(vpc_id)"
if [ "$VPC" = "None" ]; then
  VPC="$(aw ec2 create-vpc --cidr-block "$VPC_CIDR" \
    --tag-specifications "$(tags vpc st-vpc)" --query 'Vpc.VpcId' --output text)"
  log "VPC creada: $VPC"
fi
aw ec2 modify-vpc-attribute --vpc-id "$VPC" --enable-dns-support '{"Value":true}'
aw ec2 modify-vpc-attribute --vpc-id "$VPC" --enable-dns-hostnames '{"Value":true}'

IGW="$(aw ec2 describe-internet-gateways --filters "Name=attachment.vpc-id,Values=$VPC" \
  --query 'InternetGateways[0].InternetGatewayId' --output text)"
if [ "$IGW" = "None" ]; then
  IGW="$(aw ec2 create-internet-gateway --tag-specifications "$(tags internet-gateway st-igw)" \
    --query 'InternetGateway.InternetGatewayId' --output text)"
  aw ec2 attach-internet-gateway --internet-gateway-id "$IGW" --vpc-id "$VPC"
  log "Internet Gateway creado: $IGW"
fi

ensure_subnet() { # nombre cidr
  local id
  id="$(subnet_id "$1")"
  if [ "$id" = "None" ]; then
    id="$(aw ec2 create-subnet --vpc-id "$VPC" --cidr-block "$2" --availability-zone "$AZ" \
      --tag-specifications "$(tags subnet "$1")" --query 'Subnet.SubnetId' --output text)"
    log "Subred $1 ($2): $id"
  fi
  echo "$id"
}

SN_ADMIN="$(ensure_subnet st-admin  10.0.0.0/24)"
SN_DMZ="$(ensure_subnet st-dmz      10.0.1.0/24)"
SN_AUTH="$(ensure_subnet st-auth    10.0.2.0/24)"
SN_INGEST="$(ensure_subnet st-ingest 10.0.3.0/24)"
SN_CORE="$(ensure_subnet st-core    10.0.4.0/24)"
SN_DATA="$(ensure_subnet st-data    10.0.5.0/24)"

ensure_rt() { # nombre
  local id
  id="$(aw ec2 describe-route-tables \
    --filters "Name=tag:Name,Values=$1" "Name=tag:Project,Values=$PROJECT" \
    --query 'RouteTables[0].RouteTableId' --output text)"
  if [ "$id" = "None" ]; then
    id="$(aw ec2 create-route-table --vpc-id "$VPC" \
      --tag-specifications "$(tags route-table "$1")" \
      --query 'RouteTable.RouteTableId' --output text)"
    log "Tabla de rutas $1: $id"
  fi
  echo "$id"
}

associate_rt() { # rt subred
  local current
  current="$(aw ec2 describe-route-tables \
    --filters "Name=association.subnet-id,Values=$2" \
    --query 'RouteTables[0].RouteTableId' --output text)"
  if [ "$current" != "$1" ]; then
    aw ec2 associate-route-table --route-table-id "$1" --subnet-id "$2" >/dev/null
  fi
}

RT_PUBLIC="$(ensure_rt st-rt-public)"
RT_PRIVATE="$(ensure_rt st-rt-private)"
aw ec2 create-route --route-table-id "$RT_PUBLIC" \
  --destination-cidr-block 0.0.0.0/0 --gateway-id "$IGW" >/dev/null 2>&1 || true
for s in "$SN_ADMIN" "$SN_DMZ"; do associate_rt "$RT_PUBLIC" "$s"; done
for s in "$SN_AUTH" "$SN_INGEST" "$SN_CORE" "$SN_DATA"; do associate_rt "$RT_PRIVATE" "$s"; done

# ---------- Grupos de seguridad (denegacion por defecto) ----------
ensure_sg() { # nombre descripcion
  local id
  id="$(sg_id "$1")"
  if [ "$id" = "None" ]; then
    id="$(aw ec2 create-security-group --group-name "$1" --description "$2" --vpc-id "$VPC" \
      --tag-specifications "$(tags security-group "$1")" --query 'GroupId' --output text)"
    # Quita la regla de salida "todo permitido" que AWS agrega por defecto.
    aw ec2 revoke-security-group-egress --group-id "$id" \
      --ip-permissions 'IpProtocol=-1,IpRanges=[{CidrIp=0.0.0.0/0}]' >/dev/null
    log "Grupo $1: $id"
  fi
  echo "$id"
}

authorize() { # ingress|egress sg permiso
  local out
  if ! out="$("$AWS_BIN" --region "$REGION" ec2 "authorize-security-group-$1" \
      --group-id "$2" --ip-permissions "$3" 2>&1)"; then
    case "$out" in
      *InvalidPermission.Duplicate*) ;;
      *) echo "$out" >&2; return 1 ;;
    esac
  fi
}

in_sg()    { authorize ingress "$1" "IpProtocol=tcp,FromPort=$2,ToPort=$2,UserIdGroupPairs=[{GroupId=$3,Description=$4}]"; }
in_cidr()  { authorize ingress "$1" "IpProtocol=tcp,FromPort=$2,ToPort=$2,IpRanges=[{CidrIp=$3,Description=$4}]"; }
out_sg()   { authorize egress  "$1" "IpProtocol=tcp,FromPort=$2,ToPort=$2,UserIdGroupPairs=[{GroupId=$3,Description=$4}]"; }
out_cidr() { authorize egress  "$1" "IpProtocol=tcp,FromPort=$2,ToPort=$2,IpRanges=[{CidrIp=$3,Description=$4}]"; }

SG_BASTION="$(ensure_sg st-bastion 'Bastion SSH de administracion')"
SG_APP="$(ensure_sg st-app 'DMZ dashboard publico')"
SG_AUTH="$(ensure_sg st-auth 'Servidor de autenticacion')"
SG_INGEST="$(ensure_sg st-ingest 'Simulador de sensores')"
SG_CORE="$(ensure_sg st-core 'Procesador de densidad')"
SG_DATA="$(ensure_sg st-data 'Kafka y RabbitMQ')"
# Salida temporal solo para instalar paquetes e imagenes; se retira con finish-setup.sh.
SG_SETUP="$(ensure_sg st-setup-egress 'Salida temporal para instalacion')"

in_cidr "$SG_BASTION" 22 "$ADMIN_IP/32" admin-ssh
out_cidr "$SG_BASTION" 22 "$VPC_CIDR" ssh-a-la-vpc

for sg in "$SG_APP" "$SG_AUTH" "$SG_INGEST" "$SG_CORE" "$SG_DATA"; do
  in_sg "$sg" 22 "$SG_BASTION" ssh-desde-bastion
done

in_cidr "$SG_APP" 80  0.0.0.0/0 http-publico
in_cidr "$SG_APP" 443 0.0.0.0/0 https-publico
out_sg  "$SG_APP" 443  "$SG_AUTH" token-auth
out_sg  "$SG_APP" 5671 "$SG_DATA" rabbitmq-tls

# core verifica los tokens con la clave publica: no necesita hablar con auth.
in_sg "$SG_AUTH" 443 "$SG_INGEST" token-ingest
in_sg "$SG_AUTH" 443 "$SG_APP"    token-app

out_sg "$SG_INGEST" 443  "$SG_AUTH" token-auth
out_sg "$SG_INGEST" 9092 "$SG_DATA" kafka-tls

out_sg "$SG_CORE" 9092 "$SG_DATA" kafka-tls
out_sg "$SG_CORE" 5671 "$SG_DATA" rabbitmq-tls

in_sg "$SG_DATA" 9092 "$SG_INGEST" kafka-ingest
in_sg "$SG_DATA" 9092 "$SG_CORE"   kafka-core
in_sg "$SG_DATA" 5671 "$SG_CORE"   rabbitmq-core
in_sg "$SG_DATA" 5671 "$SG_APP"    rabbitmq-app

# Agentes de monitoreo: cada maquina reporta su estado a app por TLS mutuo en 9443.
# Solo desde los grupos del proyecto; el puerto no se abre a internet.
for sg in "$SG_BASTION" "$SG_AUTH" "$SG_INGEST" "$SG_CORE" "$SG_DATA"; do
  in_sg  "$SG_APP" 9443 "$sg" reporte-agente
  out_sg "$sg" 9443 "$SG_APP" reporte-agente
done

out_cidr "$SG_SETUP" 80  0.0.0.0/0 setup-http
out_cidr "$SG_SETUP" 443 0.0.0.0/0 setup-https

# El grupo "default" de la VPC se deja sin reglas para que nadie dependa de el.
SG_DEFAULT="$(sg_id default)"
aw ec2 revoke-security-group-ingress --group-id "$SG_DEFAULT" \
  --ip-permissions "IpProtocol=-1,UserIdGroupPairs=[{GroupId=$SG_DEFAULT}]" >/dev/null 2>&1 || true
aw ec2 revoke-security-group-egress --group-id "$SG_DEFAULT" \
  --ip-permissions 'IpProtocol=-1,IpRanges=[{CidrIp=0.0.0.0/0}]' >/dev/null 2>&1 || true

# ---------- Claves (una por maquina, ed25519) ----------
ensure_key() { # nombre
  local file="$KEYS_DIR/$1.pem"
  local exists
  exists="$(aw ec2 describe-key-pairs --filters "Name=key-name,Values=$1" \
    --query 'KeyPairs[0].KeyName' --output text)"
  if [ "$exists" = "None" ]; then
    aw ec2 create-key-pair --key-name "$1" --key-type ed25519 \
      --tag-specifications "$(tags key-pair "$1")" \
      --query 'KeyMaterial' --output text > "$file"
    log "Clave $1 guardada en keys/"
  elif [ ! -s "$file" ]; then
    echo "La clave $1 existe en AWS pero falta $file" >&2
    return 1
  fi
  # Solo tu usuario de Windows puede leerla; ssh rechaza claves con permisos abiertos.
  MSYS2_ARG_CONV_EXCL='*' icacls "$(cygpath -w "$file")" /inheritance:r /grant:r "${USERNAME}:R" >/dev/null
}

# ---------- Maquinas ----------
ensure_instance() { # nombre subred ip tipo disco_gb publica(true|false) grupos hilos_por_nucleo
  local name="$1" subnet="$2" ip="$3" type="$4" disk="$5" public="$6" groups="$7" threads="$8"
  local id
  ensure_key "$name"
  id="$(aw ec2 describe-instances \
    --filters "Name=tag:Name,Values=$name" "Name=tag:Project,Values=$PROJECT" \
              "Name=instance-state-name,Values=pending,running,stopping,stopped" \
    --query 'Reservations[0].Instances[0].InstanceId' --output text)"
  if [ "$id" = "None" ]; then
    id="$(aw ec2 run-instances --image-id "$AMI" --instance-type "$type" --key-name "$name" \
      --count 1 \
      --network-interfaces "DeviceIndex=0,SubnetId=$subnet,PrivateIpAddress=$ip,AssociatePublicIpAddress=$public,Groups=$groups" \
      --block-device-mappings "DeviceName=/dev/sda1,Ebs={VolumeSize=$disk,VolumeType=gp3,Encrypted=true,DeleteOnTermination=true}" \
      --metadata-options 'HttpTokens=required,HttpEndpoint=enabled,HttpPutResponseHopLimit=1' \
      --credit-specification CpuCredits=standard \
      --cpu-options "CoreCount=1,ThreadsPerCore=$threads" \
      --tag-specifications "$(tags instance "$name")" "$(tags volume "$name")" \
      --query 'Instances[0].InstanceId' --output text)"
    log "Instancia $name ($ip, $type): $id"
  else
    log "Instancia $name ya existe: $id"
  fi
}

# Plan gratuito: solo tipos elegibles (todos de 2 vCPU) y limite de 8 vCPU en la cuenta.
# Por eso las maquinas de poca carga usan 1 hilo por nucleo (1 vCPU):
#   bastion, auth, ingest, core -> 1 vCPU (SSH o un proceso Node con ~2.5 eventos/s)
#   app  -> 2 vCPU (Nginx con TLS mas 3 servicios Node; recibe el trafico publico)
#   data -> 2 vCPU (Kafka y RabbitMQ son multihilo)
ensure_instance bastion-ec2 "$SN_ADMIN"  10.0.0.10 t3.micro 8  true  "$SG_BASTION,$SG_SETUP" 1
ensure_instance app-ec2     "$SN_DMZ"    10.0.1.10 t3.small 16 true  "$SG_APP,$SG_SETUP"     2
ensure_instance auth-ec2    "$SN_AUTH"   10.0.2.10 t3.micro 12 false "$SG_AUTH,$SG_SETUP"    1
ensure_instance ingest-ec2  "$SN_INGEST" 10.0.3.10 t3.micro 12 false "$SG_INGEST,$SG_SETUP"  1
ensure_instance core-ec2    "$SN_CORE"   10.0.4.10 t3.micro 12 false "$SG_CORE,$SG_SETUP"    1
ensure_instance data-ec2    "$SN_DATA"   10.0.5.10 t3.small 30 false "$SG_DATA,$SG_SETUP"    2

log "Esperando a que las instancias esten en ejecucion..."
# shellcheck disable=SC2046
aw ec2 wait instance-running --instance-ids $(project_instances | cut -f1)

"$(dirname "${BASH_SOURCE[0]}")/gen-ssh-config.sh"
log "Listo."
