#!/usr/bin/env bash
# Runs once when the codespace is created: settings, packages, database and demo data.
# Output also goes to /tmp/bayit-setup.log. start.sh re-checks the database on every start, so a
# setup that was interrupted is finished there.
set -euo pipefail
cd "$(dirname "$0")/.."
exec > >(tee -a /tmp/bayit-setup.log) 2>&1
echo "── setup $(date -u +%FT%TZ) ──"

secret() { node -e "console.log(require('crypto').randomBytes(32).toString('$1'))"; }
# Development keys carry a marker ("bayit-dev-…", or "BAYITDEV" inside a 32-byte key), so a copy on a
# staging or production site stops its start (src/lib/dev-keys.ts; SECURITY_REPORT 12.2.b).
devsecret() { echo "bayit-dev-$(secret "$1")"; }
devkey() { node -e "const c=require('crypto');console.log(Buffer.concat([Buffer.from('BAYITDEV'),c.randomBytes(24)]).toString('base64'))"; }
# shellcheck source=env-sync.sh
source .devcontainer/env-sync.sh

if [ ! -f .env ]; then
  # Throwaway development keys only: real service keys stay Codespaces secrets (env-sync.sh).
  cp .env.example .env
  chmod 600 .env
  sed -i "s|^SITE_ENV=.*|SITE_ENV=\"development\"|" .env
  sed -i "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=\"$(devsecret base64)\"|" .env
  sed -i "s|^APP_ENCRYPTION_KEY=.*|APP_ENCRYPTION_KEY=\"$(devkey)\"|" .env
  sed -i "s|^HASH_SALT=.*|HASH_SALT=\"$(devsecret hex)\"|" .env
  # A preview has no authenticator app set up for the demo admin.
  sed -i "s|^DEV_SKIP_STAFF_2FA=.*|DEV_SKIP_STAFF_2FA=\"true\"|" .env
fi
sync_env
node scripts/ensure-vapid.mjs || true  # browser-notification keys for booking alerts (kept once made)

# Exactly the locked packages, with no install scripts (.npmrc), then the allowed ones
# (scripts/allowed-install-scripts.mjs: Prisma's engine + prisma generate).
npm ci --no-audit --no-fund
npm run deps:scripts
sha256sum package-lock.json | cut -d' ' -f1 > node_modules/.bayit-lock-hash

echo "Waiting for the database…"
until (echo > /dev/tcp/127.0.0.1/5432) 2>/dev/null; do sleep 1; done
sleep 2

npx prisma db execute --file prisma/sql/before-push.sql
npx prisma db push
npm run db:seed
# Moves any plain address, pin or guest phone into the encrypted columns and adds the database
# guard (SECURITY_REPORT 12.3.c; idempotent, prints counts only).
npm run --silent db:encrypt-fields
cp prisma/seed/DEMO_DATA_VERSION .devcontainer/.demo-data-version
# The founder's account becomes the admin once it exists (private BAYIT_ADMIN_* secrets; silent
# while they are empty or the account is not made yet).
npm run --silent admin:grant -- --from-env || true
touch .devcontainer/.setup-done
echo "Setup finished."
