#!/usr/bin/env bash
# Keeps .env in step with the codespace (sourced by setup.sh and start.sh; safe to run again):
# - the public address of port 3000 (NEXT_PUBLIC_SITE_URL / BETTER_AUTH_URL), if .env still says localhost
# - NEXT_PUBLIC_MAP_TILE_KEY from a Codespaces secret of that name, when there is one
set_env() { # set_env NAME VALUE — replaces the line or appends it
  local name="$1" value="$2"
  if grep -q "^${name}=" .env; then
    sed -i "s|^${name}=.*|${name}=\"${value}\"|" .env
  else
    printf '%s="%s"\n' "$name" "$value" >> .env
  fi
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
  if [ -n "${NEXT_PUBLIC_MAP_TILE_KEY:-}" ] && ! grep -q "^NEXT_PUBLIC_MAP_TILE_KEY=\"${NEXT_PUBLIC_MAP_TILE_KEY}\"" .env; then
    set_env NEXT_PUBLIC_MAP_TILE_KEY "$NEXT_PUBLIC_MAP_TILE_KEY"
    echo "Copied the map key (Codespaces secret NEXT_PUBLIC_MAP_TILE_KEY) into .env"
  fi
}
