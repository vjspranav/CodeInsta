/**
 * Render CLI:
 *   npx tsx render.ts <script.json> <audio-manifest.json> <out.mp4> [--no-verify]
 *
 * - validates the v3 script (src/schema.ts)
 * - runs the QA gate (verify-lib.ts): refuses to write the MP4 when any micro-interaction
 *   expectation fails, unless --no-verify is given (debugging only)
 * - renders H.264 (crf 28, ~3 MB / 60 s target)
 */
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import fs from 'node:fs';
import path from 'node:path';
import {fail, prepare} from './prepare';
import {printReport, verifyStory} from './verify-lib';

const main = async () => {
	const args = process.argv.slice(2);
	const noVerify = args.includes('--no-verify');
	const [scriptArg, manifestArg, outArg] = args.filter((a) => !a.startsWith('--'));
	if (!scriptArg || !manifestArg || !outArg) {
		fail('usage: npx tsx render.ts <script.json> <audio-manifest.json> <out.mp4> [--no-verify]');
	}
	const outPath = path.resolve(outArg);
	const t0 = Date.now();
	console.log('render: bundling...');
	const prep = await prepare(scriptArg, manifestArg);
	const inputProps = {script: prep.story, audio: prep.audio};

	try {
		const composition = await selectComposition({serveUrl: prep.serveUrl, id: 'Story', inputProps});
		console.log(
			`render: ${composition.width}x${composition.height} @${composition.fps}fps, ${composition.durationInFrames} frames (${(composition.durationInFrames / composition.fps).toFixed(1)}s)`,
		);
		fs.mkdirSync(path.dirname(outPath), {recursive: true});

		// debug helper: STILLS=30,90,200 renders PNG stills next to <out> instead of the video
		if (process.env.STILLS) {
			for (const f of process.env.STILLS.split(',').map(Number)) {
				const p = outPath.replace(/\.mp4$/, '') + `-f${f}.png`;
				await renderStill({composition, serveUrl: prep.serveUrl, inputProps, frame: f, output: p, overwrite: true});
				console.log(`render: still ${p}`);
			}
			return;
		}

		if (!noVerify) {
			const outDir = path.join(path.dirname(outPath), 'verify-' + path.basename(outPath).replace(/\.mp4$/, ''));
			console.log('render: QA gate (verify)...');
			const rep = await verifyStory({
				story: prep.story,
				audio: prep.audio,
				serveUrl: prep.serveUrl,
				outDir,
			});
			printReport(rep);
			if (!rep.ok) {
				console.error(`render: verification FAILED (${rep.failed} of ${rep.total} checks). Not writing ${outPath}. Contact sheet: ${rep.contactSheet}`);
				process.exitCode = 1;
				return;
			}
		} else {
			console.warn('render: WARNING --no-verify given, skipping the QA gate');
		}

		let lastPct = -1;
		await renderMedia({
			composition,
			serveUrl: prep.serveUrl,
			codec: 'h264',
			crf: 28,
			pixelFormat: 'yuv420p',
			x264Preset: 'slow',
			audioCodec: 'aac',
			audioBitrate: '64k',
			jpegQuality: 92,
			outputLocation: outPath,
			inputProps,
			overwrite: true,
			onProgress: ({progress}) => {
				const pct = Math.floor(progress * 10) * 10;
				if (pct !== lastPct) {
					lastPct = pct;
					console.log(`render: ${pct}%`);
				}
			},
		});
		const secs = ((Date.now() - t0) / 1000).toFixed(1);
		const mb = (fs.statSync(outPath).size / 1048576).toFixed(2);
		console.log(`render: wrote ${outPath} (${mb} MB) in ${secs}s`);
	} finally {
		prep.cleanup();
	}
};

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
