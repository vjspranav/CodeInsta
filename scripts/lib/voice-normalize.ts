/**
 * Pure text normalisation for comparing a script line with what was heard (no I/O, no imports).
 * Digits and number words are unified, spelled letters joined, homophones canonicalised.
 */

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES: Record<string, number> = { thousand: 1e3, million: 1e6, billion: 1e9 };
/** Homophones / respellings treated as the same word (both sides are mapped). */
const CANON: Record<string, string> = {
  syn: "sin", sinn: "sin", cache: "cash", caches: "cashes", cached: "cashed", caching: "cashing", reddis: "redis", cue: "queue",
  okay: "ok", gonna: "going", wanna: "want",
};

const isNumWord = (w: string) => w in UNITS || w in TENS || w === "hundred" || w in SCALES;

/** A normalised token plus the range [from, to] of source parts (words) it came from. */
export type SpanToken = { tok: string; from: number; to: number };

type Raw = { w: string; src: number };

function preprocess(part: string): string[] {
  let s = part.toLowerCase().replace(/[’‘`]/g, "'");
  s = s.replace(/(\d),(?=\d{3}\b)/g, "$1"); // 100,000 -> 100000
  s = s.replace(/(\d)\.(\d)/g, "$1 point $2");
  s = s.replace(/%/g, " percent ").replace(/&/g, " and ").replace(/\$/g, " dollars ");
  s = s.replace(/(\d)([a-z])/g, "$1 $2").replace(/([a-z])(\d)/g, "$1 $2"); // p99 -> p 99, 4800ms -> 4800 ms
  s = s.replace(/'/g, ""); // don't -> dont
  return s.split(/[^a-z0-9]+/).filter(Boolean);
}

/** Normalises a list of source parts (e.g. timed words); each token remembers which parts it spans. */
export function normalizeSpans(parts: string[], articleA = false): SpanToken[] {
  const raw: Raw[] = parts.flatMap((p, src) => preprocess(p).map((w) => ({ w, src })));
  const toks: SpanToken[] = [];
  for (let i = 0; i < raw.length; ) {
    const w = raw[i].w;
    if (/^\d+$/.test(w)) {
      const from = raw[i].src;
      let v = Number(w);
      i++;
      if (i < raw.length && raw[i].w in SCALES) v *= SCALES[raw[i++].w];
      toks.push({ tok: `#${v}`, from, to: raw[i - 1].src });
      continue;
    }
    const article = (w === "a" || w === "an") && i + 1 < raw.length && (raw[i + 1].w === "hundred" || raw[i + 1].w in SCALES);
    if (isNumWord(w) || article) {
      const from = raw[i].src;
      let total = 0;
      let cur = 0;
      let any = false;
      let last = from;
      const flush = () => {
        if (any) toks.push({ tok: `#${total + cur}`, from, to: last });
        total = 0;
        cur = 0;
        any = false;
      };
      let first = true;
      while (i < raw.length) {
        const t = raw[i].w;
        if (first && article) {
          cur = 1;
          any = true;
          first = false;
          last = raw[i].src;
          i++;
          continue;
        }
        first = false;
        if (t in UNITS) {
          const u = UNITS[t];
          if (u === 0 ? any : u >= 10 ? cur % 100 !== 0 : cur % 10 !== 0 || (cur % 100 >= 10 && cur % 100 < 20)) flush();
          cur += u;
          any = true;
        } else if (t in TENS) {
          if (cur % 100 !== 0) flush();
          cur += TENS[t];
          any = true;
        } else if (t === "hundred") {
          if (cur >= 100 || !any) {
            if (any) flush();
            cur = 0;
          }
          cur = (cur || 1) * 100;
          any = true;
        } else if (t in SCALES) {
          total += (cur || 1) * SCALES[t];
          cur = 0;
          any = true;
        } else if (t === "and" && any && cur >= 100 && i + 1 < raw.length && (raw[i + 1].w in UNITS || raw[i + 1].w in TENS)) {
          // "one hundred and five"
        } else break;
        last = raw[i].src;
        i++;
      }
      flush();
      continue;
    }
    toks.push({ tok: CANON[w] ?? w, from: raw[i].src, to: raw[i].src });
    i++;
  }

  // Spelled letters: a run of two or more single letters is one acronym token ("u r l" -> "url").
  const out: SpanToken[] = [];
  for (let i = 0; i < toks.length; ) {
    if (/^[a-z]$/.test(toks[i].tok)) {
      let j = i;
      while (j < toks.length && /^[a-z]$/.test(toks[j].tok)) j++;
      // articleA: a leading "a" in a run of 3+ letters is the article ("a U R L"), not part of the acronym.
      if (articleA && toks[i].tok === "a" && j - i >= 3) {
        out.push(toks[i]);
        i++;
        continue;
      }
      if (j - i >= 2) {
        out.push({ tok: toks.slice(i, j).map((t) => t.tok).join(""), from: toks[i].from, to: toks[j - 1].to });
        i = j;
        continue;
      }
    }
    out.push(toks[i]);
    i++;
  }
  return out;
}

/** Lowercased word tokens with digits/number-words unified to `#<value>`, spelled-letter runs joined, homophones canonicalised. */
export function normalizeTokens(input: string, articleA = false): string[] {
  return normalizeSpans([input], articleA).map((t) => t.tok);
}

function editDistanceLe1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
}

/** Token equality: exact, or (words of 5+ letters) a one-letter slip such as a plural. Numbers match exactly only. */
export function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.startsWith("#") || b.startsWith("#")) return false;
  return Math.min(a.length, b.length) >= 5 && editDistanceLe1(a, b);
}

/** Expands 4-digit years ("2026") into the way they are spoken ("twenty twenty-six"). */
export function expandYears(t: string[]): string[] {
  return t.flatMap((x) => {
    const m = x.match(/^#(1[1-9]|20)(\d\d)$/);
    return m && m[2] !== "00" ? [`#${Number(m[1])}`, `#${Number(m[2])}`] : [x];
  });
}

/** Longest common subsequence under fuzzy token equality; returns matched (want, got) index pairs. */
export function align(want: string[], got: string[]): [number, number][] {
  const n = want.length;
  const m = got.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = tokensMatch(want[i], got[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const pairs: [number, number][] = [];
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (tokensMatch(want[i], got[j]) && dp[i][j] === dp[i + 1][j + 1] + 1) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

/** Merges adjacent tokens whose concatenation is a token on the other side ("look up" vs "lookup", "wi fi" vs "wifi"). */
export function joinCompounds(tokens: string[], against: string[]): string[] {
  const set = new Set(against);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const j = tokens[i] + (tokens[i + 1] ?? "");
    if (i + 1 < tokens.length && !tokens[i].startsWith("#") && !tokens[i + 1].startsWith("#") && set.has(j) && !(set.has(tokens[i]) && set.has(tokens[i + 1]))) {
      out.push(j);
      i++;
    } else out.push(tokens[i]);
  }
  return out;
}
