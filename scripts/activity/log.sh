#!/bin/bash
# Record one checkpoint in docs/coordination/.activity.jsonl (gitignored) and rebuild docs/coordination/activity.html.
# Usage: scripts/activity/log.sh <claude|codex> <status> <task> "<note>" [commits...]
#   status: start | end            a whole run (task: run, or the Codex brief name)
#           picked                 took a task       ("B1", "E1/2.1", a Codex brief name, or a short slug)
#           progress               a step inside it  (note says what just finished and what is next)
#           done                   finished it       (pass the commit hashes)
#           stopped                left it mid-way   (note says exactly where, so the next run resumes)
#           waiting                needs the owner   (note says what the owner must do)
#           blocked | failed       cannot continue   (note says why)
#           limited                usage limit hit   (note says when it resets, "resets 4:30 PM")
#           skipped                nothing to do this run
# One printf per event is a single O_APPEND write, so concurrent writers do not interleave lines.
agent=${1:-}; kind=${2:-}; job=${3:-}; summary=${4:-}; shift 4 2>/dev/null || shift $#
[ -z "$agent" ] || [ -z "$kind" ] && { echo "usage: log.sh <agent> <status> <task> <note> [commits...]" >&2; exit 1; }
R=/Users/vjspranav/Projects/CodeInsta
LOG=${ACTIVITY_LOG:-$R/docs/coordination/.activity.jsonl}
mkdir -p "$(dirname "$LOG")"
ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
summary=$(printf '%s' "$summary" | tr '\n\r\t' '   ' | cut -c1-400)
commits=$(printf '%s ' "$@" | xargs)
if command -v jq >/dev/null 2>&1; then
  line=$(jq -nc --arg ts "$ts" --arg agent "$agent" --arg kind "$kind" --arg job "$job" --arg summary "$summary" --arg commits "$commits" \
    '{ts:$ts,agent:$agent,kind:$kind,job:$job,summary:$summary} + (if $commits=="" then {} else {commits:($commits|split(" "))} end)')
else
  line=$(python3 -I -c 'import json,sys;a=sys.argv;d={"ts":a[1],"agent":a[2],"kind":a[3],"job":a[4],"summary":a[5]}
if a[6]: d["commits"]=a[6].split()
print(json.dumps(d))' "$ts" "$agent" "$kind" "$job" "$summary" "$commits")
fi
printf '%s\n' "$line" >> "$LOG"
# Rebuild the page in the background so the caller never waits or fails on it (skipped for test logs).
if [ -z "${ACTIVITY_LOG:-}" ]; then
  n=$(command -v node || ls -d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | tail -1)
  [ -n "$n" ] && ( "$n" "$R/scripts/activity/report.mjs" >/dev/null 2>&1 & )
fi
exit 0
