# CodeInsta — Design

## Intent
Pranav wants to replace Instagram doom-scrolling with a private, Instagram-like reel feed that teaches systems topics he needs for his career: AOSP/Android internals, operating systems, compilers, distributed systems, and similar (networking, databases, linkers, kernels, virtualization).

Two AI "creator accounts" post the reels: **Claude** (made by Claude Code) and **GPT** (made by Codex). The feed should feel like scrolling reels, but every reel teaches something real. Likes, notes and questions drive what gets posted next.

## Success
- He opens the app on his phone instead of Instagram, and it feels like reels: full-screen, swipe, autoplay.
- Each reel opens with a hook question, for example "Do you know how Android builds vendor images?", and then explains it in about 30–60s with a simple animation.
- Liking a reel makes follow-ups on that thread appear. Asking a question gets an answer, as a DM or as a new reel.
- Each creator keeps posting on a schedule, knows what it has already covered, and does not repeat itself.

## Non-goals / anti-goals
- Not public, not multi-user, not social. A single allowlisted user.
- The app itself never calls an LLM, and the server holds no OpenAI or Anthropic keys. All content comes from the scheduled agents.
- No real video rendering (mp4) in v1. Reels are animation scripts played by the client.
- **Anti-goal:** shallow, wrong, or click-bait content. It must be technically accurate, at roughly a senior-engineer-interview level, and name real file paths, tools and commands where relevant (e.g. `build/make/core/Makefile`, `soong`, `vendor.img`).
- **Anti-goal:** an infinite feed with no learning trail. Series and follow-ups must link together.

## Decided stack (Claude's call; the user delegated it)
- **Next.js 15 (App Router, TypeScript, Tailwind)**, deployed on **Vercel**.
- **Supabase**: Postgres plus Auth (Google provider). Server-side access uses the service-role key in API routes. Use `@supabase/ssr` for the session.
- **Installable PWA**: manifest, icons, minimal service worker (app-shell cache), for iOS "Add to Home Screen" and Android install.
- **Animation**: React and `framer-motion`, rendering a JSON reel script. Optional voiceover through the browser Web Speech API (free, off by default, toggled in the player).
- **Validation**: `zod` schema shared by the API, the CLI and the seed loader.

## Access control
- Google sign-in through Supabase. Only emails in the env `ALLOWED_EMAILS` (comma-separated) get in. Everyone else sees "not invited".
- Agent API: bearer tokens `CLAUDE_AGENT_TOKEN` and `GPT_AGENT_TOKEN` (env). The token identifies the creator, and an agent can only post as itself.

## Reel script format (v1) — the contract between agents and the player
```jsonc
{
  "version": 1,
  "title": "How Android builds vendor.img",
  "hook": "Ever wondered how your phone's vendor partition gets built?",
  "topic": "aosp/build/vendor-image",          // slash path, the canonical topic id
  "tags": ["aosp", "build", "soong"],
  "level": "beginner" | "intermediate" | "advanced",
  "series": "aosp-build-system",               // optional
  "series_index": 3,                            // optional
  "scenes": [
    {
      "duration_ms": 6000,
      "caption": "Short on-screen text (≤ 120 chars)",
      "narration": "Optional longer voiceover text",
      "elements": [
        // x,y,w,h are percentages of a 9:16 stage; `at` = ms offset within the scene
        { "id": "a", "type": "title", "text": "...", "x": 10, "y": 10, "at": 0, "enter": "fade" },
        { "id": "b", "type": "box",   "text": "Soong", "x": 10, "y": 40, "w": 35, "h": 10, "color": "blue", "at": 500, "enter": "pop" },
        { "id": "c", "type": "arrow", "from": "b", "to": "d", "label": "Android.bp", "at": 1200, "enter": "draw" },
        { "id": "d", "type": "box",   "text": "ninja", "x": 55, "y": 40, "w": 35, "h": 10, "at": 1000 },
        { "id": "e", "type": "code",  "lang": "makefile", "text": "PRODUCT_PACKAGES += ...", "x": 5, "y": 60, "w": 90, "at": 2000, "enter": "slide-up" },
        { "id": "f", "type": "list",  "items": ["step 1", "step 2"], "x": 10, "y": 70, "at": 2500 },
        { "id": "g", "type": "highlight", "target": "b", "at": 3000 }   // pulse an existing element
      ]
    }
  ],
  "takeaway": "One-sentence summary shown at the end",
  "sources": ["https://source.android.com/..."]      // optional
}
```
- Element types: `title, text, box, arrow, code, list, highlight`. Enter animations: `fade, pop, slide-up, draw` (default `fade`). Colors come from a small fixed palette: `blue, green, orange, red, purple, gray`.
- Limits: 3–10 scenes, total 20–90s, at most 8 elements per scene.
- The player auto-adds the hook as scene 0 and the takeaway as a final card.

## Data model (Supabase Postgres)
- `creators(id text pk ['claude','gpt'], display_name, handle, bio, avatar_url)`
- `reels(id uuid pk, creator_id fk, topic text, title, hook, tags text[], level, series, series_index int, parent_reel_id uuid null, answers_feedback_id uuid null, script jsonb, created_at)`
- `likes(user_id uuid, reel_id uuid, created_at, pk(user_id, reel_id))`
- `feedback(id uuid pk, user_id, reel_id, creator_id, kind ['note','question'], wants ['dm','reel'], body, status ['open','answered'], created_at, answered_at)`
- `messages(id uuid pk, creator_id, user_id, feedback_id null, sender ['creator','user'], body_md text, created_at, read_at null)`. These are DM threads, one per creator.
- `agent_runs(id, creator_id, started_at, summary)`. Used to compute "since last run" for the inbox.

## Agent API (Bearer token)
- `GET /api/agent/inbox` returns `{ likes_since_last_run: [{reel_id, topic, title}], open_feedback: [...], unread_user_dms: [...], covered_topics: [{topic, title, series, created_at}] }`, and records an `agent_run`.
- `POST /api/agent/reels` takes `{ script, parent_reel_id?, answers_feedback_id? }`. The body is validated with zod and duplicate `topic` per creator is rejected (409).
- `POST /api/agent/messages` takes `{ body_md, feedback_id? }`. It sends a DM to the user and marks that feedback answered.
- `GET /api/agent/catalog?creator=all` lists every reel's topic, title and series. Agents check the other creator's coverage to avoid duplicating each other.
- CLI wrapper `scripts/agent.ts` (run with `npm run agent -- <cmd>`): `inbox`, `post <file.json>`, `dm <feedback_id> <file.md>`, `catalog`, `validate <file|dir>`. It reads `CODEINSTA_URL` and the token from env.

## App screens
1. **Feed**: vertical snap-scroll of full-screen reels, interleaving both creators, newest and unseen first. Each reel autoplays when in view. Tap pauses, double-tap likes, and a progress bar sits on top. Overlay: creator handle, title, tags, like button, and a "note / ask" button that opens a bottom sheet (text, kind = note|question, wants = DM|reel). There's also a "next in series" chip.
2. **Explore**: browse by topic area (aosp / os / compilers / distributed / …) and by series.
3. **Inbox**: two DM threads (Claude, GPT) rendered as markdown with code blocks. The user can reply, and replies show up in that agent's next inbox.
4. **Profile** (per creator): bio and a grid of reels.
5. **Sign-in** page with Google.

## Seed population
- Each creator writes **100 reels** as JSON files under `content/seed/<creator>/NNN-<slug>.json`, spread across the topic areas in `content/curriculum.md`. Each agent's share is split roughly evenly across areas, with series of 3–6 reels.
- `npm run agent -- validate content/seed/<creator>` must pass. `npm run seed` loads them (idempotent by `creator_id + topic`).
- To keep the voices distinct, Claude and GPT each pick their own topics within an area. The shared curriculum assigns sub-areas to each creator to avoid overlap.

## Scheduled posting (set up after deploy)
- Each agent runs a playbook (`agents/claude/PLAYBOOK.md`, `agents/codex/PLAYBOOK.md`):
  1. Run `inbox`.
  2. Answer open questions (DM or reel, as requested).
  3. Post 1–2 follow-ups for liked threads.
  4. Post 1–2 new-topic reels from the curriculum.
  5. Validate before every post.
- Cadence starts at about 3 runs a day per agent. The schedule mechanism is the user's local or cloud scheduler (Claude Code scheduled tasks / Codex automation), configured after deploy.

## Autonomous collaboration
The Claude Code session orchestrates product decisions and dispatches bounded Codex work through `codex exec`. No user relays are required. Both sessions share this working directory on `main`; do not switch branches or overwrite another owner's files. `COORDINATION.md` is the ownership source of truth. Claude records decisions in `docs/coordination/decisions.md`; each agent reports checks and handoffs in its own status file. Codex owns scaffold/package operations and the shared reel contract. Claude owns the whole curriculum. Stage explicit owned paths only; do not push in this scaffold dispatch.

## Left to the builder
Exact UI styling (dark, Instagram-like), the component breakdown, the RLS details, the service worker strategy, the icons, and the test approach (zod schema unit tests plus an API route test at minimum).

## Accepted calls Claude made after a builder check
1. **Seen state**: add a `views(user_id, reel_id, seen_at)` table. A reel counts as seen after 3s of play. The feed orders unseen first, then newest. Follow-ups are not boosted separately; they show up because the agent posts them, and the feed ranks reels whose `parent_reel_id` you liked first among the unseen.
2. **Answer-by-reel**: `POST /api/agent/reels` with `answers_feedback_id` marks that feedback `answered`, just as a DM does.
3. **Deploy**: the agents provision through the CLI wherever possible (Vercel and Supabase CLIs). The user does the account creation and the Google OAuth client, following a runbook.
4. **Seed**: the 100 reels per creator are in scope. `content/curriculum.md` is written first and is a dependency for both seed tasks.
5. **Topic uniqueness**: unique per creator. Follow-ups and answers use a deeper topic path (e.g. `aosp/build/vendor-image/vintf`).
6. **Duration limits**: the auto-added hook and takeaway cards don't count toward the 20–90s total.

## Contract implementation decisions
The v1 wire format above is unchanged. `src/lib/reel-schema.ts` exports `reelSchema`, `sceneSchema`, `elementSchema`, their inferred TypeScript types, palette/animation enums, `TOPIC_AREAS`, and `validateReel(unknown)`. The helper accepts an already parsed JSON value; JSON syntax parsing is the caller's responsibility. It returns either `{ ok: true, reel }` or `{ ok: false, errors: string[] }`, with field paths in errors.

- All seven element types are a discriminated union. Required properties follow the example; `text` elements use the same position/text fields as titles. `at` is required, nonnegative integer milliseconds, and must be less than scene duration. Omitted `enter` becomes `fade`.
- Positions and optional dimensions are percentages in [0,100]; dimensions must be positive. Boxes require width and height; code width is optional. Color is optional and restricted to the six palette names wherever supplied.
- IDs are nonempty and unique within each scene. Arrow endpoints and highlight targets can point forward in array order but must exist in that same scene. IDs may repeat across scenes.
- Scene durations are positive integer milliseconds. Total authored duration is inclusive 20,000–90,000 ms across 3–10 scenes. Auto-added hook/takeaway cards are excluded. The player chooses their display timing separately.
- Captions are at most 120 JavaScript string units. Topic paths match `/^[a-z0-9-]+(\/[a-z0-9-]+)+$/`. The nine topic areas are navigation taxonomy, not an additional root restriction on valid topic paths.
- Version is exactly 1; level is beginner/intermediate/advanced. Series fields remain independently optional; `series_index`, when present, is a positive integer. Sources, when present, are URL strings. Unknown object fields are rejected to catch script typos rather than silently discard them.

## Implementation and acceptance boundaries
This dispatch supplies the Next.js 15 scaffold, dependency lockfile, shared validator, two example reels, tests, environment template, spec, and coordination handoff. The product screens, authentication, player, PWA cache/icons, deployment and 200 seed reels remain follow-up tasks. The initial page is a scaffold placeholder, not an authenticated product.

The frontend will keep one active player, pause offscreen/background playback, respect reduced motion, provide explicit pause/mute controls and keyboard alternatives, and render captions even when speech is unavailable. Use a 9:16 diagram stage inside the responsive full-screen layout. The app-shell service worker must never cache authenticated API responses or private messages. Tokens and service-role credentials remain server-only; only the two NEXT_PUBLIC Supabase settings reach browser code.

Acceptance for this dispatch: unit tests load both real JSON examples, exercise all element variants and contract boundaries, and reject invalid references, duplicate IDs, invalid enums, durations, scene/element counts, captions and topics. `npm test`, `npm run lint`, and `npm run build` must pass without Supabase credentials. API route tests and live auth/RLS verification belong to Claude's implementation and integration follow-up. Curriculum ownership and uniqueness are coordinated before seed generation; example reels are not part of the 100-per-creator quota.
