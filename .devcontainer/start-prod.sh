#!/usr/bin/env bash
# Production preview: the site as visitors will get it, to feel the real speed on a phone.
# Stops the development server (and an older production server), builds the site, starts it in
# production mode on port 3000 and prints the address to open.
#
#   bash .devcontainer/start-prod.sh
#
# Login test mode is ON here (AUTH_TEST_MODE=true: login codes on screen, only for localhost and
# the Codespaces address). To see the real behavior: AUTH_TEST_MODE=false bash .devcontainer/start-prod.sh
#
# Back to development mode (hot reload): bash .devcontainer/start.sh
# Build and server log: /tmp/bayit-dev.log.
set -u
cd "$(dirname "$0")/.."

# shellcheck source=site-procs.sh
source .devcontainer/site-procs.sh
if site_running any; then
  echo "Stopping the running website…"
  stop_site any
fi

# start.sh --prod checks the setup and the database, builds (npm run build), starts `npm start`
# on port 3000 and waits until the site answers, then prints the address.
exec bash .devcontainer/start.sh --prod
