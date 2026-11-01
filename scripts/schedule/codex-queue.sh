#!/bin/bash
# Runs the oldest pending Codex brief (docs/coordination/codex-queue/NN-*.md) headless, unless a Codex job
# is already running or Codex is still rate-limited. Records the reset time Codex reports. See docs/RUNBOOK.md.
set -u
R=/Users/vjspranav/Projects/CodeInsta
Q=$R/docs/coordination/codex-queue
STATE=$Q/.state; mkdir -p "$STATE" "$Q/done"
C=/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex

# Activity log and report (see scripts/activity). Logging must never change the runner's behavior.
act() { "$R/scripts/activity/log.sh" codex "$@" >/dev/null 2>&1 || true; }
# A skip reason is logged at most once per 6 h so a long wait does not flood the log.
skip() {
  local f="$STATE/.skip-$1"
  if [ ! -e "$f" ] || [ $(( $(date +%s) - $(stat -f %m "$f") )) -ge 21600 ]; then touch "$f"; act skipped codex-queue "$2"; fi
}
report() {
  local n; n=$(command -v node || ls -d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | tail -1)
  [ -n "$n" ] && "$n" "$R/scripts/activity/report.mjs" >/dev/null 2>&1 || true
}

# One runner at a time; a lock older than 3 h belongs to a crashed run and is cleared.
LOCK=$STATE/lock
if [ -e "$LOCK" ] && [ $(( $(date +%s) - $(stat -f %m "$LOCK") )) -lt 10800 ]; then skip busy "runner busy"; echo "runner busy"; exit 0; fi
echo $$ > "$LOCK"; trap 'rm -f "$LOCK"; report' EXIT
pgrep -f "codex exec" >/dev/null && { skip busy "codex busy"; echo "codex busy"; exit 0; }
if [ -s "$STATE/reset_epoch" ] && [ "$(date +%s)" -lt "$(cat "$STATE/reset_epoch")" ]; then
  skip limited "codex limited until $(date -r "$(cat "$STATE/reset_epoch")" +%H:%M)"
  echo "codex limited until $(date -r "$(cat "$STATE/reset_epoch")" +%H:%M)"; exit 0
fi
brief=$(find "$Q" -maxdepth 1 -name '[0-9]*.md' | sort | head -1)
[ -z "$brief" ] && { skip empty "empty queue"; echo "codex queue empty"; exit 0; }
name=$(basename "$brief" .md)
echo "codex: running $name"
act start "$name" "started $name"
"$C" exec -C "$R" -s workspace-write -c sandbox_workspace_write.network_access=true -c model_reasoning_effort=medium \
  -o "$STATE/$name.out" "$(cat "$brief")" > "$STATE/$name.log" 2>&1
limit=$(grep -o "try again at [0-9:]* [AP]M" "$STATE/$name.log" | tail -1 | sed 's/try again at //')
if [ -n "$limit" ]; then
  # Today at that time, or tomorrow if it has already passed.
  t=$(date -j -f "%I:%M %p" "$limit" +%s 2>/dev/null); [ -n "$t" ] && [ "$t" -le "$(date +%s)" ] && t=$((t + 86400))
  echo "${t:-$(( $(date +%s) + 3600 ))}" > "$STATE/reset_epoch"
  act limited "$name" "usage limit hit; $name stays queued, resets $limit"
  echo "codex hit its usage limit; $name stays queued (reset $limit)"; exit 0
fi
# A run that ended without a final message failed for another reason: retry up to 3 times, then park it.
if [ ! -s "$STATE/$name.out" ]; then
  n=$(( $(cat "$STATE/$name.tries" 2>/dev/null || echo 0) + 1 )); echo $n > "$STATE/$name.tries"
  act failed "$name" "no final message (try $n/3)$([ $n -ge 3 ] && echo "; moved to failed/")"
  if [ $n -ge 3 ]; then mkdir -p "$Q/failed"; mv "$brief" "$Q/failed/"; echo "codex: $name failed 3 times, moved to failed/ (see $STATE/$name.log)"
  else echo "codex: $name failed (try $n/3), will retry next run"; fi
  exit 0
fi
mv "$brief" "$Q/done/"
act end "$name" "$(tr '\n' ' ' < "$STATE/$name.out" | cut -c1-200)"
echo "codex: $name finished; review $STATE/$name.out and commit with [codex]"
