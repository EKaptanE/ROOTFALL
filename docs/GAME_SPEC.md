# ROOTFALL — Game Specification (v0.1)

This spec describes the game independently of any platform. The app in `src/` implements it. `reference/index.html` is the older v7.0 and differs where this spec says **(app)**. Player-facing text is **Turkish**. The quoted strings below come from the reference; reuse them.

---

## 1. Concept
The player is a hacker in a terminal. They pick a difficulty, then solve **3 questions** ("security layers") against a countdown. Each solved question gives a **key word**. At the end the player types the **Master Key** `KEY1-KEY2-KEY3` to win. The fastest times go on a local leaderboard, with one board per difficulty.

## 2. Flow / state machine
```
INIT_TYPING ─► AWAIT_NAME ─► AWAIT_DIFFICULTY ─► STAGE (×3) ─► MASTER_KEY ─► VICTORY
                                                   │              │
                                                   └──── time hits 0 ────► FAILED
```
| State | What happens | Prompt label |
|---|---|---|
| INIT_TYPING | Boot text types out like a typewriter. Pressing Enter skips the animation; that input is not echoed or used. | `AUTH:IDENT >` |
| AWAIT_NAME | The player enters a code name of at least 2 characters. | `AUTH:IDENT >` |
| AWAIT_DIFFICULTY | Shows `1 KOLAY (60 s) / 2 ORTA (75 s) / 3 ZOR (90 s)`. Accepted inputs: `1/2/3`, `kolay/orta/zor`, `easy/medium/hard`, `e/m/h`. Any other input shows an error and the menu stays. | `ZORLUK >` |
| STAGE i (1..3) | Shows the question. A correct answer gives key i and moves to the next stage. | `STAGE i >` |
| MASTER_KEY | Shows the keys. The player types the master key. | `MASTER KEY >` (red) |
| VICTORY | Shows the certificate card and that difficulty's Top 5. Buttons: new game and clear leaderboard. | `SUCCESS >` |
| FAILED | Shows the dramatic lockout screen and a retry button. | `LOCKOUT >` (red) |

The timer starts when the player picks a difficulty. Before that the badge shows `[--:--]`.

Boot lines:
`[!] ROOTFALL MAINFRAME LOCKOUT DETECTED.` / `[!] LEVEL 0 CLEARANCE RESTRICTION ACTIVE.` / `3 güvenlik katmanını kır, Master Key'i gir, sistemi ele geçir.` / `OPERATÖR KOD ADINI GİR:`

## 3. Difficulty & time
| Difficulty | Total time | Skip cost | Alerts (seconds left) |
|---|---|---|---|
| KOLAY | 60 | 10 | 36 / 24 / 12 |
| ORTA | 75 | 15 | 45 / 30 / 15 |
| ZOR | 90 | 20 | 54 / 36 / 18 |

- Alerts fire at **60%, 40% and 20%** of total time left (rounded). Each one gets stronger:
  - 1st: amber text and a warning sound.
  - 2nd: pink text, warning sound and screen shake.
  - 3rd: red "KIRMIZI ALARM", warning sound and screen shake.
- During the last 20%, a heartbeat tick plays every second and the timer badge pulses red.
- **(app) The timer follows the real clock.** The run has a deadline; time left is `deadline − now`, so a window in the background loses no accuracy. Penalties move the deadline. The badge shows whole seconds, rounded up.
- **(app)** If a penalty jumps past one or more alert thresholds, only the strongest newly reached alert fires, once.
- The difficulty order or any "hard/easy" label per question is **never shown**. Only the chosen difficulty appears in `status` and on the victory card.

## 4. Building a run
1. Pick **3 distinct categories** at random from the 6. The set (order ignored) must differ from the previous run's set.
2. For each category, pick a random question of the chosen difficulty, skipping the previous run's question IDs. If none are left, use the whole pool.
3. Pick **3 distinct key words** at random from `keyWords`. Keys are independent of the questions.

## 5. Questions
Content is in `content/rootfall-content.json`: 6 categories × 3 difficulties × 7 questions = **126 questions**. Each question has:
- `text`: the task
- `answers`: accepted answers
- `hint`: method only
- optional `guide`: reference lines shown before the task. The first line is a header (amber); the rest are blue.
- optional `lang` and `code`: a C/C++ snippet shown in a code block.

Categories: 🔐 KRİPTANALİZ (Atbash / mirror / Caesar), 🔢 SAYI SİSTEMLERİ, 🐛 C / C++ HATA AVI, 🖥️ ÇIKTI TAHMİNİ, ⚡ MANTIK KAPILARI, 🐧 LINUX VE AĞ.

**Answer check:** normalize both sides by uppercasing and removing whitespace and the quote characters `'` `"` `` ` ``. The answer is correct if it equals any accepted answer.
- Right answer: success sound, `[+] DOĞRU! <KATEGORİ> katmanı aşıldı.`, then `[+] i. ANAHTAR ALINDI: [KEY]`, then the next stage.
- Wrong answer **(app)**: error buzz, **−3 s**, and `[-] HATALI: "<input>". (-3 SANİYE) Tekrar dene veya 'hint' yaz.` If time reaches 0, the game goes to FAILED. Commands (`hint`, `status`, ...) cost nothing.
- **(app)** Turkish `İ`/`ı` count as `I`, so `PİNG` equals `PING`. The same folding applies to commands and the master key.

Stage screen layout: a `====` banner with `[*] AŞAMA i/3: <icon> <TITLE>`, then the guide lines, then the code block, then `Görev: <text>`, then a dim line with the wrong-answer cost and saying hint and skip are available.

## 6. Hint → Skip
- `hint` prints `💡 İPUCU: <hint>`. The **first** hint on a question also shows a skip option: text plus a **⏭ [SORUYU ATLA // -X SN]** button.
- `skip` (or the button) only works after `hint` has been used on the **current** question. Otherwise it shows `ATLAMA KİLİTLİ: Önce hint ...` and an error buzz.
- A skip costs `skipCost` seconds, plays the penalty siren and shows `[⏭] SORU ATLANDI: -X SANİYE BYPASS BEDELİ ÖDENDİ.`. The player **still gets the key** and moves on. If time reaches 0, the game goes to FAILED.
- The lock resets on every new question. A skip button left over from an earlier question must do nothing.
- Count the skips and show `ATLANAN SORU: n / 3` on the victory card.

## 7. Master Key
- After stage 3: `[!] TÜM GÜVENLİK DUVARLARI AŞILDI // SON KİLİT DEVREDE` banner, the instructions, `🔑 TOPLANAN ANAHTARLAR:`, then `  1: [K1]`, `  2: [K2]`, `  3: [K3]` on separate lines, then `👉 GİRİŞ FORMATI: 1.ANAHTAR-2.ANAHTAR-3.ANAHTAR (Örn: ABC-DEF-GHI)` and the −5 s warning.
- **Never show the real joined key.**
- Normalize the input: uppercase it and remove spaces and square brackets. It must equal `K1-K2-K3`.
- Wrong input: **−5 s**, siren, error buzz and screen shake, plus a format reminder. If the keys were right but the hyphens were missing, show `FORMAT HATASI: ... TİRE (-) koymayı unuttunuz!`. If time reaches 0, the game goes to FAILED.

## 8. Victory
- Fanfare and a green screen flash.
- Certificate card: `ROOT ACCESS GRANTED // LEVEL 4 CLEARANCE`, operator, master key (`K1-K2-K3-<4 random hex>`), difficulty, skipped count, `TAMAMLANMA SÜRESİ` (total − remaining, **(app)** with one decimal and a Turkish comma, e.g. `23,4 Saniye`), and `TAM ERİŞİM ONAYLANDI`.
- Message: `🏆 Derecen yerel liderlik tablosuna kaydedildi.` / `📸 Ekran görüntüsünü al, süreni paylaş ve arkadaşlarını <total> SANİYE içinde rekorunu kırmaya davet et!`
- Save the score, then show the Top 5 for this difficulty.

## 9. Failure (time out)
Error buzz and a red flash, then these lines:
- `[!] SÜRE DOLDU. SİSTEM KİLİTLENDİ. // BAĞLANTI KESİLDİ!`
- `[☠] KRİTİK SİSTEM İHLALİ: ...`
- `[!] TRACE ROUTE AKTİF: IP adresin ve donanım imzan loglandı.`
- memory sealed / access terminated lines
- `Dijital izin ağdan silindi... Sistem seni dışarı fırlattı.`
- `Tekrar sızacak cesaretin ve bilgin varsa sistemi yeniden başlat!`

A `⚡ [YENİDEN DENE // SİSTEME TEKRAR SIZ]` button or `retry` restarts with **new** questions.

## 10. Leaderboard
- Stored locally under key `rootfall_lb` as an array of `{ name, timeUsed, key, diff, date }`. Keep at most 150 entries. Entries without `diff` count as ORTA.
- **(app)** `timeUsed` is seconds with one decimal; `date` is the full local date and time (`12.11.2026 21:57`).
- One board per difficulty, sorted by `timeUsed` ascending. Show the Top 5 with 🥇🥈🥉. Empty board: `Henüz kayıtlı bir rekor yok. İlk kıran sen ol!`
- Clearing is available from a header button, the victory screen and `reset-board`. It **always asks for confirmation** first: `Liderlik tablosundaki tüm skorlar kalıcı olarak silinecektir. Emin misiniz?` **(app)** The confirmation is an in-app dialog (`[VAZGEÇ]` / `[EVET, SİL]`, Esc cancels), not a browser popup.

## 11. Commands (available in every state unless noted)
| Command | Effect |
|---|---|
| `help` | Lists the commands |
| `hint` | Shows the hint; unlocks skip (STAGE). In MASTER_KEY it repeats the format help. |
| `skip` | Skips the question after a hint (see §6) |
| `status` | Operator, time left, stage `i/3`, difficulty, keys collected (`1: [..] \| 2: [..] \| 3: [..]` or `BEKLEMEDE`) |
| `leaderboard` / `top` / `skor` | All three boards |
| `reset-board` | Clears the leaderboard, with confirmation |
| `clear` / `cls` | Clears the screen and re-renders the current question (hint/skip state is kept). **(app)** In MASTER_KEY it lists the keys and the format again. |
| `reset` / `restart` / `retry` | New game |

Input history: ArrowUp and ArrowDown cycle through previous inputs. A click anywhere (except on a button) focuses the input.

## 12. Audio (synthesized, no audio files)
The reference generates every sound with the Web Audio API. Match the feel in the new stack; small sample files are acceptable if the platform needs them.
- **Key blip:** short square wave on every Enter.
- **Error buzz:** low sawtooth with screen shake.
- **Penalty siren:** sweeping alarm with screen shake.
- **Stage clear:** rising arpeggio.
- **Victory fanfare:** a longer major arpeggio.
- **Timer warning:** two-tone 660→880 Hz sonar.
- **Tick pulse:** heartbeat during the last 20%.

A header toggle switches sound on and off (`🔊 SES: AÇIK` / `🔇 SES: KAPALI`). Audio starts on the first user gesture. **(app)** The choice is remembered (`rootfall_settings`).

## 13. Visual style (app)
A calm dark terminal in a monospace font (JetBrains Mono, bundled). It should read as a hacker terminal without tiring the eyes: one accent color, amber as the second voice, red only for errors and alarms.

| Token | Value | Used for |
|---|---|---|
| background | `#0c1014` (surface `#11171d`) | |
| accent (soft teal) | `#5fd3bc` | titles, prompt, timer |
| info (blue) | `#84b4e6` | guides, help |
| text | `#cbd3db` (dim `#7d8997`) | |
| danger (soft red) | `#f0707a` | errors, master key, ZOR |
| alert (rose) | `#ee92b4` | the task text, 2nd alert, skips |
| warn (amber) | `#e3b866` | keys, hints, ORTA |
| ok (green) | `#7fd694` | success, KOLAY |

The engine names colors by meaning (`accent`, `info`, `ok`, ...); only `src/styles.css` knows the values.

- Header: ⚡ `ROOTFALL v0.1`, a `BREACH UNIT` tag, the sound toggle, the effects toggle, the clear-leaderboard button and the timer badge `[mm:ss]`.
- Banners use drawn rules (double line for stage and alarm banners, dashed for separators) instead of rows of `=` characters, so nothing wraps on narrow windows.
- Code snippets, the victory card and the leaderboards are quiet boxes on the surface color.
- **Effects toggle** (`✨ EFEKT: TAM` / `◌ EFEKT: AZ`, remembered): TAM adds a soft text glow, faint scanlines and vignette, a short screen shake on errors and penalties, a green flash on victory and a red flash on failure. AZ turns all of that off. It starts as AZ when the system asks for reduced motion.
- Layout must work on a phone-sized window.
