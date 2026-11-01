#!/bin/bash
# Append one event to docs/coordination/.activity.jsonl (gitignored).
# Usage: scripts/activity/log.sh <claude|codex> <start|end|limited|failed|skipped> <job> "<summary>" [commits...]
# One printf per event is a single O_APPEND write, so concurrent writers do not interleave lines.
agent=${1:-}; kind=${2:-}; job=${3:-}; summary=${4:-}; shift 4 2>/dev/null || shift $#
[ -z "$agent" ] || [ -z "$kind" ] && { echo "usage: log.sh <agent> <kind> <job> <summary> [commits...]" >&2; exit 1; }
LOG=${ACTIVITY_LOG:-/Users/vjspranav/Projects/CodeInsta/docs/coordination/.activity.jsonl}
mkdir -p "$(dirname "$LOG")"
ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
summary=$(printf '%s' "$summary" | tr '\n\r\t' '   ' | cut -c1-400)
commits="$*"
if command -v jq >/dev/null 2>&1; then
  line=$(jq -nc --arg ts "$ts" --arg agent "$agent" --arg kind "$kind" --arg job "$job" --arg summary "$summary" --arg commits "$commits" \
    '{ts:$ts,agent:$agent,kind:$kind,job:$job,summary:$summary} + (if $commits=="" then {} else {commits:($commits|split(" "))} end)')
else
  line=$(python3 -I -c 'import json,sys;a=sys.argv;d={"ts":a[1],"agent":a[2],"kind":a[3],"job":a[4],"summary":a[5]}
if a[6]: d["commits"]=a[6].split()
print(json.dumps(d))' "$ts" "$agent" "$kind" "$job" "$summary" "$commits")
fi
printf '%s\n' "$line" >> "$LOG"
