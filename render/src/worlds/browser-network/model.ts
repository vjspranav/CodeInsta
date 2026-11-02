/** Browser Network panel. Timing values are milliseconds; duration_ms controls presentation only. */
import type {Action} from '../../schema';
import type {Rect} from '../../theme';
import type {WorldEvent, WorldText} from '../types';
import {msToFrames, needString, nv, optNumber, type Props, sv} from '../kit';

export const NETWORK_ID = 'browser.network';
export const NETWORK_ACTIONS = ['net.request', 'net.select', 'net.clear', 'net.focus'] as const;
export const PHASES = ['dns', 'connect', 'tls', 'ttfb', 'download'] as const;
export const PHASE_LABELS = ['DNS', 'Connect', 'TLS', 'TTFB', 'Download'];
export type Phase = typeof PHASES[number];
export type Timing = Record<Phase, number>;
/** dir: 'req' for a request header the browser sent, 'res' (default) for a response header. */
export interface Header {name: string; value: string; dir: 'req' | 'res'}
export interface NetworkRequest {
 key: string; name: string; method: string; status: number | null; timing: Timing;
 startMs: number; totalMs: number; elapsedMs: number; progress: number; done: boolean;
 cache: string; error: string; pending: boolean; headers: Header[]; frame: number;
}
export interface NetworkState {visible: boolean; url: string; requests: NetworkRequest[]; selected: string | null; focus: Phase | null}
const timingOf = (p: Props): Timing => {
 const raw = p.timing && typeof p.timing === 'object' ? p.timing as Props : {};
 return Object.fromEntries(PHASES.map(k => [k, Math.max(0, nv(raw[k], 0))])) as Timing;
};
const headersOf = (p: Props): Header[] => Array.isArray(p.headers) ? p.headers.filter(h => h && typeof h === 'object').map(h => ({name: sv(h.name), value: sv(h.value), dir: h.dir === 'req' ? 'req' as const : 'res' as const})) : [];
export const requestFrames = (p: Props) => Math.max(1, msToFrames(nv(p.duration_ms, 1200)));
export const cacheText = (cache: string) => cache === 'revalidated' ? 'cache revalidated' : cache ? `${cache} cache` : '';
export const requestStatus = (r: NetworkRequest) => !r.done ? 'pending' : r.error ? 'blocked' : String(r.status);
export const requestTime = (r: NetworkRequest) => r.done ? `${Math.round(r.totalMs)} ms` : '';
/** Elapsed ms inside one phase (the phases run back to back). */
export const phaseMs = (r: NetworkRequest, i: number) => Math.round(Math.min(r.timing[PHASES[i]], Math.max(0, r.elapsedMs - PHASES.slice(0, i).reduce((n, p) => n + r.timing[p], 0))));
export const requestNote = (r: NetworkRequest) => r.error || cacheText(r.cache) || r.method;
export const networkStateAt = (events: WorldEvent[], frame: number): NetworkState => {
 const s: NetworkState = {visible: false, url: 'https://example.com', requests: [], selected: null, focus: null};
 for (const e of events) {
  if (e.frame > frame) continue;
  const p = e.action as Props;
  if (p.do === 'world.set') {s.visible = true; s.url = sv(p.url, s.url);}
  if (p.do === 'net.clear') {s.requests = []; s.selected = null; s.focus = null;}
  if (p.do === 'net.focus') s.focus = p.off === true ? null : (PHASES as readonly string[]).includes(sv(p.phase)) ? sv(p.phase) as Phase : s.focus;
  if (p.do === 'net.select') s.selected = sv(p.key);
  if (p.do === 'net.request') {
   const timing = timingOf(p);
   const totalMs = PHASES.reduce((n, k) => n + timing[k], 0);
   const progress = Math.min(1, Math.max(0, (frame - e.frame) / requestFrames(p)));
   const pending = p.pending === true;
   const done = progress === 1 && !pending;
   const r: NetworkRequest = {key: sv(p.key), name: sv(p.name), method: sv(p.method, 'GET'), timing,
    startMs: nv(p.start_ms, 0), totalMs, elapsedMs: totalMs * progress, progress, done,
    status: done && !p.error ? nv(p.status, 200) : null, cache: done ? sv(p.cache) : '', error: done ? sv(p.error) : '', pending,
    headers: done ? headersOf(p) : [], frame: e.frame};
   s.requests.push(r); s.selected = r.key; s.focus = null;
  }
 }
 return s;
};
export const networkTimelineProblems = (events: WorldEvent[]) => {
 const keys = new Set<string>(); const out: string[] = [];
 for (const e of events) {
  const p = e.action as Props;
  if (p.do === 'net.clear') keys.clear();
  if (p.do === 'net.request') {if (keys.has(sv(p.key))) out.push(`beat ${e.beat}: duplicate request key "${sv(p.key)}"; use net.clear before reusing keys`); keys.add(sv(p.key));}
  if (p.do === 'net.select' && !keys.has(sv(p.key))) out.push(`beat ${e.beat}: net.select references missing request "${sv(p.key)}"`);
 }
 return out;
};
export const validateNetwork = (a: Action): string[] => {
 const p = a as Props; const what = String(a.do); const out: string[] = [];
 if (a.do === 'world.set') {
  if (p.url !== undefined) out.push(...needString(p, 'url', what, 48));
  return out;
 }
 if (a.do === 'net.request' || a.do === 'net.select') out.push(...needString(p, 'key', what, 40));
 if (a.do === 'net.focus') {
  if (p.off === true) return p.phase === undefined ? out : [`${what}: use either phase or off, not both`];
  if (!(PHASES as readonly string[]).includes(sv(p.phase))) out.push(`${what} needs phase: one of ${PHASES.join(', ')} (or off: true)`);
  return out;
 }
 if (a.do !== 'net.request') return out;
 out.push(...needString(p, 'name', what, 20));
 if (p.method !== undefined && !['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].includes(sv(p.method))) out.push(`${what}: method must be an HTTP method`);
 out.push(...optNumber(p, 'status', what, 100, 599, true), ...optNumber(p, 'start_ms', what, 0, 60000), ...optNumber(p, 'duration_ms', what, 300, 5000));
 const timing = p.timing as Props | undefined;
 if (!timing || typeof timing !== 'object' || Array.isArray(timing)) out.push(`${what} needs timing with dns, connect, tls, ttfb, download in milliseconds`);
 else {
  for (const k of PHASES) {
   if (timing[k] === undefined) out.push(`${what}: timing needs ${k}`);
   else out.push(...optNumber(timing, k, `${what}.timing`, 0, 60000));
  }
  if (Object.values(timingOf(p)).reduce((a,b) => a+b,0) > 60000) out.push(`${what}: timing total must be <= 60000 ms`);
 }
 if (p.cache !== undefined && !['memory','disk','revalidated'].includes(sv(p.cache))) out.push(`${what}: cache must be memory, disk or revalidated`);
 if (p.error !== undefined) out.push(...needString(p, 'error', what, 36));
 if (p.pending !== undefined && typeof p.pending !== 'boolean') out.push(`${what}: pending must be true or false`);
 if (p.pending === true && (p.status !== undefined || p.cache !== undefined || p.error !== undefined || p.headers !== undefined)) out.push(`${what}: a pending request has no status, cache, error or headers yet`);
 if (p.error && (p.status !== undefined || p.cache !== undefined)) out.push(`${what}: blocked request must omit status and cache (no readable response)`);
 if (p.cache === 'revalidated' && p.status !== 304) out.push(`${what}: revalidated cache needs status 304`);
 if (p.headers !== undefined) {
  if (!Array.isArray(p.headers) || p.headers.length > 3) out.push(`${what}: headers must be an array of at most 3 headers`);
  else p.headers.forEach((h, i) => {
   if (!h || typeof h !== 'object' || Array.isArray(h)) {out.push(`${what}: headers[${i}] must be {name,value}`); return;}
   out.push(...needString(h, 'name', `${what}.headers[${i}]`, 34), ...needString(h, 'value', `${what}.headers[${i}]`, 48));
   if (h.dir !== undefined && h.dir !== 'req' && h.dir !== 'res') out.push(`${what}: headers[${i}].dir must be req or res`);
   if (typeof h.name === 'string' && !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(h.name)) out.push(`${what}: headers[${i}].name must be an HTTP header name`);
  });
 }
 for (const key of ['name', 'error', 'url']) if (typeof p[key] === 'string' && /[\n\r\t]/.test(p[key] as string)) out.push(`${what}: ${key} must be a single line`);
 return out;
};
export const networkTokens = (a: Action): WorldText[] => {
 const p = a as Props;
 if (a.do === 'world.set') return p.url ? [{text: sv(p.url), off: 0}] : [];
 if (a.do !== 'net.request') return [];
 const out = [{text: sv(p.name), off: 0}];
 if (p.pending === true) return [...out, {text: 'pending', off: 0}];
 out.push({text: p.error ? 'blocked' : String(nv(p.status,200)), off: requestFrames(p)});
 if (p.error || p.cache) out.push({text: sv(p.error) || cacheText(sv(p.cache)), off: requestFrames(p)});
 return out;
};
export const networkRows = (a: Action) => a.do === 'net.request' ? 1 : 0;
export const networkSettle = (a: Action) => a.do === 'net.request' ? requestFrames(a as Props) + 2 : 2;
export const networkIsSignature = (a: Action) => a.do === 'net.select' || a.do === 'net.focus' && (a as Props).off !== true || (a.do === 'net.request' && (requestFrames(a as Props) >= 18 && Object.values(timingOf(a as Props)).some(n => n > 0) || !!(a as Props).error));
export const networkLayout = (s: NetworkState, rect: Rect) => {
 const cap = Math.max(1, Math.min(4, Math.floor((rect.h - 410) / 52)));
 const selectedIndex = s.requests.findIndex(r => r.key === s.selected);
 const top = selectedIndex < 0 ? Math.max(0,s.requests.length-cap) : Math.min(selectedIndex, Math.max(0,s.requests.length-cap));
 const rows = s.requests.slice(top, top+cap);
 const selected = s.requests.find(r => r.key === s.selected);
 const scaleMs = Math.max(1000, ...s.requests.map(r => r.startMs+r.totalMs));
 return {cap, top, rows, selected, scaleMs, detailY: 110 + cap*52, waterfallX: 300, waterfallW: rect.w-316};
};
export const networkTexts = (s: NetworkState, rect: Rect): string[] => {
 if (!s.visible) return [];
 const l = networkLayout(s,rect);
 const out = [s.url, 'Network', 'Name', 'Status', 'Waterfall', `${s.requests.length} requests`];
 for (const r of l.rows) out.push(r.name, requestStatus(r), requestNote(r), ...(requestTime(r) ? [requestTime(r)] : []));
 if (l.selected) {
  const r = l.selected;
  out.push(`${r.method} ${r.name}`, 'Timing', ...PHASES.map((_,i) => `${PHASE_LABELS[i]} ${phaseMs(r,i)} ms`));
  if (r.done) {out.push('Headers'); for (const h of r.headers) out.push(h.dir, h.name, h.value); if (!r.headers.length) out.push(r.error ? 'Response unavailable to JavaScript' : 'No headers shown');}
  else out.push(r.pending && r.progress === 1 ? 'Still waiting for response' : 'Waiting for response');
 }
 return out;
};
export const networkProblems = (s: NetworkState, rect: Rect): string[] => {
 if (!s.visible) return [];
 const out: string[] = [];
 if (rect.w < 540 || rect.h < 650) out.push(`network slot ${rect.w}x${rect.h} is too small for readable waterfall and headers`);
 if (s.selected && !s.requests.some(r => r.key === s.selected)) out.push(`selected request "${s.selected}" is missing`);
 return out;
};
