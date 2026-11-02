# Canonical reel rules

Owner: Codex. Consolidated 2026-11-01 from **all** entries in [decisions.md](../coordination/decisions.md), newest applicable decision winning. These rules govern new final reels; legacy player compatibility does not authorize publishing old-format substitutes. Status is the post-fix independent review, not a production certification. PASS = supported implementation and local evidence; FAIL = observed contradictory behavior or concrete defect; GAP = missing enforcement/evidence. Exact remediation and test results are in [the review](../coordination/review-2026-11-01.md). A compound rule takes the worst status of its clauses.

## Precedence and unresolved interpretation

- **Voices:** Oct 31 Kokoro and comparison-engine instructions are superseded for final output by Nov 1 “Owner verdict…”: Gemini, billing key for scheduled work, Batch where possible. Legacy playback may still support Kokoro.
- **Story:** automatic spoken hook/title/takeaway cards and 20–90 s legacy authoring yield to v3 cold opens, no title/end rereading, then the 60–90 s parts decision. Keep legacy rendering compatible, but do not treat it as the current creative brief.
- **Pacing:** round-2 500 ms/row (up to 4 s) was replaced by 150 ms/row (up to 1 s), then by visibility-shortfall-only dwell. The last decision sets a 250 ms default; earlier contextual variation remains where compatible. Explicit hold ≤1.2 s and whole-runtime silence limits remain in force.
- **Row dwell wording:** “under ~1.5 s, plus about 0.3 s per row in total” is approximate. Current code interprets this as max(1500, 300×rows), not 1500+300×rows. Treat this as an implementation interpretation to document with editorial examples, not an owner-approved exact formula. The non-negotiable rule is no extra hold for a visual that persists.
- **Styles:** the v3 sketch-only look became one of at least six skins; the newest decision adds category/genre affinity and creator-history rotation. There is no recorded exception allowing consecutive parts to repeat a style.
- **Commits:** Nov 1 “Commit references (user correction)” overrides Oct 31 “Content preferences”: no hashes on screen; source URLs may contain the actual commit identifier.
- **Members:** Oct 31 “Members can ask” supersedes owner-only questions, but free-form DMs remain owner-only. Member answers require isolated writers. Owner-approved topic text remains untrusted data. “Auth hardening” supersedes email-only owner elevation with allowlisted email plus Google identity.
- **Silent glossary vs silence cap:** both remain requirements. The code excludes the outro from the gate, but no decision grants that exception. Fit the complete silent glossary without violating whole-video limits, or obtain a new owner decision; do not silently redefine the denominator.

## Decision source key

- **feed** — 2026-10-31, **Player and feed must be addictive (user goal)**, [decisions.md line 20](../coordination/decisions.md#L20).
- **lab** — 2026-10-31, **Format Lab (user: reels must be better and less like a lecture; wants options)**, [decisions.md line 56](../coordination/decisions.md#L56).
- **member** — 2026-10-31, **Members can ask (user request)**, [decisions.md line 75](../coordination/decisions.md#L75).
- **content** — 2026-10-31, **Content preferences (user)**, [decisions.md line 79](../coordination/decisions.md#L79).
- **commit** — 2026-11-01, **Commit references (user correction)**, [decisions.md line 85](../coordination/decisions.md#L85).
- **v3** — 2026-11-01, **Reels v3: "Story mode", pre-rendered video (user feedback round 1)**, [decisions.md line 86](../coordination/decisions.md#L86).
- **requests** — 2026-11-01, **Categories from requests and admin review (user request, verbatim intent)**, [decisions.md line 111](../coordination/decisions.md#L111).
- **ml** — 2026-11-01, **New categories requested by the owner**, [decisions.md line 122](../coordination/decisions.md#L122).
- **round2** — 2026-11-01, **Story-mode round 2 (owner feedback on the first render: "look was very nice")**, [decisions.md line 125](../coordination/decisions.md#L125).
- **qa** — 2026-11-01, **Reel QA gate: micro-interaction tests (owner requirement, before any bulk creation)**, [decisions.md line 141](../coordination/decisions.md#L141).
- **length** — 2026-11-01, **Reel length**, [decisions.md line 157](../coordination/decisions.md#L157).
- **pace** — 2026-11-01, **Pacing fix for final renders (owner feedback on the round-2 voice comparison)**, [decisions.md line 158](../coordination/decisions.md#L158).
- **verdict** — 2026-11-01, **Owner verdict on the voice comparison, plus refined pacing**, [decisions.md line 164](../coordination/decisions.md#L164).
- **genres** — 2026-11-01, **Genres, style by type and category, and dislikes**, [decisions.md line 169](../coordination/decisions.md#L169).
- **variety** — 2026-11-02, **Reels must not look the same; remakes hidden for a variety pass**, [decisions.md line 257](../coordination/decisions.md#L257).

## Audio

- [ ] **A1 — Final renders default to Gemini; scheduled generation uses GEMINI_API_KEY_BILLING, Batch where possible.**
  - Source: 2026-11-01 — Owner verdict on the voice comparison, plus refined pacing (verdict).
  - Enforcement: `scripts/lib/tts-v3.ts:112 engineAvailable, :208 gemini; scripts/agent.ts:69 renderAndUpload`.
  - Review: **FAIL**. Use the billing key for scheduled Gemini, implement eligible Batch jobs with explicit fallback, and route final publishing through v3. Current CLI still generates Kokoro; Gemini reads the nonbilling key.
- [ ] **A2 — Target rookie ≈160, senior ≈150, narrator ≈150 words/minute; natural expressive delivery, clear non-husky voices, no slow senior prompts.**
  - Source: 2026-11-01 — Reels v3: "Story mode", pre-rendered video (user feedback round 1) (v3); 2026-11-01 — Owner verdict on the voice comparison, plus refined pacing (verdict).
  - Enforcement: `scripts/lib/tts-v3.ts:22 ROLE_SPEED, :61 STYLE_INSTRUCTIONS, :272 renderLine`.
  - Review: **FAIL**. Prompts improved, but fixed multipliers are not rate control. Measure normalized spoken words per output duration, tune/regenerate outside an explicit tolerance, and record role rates. Original senior ≈108 WPM; latest part2 rookie ≈184, narrator ≈175. Listening review remains required.
- [ ] **A3 — Compress pauses inside clips to at most approximately 0.25 s.**
  - Source: 2026-11-01 — Owner verdict on the voice comparison, plus refined pacing (verdict).
  - Enforcement: `scripts/lib/tts-v3.ts:145 PAUSE_PARAMS and postProcess`.
  - Review: **PASS**. Existing ffmpeg compressor precedes atempo. Local latest part1/2 clips measured maximum detected silence 198/220 ms at -40 dB, minimum interval 80 ms; keep a signal regression fixture.
- [ ] **A4 — Apply the pronunciation lexicon before synthesis, with per-line say overrides; URL is U R L, prefetch is pree-fetch, and abbreviations receive appropriate spoken forms.**
  - Source: 2026-11-01 — Reels v3: "Story mode", pre-rendered video (user feedback round 1) (v3).
  - Enforcement: `scripts/lib/tts-v3.ts:31 loadLexicon, :43 applyLexicon, :311 renderStory; tts/lexicon.json`.
  - Review: **PASS**. Existing whole-word lexicon and say path implement this. Full forms belong in the glossary too (V12); pronunciation alone does not expand or define a term.
- [ ] **A5 — Narrator is a separate voice, never a cast character; use distinct rookie/senior/narrator roles.**
  - Source: 2026-11-01 — Reels v3: "Story mode", pre-rendered video (user feedback round 1) (v3).
  - Enforcement: `render/src/schema.ts:189 validateStory; scripts/lib/tts-v3.ts:57 GEMINI_VOICES, :299 roleFor; render/src/components/Doodle.tsx Avatar`.
  - Review: **PASS**. Reserved narrator ID and role checks reject narrator cast membership; three Gemini voices are distinct. Short scene-setting usage is an editorial check under C2.
- [ ] **A6 — Schedule each spoken clip and its actions on the same per-line frame clock.**
  - Source: 2026-11-01 — Reels v3: "Story mode", pre-rendered video (user feedback round 1) (v3).
  - Enforcement: `render/src/timeline.ts:161 buildBeats, triggerFrame; render/src/Story.tsx StoryInner`.
  - Review: **PASS**. Sequences use each beat start/duration and actions use those frames; 30 fps quantization is expected. Actual word alignment and manifest authenticity are separate failed/missing checks.
- [ ] **A7 — Use 250 ms as the default inter-line gap, retaining intentional question/punchline rhythm; ordinary gaps 150–500 ms, scene changes up to 700 ms.**
  - Source: 2026-11-01 — Story-mode round 2 (owner feedback on the first render: "look was very nice") (round2); 2026-11-01 — Pacing fix for final renders (owner feedback on the round-2 voice comparison) (pace); 2026-11-01 — Owner verdict on the voice comparison, plus refined pacing (verdict).
  - Enforcement: `render/src/timeline.ts:10 GAPS, :147 gapBetween`.
  - Review: **FAIL**. Set ordinary same/change gaps to 250 ms; retain documented contextual overrides in range. Current 120/200 ms defaults violate the latest default, with same-speaker below the prior lower bound. Test actual timing, not just equality to constants.
- [ ] **A8 — Let speech explain data as it appears. Add only visibility shortfall when a visual leaves next beat; persistent visuals get no extra dwell. Base minimum is about 1.5 s with row-dependent time about 0.3 s/row.**
  - Source: 2026-11-01 — Pacing fix for final renders (owner feedback on the round-2 voice comparison) (pace); 2026-11-01 — Owner verdict on the voice comparison, plus refined pacing (verdict).
  - Enforcement: `render/src/timeline.ts:161 buildBeats, minVisibleMs, joinExtraMs`.
  - Review: **FAIL**. Track visibility lifetimes across beats and apply only the shortfall at removal. joinExtraMs currently forces silence even when the table persists; older surviving items are not considered by the last-beat-only loop. Codify the row-time interpretation described below.
- [ ] **A9 — Explicit hold_ms is at most 1200 ms, only immediately after a reveal; do not hide invalid authoring by clamping it.**
  - Source: 2026-11-01 — Pacing fix for final renders (owner feedback on the round-2 voice comparison) (pace).
  - Enforcement: `render/src/schema.ts:118 BeatSchema; render/src/timeline.ts:182 holdMs`.
  - Review: **FAIL**. Reject hold_ms >1200 and holds without an associated reveal; bound pause_before_ms by context. Schema currently allows 30000 ms, and source story contains oversized holds despite runtime clamping.
- [ ] **A10 — Silence is ≤10% of whole reel runtime and the longest silence is ≤1.5 s. Include internal clip pauses, lead-in and the silent outro in measurement.**
  - Source: 2026-11-01 — Pacing fix for final renders (owner feedback on the round-2 voice comparison) (pace); 2026-11-01 — Owner verdict on the voice comparison, plus refined pacing (verdict).
  - Enforcement: `render/verify-lib.ts:171 timingStats, :773 silence gate`.
  - Review: **FAIL**. Measure decoded final audio across the entire MP4; current gate excludes lead/outro and assumes clips are speech. Original fails even its relaxed gate; split parts show 17.1%/21.2% whole-video silence before internal pauses. Shorten/restructure the outro; do not invent an exemption.
- [ ] **A11 — Sound defaults on after browser gesture unlock; playback and progress pause offscreen, on user pause/backgrounding, and during feedback; prefer rendered video when present.**
  - Source: 2026-10-31 — Player and feed must be addictive (user goal) (feed); 2026-11-01 — Reels v3: "Story mode", pre-rendered video (user feedback round 1) (v3).
  - Enforcement: `src/components/reel/video-player.tsx VideoPlayer; video-playback.ts; feed.tsx; player.tsx`.
  - Review: **PASS**. Existing playback and playable-content tests cover active/muted/paused cases. Real-device autoplay acceptance is not established by this review.

## Video and visuals

- [ ] **V1 — Deliver 720×1280 H.264 MP4, approximately 3 MB target; store video_url and the associated glossary and play the video.**
  - Source: 2026-11-01 — Reels v3: "Story mode", pre-rendered video (user feedback round 1) (v3).
  - Enforcement: `render/src/Root.tsx and render/render.ts main enforce dimensions/codec; NOT ENFORCED for measured size, upload and glossary persistence`.
  - Review: **GAP**. Add ffprobe codec/dimension/duration checks and a reported byte budget after encoding; upload reel-video/<id>.mp4 with glossary/video_url only through Q4. CRF 28 is not a size guarantee.
- [ ] **V2 — Every beat, including narrator beats, has a meaningful visible visual; no empty scenes.**
  - Source: 2026-11-01 — Story-mode round 2 (owner feedback on the first render: "look was very nice") (round2); 2026-11-01 — Reel QA gate: micro-interaction tests (owner requirement, before any bulk creation) (qa).
  - Enforcement: `render/verify-lib.ts:288 deriveExpectations checks a beat-end sample; NOT ENFORCED throughout each beat`.
  - Review: **GAP**. Check initial, transition and end frames, allowing only the declared entrance animation interval; a final-frame visibleAt count cannot prove the start was not empty or the visual meaningful.
- [ ] **V3 — Reveal visuals with their spoken line, introduce data at line start, and never show an answer while its question is being asked.**
  - Source: 2026-11-01 — Reels v3: "Story mode", pre-rendered video (user feedback round 1) (v3); 2026-11-01 — Story-mode round 2 (owner feedback on the first render: "look was very nice") (round2); 2026-11-01 — Pacing fix for final renders (owner feedback on the round-2 voice comparison) (pace).
  - Enforcement: `content/lab-v3/instagram-feed-part1.json:428; instagram-feed-story.json:456; render/src/state.ts commitStages`.
  - Review: **FAIL**. Remove ~100,000/sec from the question beat and reveal it only on the answer beat. Make commitStages frame-aware rather than collecting future updates. Add question/answer and action semantic bindings to the QA timeline.
- [ ] **V4 — No clipped/truncated text, overflowing tables, overlapping visual objects, or content beyond its allocated slot.**
  - Source: 2026-11-01 — Story-mode round 2 (owner feedback on the first render: "look was very nice") (round2); 2026-11-01 — Reel QA gate: micro-interaction tests (owner requirement, before any bulk creation) (qa).
  - Enforcement: `render/src/components/DBTable.tsx:143 and :216; Items.tsx:107; render/verify-lib.ts:343 layout checks`.
  - Review: **FAIL**. Replace data-cell/subtitle ellipsis with fitting, wrapping or pagination. Instrument every text container and compare rendered full content against authored content at transition frames, not just generic scroll bounds.
- [ ] **V5 — Keep content, lower-thirds and captions inside the safe area, with player controls and metadata outside the video image.**
  - Source: 2026-11-01 — Reel QA gate: micro-interaction tests (owner requirement, before any bulk creation) (qa); 2026-11-01 — Owner verdict on the voice comparison, plus refined pacing (verdict).
  - Enforcement: `render/src/layout.ts; render/src/state.ts layoutProblems; render/verify-lib.ts:343; src/app/globals.css:1445`.
  - Review: **GAP**. Codex reserved separate video/control/footer bounds and restored metadata button interaction. Add viewport screenshots and safe-area assertions including end cards/arrows and narrow mobile heights. Existing scene-end checks and unavailable Chromium cannot certify all frames.
- [ ] **V6 — Captions show at most two readable lines, with complete word boundaries.**
  - Source: 2026-10-31 — Format Lab (user: reels must be better and less like a lecture; wants options) (lab); 2026-11-01 — Reels v3: "Story mode", pre-rendered video (user feedback round 1) (v3); 2026-11-01 — Reel QA gate: micro-interaction tests (owner requirement, before any bulk creation) (qa).
  - Enforcement: `render/src/captionstate.ts chunkText; render/verify-lib.ts:314; render/tests/captions.test.ts`.
  - Review: **PASS**. Pure wrapping checks and caption tests pass. This is the two-line layout rule only; accurate spoken timing is V7.
- [ ] **V7 — Caption text/word emphasis must match the actual current voice, without old captions leaking into the next speaker.**
  - Source: 2026-11-01 — Reels v3: "Story mode", pre-rendered video (user feedback round 1) (v3); 2026-11-01 — Reel QA gate: micro-interaction tests (owner requirement, before any bulk creation) (qa).
  - Enforcement: `render/src/captionstate.ts:81 captionStateAt; render/src/Story.tsx:26 active beat selection`.
  - Review: **FAIL**. Replace character-weight timing with measured/aligned words in the manifest. Use half-open beat intervals instead of end+6 frames, which can select the previous line over the next line during short gaps.
- [ ] **V8 — Chat bubbles show only the speaking turn, update for repeated turns, and cannot reveal a later speaker’s answer.**
  - Source: 2026-11-01 — Reels v3: "Story mode", pre-rendered video (user feedback round 1) (v3).
  - Enforcement: `src/components/reel/timeline.ts:176 bubbleContent; src/components/reel/stage.tsx:314`.
  - Review: **PASS**. Fixed by Codex: active line text controls the speaker’s first bubble slot; hide during gaps/other turns and update repeated turns. Regression tests cover early answers, repeated turns and clip end. v3 uses captions rather than dialogue bubbles.
- [ ] **V9 — Show actual database column names and example rows, then walk requests through highlighted join rows and the result.**
  - Source: 2026-11-01 — Story-mode round 2 (owner feedback on the first render: "look was very nice") (round2).
  - Enforcement: `render/src/dbmodel.ts dbStateAt; render/src/components/DBTable.tsx; render/tests/db.test.ts`.
  - Review: **PASS**. Current DB state machinery and sample rows/join/result support this; context and factual accuracy require C1/Q7 review. These are authored examples, not a claim of live database output.
- [ ] **V10 — Visualize inserts, sharding, replication, fan-out, cache hit/miss and query progress rather than replacing each with a static label.**
  - Source: 2026-11-01 — Reels v3: "Story mode", pre-rendered video (user feedback round 1) (v3); 2026-11-01 — Story-mode round 2 (owner feedback on the first render: "look was very nice") (round2); 2026-11-01 — Reel QA gate: micro-interaction tests (owner requirement, before any bulk creation) (qa).
  - Enforcement: `render/src/dbmodel.ts; render/src/state.ts cacheStateAt; render/src/components/DBTable.tsx and Items.tsx`.
  - Review: **PASS**. State transitions and moving row/packet components exist; DB/board unit tests pass. Q1/Q3 still require exhaustive action and style coverage.
- [ ] **V11 — A like tap fills the heart red within 300 ms and keeps it until reset; spinner persists until the next phone state; exact-text toast lasts ≥1.2 s.**
  - Source: 2026-11-01 — Reel QA gate: micro-interaction tests (owner requirement, before any bulk creation) (qa).
  - Enforcement: `render/src/phonestate.ts phoneStateAt and heartVisual; render/src/components/PhoneMock.tsx; render/tests/phone.test.ts`.
  - Review: **PASS**. Pure first-like transition is eight frames (~267 ms); spinner/toast tests pass. The gate’s second-tap assumption needs Q1 correction, and pixels still need full-style execution.
- [ ] **V12 — First mention shows a complete lower-third full form; define abbreviations rather than repeat them inside the expansion.**
  - Source: 2026-11-01 — Reels v3: "Story mode", pre-rendered video (user feedback round 1) (v3).
  - Enforcement: `render/src/components/Overlays.tsx DefineLowerThird; content/lab-v3/instagram-feed-part2.json:64`.
  - Review: **FAIL**. Expand Optimistic UI to Optimistic User Interface and audit all spoken abbreviations. Derive/check first-mention define actions against the glossary and narration; manual define actions currently permit missing or late definitions.
- [ ] **V13 — Show the complete glossary at the end without reading it aloud; retain it with the reel.**
  - Source: 2026-11-01 — Reels v3: "Story mode", pre-rendered video (user feedback round 1) (v3).
  - Enforcement: `render/src/components/Overlays.tsx:95 EndCard; render/src/schema.ts GlossaryEntrySchema`.
  - Review: **FAIL**. Remove silent slice(0,8) omission; paginate or reject content that cannot fit, and test every end-card entry plus storage. Resolve end-card runtime with A10, without silently dropping entries.
- [ ] **V14 — Maintain at least six distinct styles as a registry of tokens plus component skins, selected by script.style.**
  - Source: 2026-11-01 — Owner verdict on the voice comparison, plus refined pacing (verdict); 2026-11-01 — Genres, style by type and category, and dislikes (genres).
  - Enforcement: `render/src/styles/index.ts:12 STYLES; styles/context.tsx; render/tests/styles.test.ts`.
  - Review: **PASS**. Six styles exist: sketch, editorial-dark, blueprint, terminal, paper-cutout, newsprint. Schema validates registered style IDs; unit token/skin tests pass.
- [ ] **V15 — Every style has ≥4.5:1 caption/label contrast and visibly red like-heart color; verify actual rendered components as well as tokens.**
  - Source: 2026-11-01 — Owner verdict on the voice comparison, plus refined pacing (verdict); 2026-11-01 — Genres, style by type and category, and dislikes (genres).
  - Enforcement: `render/src/styles/index.ts styleProblems; render/verify-lib.ts:144 SAMPLED_MIN, :378 label contrast`.
  - Review: **FAIL**. Token checks pass, but pixel threshold is reduced to 4.05 and data/partly opaque labels escape checks. Keep the normative 4.5 threshold on effective foreground/background; use robust interior pixel samples and test heart color for every style.
- [ ] **V16 — Readable minimum font sizes apply to every style and component, including database data, code and terminal text.**
  - Source: 2026-11-01 — Owner verdict on the voice comparison, plus refined pacing (verdict).
  - Enforcement: `render/src/components/DBTable.tsx:112, :137, :213; Items.tsx Code/Terminal; render/verify-lib.ts:370`.
  - Review: **FAIL**. DB headers are 12 px and rows 14.5 px before transforms; code/terminal can shrink to 11 px. Enforce effective-size checks for data and labels (proposed 22 px, captions existing 34 px), split dense scenes rather than shrinking them. Exact data minimum is a proposed QA policy, not an owner-specified number.
- [ ] **V17 — Choose style using both category and genre affinities, preserving creative visual direction for each type.**
  - Source: 2026-11-01 — Genres, style by type and category, and dislikes (genres).
  - Enforcement: `NOT ENFORCED; render/src/styles/index.ts supplies styles only; agents/*/PLAYBOOK.md gives prose guidance`.
  - Review: **GAP**. Add a shared affinity resolver and validate the draft against it. Record deliberate exceptions with an editorial rationale; the full default affinity table is below.
- [ ] **V18 — Rotate fitting genres/styles so consecutive posts from a creator differ; history must inform selection.**
  - Source: 2026-11-01 — Owner verdict on the voice comparison, plus refined pacing (verdict); 2026-11-01 — Genres, style by type and category, and dislikes (genres).
  - Enforcement: `content/lab-v3/instagram-feed-part1.json:34 and part2.json:34; src/app/api/agent/catalog/route.ts GET`.
  - Review: **FAIL**. Both split parts choose sketch; no same-series exception is recorded. Include genre/style in creator history and test candidate selection against the last post before publication. Preserve series continuity through cast/assets, while rotating the approved style.
- [ ] **V19 — Use deliberate layout slots and realistic phone/terminal/database mockups. Sketch is one style, with paper/ink/one accent and no glow/gradient; do not force all genres into sketch.**
  - Source: 2026-11-01 — Reels v3: "Story mode", pre-rendered video (user feedback round 1) (v3); 2026-11-01 — Owner verdict on the voice comparison, plus refined pacing (verdict); 2026-11-01 — Genres, style by type and category, and dislikes (genres).
  - Enforcement: `render/src/layout.ts; render/src/styles/sketch.ts; components/Panel.tsx, Texture.tsx, SceneView.tsx`.
  - Review: **PASS**. Registry and slot composition implement this structural direction. Assess creative fitness and animation transitions through Q7 and GENRES.md; unit success alone is not a creative-quality claim.
- [ ] **V20 — Every new reel declares one primary world that matches its scenario (`"world"`: a registered world from `render/src/worlds`, or `phone` / `db`) and keeps it on screen for at least half the runtime.**
  - Source: 2026-11-02 — Reels must not look the same; remakes hidden for a variety pass (variety).
  - Enforcement: `render/src/schema.ts world + world.set validation; render/src/variety.ts; render/verify-lib.ts world.primary (gated when the script declares world)`.
  - Review: **PASS** for the mechanism (vitest `tests/worlds.test.ts`). Runtime is frame 0 up to the end card. Scripts without `world` are reported, not gated; every new reel must declare one. The five launch reels were written before the rule and do not pass it (see Q10).
- [ ] **V21 — A world looks like the real thing and is data-driven by the script: real commands, output, exit codes and tool formatting; its state at any frame is a pure function of the actions.**
  - Source: 2026-11-02 — Reels must not look the same (variety); 2026-10-31 — Content preferences (user) (content).
  - Enforcement: `render/src/worlds/types.ts WorldModule (stateAt, validate, tokens, texts, problems); render/src/worlds/<id>/model.ts; per-world vitest`.
  - Review: **PASS** for `term.session` (prompt, typed command with block cursor, streamed output, exit status, scrollback, highlight). Real output still needs a recorded source (C5).
- [ ] **V22 — World actions only run while their world is on screen; a world takes the whole stage (no phone or database in its scene); board notes share a strip below it.**
  - Source: 2026-11-02 — Reels must not look the same (variety).
  - Enforcement: `render/src/schema.ts validateStory (world.set order, layout leaves, clear keeps); render/src/layout.ts world template; render/src/timeline.ts`.
  - Review: **PASS**. The world template is `CONTENT`, so the existing zone, safe-area and caption checks apply unchanged.
- [ ] **V23 — Cast is shaped by the story: 0 to 4 speakers besides the narrator, each of whom speaks.**
  - Source: 2026-11-02 — Reels must not look the same (variety): "every reel has the same 2-person cast".
  - Enforcement: `render/src/schema.ts cast max 4; silent cast members are a validation warning`.
  - Review: **PASS**. Creative fit of the cast stays a Q7 review item.

## Content and preferences

- [ ] **C1 — Context precedes conflict: establish the system, database columns and 3–5 illustrative rows, then follow a request before discussing the failure.**
  - Source: 2026-11-01 — Story-mode round 2 (owner feedback on the first render: "look was very nice") (round2).
  - Enforcement: `NOT ENFORCED semantically; content/lab-v3/instagram-feed-part1.json provides context`.
  - Review: **GAP**. Require editor annotations for context, request, failure and reveal, then reject missing/out-of-order phases. Rows may be fewer where appropriate to explain a smaller real example; record editorial reasoning rather than a meaningless row-count-only pass.
- [ ] **C2 — Cold-open in a situation; no title/answer card, no spoken title or reread ending. Use original characters and narrator only for brief scene-setting.**
  - Source: 2026-11-01 — Reels v3: "Story mode", pre-rendered video (user feedback round 1) (v3).
  - Enforcement: `NOT ENFORCED semantically; Story.tsx has no automatic intro; sample scripts and Codex playbook follow direction`.
  - Review: **GAP**. Add spoken-title/end duplication checks plus required human/editorial review for spoilers, original personas and narrator use. Do not ban genre-appropriate presenter-free formats.
- [ ] **C3 — Final runtime is 60–90 s. Split longer stories into same-series consecutive parts, with a cliffhanger ending the earlier part.**
  - Source: 2026-11-01 — Reel length (length).
  - Enforcement: `render/src/timeline.ts buildTimeline; render/verify-lib.ts deriveExpectations; content/lab-v3/instagram-feed-story.json`.
  - Review: **FAIL**. Add a final-runtime gate including outro, and validate series continuity/cliffhanger metadata. Original is 160.7 s and lacks a duration failure; latest parts are 63.6/67.6 s and demonstrate a working split.
- [ ] **C4 — Every v3 reel declares a genre; support all ten initial genres and register new ones in content/curriculum.md.**
  - Source: 2026-11-01 — Genres, style by type and category, and dislikes (genres).
  - Enforcement: `render/src/schema.ts:143 StorySchema; content/curriculum.md`.
  - Review: **FAIL**. Require a lowercase registered genre; add the ten-entry extensible registry to curriculum and validate new entries. The original story omits genre, the field is optional, and curriculum has no genre registry. Codex fixed legacy metadata acceptance without breaking v1/v2 readers.
- [ ] **C5 — Use real, short, readable snippets that support the story, not code walls or invented command results.**
  - Source: 2026-10-31 — Content preferences (user) (content); 2026-11-01 — Reels v3: "Story mode", pre-rendered video (user feedback round 1) (v3).
  - Enforcement: `NOT ENFORCED; Items.tsx Code and agents/*/PLAYBOOK.md provide rendering/instructions`.
  - Review: **GAP**. Require snippet source/language and observed-versus-illustrative output labels; lint/parse or execute only in a separate safe fixture environment. Check rendered line/width budget and editorial relevance.
- [ ] **C6 — Occasionally tell real StagOS/LineageOS commit stories: bug, cause, change, why it works. Verify with gh, store the commit URL, never put hashes on screen.**
  - Source: 2026-10-31 — Content preferences (user) (content); 2026-11-01 — Commit references (user correction) (commit); 2026-11-01 — Genres, style by type and category, and dislikes (genres).
  - Enforcement: `agents/claude/PLAYBOOK.md:27 contradicts the correction; render/src/schema.ts ActionSchema`.
  - Review: **FAIL**. Remove show-short-hash guidance from Claude playbook. Require verified repository/URL provenance and staged bug/cause/fix; scan displayed text fields for hashes with reviewed false positives. Codex playbook already prohibits on-screen hashes.
- [ ] **C7 — Member text is data, never instructions. Answer member feedback only through a tool-less isolated writer; validate returned Markdown/JSON before routing to its author.**
  - Source: 2026-10-31 — Members can ask (user request) (member); 2026-11-01 — Categories from requests and admin review (user request, verbatim intent) (requests).
  - Enforcement: `NOT ENFORCED as a runtime boundary; agents/*/PLAYBOOK.md; src/app/api/agent/inbox/route.ts:179`.
  - Review: **GAP**. Implement an isolated writer with no tools/files/network/secrets and minimal quoted question context, plus adversarial tests. Codex playbook now treats missing from_owner as untrusted and defers if isolation is unavailable. Approval of a topic never makes its text trusted instructions.
- [ ] **C8 — Only approved, not-done topic requests enter the creator work queue; request text remains a suggestion and cannot alter instructions or ownership.**
  - Source: 2026-11-01 — Categories from requests and admin review (user request, verbatim intent) (requests).
  - Enforcement: `src/app/api/agent/inbox/route.ts GET requests query; supabase/migrations/0004_interests.sql; agents/codex/PLAYBOOK.md`.
  - Review: **PASS**. Approval/status filtering and explicit data-only guidance exist. This PASS covers queue filtering and written policy; tool isolation is C7 and atomic fulfillment is a separate bug.
- [ ] **C9 — Dislikes are private, per-user and toggleable; members cannot read another member’s dislikes.**
  - Source: 2026-11-01 — Genres, style by type and category, and dislikes (genres).
  - Enforcement: `supabase/migrations/0008_dislikes_genre.sql:25 RLS; src/components/data.tsx toggleDislike; reel/player.tsx`.
  - Review: **PASS**. Own-user RLS and toggling are present; no client aggregate dislikes are exposed. Migration application and cross-user live DB tests were not attempted.
- [ ] **C10 — Demote unseen reels sharing disliked genre/style for that user.**
  - Source: 2026-11-01 — Genres, style by type and category, and dislikes (genres).
  - Enforcement: `src/components/reel/timeline.ts:231 scoreFeed; timeline.test.ts`.
  - Review: **PASS**. Genre and matching-style penalties are applied from that user’s disliked set; feed tests pass. Publication must preserve the metadata for this to work.
- [ ] **C11 — Agent inbox supplies dislikes since the last run and aggregate genre/style/topic-area counts.**
  - Source: 2026-11-01 — Genres, style by type and category, and dislikes (genres).
  - Enforcement: `src/app/api/agent/inbox/route.ts:28 Stats, :32 tally, :104 queries; :175 response`.
  - Review: **PASS**. Required marginal counts and recent events exist. This does not imply pair-level counts or reliable delivery; C12 and inbox cursor bug cover those gaps.
- [ ] **C12 — Creators avoid net-disliked genre+style pairs; retry owner-disliked topics with a new genre or angle instead of abandoning the topic.**
  - Source: 2026-11-01 — Genres, style by type and category, and dislikes (genres).
  - Enforcement: `src/app/api/agent/inbox/route.ts:28 Stats, :135 dislikesSince; agents/*/PLAYBOOK.md`.
  - Review: **FAIL**. Provide by_genre_style pair counts and server-derived owner markers, with history of topic/angle attempts. Marginal totals cannot identify a net-disliked pair, and dislike events lack owner attribution. Test selection/rotation from those exact data.
- [ ] **C13 — Product-design lessons compare real design choices; ML follows L1–L5 and advances only when the owner liked ≥2 of the last 3 at the current level, otherwise uses a new angle.**
  - Source: 2026-11-01 — New categories requested by the owner (ml).
  - Enforcement: `content/curriculum.md ML ladder; src/lib/reel-schema.ts level; supabase/migrations/0001_init.sql reels.level; inbox/route.ts:170`.
  - Review: **FAIL**. Coordinate a dedicated ml_level (1–5) contract/migration or equivalent explicit mapping; existing level enums accept beginner/intermediate/advanced only. Supply owner-specific recent ML feedback and level history. Do not weaken a schema without compatible storage; Claude must lead this cross-owned contract change.

## QA release gate

- [ ] **Q1 — Derive expectations for every action and accept explicit expectations; unit tests cover every action’s transitions, not merely representative components.**
  - Source: 2026-11-01 — Reel QA gate: micro-interaction tests (owner requirement, before any bulk creation) (qa).
  - Enforcement: `render/verify-lib.ts deriveExpectations, :405 phone.tap; render/tests/board.test.ts`.
  - Review: **FAIL**. Add action-exhaustiveness coverage for cache/code/commit transitions and semantic content. Second like tap currently expects filled even when the phone model toggles empty; derive the expected transition from prior state and test reset/unlike too.
- [ ] **Q2 — The verifier combines pure state and rendered still/DOM/pixel checks, emits a check-by-check report and exits nonzero on failed checks.**
  - Source: 2026-11-01 — Reel QA gate: micro-interaction tests (owner requirement, before any bulk creation) (qa).
  - Enforcement: `render/verify-lib.ts verifyStory/printReport; render/verify.ts main`.
  - Review: **PASS**. These mechanisms exist; the requested failing original-story run exits 1. PASS describes the facility, not successful rendered certification: Chromium launch failed in this environment.
- [ ] **Q3 — Run the full QA gate for every component in every registered style, including contrast, heart color, minimum font size, overflow and safe area.**
  - Source: 2026-11-01 — Reel QA gate: micro-interaction tests (owner requirement, before any bulk creation) (qa); 2026-11-01 — Owner verdict on the voice comparison, plus refined pacing (verdict); 2026-11-01 — Genres, style by type and category, and dislikes (genres).
  - Enforcement: `render/verify.ts --all-styles; NOT ENFORCED as complete release coverage`.
  - Review: **GAP**. Run a coverage fixture matrix of every action/component × every style with stills, fail missing cases, retain contact sheets. --all-styles on one story without stills is insufficient and cannot certify unexercised components.
- [ ] **Q4 — Publishing must refuse failed or incomplete QA; no bulk creation until this release gate works end to end.**
  - Source: 2026-11-01 — Reel QA gate: micro-interaction tests (owner requirement, before any bulk creation) (qa).
  - Enforcement: `scripts/agent.ts post; src/app/api/agent/reels/route.ts:17 POST; render/render.ts:18 noVerify`.
  - Review: **FAIL**. Add an integrated v3 prepare→Gemini→verify→render→media-check→upload→publish path. Server must require a trusted complete receipt bound to script/audio/MP4 digests and gate version. Current API accepts only legacy script and publishes before audio; skip-audio/debug render can bypass quality.
- [ ] **Q5 — Validate the audio manifest against the exact script before deriving timing or publishing.**
  - Source: 2026-11-01 — Reels v3: "Story mode", pre-rendered video (user feedback round 1) (v3); 2026-11-01 — Reel QA gate: micro-interaction tests (owner requirement, before any bulk creation) (qa).
  - Enforcement: `render/src/schema.ts:259 validateAudioManifest; render/prepare.ts prepare`.
  - Review: **FAIL**. Reject duplicate/extra/missing beat indexes, wrong speakers, stale text hashes, nonfinite or mismatched durations; hash and probe each actual clip. Probe accepted duplicate beat0, beat99 and wrongspeaker; fake 60s nonexistent audio passed pure checks.
- [ ] **Q6 — QA must test what viewers hear: actual audio silence, rate, truncation and synchronization, not only declared clip duration.**
  - Source: 2026-11-01 — Pacing fix for final renders (owner feedback on the round-2 voice comparison) (pace); 2026-11-01 — Owner verdict on the voice comparison, plus refined pacing (verdict); 2026-11-01 — Reel QA gate: micro-interaction tests (owner requirement, before any bulk creation) (qa).
  - Enforcement: `NOT ENFORCED; render/verify-lib.ts timingStats uses manifest duration only`.
  - Review: **GAP**. Decode/ffprobe final media, run silence detection and word alignment, reject empty/missing/clipped speech, report role WPM and maximum aligned drift. Establish tolerances in fixtures; keep a listening review for naturalness.
- [ ] **Q7 — Before release, review context, correctness, reveal order, creativity, glossary, real sources and genre/category fitness alongside mechanical checks.**
  - Source: 2026-11-01 — Reels v3: "Story mode", pre-rendered video (user feedback round 1) (v3); 2026-11-01 — Story-mode round 2 (owner feedback on the first render: "look was very nice") (round2); 2026-10-31 — Content preferences (user) (content); 2026-11-01 — Genres, style by type and category, and dislikes (genres).
  - Enforcement: `NOT ENFORCED as a recorded release decision; creator playbooks`.
  - Review: **GAP**. Require a structured editorial checklist keyed to C1–C7 and the matching GENRES.md brief, including source verification and contact-sheet/listening evidence. Failed/absent items block the release receipt.
- [ ] **Q8 — Partial verification is diagnostic only; no-stills output must never count as full release approval.**
  - Source: 2026-11-01 — Reel QA gate: micro-interaction tests (owner requirement, before any bulk creation) (qa); 2026-11-01 — Owner verdict on the voice comparison, plus refined pacing (verdict).
  - Enforcement: `render/verify-lib.ts:865 verifyStory; render/verify.ts --no-stills`.
  - Review: **GAP**. Expose skipped/pure-only checks distinctly and complete=false unless every required still executed. Bind completeness to Q4 receipt. Current report can say ok with zero rendered frames; this review never treats it as full QA.
- [ ] **Q9 — Save a contact sheet of checked frames for human review, and fail the release if this evidence cannot be produced.**
  - Source: 2026-11-01 — Reel QA gate: micro-interaction tests (owner requirement, before any bulk creation) (qa).
  - Enforcement: `render/verify-lib.ts:903 contact-sheet generation`.
  - Review: **FAIL**. Contact-sheet exception currently logs a warning only. Record an explicit failed required check and no complete receipt when ffmpeg/contact-sheet generation fails.
- [ ] **Q10 — Variety gate: primary world >= 50% of the runtime (`world.primary`), whiteboard-notes-only screens <= one third (`notes.share`), at least one signature micro-interaction (`signature`).**
  - Source: 2026-11-02 — Reels must not look the same; remakes hidden for a variety pass (variety).
  - Enforcement: `render/src/variety.ts varietyStats; render/verify-lib.ts groups world.primary, notes.share, signature; render/tests/worlds.test.ts`.
  - Review: **PASS** for the mechanism. Applies to scripts that declare `world` (opt-in by declaration; every new reel declares one); others get the same three lines marked "reported, not gated". Notes-only means the screen shows only sketch.note / sketch.box items (with their arrows, define lower thirds, clear), measured per frame. Signature moments: phone.tap, phone.spinner, phone.toast, phone.instant, db.insert, db.join, db.fanout, db.shard, db.replicate, cache.hit, cache.miss, and each world's declared ones (term.session: a non-zero exit, or 3+ output lines streamed at >= 200 ms per line). Launch reels on the silent timing path (not gated): android-vendor-image no world, notes 33%, no signature; instagram-feed-part1 db 42% / phone 23%, notes 29%, signatures yes; part2 db 31% / phone 24%, notes 31%, signatures yes; paper-attention db 22%, notes 75%, no signature; type-a-url no world, notes 16%, no signature. None would pass world.primary as written; the B3 rewrites fix that.
- [ ] **Q11 — Every world is checked where each of its actions settles: its own problems (legible font, nothing cut, highlight in view), its texts present in the rendered DOM, and timeline problems (actions running over each other).**
  - Source: 2026-11-02 — Reels must not look the same (variety); 2026-11-01 — Reel QA gate: micro-interaction tests (qa).
  - Enforcement: `render/verify-lib.ts group world.<id>; WorldModule.problems / texts / timelineProblems`.
  - Review: **PASS** for `term.session`.
- [ ] **Q12 — A world's `tokens` say when each text appears, so the voice-after-visual sync gate and reveal scheduling cover world text like any other visual.**
  - Source: 2026-11-01 — Owner approved Parts 1/2 (sync rules); 2026-11-02 — Reels must not look the same (variety).
  - Enforcement: `render/src/sync.ts visualTokens (world branch); render/src/timeline.ts planBeat (world.set fires no later than its actions)`.
  - Review: **PASS**. A number spoken before a command finishes typing fails `sync.voice-after-visual` (tested).

## Style affinity defaults

| Category/genre | Preferred registry styles |
| --- | --- |
| aosp | terminal, blueprint |
| os, compilers | newsprint, terminal, editorial-dark |
| distributed, system design | sketch, blueprint |
| product-design | paper-cutout, editorial-dark |
| ml | sketch, editorial-dark |
| war-story | newsprint |
| commit-story | terminal |
| predict-it, interview | sketch |

Genre defaults guide emphasis; category affinities provide fitting alternatives for rotation. The owner did not specify an exact tie-break algorithm. A proposed resolver should score both, exclude the creator’s last genre/style and net-disliked pairs, then record why it chose the alternative. Do not invent affinities for other categories as if they were owner decisions.

## Full-form glossary for authors

Every reel stores only terms it uses, expands them on first mention and shows the complete final list. This starter reference does not replace per-reel factual review. Pronunciation is a separate lexicon concern.

| Term | Full form / meaning | Spoken guidance |
| --- | --- | --- |
| URL | Uniform Resource Locator | U R L |
| UI | User Interface | U I |
| API | Application Programming Interface | A P I |
| DB | Database | database or D B, consistently |
| SQL | Structured Query Language | follow the lexicon / say override |
| CDN | Content Delivery Network | C D N |
| POP | Point of Presence | pop |
| TLS | Transport Layer Security | T L S |
| HTTP | Hypertext Transfer Protocol | H T T P |
| TCP | Transmission Control Protocol | T C P |
| TTL | Time to Live | T T L |
| AOSP | Android Open Source Project | A O S P |
| HAL | Hardware Abstraction Layer | follow lexicon |
| VINTF | Vendor Interface | define in Android context |
| ML | Machine Learning | M L |
| RLS | Row-Level Security | R L S |
| prefetch | Retrieve data before it is requested | pree-fetch; not an abbreviation |
| optimistic UI | Optimistic User Interface | define immediate UI update before confirmation |

Source requirements: v3 pronunciation/glossary decision and commit/content decisions above. The specific reference expansions are authoring aids, not additional owner feedback. A script’s `say` value changes speech, not the visible full-form requirement.
