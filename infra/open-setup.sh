#!/usr/bin/env bash
# Abre una ventana temporal de salida a internet para instalar o aplicar parches.
# Cierrala al terminar con infra/finish-setup.sh: el NAT cobra por hora.
#
# Uso: infra/open-setup.sh                 todas las maquinas (crea el NAT para las privadas)
#      infra/open-setup.sh app bastion     solo esas; si son publicas no hace falta NAT
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

SETUP_SG="$(sg_id st-setup-egress)"
WANTED=("$@")
PUBLIC_HOSTS=" bastion-ec2 app-ec2 "

needs_nat=0
if [ "${#WANTED[@]}" -eq 0 ]; then
  needs_nat=1
else
  for h in "${WANTED[@]}"; do
    case "$PUBLIC_HOSTS" in *" $h-ec2 "*) ;; *) needs_nat=1 ;; esac
  done
fi
[ "$needs_nat" -eq 1 ] && "$(dirname "${BASH_SOURCE[0]}")/nat.sh" up

project_instances | while read -r id name; do
  [ -n "$id" ] || continue
  if [ "${#WANTED[@]}" -gt 0 ] && [[ ! " ${WANTED[*]/%/-ec2} " == *" $name "* ]]; then
    continue
  fi
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
