# ROOTFALL — Agent Briefing

You are taking over **ROOTFALL**, a hacker-terminal puzzle game. It started as a single offline HTML file (`reference/index.html`, v7.0) and is now a **Tauri desktop app** (v0.1): a TypeScript engine in `src/engine`, a thin UI in `src/`, and a Rust shell in `src-tauri`. Keep the gameplay that has been tuned through many iterations with the owner.

Read these in order:
1. `docs/GAME_SPEC.md` — the complete, platform-neutral behavior spec. This is the source of truth.
2. `docs/DECISIONS.md` — why things are the way they are (owner feedback history). Don't re-introduce anything listed there as removed.
3. `content/rootfall-content.json` — all 126 questions, difficulty times, skip costs, penalties and key words. This file is the source of truth; edit it directly. Load content from data; do not hard-code it.
4. `src/engine/game.ts` — the state machine. `tests/` is the regression suite.
5. `reference/index.html` — the frozen v7.0 original, for comparison only.

## Working with the owner
- The owner writes in **Turkish**. Reply in Turkish. **All in-game text is Turkish** (keep the existing strings; English hacker flavor lines like `ROOT ACCESS GRANTED` are intentional).
- The owner likes a short plan first and then implementation once they approve ("planla, iyiyse ilerleyelim"). For big changes, propose a short plan with sensible defaults and ask only the decisions that matter.
- The owner tests by playing. When you report, say what changed in a few bullet points and what they should try.

## Non-negotiable rules (from owner feedback)
- **Never leak answers.** No question text, hint or guide may contain the answer, and no question may accept its own input echoed back as the answer (e.g. "0x1A = ?" must not accept `0x1A`). `tests/content.test.ts` enforces both rules.
- **Hints explain the method, not the result.**
- **Never show the difficulty order or which category is "hard"** on screen. The player picks one difficulty and all 3 questions use it.
- **Players build the Master Key themselves:** show the keys one per line (`1: [KEY]`), give only the abstract format `1.ANAHTAR-2.ANAHTAR-3.ANAHTAR (Örn: ABC-DEF-GHI)`, and never show the real joined answer.
- **Destructive actions need confirmation** (e.g. clearing the leaderboard).
- **Retries must not repeat** the previous run's questions or category set.
- Everything that worked offline should still work offline (no backend required for core play).

## Architecture
- `src/engine/` is pure logic: no DOM, no timers of its own. It receives a clock (`now`), randomness (`rng`), a key-value store and an `emit` callback, and it emits plain data (`Out` in `types.ts`): lines with semantic colors, sounds, buttons, the victory card. **Game rules and player-facing text live here.**
- `src/main.ts` renders that output, plays sounds (`src/ui/audio.ts`) and feeds input back. `src/styles.css` holds the theme. No game rules in the UI.
- `src-tauri/` only opens the window. The game works in a plain browser too (`npm run dev`), which is the fastest way to try changes.
- Mobile is a far-future maybe; `src-tauri/src/lib.rs` already uses the mobile entry point so it stays possible.

## Commands
```
npm install          # once
npm test             # engine + content rules (vitest)
npm run dev          # play in a browser at http://localhost:1420
npm run tauri dev    # run the desktop app (needs Rust and, on Windows, Microsoft C++ Build Tools)
npm run tauri build  # build the installer
python3 reference/test_terminal.py   # checks of the frozen v7 reference
```
Run `npm test` after every change to the engine or the content.

## Next steps
See "Agreed direction" in `docs/DECISIONS.md`: question generators, then the daily run, then streak and progress.
