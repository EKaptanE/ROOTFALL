// UI shell: renders what the engine emits and feeds it input. No game rules live here.
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import './styles.css';
import raw from '../content/rootfall-content.json';
import { formatClock } from './engine/answers';
import { loadContent } from './engine/content';
import { Game, VERSION } from './engine/game';
import type { BoardView, KeyValueStore, Line, Out, Span } from './engine/types';
import { playSound, setSoundEnabled, unlockAudio } from './ui/audio';
import { fillBoard } from './ui/board';
import { createMenu } from './ui/menu';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const app = $('app');
const gameView = $('game');
const log = $('log');
const input = $<HTMLInputElement>('input');
const promptEl = $('prompt');
const timerEl = $('timer');
const confirmEl = $('confirm');

// ---- settings (sound, effects) ----------------------------------------------------------

const SETTINGS_KEY = 'rootfall_settings';
const settings = { sound: true, fx: !window.matchMedia('(prefers-reduced-motion: reduce)').matches };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
} catch {
  /* keep defaults */
}
function applySettings(): void {
  setSoundEnabled(settings.sound);
  app.classList.toggle('fx-full', settings.fx);
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* not persisted, still applied */
  }
}

// ---- rendering --------------------------------------------------------------------------

const scrollDown = (): void => {
  log.scrollTop = log.scrollHeight;
};

function spanEl(sp: Span, text = sp.t): HTMLSpanElement {
  const el = document.createElement('span');
  el.textContent = text;
  if (sp.tone) el.classList.add(`tone-${sp.tone}`);
  if (sp.bold) el.classList.add('bold');
  if (sp.glow) el.classList.add('glow');
  return el;
}

function lineEl(line: Line, withSpans = true): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'line';
  if (line.tone) el.classList.add(`tone-${line.tone}`);
  if (line.bold) el.classList.add('bold');
  if (line.glow) el.classList.add('glow');
  if (withSpans) line.spans.forEach((sp) => el.appendChild(spanEl(sp)));
  return el;
}

function add<T extends HTMLElement>(el: T): T {
  log.appendChild(el);
  scrollDown();
  return el;
}

const shown: { el: HTMLElement; view: BoardView }[] = [];

// ---- boot typewriter --------------------------------------------------------------------

const BOOT_CHAR_MS = 20;
const BOOT_LINE_MS = 90;
let typing: { finish: () => void } | null = null;

function typeBoot(lines: Line[]): void {
  let cancelled = false;
  let li = 0;
  let ci = 0;
  let el: HTMLDivElement | null = null;
  const done = (): void => {
    typing = null;
    game.bootDone();
    input.focus();
    input.select();
  };
  const step = (): void => {
    if (cancelled) return;
    if (li >= lines.length) return done();
    const text = lines[li].spans.map((sp) => sp.t).join('');
    if (!el) el = add(lineEl(lines[li], false));
    if (ci < text.length) {
      el.textContent += text[ci++];
      scrollDown();
      if (Math.random() > 0.45) playSound('key');
      setTimeout(step, BOOT_CHAR_MS);
    } else {
      li++;
      ci = 0;
      el = null;
      setTimeout(step, BOOT_LINE_MS);
    }
  };
  typing = {
    finish: () => {
      cancelled = true;
      if (el) el.textContent = lines[li].spans.map((sp) => sp.t).join('');
      for (let i = el ? li + 1 : li; i < lines.length; i++) add(lineEl(lines[i]));
      done();
    },
  };
  if (settings.fx) step();
  else typing.finish();
}

// ---- scenes: new game text is written out line by line while the clock is held ----------

const CHAR_MS = 11; // typing speed inside a line
const LINE_MAX_MS = 360; // a long line never takes longer than this
const GAP_MS = 55; // pause between two pieces of a scene

const queue: Out[] = [];
let inScene = false;
let pumping = false;
let hurry = false; // finish the current scene at once
let generation = 0; // bumped on clear, so an old pump loop stops

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const animating = (): boolean => settings.fx && !hurry;

async function typeLine(line: Line): Promise<void> {
  const total = line.spans.reduce((n, sp) => n + sp.t.length, 0);
  if (!total || !animating()) {
    add(lineEl(line));
    return;
  }
  const el = add(lineEl(line, false));
  const parts = line.spans.map((sp) => ({ sp, node: el.appendChild(spanEl(sp, '')) }));
  const duration = Math.min(total * CHAR_MS, LINE_MAX_MS);
  const started = performance.now();
  const gen = generation;
  for (;;) {
    const done = animating() && gen === generation ? Math.min(1, (performance.now() - started) / duration) : 1;
    let budget = Math.ceil(total * done);
    for (const { sp, node } of parts) {
      const take = Math.min(budget, sp.t.length);
      if (node.textContent!.length !== take) node.textContent = sp.t.slice(0, take);
      budget -= take;
    }
    scrollDown();
    if (done >= 1) return;
    await sleep(16);
  }
}

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  // No typing ahead while the clock is stopped: the input opens when the text is done.
  input.readOnly = true;
  const gen = generation;
  while (queue.length && gen === generation) {
    const o = queue.shift()!;
    if (o.type === 'scene-end') {
      game.sceneDone();
      updateTimer();
      continue;
    }
    if (o.type === 'line') {
      await typeLine(o);
    } else {
      render(o);
    }
    const visible = o.type === 'line' || o.type === 'rule' || o.type === 'code' || o.type === 'buttons';
    if (visible && animating() && gen === generation) await sleep(GAP_MS);
  }
  if (gen === generation) {
    pumping = false;
    hurry = false;
    input.readOnly = false;
  }
}

/** Finishes whatever is still being written, at once. */
function finishWriting(): void {
  if (typing) typing.finish();
  if (queue.length || pumping) hurry = true;
}

const writing = (): boolean => Boolean(typing) || pumping || queue.length > 0;

/** Entry point for everything the engine emits. */
function emit(o: Out): void {
  if (o.type === 'scene-start') {
    inScene = true;
    return;
  }
  if (o.type === 'scene-end') {
    inScene = false;
    queue.push(o);
    void pump();
    return;
  }
  if (o.type === 'reveal-skip') {
    finishWriting();
    return;
  }
  if (o.type === 'clear' || o.type === 'menu') {
    // a new game or the menu: drop anything still waiting to be written
    queue.length = 0;
    generation++;
    pumping = false;
    hurry = false;
    inScene = false;
    input.readOnly = false;
    render(o);
    return;
  }
  // sounds and screen effects fire when they happen, not when the text catches up
  const immediate = o.type === 'sound' || o.type === 'shake' || o.type === 'flash';
  if (!immediate && (inScene || queue.length || pumping)) {
    queue.push(o);
    void pump();
  } else {
    render(o);
  }
}

function restartAnimation(el: HTMLElement, cls: string, ms: number): void {
  if (!settings.fx) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}

function render(o: Out): void {
  switch (o.type) {
    case 'line':
      add(lineEl(o));
      break;
    case 'rule': {
      const el = document.createElement('div');
      el.className = `rule tone-${o.tone}${o.heavy ? ' heavy' : ''}`;
      add(el);
      break;
    }
    case 'clear':
      if (typing) typing.finish();
      log.replaceChildren();
      shown.length = 0;
      break;
    case 'menu':
      showMenu();
      break;
    case 'boot':
      typeBoot(o.lines);
      break;
    case 'boot-skip':
      typing?.finish();
      break;
    case 'code': {
      const box = document.createElement('div');
      box.className = 'code';
      const head = document.createElement('div');
      head.className = 'code-head';
      head.textContent = `${o.lang} kod parçası`;
      const pre = document.createElement('pre');
      pre.textContent = o.lines.join('\n');
      box.append(head, pre);
      add(box);
      break;
    }
    case 'buttons': {
      const row = document.createElement('div');
      row.className = 'actions';
      if (o.note) {
        const note = document.createElement('span');
        o.note.forEach((sp) => note.appendChild(spanEl(sp)));
        row.appendChild(note);
      }
      for (const b of o.buttons) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `btn tone-${b.tone}`;
        btn.textContent = b.label;
        btn.addEventListener('click', () => {
          game.action(b.action);
          updateTimer();
          if (!gameView.hidden) input.focus();
        });
        row.appendChild(btn);
      }
      add(row);
      break;
    }
    case 'card': {
      const card = document.createElement('div');
      card.className = 'card';
      const title = document.createElement('div');
      title.className = 'card-title glow';
      title.textContent = o.title;
      const rows = document.createElement('dl');
      for (const r of o.rows) {
        const dt = document.createElement('dt');
        dt.textContent = r.label;
        const dd = document.createElement('dd');
        dd.appendChild(spanEl(r.value));
        rows.append(dt, dd);
      }
      const body = document.createElement('div');
      body.className = 'card-body';
      o.body.forEach((l) => body.appendChild(lineEl(l)));
      card.append(title, rows, body);
      add(card);
      break;
    }
    case 'leaderboard': {
      const box = document.createElement('div');
      box.className = 'boards';
      for (const view of o.boards) {
        const el = document.createElement('div');
        el.className = 'board';
        fillBoard(el, view);
        shown.push({ el, view });
        box.appendChild(el);
      }
      add(box);
      break;
    }
    case 'board-reset':
      shown.forEach(({ el, view }) => fillBoard(el, { ...view, entries: [] }));
      menu.refresh();
      break;
    case 'confirm':
      askConfirm(o.message, '[EVET, SİL]', (yes) => game.resolveConfirm(yes));
      break;
    case 'prompt':
      promptEl.textContent = o.label;
      promptEl.classList.toggle('danger', o.danger);
      input.placeholder = o.placeholder;
      input.value = o.prefill ?? '';
      break;
    case 'sound':
      playSound(o.name);
      break;
    case 'shake':
      restartAnimation(app, 'shake', 260);
      break;
    case 'flash':
      restartAnimation(app, `flash-${o.tone}`, 650);
      break;
  }
}

// ---- confirm dialog ---------------------------------------------------------------------

let confirmResult: ((yes: boolean) => void) | null = null;

function askConfirm(message: string, yesLabel: string, onResult: (yes: boolean) => void): void {
  $('confirm-text').textContent = message;
  $('confirm-yes').textContent = yesLabel;
  confirmResult = onResult;
  confirmEl.hidden = false;
  $('confirm-no').focus();
}

function closeConfirm(yes: boolean): void {
  confirmEl.hidden = true;
  const done = confirmResult;
  confirmResult = null;
  done?.(yes);
  if (gameView.hidden) menu.refresh();
  else input.focus();
}

$('confirm-yes').addEventListener('click', () => closeConfirm(true));
$('confirm-no').addEventListener('click', () => closeConfirm(false));
confirmEl.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Escape') closeConfirm(false);
  if (e.key === 'Tab' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    // keep focus inside the dialog
    e.preventDefault();
    const next = document.activeElement === $('confirm-no') ? $('confirm-yes') : $('confirm-no');
    next.focus();
  }
});

// ---- game wiring ------------------------------------------------------------------------

const noStore: KeyValueStore = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
let store: KeyValueStore = noStore;
try {
  localStorage.getItem('rootfall_lb');
  store = localStorage;
} catch {
  /* storage blocked: play without a saved leaderboard */
}

const content = loadContent(raw);
const game = new Game({ content, store, emit });

function updateTimer(): void {
  const sec = game.remainingSeconds();
  timerEl.textContent = sec === null ? '[--:--]' : formatClock(sec);
  timerEl.classList.toggle('urgent', game.urgent);
  timerEl.classList.toggle('held', game.clockHeld);
}

setInterval(() => {
  game.tick();
  updateTimer();
}, 100);

// ---- screens ----------------------------------------------------------------------------

const menu = createMenu({
  root: $('menu'),
  content,
  store,
  version: VERSION,
  settings,
  onStart: startGame,
  onToggleSound: () => {
    settings.sound = !settings.sound;
    applySettings();
    if (settings.sound) playSound('stageClear');
  },
  onToggleFx: () => {
    settings.fx = !settings.fx;
    applySettings();
  },
  onResetBoard: () => game.requestBoardReset(),
  onQuit: quitApp,
});

/** Closes the desktop app through the Tauri shell. In a plain browser there is nothing to close. */
async function quitApp(): Promise<boolean> {
  const invoke = (window as any).__TAURI__?.core?.invoke as ((cmd: string) => Promise<void>) | undefined;
  if (!invoke) return false;
  try {
    await invoke('quit');
    return true;
  } catch {
    return false;
  }
}

function showMenu(): void {
  gameView.hidden = true;
  updateTimer();
  menu.show();
}

function startGame(): void {
  menu.hide();
  gameView.hidden = false;
  game.start();
  updateTimer();
  input.focus();
}

$('menu-btn').addEventListener('click', () => {
  const running = game.state === 'STAGE' || game.state === 'MASTER_KEY';
  if (!running) return game.exitToMenu();
  askConfirm('Süren koşu iptal edilecek. Ana menüye dönülsün mü?', '[EVET, ÇIK]', (yes) => {
    if (yes) game.exitToMenu();
  });
});

// ---- input ------------------------------------------------------------------------------

const history: string[] = [];
let historyIndex = 0;

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    // Enter while text is still being written only finishes the writing; nothing is sent.
    if (writing()) {
      finishWriting();
      return;
    }
    const value = input.value;
    input.value = '';
    if (value.trim()) {
      history.push(value.trim());
      historyIndex = history.length;
    }
    game.handleInput(value);
    updateTimer();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (history.length) {
      if (historyIndex > 0) historyIndex--;
      input.value = history[historyIndex] ?? '';
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (historyIndex < history.length - 1) {
      historyIndex++;
      input.value = history[historyIndex] ?? '';
    } else {
      historyIndex = history.length;
      input.value = '';
    }
  }
});

document.addEventListener('keydown', (e) => {
  unlockAudio();
  if (!confirmEl.hidden || gameView.hidden === false) return;
  if (menu.onKey(e)) e.preventDefault();
});

document.addEventListener('click', (e) => {
  unlockAudio();
  if (gameView.hidden || !confirmEl.hidden) return;
  const onButton = (e.target as HTMLElement).closest('button');
  const selecting = Boolean(window.getSelection()?.toString());
  if (!onButton && !selecting) input.focus();
});
document.addEventListener('touchstart', () => unlockAudio(), { passive: true });

$('version').textContent = `v${VERSION}`;
applySettings();
showMenu();
