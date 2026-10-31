const FEMALE = /female|samantha|karen|moira|tessa|victoria|fiona|zira|susan|serena|allison|ava|kate|joanna|ivy|salli/i;

/** Maps a Kokoro voice id (af_heart, bm_george...) onto a distinct Web Speech voice, with a pitch nudge. */
export function pickVoice(kokoro: string, index: number): { voice?: SpeechSynthesisVoice; pitch: number } {
  const female = /^[ab]f_/.test(kokoro) || (!/^[ab]m_/.test(kokoro) && index % 2 === 1);
  const voices = typeof window !== "undefined" && "speechSynthesis" in window
    ? window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"))
    : [];
  const matching = voices.filter((v) => FEMALE.test(v.name) === female).sort((a, b) => a.name.localeCompare(b.name));
  const pool = matching.length ? matching : voices;
  // Spread cast members across the pool so two speakers never share a voice when avoidable.
  const voice = pool.length ? pool[Math.floor(index / 2) % pool.length] : undefined;
  return { voice, pitch: female ? 1.1 : 0.9 };
}
