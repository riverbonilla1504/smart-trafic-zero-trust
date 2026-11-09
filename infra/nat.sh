#!/usr/bin/env bash
# Activa o elimina el NAT Gateway temporal de las subredes privadas.
# Cuesta unos $0.045/h mas datos: dejalo activo solo mientras instalas o aplicas parches.
#
# Uso: infra/nat.sh up | down | status
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

nat_id() {
  aw ec2 describe-nat-gateways \
    --filter "Name=tag:Project,Values=$PROJECT" "Name=state,Values=pending,available" \
    --query 'NatGateways[0].NatGatewayId' --output text
}

case "${1:-status}" in
  up)
    NAT="$(nat_id)"
    if [ "$NAT" = "None" ]; then
      ALLOC="$(aw ec2 allocate-address --domain vpc \
        --tag-specifications "$(tags elastic-ip st-nat-eip)" \
        --query 'AllocationId' --output text)"
      NAT="$(aw ec2 create-nat-gateway --subnet-id "$(subnet_id st-admin)" --allocation-id "$ALLOC" \
        --tag-specifications "$(tags natgateway st-nat)" \
        --query 'NatGateway.NatGatewayId' --output text)"
      log "NAT creado: $NAT. Esperando a que este disponible (unos minutos)..."
    fi
    aw ec2 wait nat-gateway-available --nat-gateway-ids "$NAT"
    RT="$(private_rt_id)"
    aw ec2 replace-route --route-table-id "$RT" --destination-cidr-block 0.0.0.0/0 \
        --nat-gateway-id "$NAT" >/dev/null 2>&1 || \
      aw ec2 create-route --route-table-id "$RT" --destination-cidr-block 0.0.0.0/0 \
        --nat-gateway-id "$NAT" >/dev/null
    log "NAT activo: $NAT"
    ;;
  down)
    RT="$(private_rt_id)"
    aw ec2 delete-route --route-table-id "$RT" --destination-cidr-block 0.0.0.0/0 >/dev/null 2>&1 || true
    NAT="$(nat_id)"
    if [ "$NAT" != "None" ]; then
      ALLOC="$(aw ec2 describe-nat-gateways --nat-gateway-ids "$NAT" \
        --query 'NatGateways[0].NatGatewayAddresses[0].AllocationId' --output text)"
      aw ec2 delete-nat-gateway --nat-gateway-id "$NAT" >/dev/null
      log "Eliminando NAT $NAT..."
      aw ec2 wait nat-gateway-deleted --nat-gateway-ids "$NAT"
      aw ec2 release-address --allocation-id "$ALLOC"
      log "NAT eliminado e IP elastica liberada."
    else
      log "No hay NAT activo."
    fi
    ;;
  status)
    log "NAT: $(nat_id)"
    ;;
  *)
    echo "Uso: $0 up|down|status" >&2
    exit 2
    ;;
esac
