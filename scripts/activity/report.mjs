// Builds docs/coordination/activity.html: what each agent is on right now, where it stopped, what needs the owner,
// and the runbook queue with every step's checkpoint history. Sources: the checkpoints agents write with
// scripts/activity/log.sh (docs/coordination/.activity.jsonl), docs/RUNBOOK.md, the Codex queue folder and the
// B1 publish runner's files. Plain Node, no dependencies. Usage: node scripts/activity/report.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, renameSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const P = (...a) => join(ROOT, ...a);
const OUT = P('docs/coordination/activity.html');
const QUEUE = P('docs/coordination/codex-queue');
const B1 = P('.schedule-logs/b1');
const REPO = 'https://github.com/vjspranav/CodeInsta';
const NOW = Date.now();
const MIN = 60e3, H = 60 * MIN;

const read = (f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } };
const mtime = (f) => { try { return statSync(f).mtimeMs; } catch { return 0; } };
const lines = (f) => read(f).split('\n').map((s) => s.trim()).filter(Boolean);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Markdown links become their text; bold and code marks go; OWNER/PROD read as plain words.
const clean = (s) => String(s).replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\(\S*$/, '$1').replace(/\*\*/g, '').replace(/`/g, '').replace(/\bOWNER\b/g, 'owner').trim();
// The sentence of a runbook note that says what the owner must do.
const ownerAsk = (n) => (/waiting for owner[^.]*(\.|$)/i.exec(n) || [n])[0].replace(/^waiting for owner/i, 'Waiting for owner');
const clip = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1).trimEnd() + '...' : String(s));
const fmtAt = (t) => {
  const d = new Date(t), time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === new Date(NOW).toDateString() ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
};
// Relative times are rendered by the page script from data-t, so they stay right when the file is old.
const when = (t) => `<time data-t="${t}" title="${esc(new Date(t).toString())}">${esc(fmtAt(t))}</time>`;
const AGENTS = { claude: 'Claude', codex: 'Codex' };

// ---------- processes ----------
let ps = '';
try { ps = execFileSync('ps', ['-axo', 'command='], { encoding: 'utf8' }); } catch { /* ignore */ }
// Shell wrappers quote the whole command, so only count real processes, not shells whose text mentions it.
const running = (re) => ps.split('\n').some((c) => re.test(c) && !/^(\/bin\/)?(zsh|bash|sh) /.test(c));
const publishing = running(/scripts\/agent\.ts publish/);
const codexRunning = running(/codex(-cli)?\S* exec/);

// ---------- checkpoints ----------
const events = read(P('docs/coordination/.activity.jsonl')).split('\n').filter(Boolean).map((l) => {
  try { const e = JSON.parse(l); e.t = Date.parse(e.ts); return e; } catch { return null; }
}).filter((e) => e && e.t && AGENTS[e.agent] && !e.backfill && e.kind !== 'commit').sort((a, b) => a.t - b.t);
for (const e of events) {
  if (e.job === 'continue' || e.job === 'codex-queue') e.job = 'run';
  e.summary = clean(e.summary || '');
  e.commits = (e.commits || []).filter(Boolean);
}

// ---------- runbook ----------
const sections = [], steps = new Map();
{
  let inQueue = false, sec = null, cur = null;
  for (const line of read(P('docs/RUNBOOK.md')).split('\n')) {
    if (/^## /.test(line)) { inQueue = /^## Queue\b/.test(line); cur = null; continue; }
    if (!inQueue) continue;
    let m;
    if ((m = /^### ([A-Z])\. (.+)/.exec(line))) { sec = { id: m[1], name: clean(m[2]), steps: [] }; sections.push(sec); cur = null; continue; }
    if ((m = /^- \[( |x)\] ([A-Z]\d+)\. (.*)$/.exec(line)) && sec) {
      let text = m[3], result = '';
      const r = /^\((\d{4}-\d{2}-\d{2}): (.*?)\)\s+(?=\S)/.exec(text);
      if (r) { result = `${r[1]}: ${clean(r[2])}`; text = text.slice(r[0].length); }
      cur = {
        id: m[2], done: m[1] === 'x', result, section: sec.id, notes: [],
        owner: /\*\*OWNER\*\*/.test(text), prod: /\*\*PROD\*\*/.test(text),
        title: clip(clean(text).replace(/^owner\s+/, 'Owner ').replace(/^PROD\s+/, '').replace(/\bPROD\s+/g, '').replace(/\s*\(spec:[^)]*\)/, ''), 120),
      };
      sec.steps.push(cur); steps.set(cur.id, cur); continue;
    }
    // Only labelled sub-notes ("progress (date): ...", "parked: ...", "failed: ...") are status; other sub-bullets are spec.
    if (cur && (m = /^\s+- ((progress|parked|failed|blocked|stashed?|recovered|waiting)\b.*)$/i.exec(line))) cur.notes.push(clean(m[1]));
  }
}

// ---------- Codex queue ----------
const briefs = (dir) => { try { return readdirSync(dir).filter((f) => /^\d+.*\.md$/.test(f)).sort(); } catch { return []; } };
const briefInfo = (dir, f) => {
  const txt = read(join(dir, f));
  return {
    name: f.replace(/\.md$/, ''), t: mtime(join(dir, f)),
    title: clip(clean((/^#\s+(.+)$/m.exec(txt) || [, f])[1]), 100),
    step: (/^Runbook:\s*([A-Z]\d+)/m.exec(txt) || [])[1] || null,
  };
};
const queue = {
  pending: briefs(QUEUE).map((f) => briefInfo(QUEUE, f)),
  failed: briefs(join(QUEUE, 'failed')).map((f) => briefInfo(join(QUEUE, 'failed'), f)),
  done: briefs(join(QUEUE, 'done')).map((f) => briefInfo(join(QUEUE, 'done'), f)).sort((a, b) => b.t - a.t),
};
const briefByName = new Map([...queue.pending, ...queue.failed, ...queue.done].map((b) => [b.name, b]));
const resetEpoch = Number(read(join(QUEUE, '.state/reset_epoch')).trim()) * 1000 || 0;
const codexLastCheck = mtime('/tmp/codeinsta-codex-queue.log');

// A checkpoint's runbook step: "B1", "E1/2.1", or a Codex brief that names its step with a "Runbook: E1" line.
const stepOf = (job) => (/^([A-F]\d+)\b/.exec(job || '') || [])[1] || briefByName.get(job)?.step || null;
const isRun = (e) => e.job === 'run' || !e.job;

// ---------- B1 runner ----------
const remakes = ['claude', 'gpt'].flatMap((a) => { try { return readdirSync(P('content/remake', a)).filter((f) => f.endsWith('.json')); } catch { return []; } });
const b1 = existsSync(B1) ? (() => {
  const stopped = lines(join(B1, 'stopped.txt'))[0] || '';
  const log = read(join(B1, 'log.txt'));
  let reason = '';
  if (stopped) {
    const tail = log.slice(-6000);
    reason = (/verification FAILED \([^)]*\)/.exec(tail) || /"error":\s*"([^"]+)"/.exec(tail) || [])[0] || '';
    reason = reason.replace(/^"error":\s*"/, '').replace(/"$/, '');
  }
  return {
    total: remakes.length, done: lines(join(B1, 'done.txt')).length, skipped: lines(join(B1, 'skip.txt')),
    stopped: stopped.split(' ')[0].replace(/^content\/remake\//, ''), reason, at: mtime(join(B1, 'log.txt')),
    allDone: /ALL DONE\s*$/.test(log),
  };
})() : null;

// ---------- step state ----------
const STATE = {
  active: ['In progress', 'ok'], paused: ['Paused, resumes next run', 'warn'], owner: ['Needs you', 'you'],
  blocked: ['Blocked', 'bad'], queued: ['Up next', 'mute'], review: ['Done, not ticked yet', 'ok'], done: ['Done', 'mute'],
};
function stepState(s) {
  const evs = events.filter((e) => stepOf(e.job) === s.id);
  const last = evs.at(-1);
  const agent = last?.agent || null;
  if (s.done) return { key: 'done', agent, note: s.result, evs };
  if (s.id === 'B1' && b1) {
    if (publishing) return { key: 'active', agent: 'claude', note: `Publishing remakes: ${b1.done} of ${b1.total} live.`, evs };
    if (b1.stopped) return { key: 'paused', agent: 'claude', note: `Runner stopped on ${b1.stopped}: ${b1.reason || 'publish failed'}. ${b1.done} of ${b1.total} live; the next run fixes the script and restarts it.`, evs };
  }
  const waitNote = s.notes.find((n) => /waiting for owner/i.test(n));
  if (last) {
    const k = last.kind;
    if (k === 'waiting') return { key: 'owner', agent, note: last.summary, evs };
    if (k === 'blocked' || k === 'failed') return { key: 'blocked', agent, note: last.summary, evs };
    if (k === 'done') return { key: 'review', agent, note: last.summary, evs };
    if ((k === 'picked' || k === 'progress') && NOW - last.t < 3 * H) return { key: 'active', agent, note: last.summary, evs };
    if (waitNote) return { key: 'owner', agent, note: ownerAsk(waitNote), evs };
    return { key: 'paused', agent, note: last.summary, evs };
  }
  if (s.notes.some((n) => /^blocked/i.test(n))) return { key: 'blocked', agent, note: s.notes.find((n) => /^blocked/i.test(n)), evs };
  if (waitNote) return { key: 'owner', agent, note: ownerAsk(waitNote), evs };
  if (s.notes.length) return { key: 'paused', agent, note: s.notes.at(-1), evs };
  const sec = sections.find((x) => x.id === s.section);
  const prev = sec.steps[sec.steps.indexOf(s) - 1];
  if (s.owner && (!prev || prev.done)) return { key: 'owner', agent, note: 'Your turn on this step.', evs };
  return { key: 'queued', agent, note: '', evs };
}
for (const s of steps.values()) s.st = stepState(s);

// ---------- agents now ----------
function nextCron(t) { const d = new Date(t); d.setMinutes(0, 0, 0); do d.setHours(d.getHours() + 1); while (d.getHours() % 3); return d.getTime(); }
const resetOf = (e) => {
  const m = /resets (\d{1,2}):(\d{2}) ?([AP]M)/i.exec(e?.summary || '');
  if (!m) return 0;
  const d = new Date(e.t); d.setHours(Number(m[1]) % 12 + (m[3].toUpperCase() === 'PM' ? 12 : 0), Number(m[2]), 0, 0);
  if (d.getTime() <= e.t) d.setDate(d.getDate() + 1);
  return d.getTime();
};
function agentNow(agent) {
  const mine = events.filter((e) => e.agent === agent);
  const real = mine.filter((e) => e.kind !== 'skipped');
  const last = real.at(-1);
  const lastTask = [...real].reverse().find((e) => !isRun(e));
  const lastRunEvt = [...real].reverse().find((e) => isRun(e) || ['limited', 'failed'].includes(e.kind));
  const lastSkip = [...mine].reverse().find((e) => e.kind === 'skipped');
  const lockT = agent === 'claude' ? mtime(P('docs/coordination/.claude-run.lock')) : mtime(join(QUEUE, '.state/lock'));
  let working = agent === 'codex' ? codexRunning : (lockT && NOW - lockT < 3 * H);
  if (!working && last && ['start', 'picked', 'progress'].includes(last.kind) && NOW - last.t < 2 * H) working = true;
  let state = 'Idle', tone = 'mute', detail = '';
  const reset = agent === 'codex' && resetEpoch > NOW ? resetEpoch : (lastRunEvt?.kind === 'limited' ? resetOf(lastRunEvt) : 0);
  if (working) { state = 'Working'; tone = 'ok'; }
  else if (reset > NOW) { state = 'Usage limit'; tone = 'warn'; detail = `Resets ${fmtAt(reset)}`; }
  else if (lastRunEvt?.kind === 'failed') { state = 'Last run failed'; tone = 'bad'; }
  const next = agent === 'claude'
    ? `Next scheduled run ${fmtAt(nextCron(NOW))} (every 3 h while the Claude app is open)`
    : `Queue checked every 30 min${codexLastCheck ? `, last at ${fmtAt(codexLastCheck)}` : ''}${queue.pending.length ? `; ${queue.pending.length} brief(s) waiting` : '; queue empty'}`;
  let task = null;
  if (lastTask) {
    const st = steps.get(stepOf(lastTask.job));
    const open = ['picked', 'progress'].includes(lastTask.kind);
    task = { e: lastTask, label: open && working ? 'Working on' : open ? 'Last on (no end recorded)' : { done: 'Finished', end: 'Finished', stopped: 'Stopped at', waiting: 'Waiting on you for', blocked: 'Blocked on', failed: 'Failed on', limited: 'Hit the limit on' }[lastTask.kind] || 'Last on', title: st?.title || briefByName.get(lastTask.job)?.title || '' };
  }
  return { agent, state, tone, detail, next, task, last, lastSkip, lastRunEvt };
}
const now = ['claude', 'codex'].map(agentNow);

// ---------- needs you ----------
const needs = [...steps.values()].filter((s) => s.st.key === 'owner').map((s) => ({ id: s.id, title: s.title, note: s.st.note }));
for (const s of steps.values()) {
  if (s.st.key === 'owner') continue;
  for (const n of s.notes) {
    const m = /waiting for owner(?: approval)?:\s*([^.;]+)/i.exec(n);
    if (m && !s.done) needs.push({ id: s.id, title: s.title, note: `Approve: ${m[1]}` });
  }
}
for (const b of queue.failed) needs.push({ id: b.name, title: b.title, note: 'Codex failed this brief 3 times; it is parked in codex-queue/failed/.' });

// ---------- rendering ----------
const commitChips = (cs) => cs.map((h) => `<a class="sha" href="${REPO}/commit/${esc(h)}">${esc(h.slice(0, 7))}</a>`).join(' ');
const pill = (key) => `<span class="pill ${STATE[key][1]}">${esc(STATE[key][0])}</span>`;
const who = (a) => (a ? `<span class="who ${a}">${AGENTS[a]}</span>` : '');
const evRow = (e, showTask = true) => `<li><span class="k ${esc(e.kind)}">${esc(e.kind)}</span>${who(e.agent)}${showTask && !isRun(e) ? `<b class="task">${esc(e.job)}</b>` : ''}<span class="note">${esc(e.summary)}</span>${commitChips(e.commits)}${when(e.t)}</li>`;

const nowCards = now.map((a) => `
  <section class="card now ${a.agent}">
    <header><h2>${AGENTS[a.agent]}</h2><span class="pill ${a.tone}">${esc(a.state)}</span>${a.detail ? `<span class="sub">${esc(a.detail)}</span>` : ''}</header>
    ${a.task ? `<p class="lbl">${esc(a.task.label)}</p>
    <p class="cur"><b>${esc(a.task.e.job)}</b>${a.task.title ? ` ${esc(a.task.title)}` : ''}</p>
    <p class="note">${esc(a.task.e.summary)} ${commitChips(a.task.e.commits)} <span class="sub">${when(a.task.e.t)}</span></p>` : '<p class="note sub">No task checkpoints yet.</p>'}
    ${a.lastRunEvt && a.lastRunEvt !== a.task?.e ? `<p class="lbl">Last run</p><p class="note">${esc(a.lastRunEvt.summary)} <span class="sub">${a.lastRunEvt.kind}, ${when(a.lastRunEvt.t)}</span></p>` : ''}
    <p class="sub foot">${esc(a.next)}</p>
  </section>`).join('');

const needsHtml = needs.length ? `<section class="card needs"><h2>Needs you</h2><ul class="plain">${needs.map((n) => `<li><b class="task">${esc(n.id)}</b> <span>${esc(n.title)}</span><br><span class="note">${esc(n.note)}</span></li>`).join('')}</ul></section>` : '';

const bar = (n, total) => `<span class="bar"><i style="width:${total ? Math.round((n / total) * 100) : 0}%"></i></span>`;
const pipes = [];
if (b1) pipes.push(`<div><h3>B1 remake publishing</h3>${bar(b1.done, b1.total)}<p><b>${b1.done}</b> of ${b1.total} live${b1.skipped.length ? `, ${b1.skipped.length} parked` : ''}. ${publishing ? 'Publishing now.' : b1.allDone ? 'All done.' : b1.stopped ? `Stopped on <b>${esc(b1.stopped)}</b>: ${esc(b1.reason || 'publish failed')}.` : 'Not running.'} <span class="sub">Last activity ${when(b1.at)}</span></p></div>`);
pipes.push(`<div><h3>Codex queue</h3><p>${queue.pending.length ? queue.pending.map((b) => `<b class="task">${esc(b.name)}</b> ${esc(b.title)}`).join('<br>') : 'Nothing queued.'}${queue.failed.length ? `<br><span class="bad-t">${queue.failed.length} parked after 3 failures</span>` : ''}</p>${queue.done.length ? `<p class="sub">Finished: ${queue.done.slice(0, 4).map((b) => `${esc(b.name)} (${fmtAt(b.t)})`).join(', ')}</p>` : ''}</div>`);

const stepRow = (s) => {
  const st = s.st;
  const hist = st.evs.length ? `<details><summary>${st.evs.length} checkpoint${st.evs.length > 1 ? 's' : ''}</summary><ul class="feed">${[...st.evs].reverse().map((e) => evRow(e, true)).join('')}</ul></details>` : '';
  const extra = !s.done && s.notes.length && !st.note.startsWith(s.notes.at(-1).slice(0, 40)) ? `<details><summary>Runbook notes</summary><ul class="plain">${s.notes.map((n) => `<li class="note">${esc(n)}</li>`).join('')}</ul></details>` : '';
  return `<li class="step ${st.key}"><div class="head"><b class="task">${esc(s.id)}</b><span class="ttl">${esc(s.title)}</span>${s.owner ? '<span class="tag">owner</span>' : ''}${s.prod ? '<span class="tag">prod</span>' : ''}${pill(st.key)}${who(st.agent)}</div>${st.note ? `<p class="note">${esc(clip(st.note, 320))}</p>` : ''}${hist}${extra}</li>`;
};
const runbookHtml = sections.map((sec) => {
  const doneN = sec.steps.filter((s) => s.done).length;
  const open = sec.steps.filter((s) => !s.done), closed = sec.steps.filter((s) => s.done);
  return `<section class="card sec"><header><h2>${esc(sec.id)}. ${esc(sec.name)}</h2><span class="sub">${doneN} of ${sec.steps.length} done</span>${bar(doneN, sec.steps.length)}</header>
    <ul class="steps">${open.map(stepRow).join('')}</ul>
    ${closed.length ? `<details class="closed"><summary>${closed.length} done</summary><ul class="steps">${closed.map(stepRow).join('')}</ul></details>` : ''}</section>`;
}).join('');

// Last 24 h: one lane per agent; a bar from a start/picked checkpoint to the next one that closes it.
const W = 1000, T0 = NOW - 24 * H, x = (t) => Math.max(0, Math.min(W, ((t - T0) / (24 * H)) * W));
const CLOSE = new Set(['end', 'done', 'stopped', 'limited', 'failed', 'waiting', 'blocked']);
const lane = (agent, y) => {
  const mine = events.filter((e) => e.agent === agent && e.kind !== 'skipped');
  const spans = []; let open = null;
  for (const e of mine) {
    if (['start', 'picked', 'progress'].includes(e.kind)) { if (!open) open = e; }
    else if (CLOSE.has(e.kind) && open) { spans.push([open.t, e.t, e.kind]); open = null; }
  }
  if (open) spans.push([open.t, Math.min(NOW, open.t + 3 * H), 'open']);
  const bars = spans.filter(([, b]) => b > T0).map(([a, b, k]) => `<rect class="sp ${agent} ${k}" x="${x(a)}" y="${y}" width="${Math.max(4, x(b) - x(a))}" height="18" rx="3"/>`).join('');
  const ticks = mine.filter((e) => e.t > T0).map((e) => `<line class="tk ${e.kind}" x1="${x(e.t)}" x2="${x(e.t)}" y1="${y - 3}" y2="${y + 21}"><title>${esc(`${fmtAt(e.t)} ${e.kind} ${e.job}: ${e.summary}`)}</title></line>`).join('');
  return `<text class="ln" x="0" y="${y - 6}">${AGENTS[agent]}</text>${bars}${ticks}`;
};
const hourMarks = Array.from({ length: 9 }, (_, i) => { const t = T0 + i * 3 * H; return `<line class="hr" x1="${x(t)}" x2="${x(t)}" y1="12" y2="86"/><text class="hl" x="${Math.min(W - 30, x(t) + 2)}" y="100">${esc(new Date(t).toLocaleTimeString([], { hour: 'numeric' }))}</text>`; }).join('');
const timeline = `<section class="card"><h2>Last 24 hours</h2><svg viewBox="-2 0 ${W + 4} 104" role="img" aria-label="Agent runs over the last 24 hours">${hourMarks}${lane('claude', 30)}${lane('codex', 66)}</svg></section>`;

const feedEvents = events.filter((e) => e.kind !== 'skipped').slice(-40).reverse();
const feed = `<section class="card"><h2>Checkpoints</h2>${feedEvents.length ? `<ul class="feed">${feedEvents.map((e) => evRow(e)).join('')}</ul>` : '<p class="sub">None yet.</p>'}</section>`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="60"><title>Agent Activity</title>
<style>
:root{--bg:#f7f4ec;--card:#fffdf8;--ink:#1d1b17;--sub:#6d675c;--line:#e4ded0;--ok:#2f7d4f;--warn:#b7791f;--bad:#c0392b;--you:#e4572e;--claude:#c96442;--codex:#3a6ea5;--mute:#8a8478}
@media (prefers-color-scheme:dark){:root{--bg:#16150f;--card:#1f1d17;--ink:#ece6d8;--sub:#a39c8d;--line:#35322a;--mute:#7b7568}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1080px;margin:0 auto;padding:20px 16px 48px}
h1{font-size:22px;margin:0}h2{font-size:15px;margin:0}h3{font-size:13px;margin:0 0 6px}
.top{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 14px;margin-bottom:14px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;margin-bottom:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin-bottom:12px}
.grid .card{margin-bottom:0}
.card header{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin-bottom:8px}
.now{border-top:4px solid var(--mute)}.now.claude{border-top-color:var(--claude)}.now.codex{border-top-color:var(--codex)}
.lbl{margin:10px 0 2px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--sub)}
.cur{margin:0;font-weight:600}.note{margin:2px 0;color:var(--ink);overflow-wrap:anywhere}.sub{color:var(--sub);font-size:12px}.foot{margin:12px 0 0}
.pill{display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:99px;border:1px solid currentColor;white-space:nowrap}
.pill.ok{color:var(--ok)}.pill.warn{color:var(--warn)}.pill.bad{color:var(--bad)}.pill.you{color:#fff;background:var(--you);border-color:var(--you)}.pill.mute{color:var(--mute)}
.who{font-size:11px;font-weight:600;padding:1px 6px;border-radius:4px;color:#fff}.who.claude{background:var(--claude)}.who.codex{background:var(--codex)}
.task{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;margin-right:6px}
.tag{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--sub);border:1px solid var(--line);border-radius:4px;padding:0 4px}
.needs{border-left:4px solid var(--you)}
ul.plain,ul.steps,ul.feed{list-style:none;margin:0;padding:0}
ul.plain li{padding:6px 0;border-top:1px solid var(--line)}ul.plain li:first-child{border-top:0}
.step{padding:10px 0;border-top:1px solid var(--line)}.step:first-child{border-top:0}
.step .head{display:flex;flex-wrap:wrap;align-items:center;gap:6px}.step .ttl{flex:1 1 260px;font-weight:600}
.step.done .ttl{font-weight:400;color:var(--sub)}
.step .note{margin:4px 0 0;color:var(--sub)}.step.active .note,.step.owner .note,.step.blocked .note{color:var(--ink)}
details{margin-top:6px}summary{cursor:pointer;color:var(--sub);font-size:12px}
.closed{border-top:1px solid var(--line);padding-top:6px}
.feed li{display:flex;flex-wrap:wrap;gap:4px 8px;align-items:baseline;padding:6px 0;border-top:1px solid var(--line);font-size:13px}.feed li:first-child{border-top:0}
.feed .note{flex:1 1 280px}.feed time{color:var(--sub);font-size:12px;margin-left:auto;white-space:nowrap}
.k{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;min-width:62px;color:var(--sub)}
.k.done,.k.end{color:var(--ok)}.k.stopped,.k.limited,.k.paused{color:var(--warn)}.k.failed,.k.blocked{color:var(--bad)}.k.waiting{color:var(--you)}.k.picked,.k.start,.k.progress{color:var(--ink)}
.sha{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--codex);text-decoration:none}
.bar{display:inline-block;width:120px;height:6px;background:var(--line);border-radius:3px;overflow:hidden;vertical-align:middle}.bar i{display:block;height:100%;background:var(--ok)}
.pipes{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}.pipes p{margin:6px 0 0}.bad-t{color:var(--bad)}
svg{width:100%;height:auto;display:block}.hr{stroke:var(--line)}.hl,.ln{fill:var(--sub);font-size:11px}
.sp{opacity:.85}.sp.claude{fill:var(--claude)}.sp.codex{fill:var(--codex)}.sp.limited,.sp.failed{opacity:.45}
.tk{stroke:var(--ink);stroke-width:1.5;opacity:.5}.tk.limited,.tk.failed,.tk.blocked{stroke:var(--bad);opacity:1}.tk.waiting{stroke:var(--you);opacity:1}
</style></head><body><main>
<div class="top"><h1>Agent activity</h1><span class="sub">Updated ${when(NOW)}. Refreshes every minute; rebuilt whenever an agent writes a checkpoint.</span></div>
<div class="grid">${nowCards}</div>
${needsHtml}
<section class="card"><h2>Pipelines</h2><div class="pipes" style="margin-top:8px">${pipes.join('')}</div></section>
${timeline}
${runbookHtml}
${feed}
</main>
<script>
(function(){function ago(t){var m=Math.round((Date.now()-t)/60000);if(m<1)return'just now';if(m<60)return m+' min ago';var h=Math.floor(m/60);if(h<48)return h+' h '+(m%60?m%60+' min ':'')+'ago';return Math.floor(h/24)+' days ago'}
function tick(){document.querySelectorAll('time[data-t]').forEach(function(el){var t=+el.dataset.t;if(!el.dataset.abs)el.dataset.abs=el.textContent;el.textContent=el.dataset.abs+' ('+ago(t)+')'})}
tick();setInterval(tick,30000)})();
</script></body></html>
`;
const TMP = `${OUT}.${process.pid}.tmp`;
writeFileSync(TMP, html);
renameSync(TMP, OUT);
console.log(`wrote ${OUT}`);
