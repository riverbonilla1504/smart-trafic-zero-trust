#!/usr/bin/env bash
# Abre una ventana temporal de salida a internet para instalar o aplicar parches.
# Cierrala al terminar con infra/finish-setup.sh: el NAT cobra por hora.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

SETUP_SG="$(sg_id st-setup-egress)"

"$(dirname "${BASH_SOURCE[0]}")/nat.sh" up

project_instances | while read -r id name; do
  [ -n "$id" ] || continue
  groups="$(aw ec2 describe-instances --instance-ids "$id" \
    --query 'Reservations[0].Instances[0].SecurityGroups[].GroupId' --output text | tr '\t' ' ')"
  case " $groups " in
    *" $SETUP_SG "*) ;;
    *)
      # shellcheck disable=SC2086
      aw ec2 modify-instance-attribute --instance-id "$id" --groups $groups "$SETUP_SG"
      log "Salida temporal activada en $name"
      ;;
  esac
done
