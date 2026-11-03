#!/usr/bin/env bash
# THE command for the codespace: the fast version of the site (a production build), the speed
# visitors get. The codespace also runs it by itself every time it starts (devcontainer.json).
#
#   bash .devcontainer/start-prod.sh             build if the code changed since the last build, then serve
#   bash .devcontainer/start-prod.sh --rebuild   always build again
#
# It stops the development server (or an older fast version), builds when needed (3–5 minutes;
# nothing to build when the code is the same as last time), serves the site on port 3000 and
# prints the address to open on the phone: https://<codespace>-3000.app.github.dev/he
#
# Login test mode is ON here (AUTH_TEST_MODE=true: login codes on screen, only for localhost and
# the Codespaces address). To see the real behavior: AUTH_TEST_MODE=false bash .devcontainer/start-prod.sh
#
# The slow development version (hot reload, for programmers): bash .devcontainer/start.sh --dev
# Build and server log: /tmp/bayit-dev.log.
set -u
cd "$(dirname "$0")/.."

# start.sh --prod checks the setup and the database, stops whatever runs, builds (npm run build)
# when the code changed, starts `npm start` on port 3000, waits until the site answers and prints
# the address. One start at a time (it waits for another one that is still running).
exec bash .devcontainer/start.sh --prod "$@"
