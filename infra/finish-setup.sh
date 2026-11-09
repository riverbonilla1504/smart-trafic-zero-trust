#!/usr/bin/env bash
# Cierra la ventana de instalacion: quita la salida temporal y elimina el NAT.
# Para aplicar parches mas adelante: infra/open-setup.sh, actualizar y volver a ejecutar este.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

SETUP_SG="$(sg_id st-setup-egress)"

project_instances | while read -r id name; do
  [ -n "$id" ] || continue
  groups="$(aw ec2 describe-instances --instance-ids "$id" \
    --query 'Reservations[0].Instances[0].SecurityGroups[].GroupId' --output text \
    | tr '\t' '\n' | grep -v "^$SETUP_SG$" | tr '\n' ' ')"
  # shellcheck disable=SC2086
  aw ec2 modify-instance-attribute --instance-id "$id" --groups $groups
  log "Salida temporal retirada de $name"
done

"$(dirname "${BASH_SOURCE[0]}")/nat.sh" down
