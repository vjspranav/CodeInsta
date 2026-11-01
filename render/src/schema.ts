import {z} from 'zod';
import {DEFAULT_STYLE, STYLE_IDS} from './styles';

/**
 * Script schema v3 ("Story mode"), see docs/coordination/decisions.md -> "Reels v3".
 *
 * {version:3, format:"story", title, topic, tags, level,
 *  cast:[{id,name,role,color}], glossary:[{term,full,note?}],
 *  beats:[{speaker:"narrator"|castId, text, say?, visuals:[Action]}], sources?}
 *
 * Action = {do, id?, at?: "start"|"end"|number(0-1 of line), ...props}
 */

export const ACTION_KINDS = [
	'phone.show',
	'phone.feed',
	'phone.tap',
	'phone.spinner',
	'phone.toast',
	'phone.instant',
	'sketch.box',
	'sketch.arrow',
	'sketch.note',
	'db.table',
	'db.insert',
	'db.shard',
	'db.replicate',
	'db.fanout',
	'db.join',
	'db.result',
	'cache.hit',
	'cache.miss',
	'term.type',
	'code.show',
	'commit.story',
	'seq.diagram',
	'tree',
	'timeline.track',
	'packet.flow',
	'code.editor',
	'chart.plot',
	'define',
	'layout',
	'clear',
	'focus',
] as const;

export const LAYOUTS = [
	'phone-left+board-right',
	'board-full',
	'db-focus',
	'split',
] as const;

export const NARRATOR_ID = 'narrator';

export const ActionKindSchema = z.enum(ACTION_KINDS);
export const LayoutSchema = z.enum(LAYOUTS);

export const AtSchema = z.union([
	z.enum(['start', 'end']),
	z.number().min(0).max(1),
]);

/**
 * Props are free-form per action kind (documented in src/timeline.ts);
 * `passthrough` keeps them while validating the common envelope.
 */
export const ActionSchema = z
	.object({
		do: ActionKindSchema,
		id: z.string().min(1).optional(),
		at: AtSchema.optional(),
	})
	.passthrough();

export const CastMemberSchema = z.object({
	id: z.string().min(1).regex(/^[a-z0-9_-]+$/i, 'cast id: letters, digits, _ and - only'),
	name: z.string().min(1),
	role: z.string(),
	color: z.string().regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i, 'color must be a hex colour'),
});

export const GlossaryEntrySchema = z.object({
	term: z.string().min(1),
	full: z.string().min(1),
	note: z.string().optional(),
});

export const EXPECT_KINDS = [
	'heart.filled',
	'heart.empty',
	'spinner.visible',
	'toast.visible',
	'table.rows',
	'text.visible',
	'scene.visible',
	'define.visible',
	'join.highlight',
] as const;

/**
 * Explicit, checkable claim at a time (verify.ts): "at beat B (start|end|0-1 of line),
 * <kind> holds". Optional fields depend on kind:
 *  table.rows {target: tableId, count}, text.visible {text}, toast.visible {text?},
 *  join.highlight {target: tableId, rows:[idx]}, define.visible {target: term}.
 */
export const ExpectSchema = z.object({
	beat: z.number().int().min(0),
	at: AtSchema.optional(),
	kind: z.enum(EXPECT_KINDS),
	target: z.string().optional(),
	count: z.number().int().min(0).optional(),
	text: z.string().optional(),
	rows: z.array(z.number().int().min(0)).optional(),
	note: z.string().optional(),
});

export const BeatSchema = z.object({
	speaker: z.string().min(1), // "narrator" or a cast id (checked in validateStory)
	text: z.string().min(1),
	say: z.string().optional(), // pronunciation override for TTS only
	// silent hold after the line (visuals keep animating); added to the auto-dwell
	hold_ms: z.number().int().min(0).max(30000).optional(),
	// extra silence before the line starts
	pause_before_ms: z.number().int().min(0).max(30000).optional(),
	// a punchline gets a 500 ms beat of silence after it
	punchline: z.boolean().optional(),
	// empty => inherits the previous scene's visuals (not allowed on beat 0)
	visuals: z.array(ActionSchema).default([]),
});

export const StyleSchema = z.enum(STYLE_IDS);

export const StorySchema = z.object({
	version: z.literal(3),
	format: z.literal('story'),
	title: z.string().min(1),
	topic: z.string().min(1),
	tags: z.array(z.string()).default([]),
	level: z.string().min(1),
	cast: z.array(CastMemberSchema),
	glossary: z.array(GlossaryEntrySchema).default([]),
	beats: z.array(BeatSchema).min(1),
	sources: z.array(z.string()).optional(),
	// additive & optional: 2-3 short takeaways shown (silently) on the end card
	key_points: z.array(z.string()).optional(),
	// series metadata (a long story is split into parts that share a series)
	genre: z.string().min(1).optional(),
	series: z.string().min(1).optional(),
	series_index: z.number().int().min(1).optional(),
	// visual style from the registry (src/styles); default "sketch"
	style: StyleSchema.default(DEFAULT_STYLE as never).optional(),
	// explicit expectations checked by verify.ts on top of the derived ones
	expect: z.array(ExpectSchema).optional(),
});

/** Per-line audio clip as produced by the TTS step. */
export const AudioLineSchema = z.object({
	beat_index: z.number().int().min(0),
	speaker: z.string(),
	src: z.string().min(1), // file path or URL
	duration_ms: z.number().positive(),
});

export const AudioManifestSchema = z.object({
	lines: z.array(AudioLineSchema),
});

export const StoryPropsSchema = z.object({
	script: StorySchema,
	audio: AudioManifestSchema,
	/** verify.ts: log a DOM measurement report ("PROBE {...}") for the rendered frame */
	probe: z.boolean().optional(),
});

export type ActionKind = z.infer<typeof ActionKindSchema>;
export type LayoutName = z.infer<typeof LayoutSchema>;
export type At = z.infer<typeof AtSchema>;
export type Action = z.infer<typeof ActionSchema> & Record<string, unknown>;
export type CastMember = z.infer<typeof CastMemberSchema>;
export type GlossaryEntry = z.infer<typeof GlossaryEntrySchema>;
export type Beat = z.infer<typeof BeatSchema>;
export type Expect = z.infer<typeof ExpectSchema>;
export type Story = z.infer<typeof StorySchema>;
export type AudioLine = z.infer<typeof AudioLineSchema>;
export type AudioManifest = z.infer<typeof AudioManifestSchema>;
export type StoryProps = z.infer<typeof StoryPropsSchema>;

export type ValidationResult =
	| {ok: true; story: Story; warnings: string[]}
	| {ok: false; errors: string[]};

/** Validate unknown JSON as a v3 story, with cross-field checks. */
export const validateStory = (input: unknown): ValidationResult => {
	const parsed = StorySchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			errors: parsed.error.issues.map(
				(i) => `${i.path.join('.') || '(root)'}: ${i.message}`,
			),
		};
	}
	const story = parsed.data;
	const errors: string[] = [];
	const warnings: string[] = [];

	const ids = new Set<string>();
	for (const c of story.cast) {
		if (c.id === NARRATOR_ID) errors.push(`cast.${c.id}: "narrator" is reserved`);
		if (ids.has(c.id)) errors.push(`cast: duplicate id "${c.id}"`);
		ids.add(c.id);
	}
	(story.expect ?? []).forEach((e, i) => {
		if (e.beat >= story.beats.length) errors.push(`expect.${i}.beat: no such beat`);
	});
	story.beats.forEach((b, i) => {
		if (b.speaker !== NARRATOR_ID && !ids.has(b.speaker)) {
			errors.push(`beats.${i}.speaker: unknown speaker "${b.speaker}"`);
		}
		b.visuals.forEach((a, j) => {
			const rec = a as Record<string, unknown>;
			if (a.do === 'db.table') {
				const cols = rec.columns ?? rec.cols;
				if (!Array.isArray(cols) || cols.length === 0) {
					errors.push(`beats.${i}.visuals.${j}: db.table needs "columns": [..]`);
				}
				if (!Array.isArray(rec.rows) || !(rec.rows as unknown[]).every((r) => Array.isArray(r))) {
					errors.push(`beats.${i}.visuals.${j}: db.table needs "rows": [[..],..]`);
				}
			}
			if (a.do === 'db.join') {
				const steps = rec.steps;
				if (
					!Array.isArray(steps) ||
					steps.length === 0 ||
					!steps.every((st) => st && typeof st.table === 'string' && Array.isArray(st.rows) && typeof st.label === 'string')
				) {
					errors.push(`beats.${i}.visuals.${j}: db.join needs "steps": [{table, rows:[index..], label}]`);
				}
			}
			if (a.do === 'db.result') {
				if (!Array.isArray(rec.columns ?? rec.cols) || !Array.isArray(rec.rows)) {
					errors.push(`beats.${i}.visuals.${j}: db.result needs "columns" and "rows"`);
				}
			}
			if ('emoji' in rec) errors.push(`beats.${i}.visuals.${j}: "emoji" is not allowed (no emojis anywhere, draw it with a shape or a label)`);
			if (a.do === 'layout') {
				const l = LayoutSchema.safeParse((a as Record<string, unknown>).template);
				if (!l.success) {
					errors.push(
						`beats.${i}.visuals.${j}: layout needs "template" in ${LAYOUTS.join(' | ')}`,
					);
				}
			}
		});
	});
	// layout / clear `keep`: ids of items from the scene being left that carry into the new scene
	const seenIds = new Set<string>();
	story.beats.forEach((b, i) => {
		b.visuals.forEach((a, j) => {
			const rec = a as Record<string, unknown>;
			if ((a.do === 'layout' || a.do === 'clear') && rec.keep !== undefined) {
				if (!Array.isArray(rec.keep) || !rec.keep.every((k) => typeof k === 'string')) errors.push(`beats.${i}.visuals.${j}: keep must be an array of item ids`);
				else for (const k of rec.keep as string[]) if (!seenIds.has(k)) errors.push(`beats.${i}.visuals.${j}: keep "${k}" is not an id used in an earlier beat`);
			}
		});
		for (const a of b.visuals) if (typeof (a as Record<string, unknown>).id === 'string') seenIds.add((a as Record<string, unknown>).id as string);
	});
	if (story.beats[0] && story.beats[0].visuals.length === 0) {
		errors.push('beats.0.visuals: the first beat must have at least one visual (later beats may inherit the previous scene)');
	}
	if (errors.length) return {ok: false, errors};
	return {ok: true, story, warnings};
};

export const validateAudioManifest = (input: unknown, story: Story): AudioManifest => {
	const m = AudioManifestSchema.parse(input);
	const have = new Set(m.lines.map((l) => l.beat_index));
	for (let i = 0; i < story.beats.length; i++) {
		if (!have.has(i)) throw new Error(`audio manifest is missing beat_index ${i}`);
	}
	return m;
};
