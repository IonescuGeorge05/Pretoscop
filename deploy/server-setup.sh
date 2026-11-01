#!/usr/bin/env bash
# Pregătește un server Ubuntu 24.04 nou pentru Pretoscop. Rulezi o singură dată, ca root, pe server:
#   curl -fsSL https://raw.githubusercontent.com/IonescuGeorge05/Pretoscop/main/deploy/server-setup.sh | bash
# Instalează Docker, firewall (doar SSH / HTTP / HTTPS), actualizări automate de securitate, 2 GB swap,
# un utilizator „pretoscop” și copiază proiectul în /home/pretoscop/Pretoscop. Nu pornește nimic: .env vine după.
set -euo pipefail

apt-get update -q
apt-get upgrade -yq
apt-get install -yq ca-certificates curl git ufw unattended-upgrades fail2ban

# Docker (pachetele oficiale)
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

# firewall: doar SSH, HTTP, HTTPS
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# actualizări automate de securitate
dpkg-reconfigure -f noninteractive unattended-upgrades

# swap: build-ul site-ului (Next.js) are nevoie de memorie peste cea a serverelor mici
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi

# utilizator separat pentru aplicație
id pretoscop >/dev/null 2>&1 || adduser --disabled-password --gecos "" pretoscop
usermod -aG docker pretoscop
mkdir -p /home/pretoscop/.ssh
cp -n /root/.ssh/authorized_keys /home/pretoscop/.ssh/ 2>/dev/null || true
chown -R pretoscop:pretoscop /home/pretoscop/.ssh

sudo -u pretoscop bash -c 'cd ~ && [ -d Pretoscop ] || git clone https://github.com/IonescuGeorge05/Pretoscop.git'
echo "Gata. Urmează: .env în /home/pretoscop/Pretoscop, apoi pornirea (vezi README, „Pe server”)."
