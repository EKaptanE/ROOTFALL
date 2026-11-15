# Changelog

## v0.2 — 2026-11-15

### Added
- **Main menu.** The app now opens on a menu: start a run, daily run (placeholder, coming later), leaderboard, how to play, settings and exit. It works with the keyboard (↑↓, Enter, 1 to 6, Esc).
- **Writing animation.** Questions, key grants, the Master Key screen and the lockout screen are written out line by line. Enter finishes the writing at once.
- **`menu` command** and an "ANA MENÜ" button on the victory and lockout screens.
- **Remembered code name.** The last operator name is prefilled at the name prompt.
- **Exit item** in the menu that closes the app.

### Changed
- **The clock stops while the game writes new text.** The countdown starts only when the first question is fully on screen, and held time does not count toward the score. Output of commands you type (`help`, `status`, `clear`, `hint`) and wrong-answer feedback do not stop the clock.
- **One skip per run.** Skipping still requires a hint first and still costs 10/15/20 seconds.
- **Leaderboard ranking.** Runs without a skip rank above runs with a skip, whatever the time. Skipped runs are marked `⏭`.
- Sound and effects settings moved from the game header into the menu's settings. The header now shows only a menu button and the timer.
- The boot text types a little slower.

## v0.1 — 2026-11-12

First public release: the game rebuilt as a Tauri desktop app.
- 126 questions in 6 categories, 3 difficulties (60 / 75 / 90 seconds), hint → skip, Master Key finale.
- Local leaderboard per difficulty with times to a tenth of a second.
- Wrong answers cost 3 seconds; the timer follows the real clock.
- Calmer terminal theme with an effects setting; synthesized sound; works fully offline.
