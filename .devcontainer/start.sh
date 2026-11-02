#!/usr/bin/env bash
# Starts the Bayit website and waits until it answers. Safe to run again at any time:
# - first-run setup still going → waits for it; packages missing → runs it
# - after a `git pull`: reinstalls packages when package-lock.json changed, and always regenerates
#   the database client (Prisma 7's `db push` no longer does that, and src/generated/ is not in git)
# - always: updates the database tables (prisma db push, idempotent) and reloads the demo data
#   when the database has no cities or no public listings (e.g. all demo listings expired), or
#   when it was loaded by an older version of the demo data (prisma/seed/DEMO_DATA_VERSION)
# - already running → just prints the address
#
#   bash .devcontainer/start.sh          development server (hot reload)
#   bash .devcontainer/start.sh --prod   production build + server: the real speed, for phones
#
# Setup and seed output: /tmp/bayit-setup.log. Website log: /tmp/bayit-dev.log.
cd "$(dirname "$0")/.."
LOG=/tmp/bayit-setup.log
MODE=dev
[ "${1:-}" = "--prod" ] && MODE=prod

url="http://localhost:3000"
if [ -n "${CODESPACE_NAME:-}" ]; then
  url="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
fi

answering() { curl -s -o /dev/null -m 10 http://localhost:3000/he; }
setup_running() { ps -eo args | grep -v grep | grep -q "devcontainer/setup.sh"; }
log() { echo "$*" | tee -a "$LOG"; }

if setup_running; then
  echo "Waiting for the first-run setup to finish (a few minutes)…"
  while setup_running; do sleep 5; done
fi

if [ ! -x node_modules/.bin/next ]; then
  log "Running the first-run setup…"
  bash .devcontainer/setup.sh || { echo "Setup failed — see /tmp/bayit-setup.log."; exit 1; }
fi

# shellcheck source=env-sync.sh
source .devcontainer/env-sync.sh
sync_env | tee -a "$LOG"
log "── start $(date -u +%FT%TZ) ──"

# Packages: the same as package-lock.json. The marker holds the lock file's hash from the last
# install; a codespace made before the marker existed just gets one (its packages are current).
lock_hash=$(sha256sum package-lock.json | cut -d' ' -f1)
if [ ! -f node_modules/.bayit-lock-hash ]; then
  echo "$lock_hash" > node_modules/.bayit-lock-hash
elif [ "$(cat node_modules/.bayit-lock-hash)" != "$lock_hash" ]; then
  log "The package list changed — installing packages (a few minutes)…"
  pkill -f "next dev" 2>/dev/null; pkill -f "next start" 2>/dev/null; sleep 1
  npm ci --no-audit --no-fund >> "$LOG" 2>&1 || { log "Installing packages failed — see $LOG"; exit 1; }
  echo "$lock_hash" > node_modules/.bayit-lock-hash
fi

# The database client, generated from prisma/schema.prisma (a few seconds; safe to repeat).
npx prisma generate >> "$LOG" 2>&1 || { log "prisma generate failed — see $LOG"; exit 1; }

# The database: tables up to date, demo data present, current and not expired.
for _ in $(seq 1 30); do (echo > /dev/tcp/127.0.0.1/5432) 2>/dev/null && break; sleep 2; done
# (before-push.sql: lets the push add the booking index without a consent prompt; idempotent.)
{ npx prisma db execute --file prisma/sql/before-push.sql && npx prisma db push; } >> "$LOG" 2>&1 || log "prisma db push failed — see $LOG"
node scripts/db-status.mjs 2>&1 | tee -a "$LOG"
status=${PIPESTATUS[0]}
demo_version=$(cat prisma/seed/DEMO_DATA_VERSION)
if [ "$status" = "0" ] && [ "$(cat .devcontainer/.demo-data-version 2>/dev/null)" != "$demo_version" ]; then
  log "The demo data is from an older version — updating it."
  status=10
fi
if [ "$status" = "10" ] && [ "${BAYIT_SKIP_AUTO_SEED:-}" != "1" ]; then
  log "Loading the demo data (npm run db:seed)…"
  if npm run db:seed >> "$LOG" 2>&1; then
    touch .devcontainer/.setup-done
    echo "$demo_version" > .devcontainer/.demo-data-version
    node scripts/db-status.mjs 2>&1 | tee -a "$LOG"
  else
    log "Seeding failed — the error was:"
    grep -v "^\s*at " "$LOG" | tail -n 25
    log "(full log: $LOG)"
  fi
fi

if [ "$MODE" = "prod" ]; then
  if answering; then
    echo "Stopping the running website…"
    pkill -f "next dev" 2>/dev/null; pkill -f "next start" 2>/dev/null; sleep 2
  fi
  echo "Building for production (a few minutes)…"
  npm run build >> /tmp/bayit-dev.log 2>&1 || { echo "Build failed:"; tail -n 30 /tmp/bayit-dev.log; exit 1; }
  echo "Starting the production server…"
  # Test mode: login codes on screen (src/lib/auth/code-display.ts). Honored only on localhost and
  # the Codespaces preview address, never on a real domain. AUTH_TEST_MODE=false turns it off.
  echo "Login test mode: ${AUTH_TEST_MODE:-true} (codes shown on screen; set AUTH_TEST_MODE=false to turn off)"
  AUTH_TEST_MODE="${AUTH_TEST_MODE:-true}" setsid nohup npm start > /tmp/bayit-dev.log 2>&1 < /dev/null &
else
  if answering; then
    echo "Bayit is running: ${url}/he"
    exit 0
  fi
  echo "Starting the website…"
  setsid nohup npm run dev > /tmp/bayit-dev.log 2>&1 < /dev/null &
fi

for _ in $(seq 1 60); do
  if answering; then
    echo ""
    echo "Bayit is ready: ${url}/he"
    if [ "$MODE" = "prod" ]; then
      # Photos are converted (AVIF/WebP, each width) on their first request; do that now for the
      # main pages, so the first visit on the phone does not wait for it (bug 8.10).
      setsid nohup node scripts/warm-images.mjs http://localhost:3000 > /tmp/bayit-warm.log 2>&1 < /dev/null &
      echo "Preparing the photos in the background (2–3 minutes; log: /tmp/bayit-warm.log)."
    fi
    exit 0
  fi
  sleep 5
done
echo "The website did not answer within 5 minutes. Last lines of the log:"
tail -n 30 /tmp/bayit-dev.log
exit 1
