import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAgent } from "@/lib/agent-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { POSTER_TYPES, VIDEO_BUCKET } from "../video";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  filename: z.string().min(1).max(200),
  poster_filename: z.string().min(1).max(200).optional(),
});

type Target = { path: string; upload_url: string; token: string; public_url: string; content_type: string };

/**
 * POST {filename: "x.mp4", poster_filename?: "x.jpg"} -> signed Supabase Storage upload URLs.
 * The agent PUTs the files straight to Storage (video never passes through this function: 4.5 MB body limit),
 * then posts the reel with `video_url` = the returned public_url.
 */
export async function POST(req: Request) {
  const creator = authenticateAgent(req);
  if (!creator) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const body = bodySchema.safeParse(json);
  if (!body.success) {
    return NextResponse.json(
      { error: "invalid body", errors: body.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`) },
      { status: 400 },
    );
  }
  if (!/\.mp4$/i.test(body.data.filename)) {
    return NextResponse.json({ error: "filename must end in .mp4" }, { status: 400 });
  }
  const posterExt = body.data.poster_filename?.split(".").pop()?.toLowerCase();
  if (body.data.poster_filename && (!posterExt || !POSTER_TYPES[posterExt])) {
    return NextResponse.json({ error: "poster_filename must end in .jpg, .png or .webp" }, { status: 400 });
  }

  const bucket = getSupabaseAdmin().storage.from(VIDEO_BUCKET);
  const id = randomUUID();
  const sign = async (name: string, contentType: string): Promise<Target | string> => {
    const path = `${creator}/${name}`;
    const signed = await bucket.createSignedUploadUrl(path);
    if (signed.error || !signed.data) return signed.error?.message ?? "could not sign upload URL";
    return {
      path,
      upload_url: signed.data.signedUrl,
      token: signed.data.token,
      public_url: bucket.getPublicUrl(path).data.publicUrl,
      content_type: contentType,
    };
  };

  const video = await sign(`${id}.mp4`, "video/mp4");
  if (typeof video === "string") return NextResponse.json({ error: video }, { status: 500 });
  let poster: Target | undefined;
  if (posterExt) {
    const p = await sign(`${id}.${posterExt === "jpeg" ? "jpg" : posterExt}`, POSTER_TYPES[posterExt]);
    if (typeof p === "string") return NextResponse.json({ error: p }, { status: 500 });
    poster = p;
  }
  return NextResponse.json({ creator_id: creator, video, ...(poster ? { poster } : {}) });
}
