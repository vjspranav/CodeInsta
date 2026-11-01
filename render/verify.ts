/**
 * QA gate:  npx tsx verify.ts <script.json> <audio-manifest.json> [--out dir] [--no-stills] [--style id] [--all-styles]
 * Prints a PASS/FAIL table of every micro-interaction and exits 1 on failure.
 * --all-styles runs the full gate for the script in EVERY style of the registry.
 */
import path from 'node:path';
import {fail, prepare} from './prepare';
import {printReport, verifyStory} from './verify-lib';
import type {Report} from './verify-lib';
import {STYLES} from './src/styles';

const main = async () => {
	const args = process.argv.slice(2);
	const val = (flag: string) => {
		const i = args.indexOf(flag);
		return i >= 0 ? args[i + 1] : undefined;
	};
	const outDir = path.resolve(val('--out') ?? 'out/verify');
	const noStills = args.includes('--no-stills');
	const noAuto = args.includes('--no-auto-reveal'); // debugging: show what the scheduler fixes
	const all = args.includes('--all-styles');
	const style = val('--style');
	const skip = new Set(['--out', '--style'].map((f) => args.indexOf(f) + 1).filter((i) => i > 0));
	const pos = args.filter((a, i) => !a.startsWith('--') && !skip.has(i));
	if (pos.length < 2) fail('usage: npx tsx verify.ts <script.json> <audio-manifest.json> [--out dir] [--no-stills] [--style id] [--all-styles]');
	const prep = await prepare(pos[0], pos[1]);
	try {
		if (!all) {
			const rep = await verifyStory({story: prep.story, audio: prep.audio, serveUrl: prep.serveUrl, outDir, stills: !noStills, style, autoReveal: !noAuto});
			printReport(rep);
			process.exitCode = rep.ok ? 0 : 1;
			return;
		}
		const reps: Report[] = [];
		for (const st of STYLES) {
			console.log(`\n===== style: ${st.id} =====`);
			const rep = await verifyStory({story: prep.story, audio: prep.audio, serveUrl: prep.serveUrl, outDir: path.join(outDir, st.id), stills: !noStills, style: st.id, autoReveal: !noAuto});
			printReport(rep);
			reps.push(rep);
		}
		console.log('\n===== summary =====');
		for (const r of reps) console.log(`${String(r.style).padEnd(16)} ${r.passed}/${r.total} passed${r.ok ? '' : `  FAILED ${r.failed}`}`);
		process.exitCode = reps.every((r) => r.ok) ? 0 : 1;
	} finally {
		prep.cleanup();
	}
};

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
