/** Manifest audio QA (review B4): every local clip must exist and ffprobe's duration must match duration_ms (+/- 150 ms). */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type {AudioManifest} from './src/schema';

export const MAX_AUDIO_DRIFT_MS = 150;

export const probeDurationMs = (file: string): number => {
	const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], {encoding: 'utf8'}).trim();
	const sec = Number(out);
	if (!Number.isFinite(sec)) throw new Error(`ffprobe gave "${out}"`);
	return sec * 1000;
};

/** Problems found (empty = all clips exist and match their declared duration). Remote URLs are skipped. */
export const audioProblems = (m: AudioManifest, baseDir: string): string[] => {
	const probs: string[] = [];
	m.lines.forEach((l) => {
		if (/^(https?:|data:)/.test(l.src)) return;
		const abs = path.isAbsolute(l.src) ? l.src : path.resolve(baseDir, l.src);
		if (!fs.existsSync(abs)) {
			probs.push(`beat ${l.beat_index}: audio file missing: ${abs}`);
			return;
		}
		try {
			const real = probeDurationMs(abs);
			if (Math.abs(real - l.duration_ms) > MAX_AUDIO_DRIFT_MS) {
				probs.push(`beat ${l.beat_index}: manifest says ${Math.round(l.duration_ms)} ms but ffprobe measures ${Math.round(real)} ms (${path.basename(abs)})`);
			}
		} catch (e) {
			probs.push(`beat ${l.beat_index}: cannot probe ${abs}: ${(e as Error).message.split('\n')[0]}`);
		}
	});
	return probs;
};
