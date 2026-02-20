# Agent Instructions

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
```

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds


## Deployment

### Infrastructure Overview

| Instance | GCP VM | Zone | IP | Repo Path | Domain |
|----------|--------|------|----|-----------|--------|
| **otp-pds-01** | GCE | europe-north2-b | 34.51.220.89 | `/opt/otp-pds` | `otp.certs.network` |
| **magic-pds-01** | GCE | europe-north2-b | 34.51.161.83 | `/opt/magic-pds` | (main PDS) |

GCP project: `magic-pds`, account: `holke@hypercerts.org`

### otp-pds-01 (OTP PDS)

This is the PDS that serves `otp.certs.network` with email OTP authentication.

**Stack:** Docker Compose with two services:
- `pds` — pre-built image from GHCR (`ghcr.io/holkexyz/atproto/pds:latest`)
- `caddy` — reverse proxy with automatic TLS (on-demand certs)

**Image:** Built automatically by GitHub Actions (`.github/workflows/build-and-push-pds-fork.yaml`) on every push to `feature/email-otp-auth-clean`. Pushed to `ghcr.io/holkexyz/atproto/pds:latest` and `ghcr.io/holkexyz/atproto/pds:<commit-sha>`.

**Config:** `/opt/otp-pds/.env` (contains secrets — SMTP, JWT keys, admin password)

### Deploy otp-pds-01

```bash
# 1. Push your changes to origin first
git push

# 2. Wait for the CI build to complete (~6 min cold, ~2 min cached)
gh run list --workflow=build-and-push-pds-fork.yaml -R holkexyz/atproto --limit 1
gh run watch <run-id> -R holkexyz/atproto --exit-status

# 3. Pull the new image and restart on the VM (~30 seconds)
gcloud compute ssh otp-pds-01 --zone=europe-north2-b \
  --command="cd /opt/otp-pds && docker pull ghcr.io/holkexyz/atproto/pds:latest && docker compose up -d pds"

# 4. Verify health (wait ~15s for healthcheck)
gcloud compute ssh otp-pds-01 --zone=europe-north2-b \
  --command="sleep 15 && docker ps --format 'table {{.Names}}\t{{.Status}}'"

# 5. Smoke test
curl -s https://otp.certs.network/xrpc/_health
```

### Useful commands

```bash
# SSH into the VM
gcloud compute ssh otp-pds-01 --zone=europe-north2-b

# View PDS logs
gcloud compute ssh otp-pds-01 --zone=europe-north2-b \
  --command="cd /opt/otp-pds && docker compose logs -f pds --tail=100"

# View Caddy logs
gcloud compute ssh otp-pds-01 --zone=europe-north2-b \
  --command="cd /opt/otp-pds && docker compose logs -f caddy --tail=50"

# Restart without rebuild
gcloud compute ssh otp-pds-01 --zone=europe-north2-b \
  --command="cd /opt/otp-pds && docker compose restart pds"

# Check container status
gcloud compute ssh otp-pds-01 --zone=europe-north2-b \
  --command="docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'"

# Check env vars (non-secret)
gcloud compute ssh otp-pds-01 --zone=europe-north2-b \
  --command="cat /opt/otp-pds/.env | grep -v PASSWORD | grep -v SECRET | grep -v KEY | grep -v SMTP"
```

### Rollback

```bash
# Deploy a specific image version by commit SHA
gcloud compute ssh otp-pds-01 --zone=europe-north2-b \
  --command="cd /opt/otp-pds && docker pull ghcr.io/holkexyz/atproto/pds:<commit-sha> && docker compose up -d pds"
```
