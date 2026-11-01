import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {A, mkAudio, mkStory} from './helpers';
import {castColor, contrast, STYLES, STYLE_IDS, styleProblems, setActiveStyle} from '../src/styles';
import {FACES} from '../src/Fonts';
import {validateStory} from '../src/schema';
import {deriveChecks, MIN_CAPTION_PX} from '../verify-lib';
import {captionStateAt} from '../src/captionstate';
import {defineBox} from '../src/components/Overlays';
import {fitText, wrap} from '../src/text';
import demo from '../fixtures/demo.json';
import demoManifest from '../fixtures/demo.manifest.json';

const here = path.dirname(new URL(import.meta.url).pathname);

describe('style registry', () => {
	it('ships at least 6 distinct styles, including the required ones', () => {
		expect(STYLES.length).toBeGreaterThanOrEqual(6);
		for (const id of ['sketch', 'editorial-dark', 'blueprint', 'terminal', 'paper-cutout', 'newsprint']) expect(STYLE_IDS).toContain(id);
		expect(new Set(STYLES.map((s) => s.tokens.paper)).size).toBe(STYLES.length);
		expect(new Set(STYLES.map((s) => s.font.hand.fontFamily)).size).toBeGreaterThanOrEqual(5);
	});
	it('the script schema accepts exactly the registry ids and defaults to sketch', () => {
		const base = {version: 3, format: 'story', title: 't', topic: 't', level: 'x', cast: [], beats: [{speaker: 'narrator', text: 'hi', visuals: [{do: 'clear'}]}]};
		for (const id of STYLE_IDS) expect(validateStory({...base, style: id}).ok).toBe(true);
		expect(validateStory({...base, style: 'neon-glow'}).ok).toBe(false);
		const v = validateStory(base);
		expect(v.ok && (v.story.style ?? 'sketch')).toBe('sketch');
	});
});

describe.each(STYLES.map((s) => [s.id, s] as const))('style %s', (_id, style) => {
	it('every text pair has >= 4.5:1 contrast (like heart >= 3:1)', () => {
		expect(styleProblems(style)).toEqual([]);
	});
	it('script cast colours resolve to legible colours', () => {
		for (const [i, c] of ['#E4572E', '#2F6F8F', '#C9962B', '#ffffff'].entries()) {
			const col = castColor(style, c, i);
			expect(contrast(col, style.tokens.captionBg)).toBeGreaterThanOrEqual(4.5);
			expect(contrast(col, style.tokens.paper)).toBeGreaterThanOrEqual(4.5);
		}
	});
	it('every font family it uses is bundled in public/fonts', () => {
		for (const fam of style.families) {
			const faces = FACES.filter((f) => f.family === fam);
			expect(faces.length, fam).toBeGreaterThan(0);
			for (const f of faces) expect(fs.existsSync(path.join(here, '..', 'public', f.file)), f.file).toBe(true);
		}
		for (const key of ['hand', 'ui', 'mono'] as const) {
			const first = style.font[key].fontFamily.split(',')[0].replace(/['"]/g, '').trim();
			expect(style.families, `${key} font ${first}`).toContain(first);
		}
	});
	it('is not AI-looking: no gradients or glows in its texture or tokens', () => {
		const dump = JSON.stringify(style);
		expect(dump).not.toMatch(/gradient|glow|neon|blur/i);
	});
	it('captions are >= 34 px and <= 2 lines, define boxes >= 22 px, for every line of the demo story', () => {
		const v = validateStory(demo);
		if (!v.ok) throw new Error(v.errors.join('; '));
		const story = {...v.story, style: style.id as typeof v.story.style};
		const {tl} = deriveChecks(story, demoManifest as never);
		for (const b of tl.beats) {
			const cs = captionStateAt(b, b.start + 2);
			expect(cs.fs, `beat ${b.index}`).toBeGreaterThanOrEqual(MIN_CAPTION_PX);
			expect(cs.lines.length).toBeLessThanOrEqual(2);
		}
		for (const d of tl.defines) expect(defineBox(d).size).toBeGreaterThanOrEqual(22);
	});
	it('passes every pure QA check on the demo story (everything but the data timing, which depends on authoring)', () => {
		const v = validateStory(demo);
		if (!v.ok) throw new Error(v.errors.join('; '));
		const story = {...v.story, style: style.id as typeof v.story.style};
		const {checks} = deriveChecks(story, demoManifest as never);
		const failed = checks.filter((c) => c.group !== 'timing').flatMap((c) => {
			const r = c.pure();
			return r ? [`${c.group} ${c.desc}: ${r}`] : [];
		});
		expect(failed).toEqual([]);
	});
	it('text never breaks mid-word: boxes shrink to the label, lines wrap at spaces, lines are balanced', () => {
		setActiveStyle(style.id);
		for (const [text, w] of [['Postgres', 150], ['query', 90], ['read the feed once, cache it', 150], ['App server', 140]] as const) {
			const f = fitText(text, 'hand', w, 120, 52, 22, 1.12, undefined, 3);
			expect(f.lines.join(' ')).toBe(text); // nothing hyphenated or dropped
			expect(f.lines.join('').includes('-')).toBe(false);
			expect(f.size).toBeGreaterThanOrEqual(22);
		}
		expect(wrap('internationalization', 'hand', 60, 100)).toEqual(['internationalization']); // too wide: stays whole
		const note = fitText('read the feed once, cache it', 'hand', 150, 120, 42, 22, 1.15, undefined, 3);
		expect(Math.max(...note.lines.map((l) => l.length)) - Math.min(...note.lines.map((l) => l.length))).toBeLessThanOrEqual(8);
	});
	it('a tap turns the heart into the style like colour (state + like colour is distinct from ink and screen)', () => {
		const s = mkStory([{visuals: [A({do: 'phone.tap', target: 'heart'})]}]);
		setActiveStyle(style.id);
		const {checks} = deriveChecks({...s, style: style.id as never}, mkAudio(s, 3000));
		const heart = checks.filter((c) => c.group === 'phone.tap');
		expect(heart.length).toBeGreaterThan(0);
		for (const c of heart) expect(c.pure()).toBeNull();
		expect(contrast(style.tokens.like, style.tokens.screen)).toBeGreaterThanOrEqual(3);
	});
});
