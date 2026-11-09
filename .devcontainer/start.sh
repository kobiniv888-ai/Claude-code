#!/usr/bin/env bash
# Starts the Bayit website and waits until it answers. Safe to run again at any time:
# - first-run setup still going → waits for it; packages missing → runs it
# - after a `git pull`: reinstalls packages when package-lock.json changed, and always regenerates
#   the database client (Prisma 7's `db push` no longer does that, and src/generated/ is not in git)
# - always: updates the database tables (prisma db push, idempotent) and reloads the demo data
#   when the database has no cities or no public listings (e.g. all demo listings expired), or
#   when it was loaded by an older version of the demo data (prisma/seed/DEMO_DATA_VERSION)
# - another start already running (the codespace starts this twice when it opens) → waits for it
#
#   bash .devcontainer/start.sh          keeps a running site as it is; nothing running → the FAST
#                                        version (production build), like start-prod.sh
#   bash .devcontainer/start.sh --dev    the development version (slow, hot reload); stops the fast
#                                        version first if it runs (a production build never shows new code)
#   bash .devcontainer/start.sh --prod   the fast version: builds only when the code changed since the
#                                        last build (--rebuild: always), then serves it (= start-prod.sh)
#
# The codespace runs start-prod.sh when it starts (devcontainer.json), so the address it prints is
# always the fast version unless someone asked for --dev.
# Setup and seed output: /tmp/bayit-setup.log. Website log: /tmp/bayit-dev.log.
cd "$(dirname "$0")/.."
LOG=/tmp/bayit-setup.log
MODE=auto
REBUILD=0
for arg in "$@"; do
  case "$arg" in
    --prod) MODE=prod ;;
    --dev) MODE=dev ;;
    --rebuild) REBUILD=1 ;;
  esac
done

url="http://localhost:3000"
if [ -n "${CODESPACE_NAME:-}" ]; then
  url="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
fi

answering() { curl -s -o /dev/null -m 10 http://localhost:3000/he; }
setup_running() { ps -eo args | grep -v grep | grep -q "devcontainer/setup.sh"; }
log() { echo "$*" | tee -a "$LOG"; }

# One start at a time: when the codespace opens it runs start-prod.sh (postStartCommand) and this
# script (postAttachCommand) together; the second one waits, then finds the site running.
# (Background processes started below close fd 9, so a running server never holds the lock.)
exec 9>/tmp/bayit-start.lock
if ! flock -n 9; then
  echo "Another start of the website is running — waiting for it (the first build takes 3–5 minutes)…"
  flock 9
fi

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
# shellcheck source=site-procs.sh
source .devcontainer/site-procs.sh
sync_env | tee -a "$LOG"
node scripts/ensure-vapid.mjs 2>&1 | tee -a "$LOG" || true
log "── start $(date -u +%FT%TZ) ──"

# Packages: the same as package-lock.json. The marker holds the lock file's hash from the last
# install; a codespace made before the marker existed just gets one (its packages are current).
lock_hash=$(sha256sum package-lock.json | cut -d' ' -f1)
if [ ! -f node_modules/.bayit-lock-hash ]; then
  echo "$lock_hash" > node_modules/.bayit-lock-hash
elif [ "$(cat node_modules/.bayit-lock-hash)" != "$lock_hash" ]; then
  log "The package list changed — installing packages (a few minutes)…"
  stop_site any
  { npm ci --no-audit --no-fund && npm run deps:scripts; } >> "$LOG" 2>&1 || { log "Installing packages failed — see $LOG"; exit 1; }
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

# Field encryption (SECURITY_REPORT 12.3.c): any plain address, pin or guest phone goes into the
# encrypted columns, values under an old key are re-sealed, the database guard is added. Idempotent
# and quick when there is nothing to do; prints counts only.
npm run --silent db:encrypt-fields 2>&1 | tee -a "$LOG" || log "Encrypting the address/phone fields did not finish — see $LOG"

# The founder's account becomes the admin once it exists (BAYIT_ADMIN_EMAIL / BAYIT_ADMIN_PHONE,
# private Codespaces secrets). Says nothing while they are empty or the account is not made yet;
# never prints the address. 2-step login is still asked for at the first visit to /admin.
npm run --silent admin:grant -- --from-env 2>&1 | tee -a "$LOG" || true

# Translation key set → listings sent before it was set get their other languages now (listings
# that already have all five are skipped, so this costs nothing on later starts).
if grep -qE '^(AZURE_TRANSLATOR_KEY|GOOGLE_TRANSLATE_API_KEY)="[^"]' .env 2>/dev/null; then
  timeout 300 npm run --silent translate:missing 2>&1 | tail -n 3 | tee -a "$LOG"
fi

# What the fast version is built from: the commit, uncommitted changes, the NEXT_PUBLIC_* values
# (baked into the build) and the packages. Same stamp as the last build → no need to build again.
build_stamp() {
  {
    git rev-parse HEAD 2>/dev/null
    git status --porcelain=v1 --untracked-files=all -- src messages prisma public next.config.ts package-lock.json 2>/dev/null
    git diff HEAD -- src messages prisma public next.config.ts package-lock.json 2>/dev/null
    git ls-files --others --exclude-standard -z -- src messages public 2>/dev/null | xargs -0 -r sha256sum 2>/dev/null
    grep -E '^NEXT_PUBLIC_' .env 2>/dev/null
    # NEXT_PUBLIC_* Codespaces secrets come from the environment (env-sync.sh), not .env.
    env | grep -E '^NEXT_PUBLIC_' | sort
  } | sha256sum | cut -d' ' -f1
}
STAMP_FILE=.next/bayit-build-stamp
TEST_MODE="${AUTH_TEST_MODE:-true}"
MODE_FILE=/tmp/bayit-prod-test-mode

# Plain start.sh: keep whatever answers (a development server reloads by itself; a fast version
# keeps running); nothing running → the fast version.
if [ "$MODE" = "auto" ]; then
  if answering; then
    echo "Bayit is running: ${url}/he"
    if site_running prod && [ "$(cat "$STAMP_FILE" 2>/dev/null)" != "$(build_stamp)" ]; then
      echo "(The fast version was built from older code. To see the new code: bash .devcontainer/start-prod.sh)"
    elif site_running dev; then
      echo "(This is the slow development version. For the fast one: bash .devcontainer/start-prod.sh)"
    fi
    exit 0
  fi
  MODE=prod
fi

if [ "$MODE" = "prod" ]; then
  stamp=$(build_stamp)
  built=0
  [ -f .next/BUILD_ID ] && [ "$(cat "$STAMP_FILE" 2>/dev/null)" = "$stamp" ] && built=1
  [ "$REBUILD" = "1" ] && built=0
  if [ "$built" = "1" ] && site_running prod && [ "$(cat "$MODE_FILE" 2>/dev/null)" = "$TEST_MODE" ] && answering; then
    echo ""
    echo "The fast version is already running and up to date."
    echo "Bayit is ready: ${url}/he"
    exit 0
  fi
  if site_running any; then
    echo "Stopping the running website…"
    stop_site any
  fi
  if [ "$built" = "1" ]; then
    echo "The fast version is already built from this code — starting it (no new build needed)."
  else
    echo "Building the fast version (3–5 minutes)…"
    rm -f "$STAMP_FILE"
    npm run build >> /tmp/bayit-dev.log 2>&1 || { echo "Build failed:"; tail -n 30 /tmp/bayit-dev.log; exit 1; }
    echo "$stamp" > "$STAMP_FILE"
  fi
  echo "Starting the production server…"
  # Test mode: login codes on screen (src/lib/auth/code-display.ts). Allowed only because the
  # codespace is a development site (SITE_ENV=development in .env, src/lib/site-env.ts), and
  # honored only on localhost and the Codespaces preview address. The real site
  # (SITE_ENV=production) refuses to start with it. AUTH_TEST_MODE=false turns it off.
  echo "Login test mode: ${TEST_MODE} (codes shown on screen; set AUTH_TEST_MODE=false to turn off)"
  echo "$TEST_MODE" > "$MODE_FILE"
  SITE_ENV=development AUTH_TEST_MODE="$TEST_MODE" setsid nohup npm start > /tmp/bayit-dev.log 2>&1 < /dev/null 9>&- &
else
  # --dev: the development version (hot reload, slow on a phone). The fast version never picks up
  # new code, so it is stopped first. A running development server is kept: it reloads by itself.
  if site_running prod; then
    echo "Stopping the fast version (it does not show new code) to start the development version…"
    stop_site prod
  fi
  if answering; then
    echo "Bayit is running (development version): ${url}/he"
    echo "(Slow on a phone. For the fast version: bash .devcontainer/start-prod.sh)"
    exit 0
  fi
  echo "Starting the development version…"
  # The development server shows login codes only in test mode too (src/lib/auth/code-display.ts).
  SITE_ENV=development AUTH_TEST_MODE="$TEST_MODE" setsid nohup npm run dev > /tmp/bayit-dev.log 2>&1 < /dev/null 9>&- &
fi

for _ in $(seq 1 60); do
  if answering; then
    echo ""
    if [ "$MODE" = "prod" ]; then
      echo "Bayit is ready (the fast version). Open this address on your phone:"
    else
      echo "Bayit is ready (the slow development version). Open:"
    fi
    echo "  ${url}/he"
    if [ "$MODE" = "prod" ]; then
      # Photos are converted (WebP, each width) on their first request; do that now for the
      # main pages, so the first visit on the phone does not wait for it (bug 8.10).
      setsid nohup node scripts/warm-images.mjs http://localhost:3000 > /tmp/bayit-warm.log 2>&1 < /dev/null 9>&- &
      echo "Preparing the photos in the background (2–3 minutes; log: /tmp/bayit-warm.log)."
    else
      # The development server builds each page the first time it is opened (minutes in a
      # codespace): open the main pages now — login and the admin panel included — so the first
      # visit on the phone does not wait. Built pages are kept on disk for the next start too.
      setsid nohup node scripts/warm-dev.mjs http://localhost:3000 > /tmp/bayit-warm.log 2>&1 < /dev/null 9>&- &
      echo "Preparing the main pages in the background (1–4 minutes; log: /tmp/bayit-warm.log)."
      echo "Pages open faster after that — when the log says \"Main pages ready\": tail /tmp/bayit-warm.log"
    fi
    exit 0
  fi
  sleep 5
done
echo "The website did not answer within 5 minutes. Last lines of the log:"
tail -n 30 /tmp/bayit-dev.log
exit 1
