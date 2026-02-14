#!/usr/bin/env bash
set -euo pipefail

# Magic PDS Deployment Script
# Run this on a fresh Debian 12 server with root/sudo access.

PDS_DOMAIN="pds.certs.network"
AUTH_DOMAIN="auth.pds.certs.network"
SERVER_IP="34.51.161.83"

echo "=== Magic PDS Deployment ==="
echo "  PDS:  ${PDS_DOMAIN}"
echo "  Auth: ${AUTH_DOMAIN}"
echo "  IP:   ${SERVER_IP}"
echo ""

# ── 1. Install Docker ──
if ! command -v docker &>/dev/null; then
  echo "Installing Docker..."
  apt-get update
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable docker
  systemctl start docker
  echo "Docker installed."
else
  echo "Docker already installed."
fi

# ── 2. Add swap (1GB RAM is tight) ──
if [ ! -f /swapfile ]; then
  echo "Adding 2GB swap..."
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "Swap added."
else
  echo "Swap already exists."
fi

# ── 3. Clone or update repo ──
DEPLOY_DIR="/opt/magic-pds"
if [ -d "$DEPLOY_DIR" ]; then
  echo "Updating existing deployment..."
  cd "$DEPLOY_DIR"
  git pull
else
  echo "Cloning repository..."
  # For now, we'll copy files. Replace with git clone when repo is pushed.
  mkdir -p "$DEPLOY_DIR"
  echo "ERROR: No git repo URL configured. Please copy files manually or set up a git remote."
  echo "  scp -r . root@${SERVER_IP}:/opt/magic-pds/"
  exit 1
fi

cd "$DEPLOY_DIR"

# ── 4. Generate .env ──
if [ ! -f .env ]; then
  echo "Generating .env..."
  cp .env.example .env

  # Generate secrets
  JWT_SECRET=$(openssl rand -hex 32)
  DPOP_SECRET=$(openssl rand -hex 32)
  ADMIN_PASSWORD=$(openssl rand -hex 32)
  SESSION_SECRET=$(openssl rand -hex 32)
  CSRF_SECRET=$(openssl rand -hex 32)

  # Generate PLC rotation key
  PLC_KEY=$(openssl ecparam -name secp256k1 -genkey -noout 2>/dev/null | openssl ec -text -noout 2>/dev/null | grep priv -A 3 | tail -n +2 | tr -d '[:space:]:')

  # Portable sed (Debian = GNU sed, no -i '' needed)
  sed -i "s|^PDS_HOSTNAME=.*|PDS_HOSTNAME=${PDS_DOMAIN}|" .env
  sed -i "s|^PDS_PUBLIC_URL=.*|PDS_PUBLIC_URL=https://${PDS_DOMAIN}|" .env
  sed -i "s|^AUTH_HOSTNAME=.*|AUTH_HOSTNAME=${AUTH_DOMAIN}|" .env
  sed -i "s|^MAGIC_LINK_BASE_URL=.*|MAGIC_LINK_BASE_URL=https://${AUTH_DOMAIN}/auth/verify|" .env
  sed -i "s|^SMTP_FROM=.*|SMTP_FROM=noreply@${PDS_DOMAIN}|" .env
  sed -i "s|^SMTP_FROM_NAME=.*|SMTP_FROM_NAME=Magic PDS|" .env

  sed -i "s|^PDS_JWT_SECRET=.*|PDS_JWT_SECRET=${JWT_SECRET}|" .env
  sed -i "s|^PDS_DPOP_SECRET=.*|PDS_DPOP_SECRET=${DPOP_SECRET}|" .env
  sed -i "s|^PDS_ADMIN_PASSWORD=.*|PDS_ADMIN_PASSWORD=${ADMIN_PASSWORD}|" .env
  sed -i "s|^AUTH_SESSION_SECRET=.*|AUTH_SESSION_SECRET=${SESSION_SECRET}|" .env
  sed -i "s|^AUTH_CSRF_SECRET=.*|AUTH_CSRF_SECRET=${CSRF_SECRET}|" .env
  sed -i "s|^PDS_PLC_ROTATION_KEY_K256_PRIVATE_KEY_HEX=.*|PDS_PLC_ROTATION_KEY_K256_PRIVATE_KEY_HEX=${PLC_KEY}|" .env

  echo ".env generated with fresh secrets."
  echo ""
  echo "IMPORTANT: Configure your email provider in .env before starting."
  echo "  nano /opt/magic-pds/.env"
  echo ""
else
  echo ".env already exists, keeping existing config."
fi

# ── 5. Build and start ──
echo "Building Docker images..."
docker compose build

echo ""
echo "Starting services..."
docker compose up -d

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Services:"
docker compose ps
echo ""
echo "Check logs:   docker compose logs -f"
echo "Check health: curl -s https://${PDS_DOMAIN}/health"
echo "AS metadata:  curl -s https://${PDS_DOMAIN}/.well-known/oauth-authorization-server | jq .authorization_endpoint"
echo ""
echo "Next steps:"
echo "  1. Configure email provider in .env (if not done)"
echo "  2. docker compose restart"
echo "  3. Test OAuth flow with a client"
