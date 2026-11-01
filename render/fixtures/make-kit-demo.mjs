// Silent placeholder audio for content/lab-v3/kit-demo.json at 155 wpm:  node fixtures/make-kit-demo.mjs
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const story = JSON.parse(fs.readFileSync(path.join(here, '..', '..', 'content', 'lab-v3', 'kit-demo.json'), 'utf8'));
const dir = path.join(here, 'kit-demo');
fs.mkdirSync(dir, {recursive: true});
const lines = story.beats.map((b, i) => {
	const words = (b.say ?? b.text).trim().split(/\s+/).length;
	const ms = Math.round((words / 155) * 60 * 1000);
	const file = path.join(dir, `b${i}.wav`);
	execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono', '-t', String(ms / 1000), file]);
	return {beat_index: i, speaker: b.speaker, src: `kit-demo/b${i}.wav`, duration_ms: ms};
});
fs.writeFileSync(path.join(here, 'kit-demo.manifest.json'), JSON.stringify({lines}, null, 2));
console.log(`kit-demo: ${lines.length} silent clips, ${(lines.reduce((a, l) => a + l.duration_ms, 0) / 1000).toFixed(1)} s of speech`);
