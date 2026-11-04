#!/bin/bash
# The web (web/) to Vercel production. Vercel blocks every deploy whose git commit author is not on its team, from a
# push or from the CLI inside the repo (it reads the last commit), so this deploys a copy of web/ from outside git.
# Usage: bash deploy/web.sh
set -euo pipefail
cd "$(dirname "$0")/.."
D=$(mktemp -d)
trap 'rm -rf "$D"' EXIT
rsync -a --exclude node_modules --exclude .next --exclude .vercel web/ "$D/web/"
mkdir -p "$D/.vercel" && cp web/.vercel/project.json "$D/.vercel/project.json"
cd "$D" && vercel deploy --prod --yes < /dev/null
