/** Shared by render.ts and verify.ts: validate inputs, stage fonts + audio, bundle once. */
import {bundle} from '@remotion/bundler';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {AudioManifestSchema, validateAudioManifest, validateStory} from './src/schema';
import type {AudioManifest, Story} from './src/schema';
import {audioProblems} from './audio-check';

export const here = path.dirname(fileURLToPath(import.meta.url));

export const fail = (msg: string): never => {
	console.error(`render: ${msg}`);
	process.exit(1);
};

export interface Prepared {
	story: Story;
	/** manifest as given (original src paths) */
	rawAudio: AudioManifest;
	/** manifest with srcs rewritten to the staged public dir */
	audio: AudioManifest;
	stage: string;
	serveUrl: string;
	cleanup: () => void;
}

export const prepare = async (scriptArg: string, manifestArg: string, opts: {checkAudio?: boolean} = {}): Promise<Prepared> => {
	const scriptPath = path.resolve(scriptArg);
	const manifestPath = path.resolve(manifestArg);
	const v = validateStory(JSON.parse(fs.readFileSync(scriptPath, 'utf8')));
	if (!v.ok) return fail(`invalid script:\n  ${v.errors.join('\n  ')}`);
	for (const w of v.warnings) console.warn(`render: warning: ${w}`);
	const story = v.story;
	const rawAudio = validateAudioManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8')), story);

	if (opts.checkAudio !== false) {
		const probs = audioProblems(rawAudio, path.dirname(manifestPath));
		if (probs.length) return fail(`audio manifest QA failed:\n  ${probs.join('\n  ')}`);
	}

	const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'codeinsta-render-'));
	fs.cpSync(path.join(here, 'public', 'fonts'), path.join(stage, 'fonts'), {recursive: true});
	fs.mkdirSync(path.join(stage, '_audio'));
	const lines = rawAudio.lines.map((l, i) => {
		if (/^(https?:|data:)/.test(l.src)) return l;
		const abs = path.isAbsolute(l.src) ? l.src : path.resolve(path.dirname(manifestPath), l.src);
		if (!fs.existsSync(abs)) fail(`audio file not found: ${abs}`);
		const name = `_audio/${i}${path.extname(abs) || '.wav'}`;
		fs.copyFileSync(abs, path.join(stage, name));
		return {...l, src: name};
	});
	const audio = AudioManifestSchema.parse({lines});
	const serveUrl = await bundle({entryPoint: path.join(here, 'src', 'index.ts'), publicDir: stage});
	return {story, rawAudio, audio, stage, serveUrl, cleanup: () => fs.rmSync(stage, {recursive: true, force: true})};
};
