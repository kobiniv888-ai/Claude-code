#!/usr/bin/env bash
# Starts the Bayit website and waits until it answers. Safe to run again at any time:
# - already running → just prints the address
# - first-run setup still going → waits for it
# - setup never finished → runs it
cd "$(dirname "$0")/.."

url="http://localhost:3000"
if [ -n "${CODESPACE_NAME:-}" ]; then
  url="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
fi

answering() { curl -s -o /dev/null -m 10 http://localhost:3000/he; }
setup_running() { ps -eo args | grep -v grep | grep -q "devcontainer/setup.sh"; }

if answering; then
  echo "Bayit is running: ${url}/he"
  exit 0
fi

if setup_running; then
  echo "Waiting for the first-run setup to finish (a few minutes)…"
  while setup_running; do sleep 5; done
fi

if [ ! -f .devcontainer/.setup-done ] && [ ! -x node_modules/.bin/next ]; then
  echo "Running the first-run setup…"
  bash .devcontainer/setup.sh || { echo "Setup failed — see the messages above."; exit 1; }
fi

echo "Starting the website…"
setsid nohup npm run dev > /tmp/bayit-dev.log 2>&1 < /dev/null &

for _ in $(seq 1 60); do
  if answering; then
    echo ""
    echo "Bayit is ready: ${url}/he"
    exit 0
  fi
  sleep 5
done
echo "The website did not answer within 5 minutes. Last lines of the log:"
tail -n 30 /tmp/bayit-dev.log
exit 1
