import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {audioProblems} from '../audio-check';

describe('manifest audio QA', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-qa-'));
	const wav = path.join(dir, 'one.wav');
	execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono', '-t', '1', wav]);
	const m = (src: string, ms: number) => ({lines: [{beat_index: 0, speaker: 'narrator', src, duration_ms: ms}]});
	it('passes a clip whose ffprobe duration matches', () => {
		expect(audioProblems(m(wav, 1040), dir)).toEqual([]);
	});
	it('fails a missing file (an invented 60 s entry)', () => {
		expect(audioProblems(m('nope.wav', 60000), dir)[0]).toMatch(/missing/);
	});
	it('fails a duration that is off by more than 150 ms', () => {
		expect(audioProblems(m(wav, 1400), dir)[0]).toMatch(/ffprobe measures/);
	});
});
