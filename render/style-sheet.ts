/**
 * Style sheet:  npx tsx style-sheet.ts [out.png]   (default out/styles.png)
 * Renders the same 3 frames (a phone with a liked red heart, a DB table, boxes + a caption) in every
 * registry style into one PNG grid: one row per style, in registry order.
 */
import {renderStill, selectComposition} from '@remotion/renderer';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fail, here, prepare} from './prepare';
import {STYLES} from './src/styles';
import {buildTimeline} from './src/timeline';
import {TAP_ARRIVE} from './src/phonestate';

const story = {
	version: 3,
	format: 'story',
	title: 'Style sheet',
	topic: 'style sheet',
	tags: [],
	level: 'beginner',
	cast: [
		{id: 'rookie', name: 'Rookie', role: 'ships fast', color: '#E4572E'},
		{id: 'senior', name: 'Senior', role: 'dry humor', color: '#2F6F8F'},
	],
	glossary: [],
	beats: [
		{speaker: 'rookie', text: 'I tapped the heart and it just worked.', visuals: [{do: 'phone.show'}, {do: 'phone.tap', target: 'heart', at: 0.1}]},
		{
			speaker: 'senior',
			text: 'Here is the users table: an id, a handle, a follower count.',
			visuals: [
				{do: 'layout', template: 'board-full'},
				{do: 'db.table', id: 'users', name: 'users', columns: ['id', 'handle', 'followers'], rows: [[42, 'maya', 1204], [7, 'jonah', 311], [19, 'priya', 88]]},
			],
		},
		{
			speaker: 'senior',
			text: 'One request touches three boxes, then back.',
			visuals: [
				{do: 'layout', template: 'board-full'},
				{do: 'sketch.box', id: 'app', text: 'App server', icon: 'service'},
				{do: 'sketch.box', id: 'db', text: 'Postgres', icon: 'db', tone: 'accent'},
				{do: 'sketch.arrow', from: 'app', to: 'db', label: 'query'},
				{do: 'sketch.note', text: 'read the feed once, cache it'},
			],
		},
	],
};

/** One beat per visualization kit (board-full), each settled by the end of its line. */
const kitStory = {
	version: 3,
	format: 'story',
	title: 'Kit sheet',
	topic: 'kit sheet',
	tags: [],
	level: 'beginner',
	cast: [{id: 'senior', name: 'Senior', role: 'dry humor', color: '#2F6F8F'}],
	glossary: [],
	beats: [
		['seq.diagram', {actors: ['Client', 'API', 'DB'], messages: [{from: 'Client', to: 'API', label: 'GET /feed'}, {from: 'API', to: 'DB', label: 'SELECT'}, {from: 'DB', to: 'Client', label: 'rows', reply: true}]}],
		['tree', {nodes: [{id: 'r', label: 'Program'}, {id: 'f', label: 'Func', parent: 'r'}, {id: 'e', label: 'Expr', parent: 'r'}, {id: 'a', label: 'Add', parent: 'f'}, {id: 'n', label: 'Num', parent: 'f'}], path: ['r', 'f', 'a']}],
		['timeline.track', {lanes: ['CPU 0', 'CPU 1'], span: [0, 100], blocks: [{lane: 'CPU 0', start: 0, end: 55, label: 'init'}, {lane: 'CPU 1', start: 30, end: 95, label: 'zygote', tone: 'accent'}], playhead: {from: 0, to: 70, ms: 1400}}],
		['packet.flow', {nodes: ['Phone', 'Router', 'Server'], packets: [{from: 'Phone', to: 'Router', label: 'SYN'}, {from: 'Router', to: 'Server', label: 'SYN', drop: true}, {from: 'Router', to: 'Server', label: 'retry', retry: true}]}],
		['code.editor', {file: 'fix.c', diff: [' int n = len(x);', '- buf[n] = 0;', '+ buf[n - 1] = 0;']}],
		['chart.plot', {kind: 'loss', xlabel: 'step', ylabel: 'loss', series: [{name: 'loss', points: [[0, 2.1], [1, 1.4], [2, 1.0], [3, 0.7], [4, 0.52], [5, 0.41]]}]}],
	].map(([kind, props]) => ({speaker: 'senior', text: 'A line the kit is shown with, held long enough.', visuals: [{do: 'layout', template: 'board-full'}, {do: kind, id: 'k', ...(props as object)}]})),
};

const main = async () => {
	const outPath = path.resolve(process.argv[2] ?? 'out/styles.png');
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'style-sheet-'));
	const scriptPath = path.join(tmp, 'sheet.json');
	const manifestPath = path.join(tmp, 'sheet.manifest.json');
	fs.writeFileSync(scriptPath, JSON.stringify(story));
	fs.writeFileSync(
		manifestPath,
		JSON.stringify({lines: [0, 1, 2].map((i) => ({beat_index: i, speaker: story.beats[i].speaker, src: path.join(here, 'fixtures', 'audio', `b${i}.wav`), duration_ms: 4200}))}),
	);
	const prep = await prepare(scriptPath, manifestPath, {checkAudio: false});
	try {
		const tl = buildTimeline(prep.story, prep.audio);
		const frames = [tl.beats[0].start + Math.round(0.1 * tl.beats[0].dur) + TAP_ARRIVE + 30, tl.beats[1].end - 3, tl.beats[2].start + Math.round(tl.beats[2].dur * 0.5)];
		const cells: string[] = [];
		for (const st of STYLES) {
			const inputProps = {script: {...prep.story, style: st.id}, audio: prep.audio};
			const composition = await selectComposition({serveUrl: prep.serveUrl, id: 'Story', inputProps});
			for (const f of frames) {
				const out = path.join(tmp, `${st.id}-${f}.png`);
				await renderStill({composition, serveUrl: prep.serveUrl, inputProps, frame: f, output: out, overwrite: true});
				cells.push(out);
			}
			console.log(`style-sheet: ${st.id}`);
		}
		cells.forEach((p, i) => fs.symlinkSync(p, path.join(tmp, `c${String(i + 1).padStart(3, '0')}.png`)));
		fs.mkdirSync(path.dirname(outPath), {recursive: true});
		const stylesPng = path.join(tmp, 'styles-grid.png');
		execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(tmp, 'c%03d.png'), '-vf', `scale=360:-1,tile=3x${STYLES.length}:padding=6:color=0x888888`, '-frames:v', '1', stylesPng]);

		// one new row per visualization kit: the same kit in every style (columns = registry order)
		const kitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-sheet-'));
		const kScript = path.join(kitDir, 'kits.json');
		fs.writeFileSync(kScript, JSON.stringify(kitStory));
		fs.writeFileSync(path.join(kitDir, 'kits.manifest.json'), JSON.stringify({lines: kitStory.beats.map((b, i) => ({beat_index: i, speaker: b.speaker, src: path.join(here, 'fixtures', 'audio', 'b0.wav'), duration_ms: 6500}))}));
		const kprep = await prepare(kScript, path.join(kitDir, 'kits.manifest.json'), {checkAudio: false});
		try {
			const ktl = buildTimeline(kprep.story, kprep.audio);
			const kcells: string[] = [];
			const labels = ['seq.diagram', 'tree', 'timeline.track', 'packet.flow', 'code.editor', 'chart.plot'];
			for (let bi = 0; bi < ktl.beats.length; bi++) {
				for (const st of STYLES) {
					const inputProps = {script: {...kprep.story, style: st.id}, audio: kprep.audio};
					const composition = await selectComposition({serveUrl: kprep.serveUrl, id: 'Story', inputProps});
					const out = path.join(kitDir, `${labels[bi]}-${st.id}.png`);
					await renderStill({composition, serveUrl: kprep.serveUrl, inputProps, frame: ktl.beats[bi].end - 3, output: out, overwrite: true});
					kcells.push(out);
				}
				console.log(`style-sheet: ${labels[bi]}`);
			}
			kcells.forEach((p, i) => fs.symlinkSync(p, path.join(kitDir, `k${String(i + 1).padStart(3, '0')}.png`)));
			const kitsPng = path.join(kitDir, 'kits-grid.png');
			execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(kitDir, 'k%03d.png'), '-vf', `crop=720:900:0:60,scale=240:-1,tile=${STYLES.length}x${labels.length}:padding=6:color=0x888888`, '-frames:v', '1', kitsPng]);
			execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', stylesPng, '-i', kitsPng, '-filter_complex', '[0]scale=1500:-1[a];[1]scale=1500:-1[b];[a][b]vstack=inputs=2', '-frames:v', '1', outPath]);
		} finally {
			kprep.cleanup();
			fs.rmSync(kitDir, {recursive: true, force: true});
		}
		console.log(`style-sheet: wrote ${outPath} (rows: ${STYLES.map((s) => s.id).join(', ')}, then one row per kit: ${['seq.diagram', 'tree', 'timeline.track', 'packet.flow', 'code.editor', 'chart.plot'].join(', ')})`);
	} finally {
		prep.cleanup();
		fs.rmSync(tmp, {recursive: true, force: true});
	}
};

main().catch((e) => fail(String((e as Error).stack ?? e)));
