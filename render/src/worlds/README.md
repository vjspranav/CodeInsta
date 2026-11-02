# Worlds

A world is a full-frame scene that looks like the real thing: a terminal session, a debugger, a browser
network tab, an incident channel with a live dashboard. Decisions.md (2026-11-02, "Reels must not look the
same") asks every new reel to pick one primary world that matches its scenario and keep it on screen for at
least half the runtime. The whiteboard is still there, but it is a supporting scene, not the reel.

A script puts a world on screen with `world.set` and drives it with the world's own prefixed actions:

```json
{"do": "world.set", "world": "term.session", "cwd": "~/shop"},
{"do": "term.run", "cmd": "git push origin main", "out": [" ! [rejected]  main -> main (fetch first)"], "exit": 1}
```

and declares the primary world at the top level, which opts the script into the variety gate:

```json
{"version": 3, "format": "story", "world": "term.session", ...}
```

## How the pieces fit

| Piece | File | What it does with worlds |
| --- | --- | --- |
| Contract | `types.ts` | `WorldModule`: id, prefixed actions, validation, reducer, tokens, view, signature actions |
| Registry | `index.ts` | `WORLDS` list, lookups, built-in phone / db pseudo-worlds, signature test, registry checks |
| Schema | `../schema.ts` | adds every world's action kinds, runs each world's `validate`, checks `world.set` order and the top-level `world` |
| Timeline | `../timeline.ts` | `world.set` opens a scene with the `world` layout; world actions feed the world's instance (`tl.worlds`) |
| Layout | `../layout.ts` | the `world` template: the world fills `CONTENT` (clear of every overlay zone); board items get a strip below |
| Sync | `../sync.ts` | a world's `tokens` say what each action shows and when, so the voice never runs ahead of the screen |
| View | `../components/SceneView.tsx` | draws a world item with its module's `View` and `stateAt` |
| QA gate | `../../verify-lib.ts` | `world.<id>` checks (problems, texts in the DOM, timeline problems) and the variety gate |
| Variety | `../variety.ts` | on-screen share per world, notes-only share, signature moments |

Rules the framework enforces for every world:

- Action kinds start with the world's `prefix` and never clash with built-in kinds or another world.
- A world action needs its world on screen: a `world.set` earlier (a `layout` leaves the world; `clear` keeps it
  and wipes only the board strip).
- `phone.*` and `db.*` actions cannot share a world's scene (a world takes the whole stage).
- State is a pure function of the events and the frame: the view, vitest and the gate all read the same state.
- A world instance keeps its state across scenes: leave the terminal for the whiteboard, come back with
  `world.set`, and the scrollback is still there. `world.set {id: "b"}` starts a second, separate instance.

## Add a world (the exact steps)

1. **Create `render/src/worlds/<name>/`** with three files, following `term-session/`:
   - `model.ts`: pure code only (no React). Export the action kinds, the state type, `stateAt(events, frame)`,
     `validate(action)`, `tokens(action)`, `rows(action)`, `settle(action)`, `texts(state, rect)`,
     `problems(state, rect)` and, if actions can run over each other, `timelineProblems(events)`.
     Precompute anything frame-independent once per events array (a `WeakMap`, see `planSession`).
   - `View.tsx`: a React view that draws the state inside `rect`. Root element: `data-shell` and
     `data-world="<id>"`. Mark text `data-code` (code / terminal, >= 16 px), `data-label` (>= 22 px, contrast
     sampled) or `data-data`. Use only style tokens (`style.tokens`, `style.font`, `style.skin`), never colour
     literals; lift a colour with `legible()` from `../kit.ts` when a token is not 4.5:1 on your background.
     Draw only what is inside `rect` (scrolled-out rows are not rendered, or the probe reports them).
   - `index.ts`: `export const <name> = defineWorld<State>({id, label, prefix, actions, signature, isSignature?,
     validate, stateAt, tokens, rows, settle, texts, problems, timelineProblems, View})`.
2. **Add one line** to `WORLDS` in `render/src/worlds/index.ts`.
3. **Write `render/tests/<name>.test.ts`**: validation (good and bad actions), the reducer at key frames
   (before, during and after each animation), determinism (more events later do not change earlier frames),
   tokens agreeing with `texts` (each token's text is on screen at its offset), layout problems, signature
   predicate, and colour contrast of the view's colours in every style.
4. **Write a demo** `content/lab-v3/worlds/<name>.json` (60-75 s, real facts, `"world": "<id>"`), make silent
   audio and run the gate:

   ```sh
   cd render
   node fixtures/make-audio.mjs ../content/lab-v3/worlds/<name>.json out/<name>
   npx tsx verify.ts ../content/lab-v3/worlds/<name>.json out/<name>/demo.manifest.json --no-stills --out out/<name>/verify
   npx tsx verify.ts ../content/lab-v3/worlds/<name>.json out/<name>/demo.manifest.json --out out/<name>/verify   # stills, look at them
   npx vitest run
   ```

   The silent fixture audio costs no TTS quota. Never voice a demo.

You never edit `schema.ts`, `timeline.ts`, `layout.ts`, `Story.tsx`, `SceneView.tsx` or `verify-lib.ts` to add a
world. If a world needs something the contract does not offer, say so in your report instead of patching them.

## Worked example: term.session

`term-session/model.ts` models a real shell session:

| Action | Props | What the viewer sees |
| --- | --- | --- |
| `world.set` | `cwd?`, `prompt?` (`"{cwd} $"`), `title?` | the terminal window, a prompt with a blinking block cursor |
| `term.run` | `cmd`, `out?` (lines or `{text, tone}`), `exit?`, `running?`, `cwd?`, `wait_ms?`, `line_ms?`, `cps?` | the command typed (20 chars/s), Enter, output streamed one line every 133 ms, the exit status, a new prompt |
| `term.out` | `out`, `line_ms?` | more output from a running command |
| `term.exit` | `code` | the running command ends with this status |
| `term.clear` | | Ctrl-L: screen and highlight cleared |
| `term.highlight` | `match` or `off: true` | rows containing the text get a highlight bar; the view scrolls back to them |

- **Tones** `out`, `err`, `warn`, `ok`, `dim` colour output lines like the real tool does (git's rejected ref is
  red, its hints yellow).
- **Signature moments** (`isSignature`): a non-zero exit (the command's gutter turns red and flashes, the status
  bar shows a red `exit N` pill, the next prompt symbol turns red) and output visibly streaming (3+ lines at
  `line_ms >= 200`).
- **Timing**: every action starts at its own frame. A command typed while the previous one is still printing
  makes that output complete at once, and `timelineProblems` reports it, so `tokens` stay exact.
- **Layout** (`termLayout`): one font size for the whole session (18-24 px, from the longest row), long rows wrap
  at sensible breaks, the window follows the newest row, a highlight scrolls back, a scrollbar shows the
  scrollback.
- **Gate**: `world.term.session` checks the state where each action settles (no unreadable font, no cut tokens,
  the highlight matches a row in view) and that every row, the title and the exit pill are in the rendered DOM.

Demo: `content/lab-v3/worlds/term-session.json`, "Why was my git push rejected?" (66.9 s, real git 2.54 output).

## Planned worlds

`term.session` (done), `debugger`, `browser.network`, `incident`, `netmap`, `memgrid`, `device.boot`, `review`.
See `docs/reels/GENRES.md` for which world suits which genre and category.
