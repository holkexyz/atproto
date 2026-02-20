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
- `pds` — built from `services/pds/Dockerfile` in this repo
- `caddy` — reverse proxy with automatic TLS (on-demand certs)

**Repo on VM:** `/opt/otp-pds` — a clone of `https://github.com/holkexyz/atproto.git` on branch `feature/email-otp-auth-clean`

**Config:** `/opt/otp-pds/.env` (contains secrets — SMTP, JWT keys, admin password)

### Deploy otp-pds-01

```bash
# 1. Push your changes to origin first
git push

# 2. Pull on the VM, rebuild, and restart (single command)
gcloud compute ssh otp-pds-01 --zone=europe-north2-b \
  --command="cd /opt/otp-pds && git pull origin feature/email-otp-auth-clean && docker compose up -d --build pds"

# 3. Verify health (wait ~15s for healthcheck)
gcloud compute ssh otp-pds-01 --zone=europe-north2-b \
  --command="sleep 15 && docker ps --format 'table {{.Names}}\t{{.Status}}'"

# 4. Smoke test
curl -s https://otp.certs.network/xrpc/_health
```

**Timeout note:** The Docker build takes ~8 minutes on a cold build (no cache). With cache it's ~30 seconds. Set `--timeout 900000` if running via the Bash tool.

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
# Find the previous commit
gcloud compute ssh otp-pds-01 --zone=europe-north2-b \
  --command="cd /opt/otp-pds && git log --oneline -5"

# Reset to a specific commit and rebuild
gcloud compute ssh otp-pds-01 --zone=europe-north2-b \
  --command="cd /opt/otp-pds && git checkout <commit-hash> && docker compose up -d --build pds"
```
