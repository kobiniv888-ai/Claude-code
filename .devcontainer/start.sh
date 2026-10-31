#!/usr/bin/env bash
# Runs every time the codespace starts: launches the website in the background.
cd "$(dirname "$0")/.."
setsid nohup npm run dev > /tmp/bayit-dev.log 2>&1 < /dev/null &
if [ -n "${CODESPACE_NAME:-}" ]; then
  echo "Bayit is starting at https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}/he"
  echo "(first page load takes about a minute while it compiles; log: /tmp/bayit-dev.log)"
fi
