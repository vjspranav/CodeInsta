// Generates silent wav clips (ffmpeg) + demo.manifest.json for demo.json.
// Duration is estimated from text length (~16 chars/sec) so timing resembles speech.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(here, 'demo.json');
const outBase = process.argv[3] ? path.resolve(process.argv[3]) : here;
const script = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
const dir = path.join(outBase, 'audio');
fs.mkdirSync(dir, {recursive: true});
const lines = script.beats.map((b, i) => {
	const duration_ms = Math.max(1400, Math.round((b.say ?? b.text).length * 62));
	const file = path.join(dir, `b${i}.wav`);
	execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', String(duration_ms / 1000), file]);
	return {beat_index: i, speaker: b.speaker, src: `audio/b${i}.wav`, duration_ms};
});
fs.writeFileSync(path.join(outBase, 'demo.manifest.json'), JSON.stringify({lines}, null, 2) + '\n');
console.log(`wrote ${lines.length} clips, ${(lines.reduce((a, l) => a + l.duration_ms, 0) / 1000).toFixed(1)}s total`);
