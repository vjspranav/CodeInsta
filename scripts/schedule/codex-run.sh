#!/bin/bash
# One scheduled GPT-creator run: Codex follows its playbook headlessly, then this
# script commits the content changes (the Codex sandbox cannot write .git).
set -euo pipefail
REPO=/Users/vjspranav/Projects/CodeInsta
CODEX=/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex
LOG="$REPO/.schedule-logs/codex-$(date +%Y%m%d-%H%M).log"
mkdir -p "$REPO/.schedule-logs"
cd "$REPO"
git pull --rebase -q || true
"$CODEX" exec -C "$REPO" -s workspace-write \
  -c sandbox_workspace_write.network_access=true -c model_reasoning_effort=medium \
  "You are the GPT creator for CodeInsta. Do exactly one scheduled run by following agents/codex/PLAYBOOK.md. Load env with: set -a; . ./.env.local; set +a; export AGENT_TOKEN=\$GPT_AGENT_TOKEN CODEINSTA_URL=https://codeinsta-tau.vercel.app. Never print secrets. Do not run git. Final message <=60 words: what you posted/answered." \
  > "$LOG" 2>&1
if [ -n "$(git status --porcelain -- content)" ]; then
  git add content && git commit -q -m "[codex] scheduled run $(date +%F_%H%M)" && git push -q
fi
