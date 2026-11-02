#!/usr/bin/env bash
# Production preview: the site as visitors will get it, to feel the real speed on a phone.
# Stops the development server (and an older production server), builds the site, starts it in
# production mode on port 3000 and prints the address to open.
#
#   bash .devcontainer/start-prod.sh
#
# Back to development mode (hot reload): bash .devcontainer/start.sh
# Build and server log: /tmp/bayit-dev.log.
set -u
cd "$(dirname "$0")/.."

stop() { # stop <pattern>: ends matching processes, but never this script
  local pids
  pids=$(pgrep -f "$1" | grep -v "^$$\$" || true)
  [ -n "$pids" ] && kill $pids 2>/dev/null
  return 0
}
if pgrep -f "next dev|next start|next-server" > /dev/null; then
  echo "Stopping the running website…"
  stop "next dev"
  stop "next start"
  stop "next-server"
  for _ in $(seq 1 15); do pgrep -f "next dev|next start|next-server" > /dev/null || break; sleep 1; done
fi

# start.sh --prod checks the setup and the database, builds (npm run build), starts `npm start`
# on port 3000 and waits until the site answers, then prints the address.
exec bash .devcontainer/start.sh --prod
