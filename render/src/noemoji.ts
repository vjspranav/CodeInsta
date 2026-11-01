/** Owner rule: no emojis or pictographs anywhere. Plain arrows (-> <- down) are typography and stay allowed. */
export const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}\u{FE0F}]/u;

/** Every string in the script (title, topic, tags, cast, glossary, key_points, beats text/say, all visual strings...) that contains an emoji. */
export const emojiProblems = (script: unknown): string[] => {
	const out: string[] = [];
	const walk = (v: unknown, path: string) => {
		if (typeof v === 'string') {
			const m = EMOJI_RE.exec(v);
			if (m) out.push(`${path}: "${v.slice(0, 40)}" contains an emoji (U+${m[0].codePointAt(0)!.toString(16).toUpperCase()})`);
		} else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}.${i}`));
		else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
	};
	walk(script, '');
	return out;
};
