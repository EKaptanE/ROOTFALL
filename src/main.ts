// UI shell: renders what the engine emits and feeds it input. No game rules live here.
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import './styles.css';
import raw from '../content/rootfall-content.json';
import { formatClock, formatSeconds } from './engine/answers';
import { loadContent } from './engine/content';
import { Game, VERSION } from './engine/game';
import type { BoardView, KeyValueStore, Line, Out, Span } from './engine/types';
import { playSound, setSoundEnabled, unlockAudio } from './ui/audio';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const app = $('app');
const log = $('log');
const input = $<HTMLInputElement>('input');
const promptEl = $('prompt');
const timerEl = $('timer');
const soundBtn = $('sound-btn');
const fxBtn = $('fx-btn');
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
  soundBtn.textContent = settings.sound ? '🔊 SES: AÇIK' : '🔇 SES: KAPALI';
  fxBtn.textContent = settings.fx ? '✨ EFEKT: TAM' : '◌ EFEKT: AZ';
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

function spanEl(sp: Span): HTMLSpanElement {
  const el = document.createElement('span');
  el.textContent = sp.t;
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

function fillBoard(el: HTMLElement, view: BoardView): void {
  el.replaceChildren();
  const head = document.createElement('div');
  head.className = `board-head tone-${view.tone} bold`;
  head.textContent = `🏆 [LİDERLİK TABLOSU // ${view.diff} — ${view.time} SN]`;
  el.appendChild(head);
  if (!view.entries.length) {
    const empty = document.createElement('div');
    empty.className = 'tone-dim';
    empty.textContent = 'Henüz kayıtlı bir rekor yok. İlk kıran sen ol!';
    el.appendChild(empty);
    return;
  }
  view.entries.forEach((e, i) => {
    const row = document.createElement('div');
    row.className = 'board-row';
    const medal = ['🥇', '🥈', '🥉'][i] ?? '';
    const cells: [string, string][] = [
      ['board-rank tone-accent bold', `${medal} #${i + 1}`],
      ['board-name bold', e.name],
      ['board-time tone-ok bold', `${formatSeconds(e.timeUsed)} sn`],
      ['board-date tone-dim', e.date ?? ''],
    ];
    for (const [cls, text] of cells) {
      const c = document.createElement('span');
      c.className = cls;
      c.textContent = text;
      row.appendChild(c);
    }
    el.appendChild(row);
  });
}

// boot typewriter
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
      setTimeout(step, 16);
    } else {
      li++;
      ci = 0;
      el = null;
      setTimeout(step, 70);
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
  step();
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
          input.focus();
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
      break;
    case 'confirm':
      $('confirm-text').textContent = o.message;
      confirmEl.hidden = false;
      $('confirm-no').focus();
      break;
    case 'prompt':
      promptEl.textContent = o.label;
      promptEl.classList.toggle('danger', o.danger);
      input.placeholder = o.placeholder;
      input.value = '';
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

// ---- game wiring ------------------------------------------------------------------------

const noStore: KeyValueStore = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
let store: KeyValueStore = noStore;
try {
  localStorage.getItem('rootfall_lb');
  store = localStorage;
} catch {
  /* storage blocked: play without a saved leaderboard */
}

const game = new Game({ content: loadContent(raw), store, emit: render });

function updateTimer(): void {
  const sec = game.remainingSeconds();
  timerEl.textContent = sec === null ? '[--:--]' : formatClock(sec);
  timerEl.classList.toggle('urgent', game.urgent);
}

setInterval(() => {
  game.tick();
  updateTimer();
}, 100);

// ---- input ------------------------------------------------------------------------------

const history: string[] = [];
let historyIndex = 0;

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
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

document.addEventListener('click', (e) => {
  unlockAudio();
  const onButton = (e.target as HTMLElement).closest('button');
  const selecting = Boolean(window.getSelection()?.toString());
  if (!onButton && !selecting && confirmEl.hidden) input.focus();
});
document.addEventListener('touchstart', () => unlockAudio(), { passive: true });
document.addEventListener('keydown', () => unlockAudio(), { once: true });

soundBtn.addEventListener('click', () => {
  settings.sound = !settings.sound;
  applySettings();
  if (settings.sound) playSound('stageClear');
  input.focus();
});
fxBtn.addEventListener('click', () => {
  settings.fx = !settings.fx;
  applySettings();
  input.focus();
});
$('reset-lb-btn').addEventListener('click', () => game.requestBoardReset());

function closeConfirm(yes: boolean): void {
  confirmEl.hidden = true;
  game.resolveConfirm(yes);
  input.focus();
}
$('confirm-yes').addEventListener('click', () => closeConfirm(true));
$('confirm-no').addEventListener('click', () => closeConfirm(false));
confirmEl.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeConfirm(false);
  if (e.key === 'Tab') {
    // keep focus inside the dialog
    e.preventDefault();
    const next = document.activeElement === $('confirm-no') ? $('confirm-yes') : $('confirm-no');
    next.focus();
  }
});

$('version').textContent = `v${VERSION}`;
applySettings();
game.start();
updateTimer();
