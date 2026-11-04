#!/bin/bash
# Ships the worker to its server and restarts it. The server's own state (kits/, lab/out/, and what Muse learns in
# data/) is never overwritten: it lives there, not in git.
# Usage: deploy/deploy.sh [first]    (first: also seeds data/, the lab's kits and the ledger)
set -euo pipefail
HOST=${DOMI_WORKER:-root@2.29.117.228}
cd "$(dirname "$0")/.."
STATE="--exclude data/history.json --exclude data/playbook.json --exclude data/stock.json --exclude data/stock-claims/ --exclude data/trends/"
[ "${1:-}" = first ] && STATE=""
rsync -az --delete --exclude .git --exclude node_modules --exclude kits/ --exclude lab/out/ --exclude lab/inspo/ --exclude lab/photos/ \
  --exclude web/ --exclude .env $STATE ./ $HOST:/srv/domi-reels/
if [ "${1:-}" = first ]; then
  rsync -az kits/ $HOST:/srv/domi-reels/kits/
  ssh $HOST 'mkdir -p /srv/domi-reels/lab/out' && rsync -az lab/out/ledger.jsonl $HOST:/srv/domi-reels/lab/out/
fi
scp -q deploy/domi-worker.service deploy/domi-chat.service $HOST:/etc/systemd/system/
scp -q deploy/Caddyfile $HOST:/etc/caddy/Caddyfile
# QUIET=1 copies the code without restarting anything: a Reel being made keeps going (its run already loaded its code).
if [ -n "${QUIET:-}" ]; then ssh $HOST 'chown -R domi:domi /srv/domi-reels'; echo "copied, nothing restarted"; exit 0; fi
ssh $HOST 'cd /srv/domi-reels && chown -R domi:domi /srv/domi-reels && sudo -u domi npm ci --omit=dev --no-audit --no-fund --silent && systemctl daemon-reload \
  && systemctl enable --now domi-worker domi-chat && systemctl restart domi-worker domi-chat && systemctl reload caddy \
  && sleep 2 && systemctl is-active domi-worker domi-chat caddy'
# The worker restarts with its job back in the queue; the webhook comes back in a second.
