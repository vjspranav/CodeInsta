# Codex status

Updated: 2026-10-31. Dispatch: scaffold, spec, reel contract.

## Completed

- Rewrote the design spec at `docs/superpowers/specs/2026-10-31-codeinsta-design.md` from Claude's notes, accepting all six builder-check calls. Preserved the reel v1 wire format and documented validator semantics and follow-up scope.
- Rewrote `COORDINATION.md` for Claude orchestration via `codex exec`, no user relays, and the accepted ownership split (including Claude owning the entire curriculum).
- Created Next.js **15.5.28**, App Router, TypeScript, `src/`, Tailwind 4, npm and ESLint scaffold. Installed all requested runtime and development dependencies and generated `package-lock.json`.
- Added scripts: dev, build, lint, test, agent, seed (plus start). Agent and seed script implementations remain Claude-owned.
- Added `src/lib/reel-schema.ts`: Zod discriminated union for seven element types; scene-local reference/ID checks; all requested count, duration, caption, topic and enum limits; inferred Reel/ReelInput/ReelScene/ReelElement types; `TOPIC_AREAS`; and `validateReel(unknown)` returning the requested tagged result.
- Added two valid example reels (virtual address spaces and compiler IR) and 40 contract tests that load the JSON files.
- Added `.env.example` with empty values for exactly the seven requested names, `.gitignore` with `.env*` ignored except that example, and a setup README.

## Decisions

- The initial page is a minimal CodeInsta placeholder. Full frontend/player, auth and PWA behavior remain later tasks; no feature-completion claim is implied by this scaffold.
- Use system fonts to avoid a build-time remote font dependency. Build and tests require no Supabase credentials.
- Validator input is parsed JSON, not a JSON string. Unknown fields are rejected. Enter defaults to fade; offsets are integer milliseconds before scene end; coordinates are percentages. See spec for the full interpretation.
- Hook/takeaway cards are excluded from authored duration. Topics retain the requested regex; the navigation taxonomy does not restrict topic roots. Series fields stay independently optional.
- No separate earlier design artifact was available in this checkout; Claude's notes and the dispatch are the design baseline.
- npm cache was redirected to `/private/tmp/codeinsta-npm-cache`. `create-next-app@15` could not write its macOS preferences outside the sandbox, so the scaffold was assembled from its downloaded official App Router/Tailwind/TypeScript template files, with project metadata/page customized.

## Checks actually run

- `npm install`: succeeded, 464 packages installed.
- Red test run: initially missing schema module; then a permissive skeleton produced **34 expected failures / 6 passes**, demonstrating rejection/default tests fail without enforcement.
- `npm test`: **40 passed**, including both disk fixtures, all element variants, forward references, duration boundaries and invalid inputs. Reran after correcting the empty-array test parameterization: 40 passed.
- `npm run lint`: passed; reran after the test correction and passed.
- `npm run build`: passed, static `/` and `/_not-found` generated, TypeScript and integrated lint passed.
- `git check-ignore`: `.env`, `.env.local`, `.env.production` ignored; `.env.example` is not ignored (expected exit 1 for that last check).
- `npm audit --json`: **16 vulnerabilities (15 moderate, 1 high)**. Includes Next.js/PostCSS and ESLint dependency chains. Audit suggests a Next.js 16 major upgrade for Next/PostCSS and incompatible versions for some lint dependencies. Left the explicit Next.js 15 requirement intact; this requires an orchestrator dependency/security decision before deployment.

## Failures / limitations

Initial CLI attempts failed on sandbox writes to the default npm cache and create-next-app preferences; the direct-template fallback resolved scaffolding. No outstanding build, lint or test failure. Dependency audit findings remain as above. No live Supabase/API/auth testing is possible or claimed in this dispatch. No Claude-owned file was edited or staged; concurrent Claude work may appear untracked.

## Next

Claude can consume `reelSchema`, `Reel`, `ReelInput` and `validateReel` now for migrations, routes, CLI and seed loading. Write the shared curriculum before either creator's 100 seed reels. Next Codex dispatch can build auth/frontend/player/PWA and GPT seeds/playbook within ownership. Review dependency audit findings before deploying. This dispatch stages only explicit Codex paths and makes the requested first commit; no push.
