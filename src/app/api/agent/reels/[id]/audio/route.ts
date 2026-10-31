import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAgent } from "@/lib/agent-auth";
import { storeReelAudio, type AudioClipBytes } from "@/lib/reel-audio";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CLIP_BYTES = 2_000_000;
const ms = z.number().int().positive().max(120_000);
const words = z.array(z.object({ w: z.string(), start_ms: z.number().int().min(0) })).max(400);
const manifestSchema = z.object({
  voice: z.string().min(1),
  hook: z.object({ duration_ms: ms }),
  scenes: z.array(z.object({ duration_ms: ms, words })).min(1).max(20),
  takeaway: z.object({ duration_ms: ms }),
});

/** POST multipart: `manifest` (JSON) plus mp3 parts `hook`, `scene-0`..`scene-N`, `takeaway`. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const creator = authenticateAgent(req);
  if (!creator) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "invalid reel id" }, { status: 400 });

  const db = getSupabaseAdmin();
  const reel = await db.from("reels").select("id, creator_id, script").eq("id", id).maybeSingle();
  if (reel.error) return NextResponse.json({ error: reel.error.message }, { status: 500 });
  if (!reel.data) return NextResponse.json({ error: "reel not found" }, { status: 404 });
  if (reel.data.creator_id !== creator) return NextResponse.json({ error: "reel belongs to another creator" }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
  }
  const rawManifest = form.get("manifest");
  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(typeof rawManifest === "string" ? rawManifest : "");
  } catch {
    return NextResponse.json({ error: "manifest must be a JSON string field" }, { status: 400 });
  }
  const parsed = manifestSchema.safeParse(manifestJson);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid manifest", errors: parsed.error.issues.map((i) => `${i.path.join(".") || "manifest"}: ${i.message}`) },
      { status: 400 },
    );
  }
  const manifest = parsed.data;
  const sceneCount = (reel.data.script as { scenes?: unknown[] } | null)?.scenes?.length ?? 0;
  if (manifest.scenes.length !== sceneCount) {
    return NextResponse.json(
      { error: `manifest has ${manifest.scenes.length} scenes but the reel has ${sceneCount}` },
      { status: 400 },
    );
  }

  const readClip = async (name: string, duration_ms: number): Promise<AudioClipBytes | string> => {
    const part = form.get(name);
    if (!(part instanceof Blob)) return `missing file part: ${name}`;
    if (part.size === 0 || part.size > MAX_CLIP_BYTES) return `file part ${name} must be 1..${MAX_CLIP_BYTES} bytes`;
    return { bytes: new Uint8Array(await part.arrayBuffer()), duration_ms };
  };
  const hook = await readClip("hook", manifest.hook.duration_ms);
  const takeaway = await readClip("takeaway", manifest.takeaway.duration_ms);
  const scenes: (AudioClipBytes & { words: { w: string; start_ms: number }[] })[] = [];
  const problems: string[] = [];
  if (typeof hook === "string") problems.push(hook);
  if (typeof takeaway === "string") problems.push(takeaway);
  for (let i = 0; i < manifest.scenes.length; i++) {
    const c = await readClip(`scene-${i}`, manifest.scenes[i].duration_ms);
    if (typeof c === "string") problems.push(c);
    else scenes.push({ ...c, words: manifest.scenes[i].words });
  }
  if (problems.length || typeof hook === "string" || typeof takeaway === "string") {
    return NextResponse.json({ error: "invalid upload", errors: problems }, { status: 400 });
  }

  try {
    const audio = await storeReelAudio(db, id, { voice: manifest.voice, hook, scenes, takeaway });
    return NextResponse.json(audio);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
