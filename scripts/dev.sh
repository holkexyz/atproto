#!/bin/bash
set -euo pipefail

echo "Starting Magic PDS in development mode..."

# Check prerequisites
if [ ! -f .env ]; then
  echo "ERROR: .env file not found. Run ./scripts/setup.sh first."
  exit 1
fi

if ! command -v pnpm &>/dev/null; then
  echo "ERROR: pnpm is required. Install with: corepack enable && corepack prepare pnpm@8 --activate"
  exit 1
fi

# Start MailHog if Docker is available and MailHog isn't running
if command -v docker &>/dev/null; then
  if ! curl -s http://localhost:8025 >/dev/null 2>&1; then
    echo "Starting MailHog..."
    docker compose --profile dev up -d mailhog 2>/dev/null || echo "  (MailHog skipped - Docker not available or compose failed)"
    sleep 2
  fi
  echo "MailHog UI: http://localhost:8025"
fi

# Set dev-friendly defaults
export NODE_ENV=development
export PDS_HOSTNAME=${PDS_HOSTNAME:-localhost}
export AUTH_HOSTNAME=${AUTH_HOSTNAME:-auth.localhost}
export PDS_PORT=${PDS_PORT:-3000}
export AUTH_PORT=${AUTH_PORT:-3001}
export SMTP_HOST=${SMTP_HOST:-localhost}
export SMTP_PORT=${SMTP_PORT:-1025}
export MAGIC_LINK_BASE_URL=${MAGIC_LINK_BASE_URL:-http://auth.localhost:3001/auth/verify}
export PDS_PUBLIC_URL=${PDS_PUBLIC_URL:-http://localhost:3000}

echo ""
echo "PDS:  http://localhost:${PDS_PORT}"
echo "Auth: http://localhost:${AUTH_PORT}"
echo ""

# Run both services concurrently
pnpm dev
