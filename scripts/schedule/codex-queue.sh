#!/bin/bash
# Runs the oldest pending Codex brief (docs/coordination/codex-queue/NN-*.md) headless, unless a Codex job
# is already running or Codex is still rate-limited. Records the reset time Codex reports. See docs/RUNBOOK.md.
set -u
R=/Users/vjspranav/Projects/CodeInsta
Q=$R/docs/coordination/codex-queue
STATE=$Q/.state; mkdir -p "$STATE" "$Q/done"
C=/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex

pgrep -f "codex exec" >/dev/null && { echo "codex busy"; exit 0; }
if [ -s "$STATE/reset_epoch" ] && [ "$(date +%s)" -lt "$(cat "$STATE/reset_epoch")" ]; then
  echo "codex limited until $(date -r "$(cat "$STATE/reset_epoch")" +%H:%M)"; exit 0
fi
brief=$(find "$Q" -maxdepth 1 -name '[0-9]*.md' | sort | head -1)
[ -z "$brief" ] && { echo "codex queue empty"; exit 0; }
name=$(basename "$brief" .md)
echo "codex: running $name"
"$C" exec -C "$R" -s workspace-write -c sandbox_workspace_write.network_access=true -c model_reasoning_effort=medium \
  -o "$STATE/$name.out" "$(cat "$brief")" > "$STATE/$name.log" 2>&1
limit=$(grep -o "try again at [0-9:]* [AP]M" "$STATE/$name.log" | tail -1 | sed 's/try again at //')
if [ -n "$limit" ]; then
  # Today at that time, or tomorrow if it has already passed.
  t=$(date -j -f "%I:%M %p" "$limit" +%s 2>/dev/null); [ -n "$t" ] && [ "$t" -le "$(date +%s)" ] && t=$((t + 86400))
  echo "${t:-$(( $(date +%s) + 3600 ))}" > "$STATE/reset_epoch"
  echo "codex hit its usage limit; $name stays queued (reset $limit)"; exit 0
fi
mv "$brief" "$Q/done/"
echo "codex: $name finished; review $STATE/$name.out and commit with [codex]"
