#!/usr/bin/env bash
# Keeps .env in step with the codespace (sourced by setup.sh and start.sh; safe to run again):
# - SITE_ENV="development" when .env has none: the server refuses to start without SITE_ENV
#   (src/lib/site-env.ts, src/lib/startup-check.ts), and a codespace is always a development site
# - the public address of port 3000 (NEXT_PUBLIC_SITE_URL / BETTER_AUTH_URL), if .env still says localhost
# - .env readable by its owner only (chmod 600)
# - a throwaway FIELD_ENCRYPTION_KEY (the key of the encrypted addresses, pins and guest phones,
#   src/lib/field-crypto.ts) when .env has none: made on this machine, marked as a development key
#   (src/lib/dev-keys.ts), never committed, never printed
# Service keys (map, translation, email, Google login, SMS, Telegram) and the PRIVATE admin
# settings (BAYIT_ADMIN_EMAIL, BAYIT_ADMIN_PHONE, ADMIN_ALERT_EMAIL) are Codespaces secrets: the
# codespace puts them in the environment of every process, and the website and the scripts read
# them from there (an environment variable always wins over .env). They are NEVER copied into
# .env (SECURITY_REPORT 2.3.h, founder's answer Q17): .env keeps only throwaway development keys.
# A copy an older version of this script made is removed from .env when the secret of the same
# name is set. Only the NAMES are printed, never a value.
set_env() { # set_env NAME VALUE — replaces the line (or appends it); any characters are safe
  local name="$1" value="$2" tmp
  tmp=$(mktemp)
  grep -v "^${name}=" .env > "$tmp" || true
  printf '%s="%s"\n' "$name" "$value" >> "$tmp"
  cat "$tmp" > .env
  rm -f "$tmp"
}

unset_env() { # unset_env NAME — removes its line from .env
  local name="$1" tmp
  tmp=$(mktemp)
  grep -v "^${name}=" .env > "$tmp" || true
  cat "$tmp" > .env
  rm -f "$tmp"
}

# Codespaces secrets the site uses (github.com → Settings → Codespaces → Secrets, same names).
# SITE_URL: the permanent address that links leaving the site are built from (src/lib/site-url.ts).
CODESPACE_SECRET_NAMES="SITE_URL NEXT_PUBLIC_MAP_TILE_KEY TRANSLATE_PROVIDER GOOGLE_TRANSLATE_API_KEY AZURE_TRANSLATOR_KEY AZURE_TRANSLATOR_REGION \
  RESEND_API_KEY EMAIL_FROM RESEND_WEBHOOK_SECRET \
  GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN \
  TWILIO_VERIFY_SERVICE_SID TWILIO_MESSAGING_SERVICE_SID TWILIO_FROM_NUMBER \
  TELEGRAM_BOT_TOKEN TELEGRAM_BOT_USERNAME TELEGRAM_WEBHOOK_SECRET \
  BAYIT_ADMIN_EMAIL BAYIT_ADMIN_PHONE ADMIN_ALERT_EMAIL"

sync_env() {
  [ -f .env ] || return 0
  chmod 600 .env 2>/dev/null || true
  if ! grep -q '^SITE_ENV=' .env; then
    set_env SITE_ENV "development"
    echo "Set SITE_ENV=development in .env (a codespace is a development site)"
  fi
  if ! grep -qE '^FIELD_ENCRYPTION_KEY="?[A-Za-z0-9+/]{43}=' .env; then
    set_env FIELD_ENCRYPTION_KEY "$(node -e "const c=require('crypto');console.log(Buffer.concat([Buffer.from('BAYITDEV'),c.randomBytes(24)]).toString('base64'))")"
    echo "Set a development FIELD_ENCRYPTION_KEY in .env (npm run db:encrypt-fields re-seals values made before with the derived key)"
  fi
  if [ -n "${CODESPACE_NAME:-}" ] && [ -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]; then
    local url="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
    if ! grep -q "^NEXT_PUBLIC_SITE_URL=\"${url}\"" .env; then
      set_env NEXT_PUBLIC_SITE_URL "$url"
      set_env BETTER_AUTH_URL "$url"
      echo "Set the site address in .env to ${url}"
    fi
  fi
  local name
  for name in $CODESPACE_SECRET_NAMES; do
    [ -n "${!name:-}" ] || continue
    grep -q "^${name}=" .env || continue
    unset_env "$name"
    echo "Removed the old copy of the Codespaces secret ${name} from .env (it is read from the environment)"
  done
}
