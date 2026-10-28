#!/usr/bin/env bash
# One-time preparation of the production server (Hetzner dedicated, Ubuntu 24.04 LTS), M18.
# Run as root on a fresh install:   bash bootstrap.sh <github-repo-url> <deploy-user-ssh-public-keys-file>
# (repo URL: https://github.com/OWNER/Pretoscop.git while the repository is public; for a private one
# git@github.com:OWNER/Pretoscop.git, which needs the deploy user's GitHub deploy key: if that clone
# fails, add the key printed at the end to GitHub and run the script again.)
# Idempotent: re-running it changes nothing that is already in place.
# What it does: updates the system, enables unattended security upgrades, installs Docker Engine and
# the compose plugin from Docker's repository, creates the `deploy` user (docker group, SSH key,
# no password, no sudo), hardens SSH (keys only; root by key only, for maintenance), configures the firewall (SSH from
# anywhere, HTTP/HTTPS from Cloudflare only), sets journald and Docker log limits, creates
# /srv/pretoscop/{prod,staging} checkouts. Secrets are NOT created here: see infra/runbooks/server-setup.md.
set -Eeuo pipefail

REPO_URL="${1:?usage: bootstrap.sh <git repo url> <deploy user public key file>}"
PUBKEY_FILE="${2:?usage: bootstrap.sh <git repo url> <deploy user public key file>}"
DEPLOY_USER=deploy
SRV=/srv/pretoscop

[[ $EUID -eq 0 ]] || {
  echo "run as root" >&2
  exit 1
}
[[ -f "$PUBKEY_FILE" ]] || {
  echo "no such public key file: $PUBKEY_FILE" >&2
  exit 1
}

echo "== packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get -y -q upgrade
apt-get -y -q install ca-certificates curl gnupg git jq ufw unattended-upgrades fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== Docker Engine (docker.com apt repository)"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  # shellcheck disable=SC1091
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" >/etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get -y -q install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
mkdir -p /etc/docker
if [[ ! -f /etc/docker/daemon.json ]]; then
  # Rotated JSON logs for every container (compose files set the same per service), and containers
  # keep running while the Docker daemon restarts during upgrades.
  cat >/etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "20m", "max-file": "5" },
  "live-restore": true
}
JSON
  systemctl restart docker
fi
systemctl enable --now docker

echo "== journald size cap"
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=1G\n' >/etc/systemd/journald.conf.d/pretoscop.conf
systemctl restart systemd-journald

echo "== deploy user"
id "$DEPLOY_USER" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$DEPLOY_USER"
usermod -aG docker "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/${DEPLOY_USER}/.ssh"
# The file may hold several keys (the CI deploy key and each founder's); keys already present stay.
auth="/home/${DEPLOY_USER}/.ssh/authorized_keys"
install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /dev/null "$auth.new"
{
  if [[ -f "$auth" ]]; then cat "$auth"; fi
  cat "$PUBKEY_FILE"
} | grep -E '^(ssh-|ecdsa-|sk-)' | awk '!seen[$0]++' >"$auth.new" || {
  echo "no public key in $PUBKEY_FILE" >&2
  exit 1
}
mv "$auth.new" "$auth"
if [[ ! -f "/home/${DEPLOY_USER}/.ssh/id_ed25519" ]]; then
  # The deploy user's own key: read-only GitHub deploy key for git fetch (infra/runbooks/server-setup.md).
  sudo -u "$DEPLOY_USER" ssh-keygen -q -t ed25519 -N '' -C "deploy@$(hostname)" -f "/home/${DEPLOY_USER}/.ssh/id_ed25519"
fi
sudo -u "$DEPLOY_USER" sh -c 'ssh-keyscan -t ed25519 github.com >>~/.ssh/known_hosts 2>/dev/null; sort -u -o ~/.ssh/known_hosts ~/.ssh/known_hosts'

echo "== SSH: keys only (root too: the deploy user has no sudo, so maintenance is ssh root@ with a key)"
cat >/etc/ssh/sshd_config.d/10-pretoscop.conf <<'SSHD'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
SSHD
systemctl reload ssh || systemctl reload sshd

echo "== firewall: SSH open, HTTP/HTTPS from Cloudflare only"
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
for range in $(curl -fsS https://www.cloudflare.com/ips-v4) $(curl -fsS https://www.cloudflare.com/ips-v6); do
  ufw allow proto tcp from "$range" to any port 80,443 comment cloudflare >/dev/null
  ufw allow proto udp from "$range" to any port 443 comment cloudflare >/dev/null
done
ufw --force enable
# Docker publishes ports through iptables rules that bypass ufw's INPUT chain; restrict the
# published edge ports to Cloudflare in DOCKER-USER as well (infra/runbooks/server-setup.md).
cat >/usr/local/sbin/pretoscop-docker-user-firewall <<'FW'
#!/usr/bin/env bash
# Only Cloudflare may open connections to the ports Docker publishes for Caddy (80, 443). Matches
# packets arriving on the external interface by their original (pre-NAT) destination port, so
# containers' own outbound HTTPS (crawling, R2, APIs) is never affected. Re-applied at boot.
set -e
ext_if="$(ip route get 1.1.1.1 | awk '{for (i = 1; i <= NF; i++) if ($i == "dev") { print $(i + 1); exit }}')"
iptables -N PRETOSCOP-EDGE 2>/dev/null || iptables -F PRETOSCOP-EDGE
for r in $(curl -fsS https://www.cloudflare.com/ips-v4); do iptables -A PRETOSCOP-EDGE -s "$r" -j RETURN; done
iptables -A PRETOSCOP-EDGE -j DROP
for rule in "-p tcp -m conntrack --ctorigdstport 80 --ctdir ORIGINAL" "-p tcp -m conntrack --ctorigdstport 443 --ctdir ORIGINAL" "-p udp -m conntrack --ctorigdstport 443 --ctdir ORIGINAL"; do
  # shellcheck disable=SC2086
  iptables -C DOCKER-USER -i "$ext_if" $rule -j PRETOSCOP-EDGE 2>/dev/null || iptables -I DOCKER-USER -i "$ext_if" $rule -j PRETOSCOP-EDGE
done
FW
chmod 755 /usr/local/sbin/pretoscop-docker-user-firewall
cat >/etc/systemd/system/pretoscop-docker-user-firewall.service <<'UNIT'
[Unit]
Description=Restrict Docker-published edge ports to Cloudflare
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/pretoscop-docker-user-firewall

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now pretoscop-docker-user-firewall.service

echo "== checkouts"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$SRV"
cloned=1
for env in prod staging; do
  if [[ ! -d "$SRV/$env/.git" ]]; then
    sudo -u "$DEPLOY_USER" git clone "$REPO_URL" "$SRV/$env" || cloned=0
  fi
done
if ((cloned == 0)); then
  echo
  echo "The clone failed. For a private repository add this read-only deploy key on GitHub"
  echo "(Settings → Deploy keys), then run this script again:"
  cat "/home/${DEPLOY_USER}/.ssh/id_ed25519.pub"
  exit 1
fi

echo
echo "Done. Next (as ${DEPLOY_USER}): create ${SRV}/prod/.env and .env.backup, ${SRV}/staging/.env,"
echo "the Cloudflare origin certificate, docker login ghcr.io, then the first deploy:"
echo "  infra/runbooks/server-setup.md"
