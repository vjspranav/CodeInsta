// Builds docs/coordination/activity.html from docs/coordination/.activity.jsonl plus git history.
// Plain Node, no dependencies. Usage: node scripts/activity/report.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const LOG = join(ROOT, 'docs/coordination/.activity.jsonl');
const OUT = join(ROOT, 'docs/coordination/activity.html');
const RESET_FILE = join(ROOT, 'docs/coordination/codex-queue/.state/reset_epoch');
const NOW = Date.now();
const H = 3600e3;
const WINDOW = 48 * H;

// ---------- load events ----------
const events = [];
if (existsSync(LOG)) {
  for (const l of readFileSync(LOG, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    try { const r = JSON.parse(l); r.t = Date.parse(r.ts); if (r.t && (r.agent === 'claude' || r.agent === 'codex')) events.push(r); } catch { /* skip bad line */ }
  }
}
// Live git history (newest 400 commits), merged with logged commit events by hash.
const commits = [];
try {
  const out = execFileSync('git', ['-C', ROOT, 'log', '-n', '400', '--format=%h|%cI|%s'], { encoding: 'utf8' });
  for (const line of out.split('\n').filter(Boolean)) {
    const [h, ts, ...rest] = line.split('|');
    const subject = rest.join('|');
    commits.push({ hash: h, t: Date.parse(ts), ts, agent: /^\[codex\]/i.test(subject) ? 'codex' : 'claude', summary: subject.replace(/^\[(claude|codex)\]\s*/i, '') });
  }
} catch { /* not a git checkout */ }
const seen = new Set(commits.map((c) => c.hash));
for (const e of events) if (e.kind === 'commit' && e.commits?.[0] && !seen.has(e.commits[0])) { commits.push({ hash: e.commits[0], t: e.t, ts: e.ts, agent: e.agent, summary: e.summary }); seen.add(e.commits[0]); }
commits.sort((a, b) => b.t - a.t);
const runEvents = events.filter((e) => e.kind !== 'commit').sort((a, b) => a.t - b.t);

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtDay = (t) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });
const fmtFull = (t) => `${fmtDay(t)}, ${fmtTime(t)}`;
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const fmtAt = (t) => (sameDay(t, NOW) ? fmtTime(t) : fmtFull(t));
function ago(t) {
  const m = Math.max(0, Math.round((NOW - t) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h${m % 60 ? ` ${m % 60} min` : ''} ago`;
  return `${Math.floor(h / 24)} days ago`;
}
const clip = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1).trimEnd() + '...' : String(s));

// Reset time of a "limited" event: the live reset_epoch file for the latest one, else parsed from "resets <time>".
function resetOf(e) {
  const m = /resets (?:([A-Z][a-z]{2}) (\d+)(?:st|nd|rd|th), (\d{4}) )?(\d{1,2}):(\d{2}) ([AP]M)/.exec(e.summary || '');
  if (!m) return null;
  let hh = Number(m[4]) % 12 + (m[6] === 'PM' ? 12 : 0);
  const base = new Date(e.t);
  const d = new Date(base);
  if (m[1]) { const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(m[1]); d.setFullYear(Number(m[3]), mo, Number(m[2])); }
  d.setHours(hh, Number(m[5]), 0, 0);
  if (!m[1] && d.getTime() <= e.t) d.setDate(d.getDate() + 1);
  return d.getTime();
}
let liveReset = null;
try { if (existsSync(RESET_FILE)) { const v = Number(readFileSync(RESET_FILE, 'utf8').trim()) * 1000; if (v) liveReset = v; } } catch { /* ignore */ }

// ---------- per-agent status ----------
const REAL = new Set(['start', 'end', 'limited', 'failed']);
const maxAge = { claude: 4 * H, codex: 24 * H };
function status(agent) {
  const mine = runEvents.filter((e) => e.agent === agent);
  const lastAny = [...mine, ...commits.filter((c) => c.agent === agent).map((c) => ({ ...c, kind: 'commit', job: 'git' }))].sort((a, b) => b.t - a.t)[0];
  const lastReal = [...mine].reverse().find((e) => REAL.has(e.kind));
  const lastSkip = [...mine].reverse().find((e) => e.kind === 'skipped');
  let badge = 'IDLE', detail = 'no recent activity';
  if (lastReal?.kind === 'limited') {
    const r = (liveReset && liveReset > lastReal.t ? liveReset : resetOf(lastReal));
    if (r && r > NOW) { badge = 'LIMITED'; detail = `limited until ${fmtAt(r)}`; }
    else detail = 'limit reset, waiting for the next run';
  } else if (lastReal?.kind === 'failed') { badge = 'FAILING'; detail = `last run failed ${ago(lastReal.t)}`; }
  if (badge === 'IDLE') {
    const recentReal = lastReal && NOW - lastReal.t < maxAge[agent];
    const recentCommit = lastAny && lastAny.kind === 'commit' && NOW - lastAny.t < maxAge[agent];
    const recentSkip = lastSkip && NOW - lastSkip.t < 7 * H; // runner alive, nothing to do
    if (recentReal || recentCommit || recentSkip) { badge = 'OK'; if (!lastReal || lastReal.kind !== 'limited') detail = recentReal || recentCommit ? 'ran recently' : 'runner alive, nothing queued'; }
  }
  const what = lastAny ? (lastAny.kind === 'commit' ? `committed: ${lastAny.summary}` : `${lastAny.kind} ${lastAny.job}${lastAny.summary && lastAny.kind !== 'start' ? ` (${lastAny.summary})` : ''}`) : null;
  return { agent, badge, detail, lastAny, what };
}
const S = { claude: status('claude'), codex: status('codex') };

// Next scheduled runs: Claude every 3 h on the hour (0 */3 * * *), Codex queue every 30 min.
const nextClaude = new Date(NOW); nextClaude.setMinutes(0, 0, 0); do nextClaude.setHours(nextClaude.getHours() + 1); while (nextClaude.getHours() % 3 !== 0);
const next = { claude: `next Claude run about ${fmtAt(nextClaude.getTime())} (every 3 h at :00)`, codex: 'Codex queue checks every 30 min, next within 30 min' };

// ---------- timeline ----------
const W = 720, X0 = 64, X1 = 708, LANE = { claude: 44, codex: 112 }, BH = 30, HEIGHT = 190;
const tMin = NOW - WINDOW;
const x = (t) => X0 + ((Math.min(Math.max(t, tMin), NOW) - tMin) / WINDOW) * (X1 - X0);
const tips = []; // [id, html] for the detail panel
function tip(lines) { tips.push(lines); return tips.length - 1; }

const blocks = [];
const markers = [];
for (const agent of ['claude', 'codex']) {
  const mine = runEvents.filter((e) => e.agent === agent && REAL.has(e.kind));
  for (let i = 0; i < mine.length; i++) {
    const e = mine[i];
    if (e.kind !== 'start') continue;
    // The run ends at the next end/limited/failed with the same job, before any later start of that job.
    let end = null;
    for (let j = i + 1; j < mine.length; j++) {
      if (mine[j].job === e.job && mine[j].kind === 'start') break;
      if (mine[j].job === e.job && mine[j].kind !== 'start') { end = mine[j]; break; }
    }
    const stop = end ? end.t : Math.min(NOW, e.t + 3 * H);
    const res = end ? end.kind : 'running';
    blocks.push({ agent, a: e.t, b: stop, res, job: e.job, summary: end ? end.summary : e.summary, startTs: e.t, endTs: end?.t });
  }
  for (const e of mine) {
    if (e.kind === 'limited' || e.kind === 'failed') markers.push({ agent, t: e.t, kind: e.kind, job: e.job, summary: e.summary });
    // an end/limited/failed with no matching start is shown as a thin block
    if (e.kind !== 'start' && !blocks.some((b) => b.agent === agent && b.job === e.job && b.endTs === e.t)) blocks.push({ agent, a: e.t - 60e3, b: e.t, res: e.kind, job: e.job, summary: e.summary, endTs: e.t });
  }
  for (const e of runEvents.filter((r) => r.agent === agent && r.kind === 'skipped')) markers.push({ agent, t: e.t, kind: 'skipped', job: e.job, summary: e.summary });
}
for (const c of commits) markers.push({ agent: c.agent, t: c.t, kind: 'commit', job: 'git', summary: `${c.hash} ${c.summary}` });

let svg = `<svg id="tl" viewBox="0 0 ${W} ${HEIGHT}" role="img" aria-label="Agent timeline for the last 48 hours" xmlns="http://www.w3.org/2000/svg">`;
for (const [agent, y] of Object.entries(LANE)) {
  svg += `<rect class="lane" x="${X0}" y="${y - 8}" width="${X1 - X0}" height="${BH + 30}" rx="4"/>`;
  svg += `<text class="lbl" x="${X0 - 8}" y="${y + BH / 2 + 4}" text-anchor="end">${agent === 'claude' ? 'Claude' : 'Codex'}</text>`;
}
// grid: every 6 h, labelled with local time
const firstTick = new Date(tMin); firstTick.setMinutes(0, 0, 0); while (firstTick.getHours() % 6 !== 0 || firstTick.getTime() < tMin) firstTick.setHours(firstTick.getHours() + 1);
for (let t = firstTick.getTime(); t <= NOW; t += 6 * H) {
  const d = new Date(t);
  const label = d.getHours() === 0 ? fmtDay(t) : `${d.getHours() % 12 || 12}${d.getHours() < 12 ? 'a' : 'p'}`;
  svg += `<line class="grid${d.getHours() === 0 ? ' day' : ''}" x1="${x(t)}" x2="${x(t)}" y1="22" y2="${HEIGHT - 26}"/><text class="tick" x="${x(t)}" y="${HEIGHT - 8}" text-anchor="middle">${esc(label)}</text>`;
}
svg += `<line class="now" x1="${X1}" x2="${X1}" y1="22" y2="${HEIGHT - 26}"/><text class="tick" x="${X1}" y="14" text-anchor="end">now</text>`;
for (const b of blocks.filter((b) => b.b >= tMin)) {
  const y = LANE[b.agent], x0 = x(b.a), w = Math.max(4, x(b.b) - x0);
  const id = tip({ title: `${b.agent === 'claude' ? 'Claude' : 'Codex'}: ${b.job}`, when: `${fmtFull(b.a)} to ${b.res === 'running' ? 'now' : fmtTime(b.b)}`, result: b.res, text: b.summary });
  svg += `<rect class="blk ${b.res}" data-tip="${id}" tabindex="0" x="${x0.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${BH}" rx="3"><title>${esc(`${b.job} (${b.res}): ${clip(b.summary, 160)}`)}</title></rect>`;
}
for (const m of markers.filter((m) => m.t >= tMin)) {
  const y = LANE[m.agent], cx = x(m.t);
  const id = tip({ title: `${m.agent === 'claude' ? 'Claude' : 'Codex'} ${m.kind}: ${m.job}`, when: fmtFull(m.t), result: m.kind, text: m.summary });
  const t = `<title>${esc(`${m.kind}: ${clip(m.summary, 160)}`)}</title>`;
  if (m.kind === 'commit') svg += `<circle class="mk commit" data-tip="${id}" tabindex="0" cx="${cx.toFixed(1)}" cy="${y + BH + 12}" r="3.2">${t}</circle>`;
  else if (m.kind === 'skipped') svg += `<circle class="mk skipped" data-tip="${id}" tabindex="0" cx="${cx.toFixed(1)}" cy="${y - 2}" r="2.2">${t}</circle>`;
  else if (m.kind === 'limited') svg += `<path class="mk limited" data-tip="${id}" tabindex="0" d="M${(cx - 5).toFixed(1)} ${y - 1}h10l-5 -9z">${t}</path>`;
  else svg += `<path class="mk failed" data-tip="${id}" tabindex="0" d="M${(cx - 4).toFixed(1)} ${y - 9}l8 8m0 -8l-8 8">${t}</path>`;
}
svg += '</svg>';

// ---------- table ----------
const rowsAll = [
  ...runEvents.map((e) => ({ t: e.t, agent: e.agent, kind: e.kind, job: e.job, text: e.summary, bf: !!e.backfill })),
  ...commits.map((c) => ({ t: c.t, agent: c.agent, kind: 'commit', job: c.hash, text: c.summary, bf: false })),
].sort((a, b) => b.t - a.t).slice(0, 500);
const resultLabel = { start: 'started', end: 'finished', limited: 'limited', failed: 'failed', skipped: 'skipped', commit: 'commit' };
const trs = rowsAll.map((r) => {
  const prob = r.kind === 'limited' || r.kind === 'failed';
  return `<tr data-agent="${r.agent}" data-prob="${prob ? 1 : 0}"><td class="when">${esc(fmtFull(r.t))}</td><td>${r.agent === 'claude' ? 'Claude' : 'Codex'}</td><td><span class="job">${esc(r.job)}</span> ${esc(clip(r.text, 220))}</td><td><span class="pill ${r.kind}">${resultLabel[r.kind]}</span></td></tr>`;
}).join('\n');
const commitList = (agent) => commits.filter((c) => c.agent === agent).slice(0, 20).map((c) => `<li><code>${esc(c.hash)}</code> ${esc(clip(c.summary, 110))} <span class="muted">${esc(fmtFull(c.t))}</span></li>`).join('') || '<li class="muted">none</li>';

// ---------- page ----------
const card = (s, title) => `<section class="card"><div class="cardhead"><h2>${title}</h2><span class="badge ${s.badge}">${s.badge}</span></div>
<p class="big">${s.lastAny ? `${ago(s.lastAny.t)}` : 'no activity yet'}</p>
<p>${esc(s.lastAny ? clip(s.what, 160) : '')}</p>
<p class="muted">${esc(s.detail)}</p><p class="muted">${esc(next[s.agent])}</p></section>`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>CodeInsta agent activity</title>
<style>
:root{--bg:#f6f5f2;--fg:#1f2328;--mut:#68707a;--card:#ffffff;--line:#dcd9d2;--ok:#2f8f6f;--lim:#b9801a;--bad:#c2433b;--run:#6b7b93;--lane:#efede8;--accent:#3b6ea5}
@media (prefers-color-scheme:dark){:root{--bg:#14161a;--fg:#e4e6ea;--mut:#9aa1ab;--card:#1c1f25;--line:#2c3038;--ok:#4cb48f;--lim:#d8a13a;--bad:#e0675e;--run:#8798b3;--lane:#1a1d22;--accent:#7fa8d6}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
main{max-width:980px;margin:0 auto;padding:16px}
h1{font-size:20px;margin:4px 0 2px}h2{font-size:15px;margin:0}h3{font-size:14px;margin:0 0 6px}
.muted{color:var(--mut);font-size:13px;margin:2px 0}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin:14px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px}
.card p{margin:4px 0}.big{font-size:22px;font-weight:600}
.cardhead{display:flex;justify-content:space-between;align-items:center}
.badge{font-size:12px;font-weight:700;letter-spacing:.06em;padding:3px 10px;border-radius:99px;border:1.5px solid currentColor}
.badge.OK{color:var(--ok)}.badge.LIMITED{color:var(--lim)}.badge.FAILING{color:var(--bad)}.badge.IDLE{color:var(--mut)}
.panel{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px;margin:14px 0}
.scroll{overflow-x:auto}
#tl{width:100%;min-width:640px;height:auto;display:block}
#tl .lane{fill:var(--lane)}#tl .lbl{fill:var(--fg);font-size:13px;font-weight:600}#tl .tick{fill:var(--mut);font-size:11px}
#tl .grid{stroke:var(--line);stroke-width:1}#tl .grid.day{stroke:var(--mut);stroke-dasharray:2 3}#tl .now{stroke:var(--accent);stroke-width:1.5}
#tl .blk{stroke:var(--card);stroke-width:1;cursor:pointer}
#tl .blk.end{fill:var(--ok)}#tl .blk.limited{fill:var(--lim)}#tl .blk.failed{fill:var(--bad)}#tl .blk.running,#tl .blk.start{fill:var(--run)}
#tl .mk{cursor:pointer}#tl .mk.commit{fill:var(--accent)}#tl .mk.skipped{fill:var(--mut);opacity:.5}
#tl .mk.limited{fill:var(--lim);stroke:var(--bg);stroke-width:.8}#tl .mk.failed{fill:none;stroke:var(--bad);stroke-width:2;stroke-linecap:round}
#tl .sel{outline:2px solid var(--fg)}
.legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--mut);margin:8px 0 0}
.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}
#detail{min-height:3.2em;font-size:13px;margin-top:8px;border-top:1px solid var(--line);padding-top:8px}
.filters{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.filters button{font:inherit;font-size:13px;padding:6px 12px;min-height:34px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--fg);cursor:pointer}
.filters button[aria-pressed=true]{background:var(--fg);color:var(--bg);border-color:var(--fg)}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;color:var(--mut);font-weight:600;padding:6px 8px;border-bottom:1px solid var(--line)}
td{padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top;overflow-wrap:anywhere}
td.when{white-space:nowrap;color:var(--mut)}.job{font-weight:600}
.pill{font-size:12px;padding:1px 8px;border-radius:99px;border:1px solid var(--line);white-space:nowrap}
.pill.end{color:var(--ok);border-color:var(--ok)}.pill.limited{color:var(--lim);border-color:var(--lim)}.pill.failed{color:var(--bad);border-color:var(--bad)}.pill.start{color:var(--run)}.pill.commit{color:var(--accent)}.pill.skipped{color:var(--mut)}
.two{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}
ul{margin:0;padding-left:18px;font-size:13px}li{margin:3px 0;overflow-wrap:anywhere}code{font-size:12px}
#stale{display:none;color:var(--lim);font-weight:600;font-size:13px}
@media (max-width:520px){main{padding:12px}.big{font-size:20px}td.when{white-space:normal}}
</style></head><body><main>
<h1>CodeInsta agent activity</h1>
<p class="muted">Generated ${esc(fmtFull(NOW))}. Regenerated every 15 min and after each Codex queue run. <span id="stale">This page may be out of date.</span></p>
<div class="cards">${card(S.claude, 'Claude')}${card(S.codex, 'Codex')}</div>
<section class="panel"><h3>Last 48 hours</h3>
<div class="scroll">${svg}</div>
<div class="legend"><span><i style="background:var(--ok)"></i>finished</span><span><i style="background:var(--lim)"></i>hit usage limit</span><span><i style="background:var(--bad)"></i>failed</span><span><i style="background:var(--run)"></i>running or unfinished</span><span>triangle: limit</span><span>cross: failure</span><span>dot below lane: commit</span><span>small dot above: skipped run</span></div>
<div id="detail" class="muted">Tap or hover a block or marker for details.</div></section>
<section class="panel"><h3>Events</h3>
<div class="filters" role="group" aria-label="Filter events"><button data-f="all" aria-pressed="true">All</button><button data-f="claude" aria-pressed="false">Claude</button><button data-f="codex" aria-pressed="false">Codex</button><button data-f="prob" aria-pressed="false">Problems</button></div>
<div class="scroll"><table><thead><tr><th>Time</th><th>Agent</th><th>What</th><th>Result</th></tr></thead><tbody id="rows">${trs}</tbody></table></div></section>
<div class="two"><section class="panel"><h3>Claude commits</h3><ul>${commitList('claude')}</ul></section><section class="panel"><h3>Codex commits</h3><ul>${commitList('codex')}</ul></section></div>
</main>
<script>
(function(){
var tips=${JSON.stringify(tips).replace(/</g, '\\u003c')};
var d=document.getElementById('detail');
function show(el){var t=tips[+el.getAttribute('data-tip')];if(!t)return;
 d.textContent='';var b=document.createElement('b');b.textContent=t.title;d.appendChild(b);
 d.appendChild(document.createTextNode(' ('+t.result+') '+t.when));d.appendChild(document.createElement('br'));d.appendChild(document.createTextNode(t.text||''));}
document.getElementById('tl').addEventListener('click',function(e){var el=e.target.closest('[data-tip]');if(el)show(el);});
document.getElementById('tl').addEventListener('mouseover',function(e){var el=e.target.closest('[data-tip]');if(el)show(el);});
document.getElementById('tl').addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){var el=e.target.closest('[data-tip]');if(el){e.preventDefault();show(el);}}});
var rows=[].slice.call(document.querySelectorAll('#rows tr'));
[].forEach.call(document.querySelectorAll('.filters button'),function(btn){btn.addEventListener('click',function(){
 var f=btn.getAttribute('data-f');
 [].forEach.call(document.querySelectorAll('.filters button'),function(b){b.setAttribute('aria-pressed',b===btn?'true':'false');});
 rows.forEach(function(r){r.style.display=(f==='all'||r.getAttribute('data-agent')===f||(f==='prob'&&r.getAttribute('data-prob')==='1'))?'':'none';});});});
if(Date.now()-${NOW}>45*60*1000)document.getElementById('stale').style.display='inline';
})();
</script></body></html>
`;
writeFileSync(OUT + '.tmp', html);
renameSync(OUT + '.tmp', OUT);
console.log(`claude: ${S.claude.badge} (${S.claude.detail}); codex: ${S.codex.badge} (${S.codex.detail})`);
