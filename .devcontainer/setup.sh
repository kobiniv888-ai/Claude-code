#!/usr/bin/env bash
# Runs once when the codespace is created: settings, packages, database and demo data.
set -euo pipefail
cd "$(dirname "$0")/.."

secret() { node -e "console.log(require('crypto').randomBytes(32).toString('$1'))"; }

if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=\"$(secret base64)\"|" .env
  sed -i "s|^APP_ENCRYPTION_KEY=.*|APP_ENCRYPTION_KEY=\"$(secret base64)\"|" .env
  sed -i "s|^HASH_SALT=.*|HASH_SALT=\"$(secret hex)\"|" .env
  # A preview has no authenticator app set up for the demo admin.
  sed -i "s|^DEV_SKIP_STAFF_2FA=.*|DEV_SKIP_STAFF_2FA=\"true\"|" .env
  if [ -n "${CODESPACE_NAME:-}" ]; then
    url="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
    sed -i "s|^NEXT_PUBLIC_SITE_URL=.*|NEXT_PUBLIC_SITE_URL=\"${url}\"|" .env
    sed -i "s|^BETTER_AUTH_URL=.*|BETTER_AUTH_URL=\"${url}\"|" .env
  fi
fi

npm ci --no-audit --no-fund

echo "Waiting for the database…"
until (echo > /dev/tcp/127.0.0.1/5432) 2>/dev/null; do sleep 1; done
sleep 2

npx prisma db push
npm run db:seed
echo "Setup finished."
