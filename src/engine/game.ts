// ROOTFALL game engine: state machine, clock-based timer, answer checking and commands.
// Pure logic. It talks to the outside only through `emit` (output), `store` (leaderboard),
// `now` (clock) and `rng` (randomness), so it runs in tests without any rendering.

import { checkMasterKey, foldTurkishI, formatClock, formatSeconds, isCorrectAnswer, normalizeCommand } from './answers';
import { formatDate, getLeaderboard, resetLeaderboard, saveScore } from './leaderboard';
import { buildRun, EMPTY_LAST_RUN, type LastRun, type Stage } from './run';
import {
  DIFFICULTIES,
  type BoardView,
  type ButtonAction,
  type Content,
  type Difficulty,
  type KeyValueStore,
  type Line,
  type Out,
  type SoundName,
  type Span,
  type Tone,
} from './types';

export type GameState =
  | 'INIT_TYPING'
  | 'AWAIT_NAME'
  | 'AWAIT_DIFFICULTY'
  | 'STAGE'
  | 'MASTER_KEY'
  | 'VICTORY'
  | 'FAILED';

export const VERSION = '0.1';

export const DIFFICULTY_TONE: Record<Difficulty, Tone> = { KOLAY: 'ok', ORTA: 'warn', ZOR: 'danger' };

const DIFF_ALIASES: Record<string, Difficulty> = {
  '1': 'KOLAY', KOLAY: 'KOLAY', EASY: 'KOLAY', E: 'KOLAY',
  '2': 'ORTA', ORTA: 'ORTA', MEDIUM: 'ORTA', M: 'ORTA',
  '3': 'ZOR', ZOR: 'ZOR', HARD: 'ZOR', H: 'ZOR',
};

const CONFIRM_RESET_TEXT = 'Liderlik tablosundaki tüm skorlar kalıcı olarak silinecektir. Emin misiniz?';
const KEY_FORMAT = '1.ANAHTAR-2.ANAHTAR-3.ANAHTAR';

export interface GameDeps {
  content: Content;
  store: KeyValueStore;
  emit: (out: Out) => void;
  /** Milliseconds; defaults to Date.now. */
  now?: () => number;
  /** 0 <= x < 1; defaults to Math.random. */
  rng?: () => number;
}

const s = (t: string, tone?: Tone, bold = false, glow = false): Span => ({ t, tone, bold, glow });

export class Game {
  private readonly content: Content;
  private readonly store: KeyValueStore;
  private readonly emit: (out: Out) => void;
  private readonly now: () => number;
  private readonly rng: () => number;

  private _state: GameState = 'INIT_TYPING';
  private operatorName = '';
  private _difficulty: Difficulty | null = null;
  private totalMs = 0;
  /** Clock time at which the run fails; null while no timer is running. */
  private deadline: number | null = null;
  /** What the timer badge shows while stopped (null = "--:--"). */
  private frozenMs: number | null = null;
  private alertsFired = 0;
  private lastBeatSecond = -1;
  private _stages: Stage[] = [];
  private stageIndex = 0;
  private _keys: string[] = [];
  private hintUsed = false;
  private skipCount = 0;
  private lastRun: LastRun = EMPTY_LAST_RUN;
  private runId = 0;
  private promptLabel = 'AUTH:IDENT >';
  private confirmPending = false;

  constructor(deps: GameDeps) {
    this.content = deps.content;
    this.store = deps.store;
    this.emit = deps.emit;
    this.now = deps.now ?? Date.now;
    this.rng = deps.rng ?? Math.random;
  }

  // ---- read-only view (UI badge, tests) -------------------------------------------------

  get state(): GameState { return this._state; }
  get difficulty(): Difficulty | null { return this._difficulty; }
  get stages(): readonly Stage[] { return this._stages; }
  get keys(): readonly string[] { return this._keys; }
  get totalSeconds(): number { return this.totalMs / 1000; }

  /** Milliseconds left, or null when no run has started. */
  remainingMs(): number | null {
    if (this.deadline !== null) return Math.max(0, this.deadline - this.now());
    return this.frozenMs;
  }

  /** Whole seconds left as shown on the badge (rounded up), or null. */
  remainingSeconds(): number | null {
    const ms = this.remainingMs();
    return ms === null ? null : Math.ceil(ms / 1000);
  }

  get timerRunning(): boolean { return this.deadline !== null; }

  /** True during the last 20% of a running timer. */
  get urgent(): boolean {
    const sec = this.remainingSeconds();
    return this.deadline !== null && sec !== null && sec > 0 && sec <= this.alertAt(0.2);
  }

  // ---- output helpers -------------------------------------------------------------------

  private line(content: string | Span[], tone?: Tone, opts: { bold?: boolean; glow?: boolean } = {}): void {
    const spans = typeof content === 'string' ? [{ t: content }] : content;
    this.emit({ type: 'line', spans, tone, bold: opts.bold, glow: opts.glow });
  }
  private rule(heavy: boolean, tone: Tone): void { this.emit({ type: 'rule', heavy, tone }); }
  private sound(name: SoundName): void { this.emit({ type: 'sound', name }); }
  private errorBuzz(): void { this.sound('error'); this.emit({ type: 'shake' }); }
  private siren(): void { this.sound('siren'); this.emit({ type: 'shake' }); }
  private setPrompt(label: string, placeholder: string, danger = false): void {
    this.promptLabel = label;
    this.emit({ type: 'prompt', label, danger, placeholder });
  }
  private cfg() { return this.content.difficulties[this._difficulty ?? 'ORTA']; }
  private alertAt(fraction: number): number { return Math.round((this.totalMs / 1000) * fraction); }

  // ---- boot -----------------------------------------------------------------------------

  /** Starts (or restarts) the game at the boot sequence. */
  start(): void {
    this._state = 'INIT_TYPING';
    this.deadline = null;
    this.frozenMs = null;
    this._keys = [];
    this._stages = [];
    this.stageIndex = 0;
    this._difficulty = null;
    this.emit({ type: 'clear' });
    this.setPrompt('AUTH:IDENT >', "Operatör kod adını yazıp Enter'a bas...");
    const bootLines: Line[] = [
      { spans: [s('[!] ROOTFALL MAINFRAME LOCKOUT DETECTED.')], tone: 'danger', bold: true, glow: true },
      { spans: [s('[!] LEVEL 0 CLEARANCE RESTRICTION ACTIVE.')], tone: 'warn', bold: true, glow: true },
      { spans: [s("3 güvenlik katmanını kır, Master Key'i gir, sistemi ele geçir.")], tone: 'accent', bold: true },
      { spans: [s('------------------------------------------------------------')], tone: 'dim' },
      { spans: [s('OPERATÖR KOD ADINI GİR:')], tone: 'text', bold: true, glow: true },
    ];
    this.emit({ type: 'boot', lines: bootLines });
  }

  /** The UI calls this when the boot text has finished typing. */
  bootDone(): void {
    if (this._state === 'INIT_TYPING') this._state = 'AWAIT_NAME';
  }

  // ---- timer ----------------------------------------------------------------------------

  /** Call regularly (the UI does so several times a second). Fires alerts, heartbeat and timeout. */
  tick(): void {
    if (this.deadline === null) return;
    const ms = this.deadline - this.now();
    if (ms <= 0) {
      this.fail();
      return;
    }
    const sec = Math.ceil(ms / 1000);
    const thresholds = [this.alertAt(0.6), this.alertAt(0.4), this.alertAt(0.2)];
    const level = thresholds.filter((t) => sec <= t).length;
    if (level > this.alertsFired) {
      this.alertsFired = level;
      this.sound('warning');
      if (level === 1) {
        this.line(`[!] ZAMAN UYARISI: Kalan süre ${sec} saniye! Hızlanın!`, 'warn', { bold: true, glow: true });
      } else if (level === 2) {
        this.emit({ type: 'shake' });
        this.line(`[!] KRİTİK ZAMAN UYARISI: Son ${sec} saniye! Sistem kilitleniyor!`, 'alert', { bold: true, glow: true });
      } else {
        this.emit({ type: 'shake' });
        this.line(`[!] KIRMIZI ALARM: Son ${sec} saniye! ACİL DURUM!`, 'danger', { bold: true, glow: true });
      }
    }
    if (sec <= thresholds[2] && sec !== this.lastBeatSecond) {
      this.lastBeatSecond = sec;
      this.sound('tick');
    }
  }

  /** Takes time off the clock. Returns true if that ended the run. */
  private penalize(seconds: number): boolean {
    if (this.deadline === null) return false;
    this.deadline -= seconds * 1000;
    this.tick();
    return this._state === 'FAILED';
  }

  // ---- run flow -------------------------------------------------------------------------

  private askDifficulty(): void {
    this._state = 'AWAIT_DIFFICULTY';
    this.setPrompt('ZORLUK >', "1, 2 veya 3 yazıp Enter'a bas...");
    this.line('');
    this.line('[?] ZORLUK SEVİYESİNİ SEÇ:', 'text', { bold: true, glow: true });
    DIFFICULTIES.forEach((name, i) => {
      this.line([
        s('  '),
        s(String(i + 1), 'accent', true),
        s(' - '),
        s(name.padEnd(5, ' '), DIFFICULTY_TONE[name], true),
        s(` (${this.content.difficulties[name].time} saniye)`, 'dim'),
      ]);
    });
    this.line('Her seviyenin kendi liderlik tablosu vardır.', 'dim');
  }

  private startRun(diff: Difficulty): void {
    this._difficulty = diff;
    this.totalMs = this.content.difficulties[diff].time * 1000;
    this.skipCount = 0;
    this._keys = [];
    this.runId++;
    const run = buildRun(this.content, diff, this.lastRun, this.rng);
    this._stages = run.stages;
    this.lastRun = run.last;
    this.line([s('[+] ZORLUK: '), s(diff, DIFFICULTY_TONE[diff], true)], 'info');
    this.line(`[+] ${this.totalMs / 1000} SANİYELİK GERİ SAYIM BAŞLATILDI!`, 'accent', { bold: true, glow: true });
    this.line('[+] KÖK ERİŞİM PROTOKOLÜNE GEÇİLİYOR...', 'dim');
    this.deadline = this.now() + this.totalMs;
    this.frozenMs = null;
    this.alertsFired = 0;
    this.lastBeatSecond = -1;
    this.launchStage(0);
  }

  private launchStage(i: number): void {
    // 'clear' re-renders the same stage and must keep its hint/skip state
    if (this.stageIndex !== i || this._state !== 'STAGE') this.hintUsed = false;
    this.stageIndex = i;
    this._state = 'STAGE';
    const { cat, q } = this._stages[i];
    this.setPrompt(`STAGE ${i + 1} >`, cat.inputPlaceholder);

    this.line('');
    this.rule(true, 'accent');
    this.line(`[*] AŞAMA ${i + 1}/3: ${cat.icon} ${cat.title}`, 'accent', { bold: true, glow: true });
    this.rule(true, 'accent');
    (q.guide ?? []).forEach((text, n) => this.line(text, n === 0 ? 'warn' : 'info', { bold: n === 0 }));
    if (q.code) this.emit({ type: 'code', lang: q.lang ?? 'C', lines: q.code });
    this.line([s('Görev: '), s(q.text, 'alert', true)]);
    this.line(
      `(Yanlış cevap -${this.content.penalties.wrongAnswer} sn. İpucu için 'hint' — ipucundan sonra 'skip' ile -${this.cfg().skipCost} sn karşılığında atlayabilirsin)`,
      'dim',
    );
  }

  private checkStage(input: string): void {
    const stage = this._stages[this.stageIndex];
    if (isCorrectAnswer(input, stage.q.answers)) {
      this.sound('stageClear');
      this.line(`[+] DOĞRU! ${stage.cat.title} katmanı aşıldı.`, 'ok', { bold: true, glow: true });
      this.grantKeyAndAdvance();
      return;
    }
    const cost = this.content.penalties.wrongAnswer;
    this.errorBuzz();
    this.line(`[-] HATALI: "${input}". (-${cost} SANİYE) Tekrar dene veya 'hint' yaz.`, 'danger');
    this.penalize(cost);
  }

  private grantKeyAndAdvance(): void {
    const key = this._stages[this.stageIndex].key;
    this._keys.push(key);
    this.line([s(`[+] ${this.stageIndex + 1}. ANAHTAR ALINDI: `), s(`[${key}]`, 'warn', true, true)], 'text');
    if (this.stageIndex < 2) {
      this.launchStage(this.stageIndex + 1);
    } else {
      this.line(
        `[!] TÜM GÖREVLER BİTTİ! Sistemi açmak için Master Key girmen gerekiyor (Aralarına mutlaka '-' tire koyunuz: ${KEY_FORMAT}).`,
        'accent',
        { bold: true, glow: true },
      );
      this.launchMasterKey();
    }
  }

  private launchMasterKey(): void {
    this._state = 'MASTER_KEY';
    this.setPrompt('MASTER KEY >', `Format: ${KEY_FORMAT} (Aralarına '-' koyup Enter'a bas)`, true);
    this.line('');
    this.rule(true, 'danger');
    this.line('[!] TÜM GÜVENLİK DUVARLARI AŞILDI // SON KİLİT DEVREDE', 'danger', { bold: true, glow: true });
    this.line("[!] KÖK (ROOT) ERİŞİMİ İÇİN MASTER KEY GİRİNİZ! (Aralarına '-' tire koyunuz)", 'danger', { bold: true, glow: true });
    this.rule(true, 'danger');
    this.line('💡 DİKKAT: KİLİT NASIL AÇILIR?', 'warn', { bold: true, glow: true });
    this.line('- 3 aşamayı da tamamladın! Kazandığın anahtarları birleştirip gir.', 'text');
    this.line('- ⚠️ ÖNEMLİ KURAL: Anahtarların arasına mutlaka TİRE (-) koymalısın!', 'alert', { bold: true });
    this.printKeys();
    this.line("- Anahtarları tekrar görmek için 'status' yazabilirsin.", 'dim');
    this.line(`- DİKKAT: Hatalı giriş -${this.content.penalties.masterKey} SANİYE ZAMAN CEZASI VERİR!`, 'danger', { bold: true, glow: true });
    this.rule(false, 'dim');
  }

  /** Keys one per line plus the abstract format. The real joined key is never shown. */
  private printKeys(): void {
    this.line('🔑 TOPLANAN ANAHTARLAR:', 'text', { bold: true });
    this._keys.forEach((k, i) => this.line([s(`  ${i + 1}: `), s(`[${k}]`, 'warn', true, true)]));
    this.line([s('👉 GİRİŞ FORMATI: '), s(KEY_FORMAT, 'ok', true, true), s(' (Örn: ABC-DEF-GHI)', 'dim')]);
  }

  private checkMaster(input: string): void {
    const result = checkMasterKey(input, this._keys);
    if (result === 'ok') {
      this.line('[+] KİMLİK KONTROLÜ BAŞARILI: MASTER KEY KABUL EDİLDİ!', 'ok', { bold: true, glow: true });
      this.victory();
      return;
    }
    if (result === 'missing-hyphens') {
      this.line('[!] FORMAT HATASI: Anahtarların arasına TİRE (-) koymayı unuttunuz!', 'warn', { bold: true, glow: true });
      this.line([s('[!] Doğru format: '), s(KEY_FORMAT, 'text', true), s(' (Örn: ABC-DEF-GHI)')], 'accent', { bold: true });
    }
    const cost = this.content.penalties.masterKey;
    this.siren();
    this.sound('error');
    this.line(`[-] YETKİ REDDEDİLDİ: HATALI MASTER KEY! (-${cost} SANİYE CEZA)`, 'danger', { bold: true, glow: true });
    this.line([s(`Format: ${KEY_FORMAT} (Anahtarları listelemek için `), s('status', 'accent', true), s(' yazabilirsiniz)')], 'dim');
    this.penalize(cost);
  }

  private skipStage(): void {
    if (this._state !== 'STAGE') {
      this.line("[!] 'skip' yalnızca soru aşamalarında kullanılabilir.", 'dim');
      return;
    }
    if (!this.hintUsed) {
      this.errorBuzz();
      this.line([s('[!] ATLAMA KİLİTLİ: Önce '), s('hint', 'accent', true), s(' yazıp ipucunu almalısın.')], 'warn', { bold: true });
      return;
    }
    const cost = this.cfg().skipCost;
    this.skipCount++;
    this.siren();
    this.line(`[⏭] SORU ATLANDI: -${cost} SANİYE BYPASS BEDELİ ÖDENDİ.`, 'alert', { bold: true, glow: true });
    if (this.penalize(cost)) return;
    this.grantKeyAndAdvance();
  }

  private giveHint(): void {
    if (this._state === 'STAGE') {
      this.line(`💡 İPUCU: ${this._stages[this.stageIndex].q.hint}`, 'warn');
      if (!this.hintUsed) {
        this.hintUsed = true;
        this.emit({
          type: 'buttons',
          note: [s('Hâlâ takıldıysan: ', 'dim'), s('skip', 'alert', true), s(' yaz veya', 'dim')],
          buttons: [{
            label: `⏭ [SORUYU ATLA // -${this.cfg().skipCost} SN]`,
            tone: 'danger',
            action: { type: 'skip', run: this.runId, stage: this.stageIndex },
          }],
        });
      }
    } else if (this._state === 'MASTER_KEY') {
      this.line(
        `💡 İPUCU: Kazandığın 3 anahtarı aralarına tire koyarak yazmalısın: ${KEY_FORMAT}. Anahtarları görmek için 'status' komutunu kullanabilirsin!`,
        'warn',
      );
    } else {
      this.line('💡 Henüz aktif bir bulmaca aşamasında değilsiniz.', 'dim');
    }
  }

  // ---- endings --------------------------------------------------------------------------

  private victory(): void {
    const remaining = this.remainingMs() ?? 0;
    this.deadline = null;
    this.frozenMs = remaining;
    this._state = 'VICTORY';
    this.sound('fanfare');
    this.emit({ type: 'flash', tone: 'ok' });

    const diff = this._difficulty!;
    const hex = Math.floor(this.rng() * 0x10000).toString(16).toUpperCase().padStart(4, '0');
    const masterKey = `${this._keys.join('-')}-${hex}`;
    const timeUsed = Math.round((this.totalMs - remaining) / 100) / 10;
    saveScore(this.store, { name: this.operatorName, timeUsed, key: masterKey, diff, date: formatDate(this.now()) });

    this.line('');
    this.emit({
      type: 'card',
      title: '[+] ROOT ACCESS GRANTED // LEVEL 4 CLEARANCE',
      rows: [
        { label: 'YETKİLİ OPERATÖR', value: s(this.operatorName, 'text', true, true) },
        { label: 'GÜVENLİK MASTER KEY', value: s(masterKey, 'danger', true, true) },
        { label: 'ZORLUK', value: s(diff, DIFFICULTY_TONE[diff], true) },
        { label: 'ATLANAN SORU', value: s(`${this.skipCount} / 3`, this.skipCount ? 'alert' : 'ok', true) },
        { label: 'TAMAMLANMA SÜRESİ', value: s(`${formatSeconds(timeUsed)} Saniye`, 'warn', true, true) },
        { label: 'DURUM', value: s('TAM ERİŞİM ONAYLANDI (SYSTEM BREACHED)', 'ok', true, true) },
      ],
      body: [
        { spans: [s('🎉 '), s('TEBRİKLER! GÜVENLİK SİSTEMİNİ ÇÖKERTTİN.', 'warn', true, true)] },
        { spans: [s('🏆 '), s('Derecen yerel liderlik tablosuna kaydedildi.', 'text', true)] },
        {
          spans: [
            s('📸 Ekran görüntüsünü al, süreni paylaş ve arkadaşlarını '),
            s(`${this.totalMs / 1000} SANİYE`, 'ok', true, true),
            s(' içinde rekorunu kırmaya davet et!'),
          ],
        },
      ],
    });
    this.printLeaderboard([diff]);
    this.emit({
      type: 'buttons',
      buttons: [
        { label: '🔄 [YENİ OPERATÖR // TEKRAR OYNA]', tone: 'accent', action: { type: 'new-game' } },
        { label: '🗑️ [TABLOYU SIFIRLA]', tone: 'warn', action: { type: 'reset-board' } },
      ],
    });
    this.setPrompt('SUCCESS >', "Yeni operatör için 'reset' yazın veya yukarıdaki butona tıklayın...");
  }

  private fail(): void {
    this.deadline = null;
    this.frozenMs = 0;
    this._state = 'FAILED';
    this.errorBuzz();
    this.emit({ type: 'flash', tone: 'danger' });

    this.line('');
    this.rule(true, 'danger');
    this.line('[!] SÜRE DOLDU. SİSTEM KİLİTLENDİ. // BAĞLANTI KESİLDİ!', 'danger', { bold: true, glow: true });
    this.rule(true, 'danger');
    this.line('[☠] KRİTİK SİSTEM İHLALİ: Savunma algoritmaları sızıntıyı tespit etti!', 'danger', { bold: true, glow: true });
    this.line('[!] TRACE ROUTE AKTİF: IP adresin ve donanım imzan loglandı.', 'alert', { bold: true });
    this.line('[-] Çekirdek bellek mühürlendi, tüm geçici oturum anahtarları imha edildi.', 'dim');
    this.line('[-] Savunma duvarı terminal erişimini sonlandırdı: KÖK KORUMASI AŞILAMADI.', 'dim');
    this.line('');
    this.line([s('Dijital izin ağdan silindi...', 'warn', true, true), s(' Sistem seni dışarı fırlattı.', 'text')]);
    this.line('Tekrar sızacak cesaretin ve bilgin varsa sistemi yeniden başlat!', 'accent', { bold: true });
    this.rule(false, 'dim');
    this.emit({
      type: 'buttons',
      buttons: [{ label: '⚡ [YENİDEN DENE // SİSTEME TEKRAR SIZ]', tone: 'danger', action: { type: 'new-game' } }],
    });
    this.setPrompt('LOCKOUT >', "Sisteme tekrar sızmak için 'retry' yazınız veya butona tıklayınız...", true);
  }

  // ---- leaderboard ----------------------------------------------------------------------

  private printLeaderboard(diffs: readonly Difficulty[]): void {
    const boards: BoardView[] = diffs.map((diff) => ({
      diff,
      time: this.content.difficulties[diff].time,
      tone: DIFFICULTY_TONE[diff],
      entries: getLeaderboard(this.store, diff).slice(0, 5),
    }));
    this.emit({ type: 'leaderboard', boards });
  }

  /** Asks for confirmation; nothing is deleted until resolveConfirm(true). */
  requestBoardReset(): void {
    this.confirmPending = true;
    this.emit({ type: 'confirm', message: CONFIRM_RESET_TEXT });
  }

  resolveConfirm(yes: boolean): void {
    if (!this.confirmPending) return;
    this.confirmPending = false;
    if (yes) {
      resetLeaderboard(this.store);
      this.emit({ type: 'board-reset' });
      this.line('[!] LİDERLİK TABLOSU BAŞARIYLA SIFIRLANDI.', 'ok', { bold: true, glow: true });
    } else {
      this.line('[*] Liderlik tablosu sıfırlama işlemi iptal edildi.', 'dim');
    }
  }

  // ---- input ----------------------------------------------------------------------------

  /** Button presses from the UI. */
  action(a: ButtonAction): void {
    if (a.type === 'skip') {
      // a skip button left over from an earlier question or run does nothing
      if (this._state === 'STAGE' && a.run === this.runId && a.stage === this.stageIndex) this.handleInput('skip');
    } else if (a.type === 'new-game') {
      this.start();
    } else {
      this.requestBoardReset();
    }
  }

  handleInput(rawInput: string): void {
    const input = rawInput.trim();
    if (!input) return;

    this.sound('key');

    // Enter during the boot text only finishes the animation; the input is not used.
    if (this._state === 'INIT_TYPING') {
      this.emit({ type: 'boot-skip' });
      this.bootDone();
      return;
    }

    this.line([s(this.promptLabel, 'accent', true), s(` ${input}`, 'text')]);

    const lower = normalizeCommand(input);

    if (lower === 'clear' || lower === 'cls') {
      this.emit({ type: 'clear' });
      this.line(`[ROOTFALL v${VERSION} // EKRAN TEMİZLENDİ]`, 'dim');
      if (this._state === 'STAGE') {
        this.launchStage(this.stageIndex);
      } else if (this._state === 'MASTER_KEY') {
        this.line('Kök Yetkilendirme aktif! Master Key bekleniyor.', 'danger', { bold: true });
        this.printKeys();
      }
      return;
    }

    if (lower === 'help') {
      this.line('[?] KULLANILABİLİR KOMUTLAR:', 'warn', { bold: true, glow: true });
      [
        '  hint        - Mevcut aşama için arkadaş canlısı bir ipucu verir',
        "  skip        - (hint'ten sonra) soruyu atlar: KOLAY -10 / ORTA -15 / ZOR -20 sn",
        '  status      - Operatör, süre ve toplanan anahtar durumunu gösterir',
        "  leaderboard - Her zorluk için en hızlı 5 rekoru listeler (veya 'top', 'skor')",
        '  reset-board - Liderlik tablosunu siler (onay ister)',
        '  clear       - Terminal ekranını temizler',
        '  reset       - Oyunu sıfırlar ve yeni operatör için başlatır',
      ].forEach((t) => this.line(t, 'info'));
      return;
    }

    if (lower === 'leaderboard' || lower === 'top' || lower === 'skor') {
      this.printLeaderboard(DIFFICULTIES);
      return;
    }

    if (lower === 'reset-board') {
      this.requestBoardReset();
      return;
    }

    if (lower === 'status') {
      const sec = this.remainingSeconds();
      const stage = this._state === 'STAGE' ? `${this.stageIndex + 1}/3` : this._state;
      const k = [0, 1, 2].map((i) => `${i + 1}: [${this._keys[i] ?? 'BEKLEMEDE'}]`).join(' | ');
      this.line('[i] GÜNCEL SİSTEM DURUMU:', 'accent', { bold: true, glow: true });
      this.line(`  OPERATÖR       : ${this.operatorName || 'GİRİLMEDİ'}`);
      this.line(`  KALAN SÜRE     : ${sec === null ? '[--:--]' : formatClock(sec)}`);
      this.line(`  AKTİF AŞAMA    : ${stage}`);
      this.line(`  ZORLUK         : ${this._difficulty ?? 'SEÇİLMEDİ'}`, 'info');
      this.line(`  TOPLANAN ANAHTARLAR: ${k}`, 'warn', { bold: true });
      return;
    }

    if (lower === 'reset' || lower === 'restart' || lower === 'retry') {
      this.start();
      return;
    }

    if (lower === 'skip' && this._state !== 'AWAIT_NAME') {
      this.skipStage();
      return;
    }

    if (this._state === 'AWAIT_NAME') {
      if (input.length < 2) {
        this.errorBuzz();
        this.line('[!] Geçerli bir kod adı gir (en az 2 karakter).', 'danger');
        return;
      }
      this.operatorName = input;
      this.line([s('[+] KİMLİK DOĞRULANDI: '), s(input.toLocaleUpperCase('tr-TR'), 'text', true)], 'ok', { bold: true, glow: true });
      this.askDifficulty();
      return;
    }

    if (this._state === 'AWAIT_DIFFICULTY') {
      const diff = DIFF_ALIASES[foldTurkishI(input).toUpperCase()];
      if (!diff) {
        this.errorBuzz();
        this.line('[!] Geçersiz seçim. 1 (KOLAY), 2 (ORTA) veya 3 (ZOR) yaz.', 'danger');
        return;
      }
      this.startRun(diff);
      return;
    }

    if (lower === 'hint') {
      this.giveHint();
      return;
    }

    if (this._state === 'STAGE') {
      this.checkStage(input);
    } else if (this._state === 'MASTER_KEY') {
      this.checkMaster(input);
    } else if (this._state === 'VICTORY') {
      this.line("[i] Sistem kırıldı! Yeniden başlatmak için butona tıklayın veya 'reset' yazın.", 'ok');
    } else if (this._state === 'FAILED') {
      this.line("[!] Süre doldu. Tekrar denemek için butona tıklayın veya 'retry' yazın.", 'danger');
    }
  }
}
