// One-time backfill of docs/coordination/.activity.jsonl from git history and Codex task logs.
// Re-running replaces earlier backfilled rows (backfill: true) and keeps live rows.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const LOG = join(ROOT, 'docs/coordination/.activity.jsonl');
const SINCE = '2026-10-31';
const SCRATCH = '/private/tmp/claude-501/-Users-vjspranav-Projects-CodeInsta/07c378f8-6ffe-46a2-b82b-a040835ccdfc/scratchpad/codex';
const STATE = join(ROOT, 'docs/coordination/codex-queue/.state');

const rows = [];
const iso = (d) => new Date(d).toISOString().replace(/\.\d+Z$/, 'Z');

// 1. Commits. [codex] -> codex; everything else (including unprefixed orchestrator commits) -> claude.
const out = execFileSync('git', ['-C', ROOT, 'log', `--since=${SINCE}`, '--format=%h|%cI|%s'], { encoding: 'utf8' });
for (const line of out.split('\n').filter(Boolean)) {
  const [h, ts, ...rest] = line.split('|');
  const subject = rest.join('|');
  rows.push({ ts: iso(ts), agent: /^\[codex\]/i.test(subject) ? 'codex' : 'claude', kind: 'commit', job: 'git', summary: subject.replace(/^\[(claude|codex)\]\s*/i, ''), commits: [h], backfill: true });
}

// 2. Codex task logs (birth time = start, mtime = end).
function fromLogs(dir, label) {
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir).filter((n) => /\.log$/.test(n) && !/chain/.test(n))) {
    const base = f.replace(/\.log$/, '');
    const st = statSync(join(dir, f));
    const start = st.birthtimeMs && st.birthtimeMs < st.mtimeMs ? st.birthtimeMs : st.mtimeMs;
    const job = label ? `${label} ${base.replace(/^task/, '')}` : base;
    const text = readFileSync(join(dir, f), 'utf8');
    const lim = [...text.matchAll(/^ERROR: .*usage limit.*?try again at ([^\n]+?)\.?\s*$/gim)].pop();
    const outFile = join(dir, base + '.out');
    const outText = existsSync(outFile) ? readFileSync(outFile, 'utf8').trim() : '';
    rows.push({ ts: iso(start), agent: 'codex', kind: 'start', job, summary: `started ${job}`, backfill: true });
    if (lim) rows.push({ ts: iso(st.mtimeMs), agent: 'codex', kind: 'limited', job, summary: `usage limit hit; resets ${lim[1]}`, backfill: true });
    else if (outText) rows.push({ ts: iso(statSync(outFile).mtimeMs), agent: 'codex', kind: 'end', job, summary: outText.replace(/\s+/g, ' ').slice(0, 200), backfill: true });
    else rows.push({ ts: iso(st.mtimeMs), agent: 'codex', kind: 'failed', job, summary: 'no final message', backfill: true });
  }
}
fromLogs(SCRATCH, 'task');
fromLogs(STATE, '');

// Keep live rows, replace old backfill rows.
let live = [];
if (existsSync(LOG)) live = readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => !r.backfill);
const all = [...rows, ...live].sort((a, b) => a.ts.localeCompare(b.ts));
writeFileSync(LOG + '.tmp', all.map((r) => JSON.stringify(r)).join('\n') + '\n');
renameSync(LOG + '.tmp', LOG);
console.log(`backfilled ${rows.length} events (${rows.filter((r) => r.kind === 'commit').length} commits); kept ${live.length} live rows`);
