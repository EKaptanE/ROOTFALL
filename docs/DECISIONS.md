# ROOTFALL — Decision History

This file records how the game got to its current shape. Each entry is a piece of owner feedback and what was done about it. **Don't undo these without asking the owner.**

## Origins
- The game started as **"PROJECT: ZERO / CES-OS"**, a one-day booth game for a university club event. Players had 75 s, and winners got a free-drink coupon.
- Once the event was over, the owner asked to turn it into a general project. It was renamed **ROOTFALL**, and every event reference was removed: club name, booth, coupon, "talk to staff", real-name entry. Don't bring any of these back.

## Gameplay decisions (oldest first)
1. **Timer and tension.** The timer went down to 75 s. Alerts at 45/30/15 s get stronger each time, so the player feels more and more pressure. These later became the 60/40/20 % thresholds.
2. **Guides are terminal lines.** Puzzle guides used to open as separate boxes or panels. That looked broken and was hard to read, so guides now print as normal terminal lines.
3. **No answer leaks.** Some questions and hints contained the answer. The rule now is that hints explain the method only. Later, answers that just echo the question input (e.g. "1010 → decimal?" accepting `1010`) and answers equal to an operand were removed as well. Automated tests enforce both rules.
4. **Category difficulty.** Number questions were not all hex; they now mix binary, decimal and hex. The hard C/C++ question was "really too hard" and was replaced with fair ones. The code category stays strictly **C/C++**.
5. **Master Key presentation.**
   - Keys are listed one per line as `1: KEY`.
   - The example format is abstract (`ABC-DEF-GHI`), so the player has to build the key themselves.
   - Players kept forgetting the hyphens, so the hyphen rule is repeated in many places: the placeholder, the banner, the hint, and a special "you forgot the hyphens" error.
   - `status` still shows the keys.
6. **Leaderboard reset needs confirmation.** This prevents accidental wipes.
7. **No repeats on retry.** A player who loses must not get the same questions again.
8. **Dramatic failure.** The "talk to staff" line was replaced with a trace-route and lockout sequence.
9. **v7: difficulty chosen at the start.**
   - The old system mixed one easy, one medium and one hard stage in a random order, and printed that order (e.g. "ZOR -> KOLAY -> ORTA"). The owner didn't like the order being visible.
   - Now the player picks KOLAY, ORTA or ZOR at the start. All 3 questions use that difficulty, and the time depends on it (60/75/90).
   - Categories grew from 3 to 6, and each run uses 3 of them. Each difficulty has its own leaderboard.
10. **v7 follow-up: hint → skip.** Some questions were too hard to solve. Two changes followed:
    - The pool grew to 7 questions per cell (126 in total).
    - After a hint, the player may skip for a time cost of 10/15/20 s. The player still gets the key.
    - The old hidden staff `skip` command was removed because it allowed leaderboard cheating.

11. **App: rebuilt as a desktop app (Tauri).** The owner chose a desktop app, with mobile as a far-future maybe. Tauri was picked because the same code can target Android/iOS later and the app stays small. The engine (`src/engine`) is separate from the UI and has its own tests.
12. **App: wrong answers cost 3 s.** Before, a wrong stage answer was free, so any question whose answer is 0 or 1 could be passed by trying both. The owner approved a flat −3 s.
13. **App: timer follows the real clock**, and scores keep one decimal with a full date. The old timer counted ticks, which slow down in a background window; whole-second scores tied too easily.
14. **App: calmer look.** The owner asked for a UI that is easier on the eyes but still hacker-like. Result: softer palette with one teal accent, less glow, short shake, and an `EFEKT: TAM / AZ` toggle. See GAME_SPEC §13.
15. **App: small fixes.** `CB-H3` now shows `???[] buffer;` so `delete` is the exact answer. `clear` on the Master Key screen lists the keys again. Turkish `İ/ı` are accepted as `I` in answers. Enter during the boot text no longer prints an input line.
16. **Content source of truth moved.** `content/rootfall-content.json` is now edited directly. `reference/` is frozen at v7.0 and `export_content.js` refuses to overwrite the JSON without `--force`.

17. **Version numbers restart with the app.** The HTML prototypes were numbered up to v7.0. The desktop app's first public release is **v0.1** (GitHub, for a competition entry); entries above marked "App" describe it.

## Agreed direction (not built yet)
The owner was unsure between "a game that keeps growing" and "a Duolingo-like daily app". The agreed middle path, in this order:
1. **Question generators.** Number systems, logic gates, Caesar/Atbash, chmod and subnet questions can be generated from random values with computed answers, so the pool does not run out. C/C++ and Linux-command questions stay hand-written. The no-leak and no-echo rules apply to generated questions too.
2. **Günlük Sızma (daily run).** One run per day, built from the date so everyone gets the same questions and it works offline; one attempt per day.
3. **Streak and per-category progress** (solved count, accuracy). Free play and its leaderboards stay as they are.

## Owner's working style
- Writes in Turkish and expects replies in Turkish.
- Likes short plans with clear defaults, then implementation after approval.
- Tests by playing the game. Likes concise change summaries.

## Ideas mentioned but not done
- Remembering question history across browser sessions (the reference only remembers the previous run in memory).
- More categories (e.g. SQL, regex, Big-O), suggested during v7 planning; the owner accepted the 6 categories for now.
