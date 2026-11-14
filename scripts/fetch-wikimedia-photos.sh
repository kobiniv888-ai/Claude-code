#!/usr/bin/env bash
# Downloads the synagogue photos from Wikimedia Commons (this server is blocked by Wikimedia, a
# Codespace is not), optimizes them, adds their credits, then commits and pushes them.
#
# Run it in the Codespace terminal, from the project folder:
#
#     bash scripts/fetch-wikimedia-photos.sh
#
# Options:  --dry-run   show what would be downloaded, change nothing
#           --no-push   commit but do not push
#           --force     download again even if the photos are already there
# Safe to run again: photos that are already there are skipped.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

DRY_RUN=0
PUSH=1
NODE_ARGS=()
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1; NODE_ARGS+=("--dry-run") ;;
    --no-push) PUSH=0 ;;
    --force) NODE_ARGS+=("--force") ;;
    *) echo "Unknown option: $arg (use --dry-run, --no-push or --force)"; exit 2 ;;
  esac
done

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m✗ %s\033[0m\n' "$*"; exit 1; }

command -v node >/dev/null || fail "Node.js is not installed. Open the project in its Codespace and try again."
command -v curl >/dev/null || fail "curl is not installed."
[ -d node_modules/sharp ] || { say "Installing packages first (npm ci)…"; { npm ci --no-audit --no-fund && npm run deps:scripts; } || fail "npm ci failed."; }

say "1/3  Downloading synagogue photos from Wikimedia Commons…"
node scripts/photos/fetch-wikimedia.mjs "${NODE_ARGS[@]}"
FETCH_STATUS=$?

if [ "$DRY_RUN" -eq 1 ]; then
  say "Dry run: nothing was downloaded or changed."
  exit 0
fi

say "2/3  Updating public/photos/CREDITS.md and PHOTOS_NEEDED.md…"
npx --no-install tsx scripts/photos/write-docs.ts || fail "Could not update the credits."

PATHS=(public/photos/jewish src/config/photos-manifest.json public/photos/CREDITS.md PHOTOS_NEEDED.md)
if [ -z "$(git status --porcelain -- "${PATHS[@]}")" ]; then
  if [ "$FETCH_STATUS" -eq 0 ]; then
    say "✓ Done — the photos were already there, nothing to commit."
    exit 0
  fi
  fail "No photo could be downloaded. Check the internet connection and run the command again in a few minutes."
fi

say "3/3  Saving the photos in git…"
git add -- "${PATHS[@]}" || fail "git add failed."
git commit -m "Add synagogue photos from Wikimedia Commons" -- "${PATHS[@]}" || fail "git commit failed."
if [ "$PUSH" -eq 1 ]; then
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  git push origin "HEAD:$BRANCH" || fail "git push failed — the photos are committed; run: git push"
fi

if [ "$FETCH_STATUS" -eq 0 ]; then
  printf '\n\033[32m✓ Success: the synagogue photos are in the site (committed%s).\033[0m\n' "$([ "$PUSH" -eq 1 ] && echo ' and pushed')"
  echo "  Please look at them on /photo-credits; if one shows people or looks wrong, tell the developer."
else
  printf '\n\033[33m! Partly done: some photos were saved, others could not be downloaded.\033[0m\n'
  echo "  Run the same command again later to try the missing ones."
  exit 1
fi
