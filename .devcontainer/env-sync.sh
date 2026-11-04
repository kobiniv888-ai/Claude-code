#!/usr/bin/env bash
# Keeps .env in step with the codespace (sourced by setup.sh and start.sh; safe to run again):
# - the public address of port 3000 (NEXT_PUBLIC_SITE_URL / BETTER_AUTH_URL), if .env still says localhost
# - service keys (map, translation, email, Google login, SMS, Telegram) and the PRIVATE admin
#   settings (BAYIT_ADMIN_EMAIL, BAYIT_ADMIN_PHONE, ADMIN_ALERT_EMAIL) from Codespaces secrets of
#   the same name. Only the NAMES are printed, never a value.
set_env() { # set_env NAME VALUE — replaces the line (or appends it); any characters are safe
  local name="$1" value="$2" tmp
  tmp=$(mktemp)
  grep -v "^${name}=" .env > "$tmp" || true
  printf '%s="%s"\n' "$name" "$value" >> "$tmp"
  cat "$tmp" > .env
  rm -f "$tmp"
}

sync_env() {
  [ -f .env ] || return 0
  if [ -n "${CODESPACE_NAME:-}" ] && [ -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]; then
    local url="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
    if ! grep -q "^NEXT_PUBLIC_SITE_URL=\"${url}\"" .env; then
      set_env NEXT_PUBLIC_SITE_URL "$url"
      set_env BETTER_AUTH_URL "$url"
      echo "Set the site address in .env to ${url}"
    fi
  fi
  # Service keys saved as Codespaces secrets (github.com → Settings → Codespaces → Secrets) are
  # copied into .env under the same name, so every script and the website see them. The admin
  # account (BAYIT_ADMIN_EMAIL / BAYIT_ADMIN_PHONE, made admin by `npm run admin:grant -- --from-env`)
  # and the alert address (ADMIN_ALERT_EMAIL) are private: they live only in the secrets and .env.
  local name value
  # SITE_URL: the permanent address that links leaving the site are built from (src/lib/site-url.ts).
  for name in SITE_URL NEXT_PUBLIC_MAP_TILE_KEY TRANSLATE_PROVIDER GOOGLE_TRANSLATE_API_KEY AZURE_TRANSLATOR_KEY AZURE_TRANSLATOR_REGION \
    RESEND_API_KEY EMAIL_FROM RESEND_WEBHOOK_SECRET \
    GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN \
    TWILIO_VERIFY_SERVICE_SID TWILIO_MESSAGING_SERVICE_SID TWILIO_FROM_NUMBER \
    TELEGRAM_BOT_TOKEN TELEGRAM_BOT_USERNAME TELEGRAM_WEBHOOK_SECRET \
    BAYIT_ADMIN_EMAIL BAYIT_ADMIN_PHONE ADMIN_ALERT_EMAIL; do
    value="${!name:-}"
    [ -n "$value" ] || continue
    grep -qF "${name}=\"${value}\"" .env && continue
    set_env "$name" "$value"
    echo "Copied the Codespaces secret ${name} into .env"
  done
}
