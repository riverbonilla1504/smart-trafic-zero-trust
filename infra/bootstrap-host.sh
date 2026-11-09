#!/usr/bin/env bash
# Sistema base de cada maquina. Se ejecuta en remoto con sudo:
#   ssh -F infra/generated/ssh_config <host> 'sudo bash -s -- <rol> <swap_mb>' < infra/bootstrap-host.sh
# Clase 10 (bastionado): parches, menos servicios y SSH restringido.
set -euo pipefail

ROLE="${1:?rol}"
SWAP_MB="${2:?swap en MB}"

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
APT_OPTS=(-y -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold -o DPkg::Lock::Timeout=300)

# Swap: las maquinas de 1 GB la necesitan al construir imagenes; el disco ya va cifrado.
if [ ! -f /swapfile ]; then
  fallocate -l "${SWAP_MB}M" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
echo 'vm.swappiness=10' > /etc/sysctl.d/90-swap.conf

# Red: no aceptar redirecciones ni rutas de origen, y registrar paquetes imposibles.
cat > /etc/sysctl.d/91-hardening.conf <<'EOF'
net.ipv4.conf.all.accept_redirects=0
net.ipv4.conf.default.accept_redirects=0
net.ipv4.conf.all.send_redirects=0
net.ipv4.conf.default.send_redirects=0
net.ipv4.conf.all.accept_source_route=0
net.ipv4.conf.default.accept_source_route=0
net.ipv4.conf.all.log_martians=1
net.ipv4.tcp_syncookies=1
kernel.dmesg_restrict=1
EOF
sysctl --system >/dev/null

apt-get update -q
apt-get "${APT_OPTS[@]}" -q upgrade

PACKAGES=(nftables auditd)
if [ "$ROLE" = "bastion" ]; then
  PACKAGES+=(fail2ban)
else
  PACKAGES+=(docker.io docker-compose-v2 docker-buildx)
fi
apt-get "${APT_OPTS[@]}" -q install "${PACKAGES[@]}"

# Superficie de ataque: snapd no se usa y consume memoria en las maquinas pequenas.
if dpkg -s snapd >/dev/null 2>&1; then
  apt-get "${APT_OPTS[@]}" -q purge snapd
fi

# SSH: solo claves y sin root. El reenvio TCP se mantiene: el bastion y los tuneles lo usan.
cat > /etc/ssh/sshd_config.d/10-hardening.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
X11Forwarding no
AllowAgentForwarding no
MaxAuthTries 3
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
EOF
sshd -t
systemctl reload ssh

# Hora: servicio de AWS en enlace local; funciona sin salida a internet.
# La caducidad de los JWT depende de que los relojes coincidan.
if [ -d /etc/chrony/sources.d ]; then
  echo 'server 169.254.169.123 prefer iburst minpoll 4 maxpoll 4' > /etc/chrony/sources.d/aws.sources
  sed -i 's/^pool /#pool /' /etc/chrony/chrony.conf
  systemctl restart chrony
fi

systemctl enable --now auditd >/dev/null 2>&1 || true
if [ "$ROLE" = "bastion" ]; then
  systemctl enable --now fail2ban >/dev/null
else
  systemctl enable --now docker >/dev/null
fi

if [ -f /var/run/reboot-required ]; then
  echo "BOOTSTRAP_OK role=$ROLE reboot=required"
else
  echo "BOOTSTRAP_OK role=$ROLE reboot=no"
fi
