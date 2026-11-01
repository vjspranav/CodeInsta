// Run: npx tsx tts/test-tts.ts [chatterbox|gemini|openai ...]
import { spawnSync } from "node:child_process";
import { applyLexicon, engineAvailable, renderStory, type Engine, type StoryScript } from "../scripts/lib/tts-v3";

const script: StoryScript = {
  cast: [
    { id: "rookie", name: "Rookie", role: "overconfident junior" },
    { id: "senior", name: "Senior", role: "senior engineer" },
  ],
  beats: [
    { speaker: "narrator", text: "Friday evening, and the feed is slow again." },
    { speaker: "rookie", text: "I'll just prefetch every URL and put it all in cache. Easy." },
    { speaker: "senior", text: "Sure. Until the CDN hits a cold POP and your p99 falls over." },
  ],
};

async function main() {
  console.log(applyLexicon("Prefetch the URL, then fsync. No prefetch? The SELinux AOSP HAL and I/O cache, via URLs."));
  const engines = (process.argv.slice(2).length ? process.argv.slice(2) : ["chatterbox", "gemini", "openai"]) as Engine[];
  for (const e of engines) {
    if (!engineAvailable(e)) {
      console.log(`[${e}] skipped: API key missing`);
      continue;
    }
    const t0 = Date.now();
    let r;
    try {
      r = await renderStory(script, e);
    } catch (err) {
      console.log(`[${e}] FAILED: ${String(err).slice(0, 200)}`);
      continue;
    }
    const wall = (Date.now() - t0) / 1000;
    console.log(`[${e}] audio ${(r.total_ms / 1000).toFixed(1)}s, render ${wall.toFixed(1)}s => ${(wall / (r.total_ms / 1000)).toFixed(2)} s per audio-second`);
    for (const l of r.lines) {
      const res = spawnSync("/opt/homebrew/bin/ffmpeg", ["-hide_banner", "-i", l.wav, "-af", "volumedetect,silencedetect=n=-35dB:d=0.12", "-f", "null", "-"], { encoding: "utf8" });
      const m = (res.stderr as string).match(/mean_volume: (\S+) dB[\s\S]*max_volume: (\S+) dB/);
      const pauses = ((res.stderr as string).match(/silence_duration: [\d.]+/g) ?? []).map((x) => x.split(": ")[1].slice(0, 4)).join(",");
      console.log(`  pauses[${pauses}]`);
      console.log(`  beat ${l.beat_index} ${l.speaker}: ${l.duration_ms}ms mean ${m?.[1]} max ${m?.[2]} dB  ${l.wav}`);
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
