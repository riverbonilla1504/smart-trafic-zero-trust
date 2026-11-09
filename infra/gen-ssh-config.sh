#!/usr/bin/env bash
# Genera infra/generated/ssh_config con las IP publicas actuales.
# Las IP publicas cambian al apagar y encender: vuelve a ejecutarlo despues de encender.
#
# Uso: ssh -F infra/generated/ssh_config app
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

public_ip() { # nombre
  aw ec2 describe-instances \
    --filters "Name=tag:Name,Values=$1" "Name=tag:Project,Values=$PROJECT" \
              "Name=instance-state-name,Values=running" \
    --query 'Reservations[0].Instances[0].PublicIpAddress' --output text
}

BASTION_IP="$(public_ip bastion-ec2)"
APP_IP="$(public_ip app-ec2)"
KEYS_WIN="$(cygpath -m "$KEYS_DIR")"
GEN_WIN="$(cygpath -m "$GEN_DIR")"
CONFIG="$GEN_DIR/ssh_config"

block() { # alias host clave jump
  cat <<EOF
Host $1
  HostName $2
  User ubuntu
  IdentityFile "$KEYS_WIN/$3.pem"
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
  UserKnownHostsFile "$GEN_WIN/known_hosts"
  ConnectTimeout 15
EOF
  if [ -n "${4:-}" ]; then
    # ProxyCommand explicito: la ruta del proyecto tiene espacios y ProxyJump los parte.
    echo "  ProxyCommand C:/Windows/System32/OpenSSH/ssh.exe -i \"$KEYS_WIN/bastion-ec2.pem\" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o \"UserKnownHostsFile=$GEN_WIN/known_hosts\" -W %h:%p ubuntu@$BASTION_IP"
  fi
  echo
}

{
  block bastion "$BASTION_IP" bastion-ec2
  block app     10.0.1.10 app-ec2    jump
  block auth    10.0.2.10 auth-ec2   jump
  block ingest  10.0.3.10 ingest-ec2 jump
  block core    10.0.4.10 core-ec2   jump
  block data    10.0.5.10 data-ec2   jump
} > "$CONFIG"

echo "bastion=$BASTION_IP app=$APP_IP" > "$GEN_DIR/public_ips.env"
log "SSH config generado. Bastion: $BASTION_IP  App: $APP_IP"
