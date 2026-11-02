# Maestro flows and the ship gate

Flows select by test id only (`apps/mobile/src/testids.ts`); the only coordinates are swipes.
Order is set in `config.yaml`: sign-in, swipe-10, like, dislike-undo, ask, widget-deeplink. Later flows reuse the session that `sign-in` creates.

| Flow | Proves |
| --- | --- |
| sign-in | email sign-in of the test member lands on the feed (`tab-feed`) |
| swipe-10 | ten swipes land on `reel-page-1`..`reel-page-10`, no `reel-retry` |
| like | double tap likes (`reel-like` selected), the control unlikes |
| dislike-undo | long press shows `reel-undo`, Undo clears the toast and the mark |
| ask | `reel-ask` sheet: type into `ask-input`, `ask-send`, sheet closes |
| widget-deeplink | `codeinsta://reel/${REEL_ID}` opens the feed (`reel-page-0`) |

## Setup (owner)

1. Pick an inbox you control (never an owner address) and set `MAESTRO_EMAIL=` in `.env.local`.
2. `set -a; . ./.env.local; set +a; npx tsx scripts/mobile-test-user.ts create` creates or reuses the member and writes `MAESTRO_PASSWORD` to `.env.local`. It refuses owner addresses and never prints the password.
3. `scripts/mobile-test-cleanup.ts` removes the member's feedback, messages, likes, dislikes, views and topic requests (the gate runs it after every run). The ask flow sends a real `[maestro-test]` question, so cleanup matters.

## Run

`bash apps/mobile/.maestro/run-gate.sh android` (or `ios`). It needs at least 12 live reels (else "waiting for the library (RUNBOOK B1)"), boots the AVD or simulator named `codeinsta-e2e` (or uses `ANDROID_SERIAL`), installs the latest release APK (or the newest simulator `.app`), runs the flows, cleans up, and on success writes `last-pass-<platform>.json` (gitignored) with `passedAt`, `buildSha256` and `gitRev`. `scripts/mobile/ship-android.sh` reads that file through `apps/mobile/scripts/ship-gate.ts`.

Single flow: `set -a; . ./.env.local; set +a; maestro test -e REEL_ID=<uuid> apps/mobile/.maestro/like.yaml`.
