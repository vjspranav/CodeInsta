/**
 * Voice mix policy (owner): about 80% of reels are voiced by Gemini flash, about 20% by OpenAI gpt-4o-mini-tts,
 * picked deterministically from the reel's topic so a rerun always picks the same engine. One engine per reel, never mixed.
 * Gemini's daily cap is waited out (never a fallback to another engine or to flash-lite).
 */
import { createHash } from "node:crypto";

export type AutoEngine = "gemini" | "openai";
/** Percent of reels (by topic hash) voiced by Gemini flash. */
/** Owner, 2026-11-01: Gemini is the voice; wait for its quota. Set VOICE_GEMINI_SHARE (0-100) to mix in OpenAI again. */
export const GEMINI_SHARE_PERCENT = Number(process.env.VOICE_GEMINI_SHARE ?? 100);

/** Stable 0-99 bucket of a topic path. */
export function topicBucket(topic: string): number {
  return createHash("sha256").update(topic.trim().toLowerCase()).digest().readUInt32BE(0) % 100;
}

export function pickEngine(topic: string, geminiShare = GEMINI_SHARE_PERCENT): AutoEngine {
  return topicBucket(topic) < geminiShare ? "gemini" : "openai";
}

/** The flash-lite model garbled lines; it is never used for a final reel. */
export const isLiteModel = (model: string): boolean => /lite/i.test(model);
