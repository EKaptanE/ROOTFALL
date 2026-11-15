// Main menu: the first screen of the app. Navigation only; no game rules live here.
// Numbers shown in "NASIL OYNANIR" come from the content file, so they cannot drift.
import { DIFFICULTY_TONE } from '../engine/game';
import { getLastOperator, getLeaderboard } from '../engine/leaderboard';
import { DIFFICULTIES, type Content, type KeyValueStore } from '../engine/types';
import { fillBoard } from './board';

export interface MenuDeps {
  root: HTMLElement;
  content: Content;
  store: KeyValueStore;
  version: string;
  settings: { sound: boolean; fx: boolean };
  onStart: () => void;
  onToggleSound: () => void;
  onToggleFx: () => void;
  onResetBoard: () => void;
  /** Closes the app. Resolves to false when that was not possible (plain browser tab). */
  onQuit: () => Promise<boolean>;
}

type Panel = 'home' | 'board' | 'howto' | 'settings';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
};

export function createMenu(deps: MenuDeps) {
  const { root, content } = deps;
  let panel: Panel = 'home';
  let notice = '';

  async function quit(): Promise<void> {
    if (await deps.onQuit()) return;
    notice = 'Tarayıcıda çalışıyorsun: çıkmak için bu sekmeyi kapat.';
    render();
  }

  const items: { label: string; hint: string; run?: () => void }[] = [
    { label: 'SIZMAYA BAŞLA', hint: 'serbest oyun', run: deps.onStart },
    { label: 'GÜNLÜK SIZMA', hint: 'yakında' },
    { label: 'LİDERLİK TABLOSU', hint: 'en iyi süreler', run: () => open('board') },
    { label: 'NASIL OYNANIR', hint: 'kurallar ve komutlar', run: () => open('howto') },
    { label: 'AYARLAR', hint: 'ses ve efektler', run: () => open('settings') },
    { label: 'ÇIKIŞ', hint: 'uygulamayı kapat', run: () => void quit() },
  ];

  function open(next: Panel): void {
    panel = next;
    render();
  }

  function header(): HTMLElement {
    const head = el('div', 'menu-head');
    const mark = el('h1', 'menu-logo glow');
    mark.append('ROOTFALL', el('span', 'menu-cursor', '_'));
    head.append(
      mark,
      el('div', 'menu-sub', `// BREACH UNIT · v${deps.version}`),
      el('p', 'menu-tagline', '3 güvenlik katmanı. 1 Master Key. Süre aleyhine işliyor.'),
    );
    return head;
  }

  function home(): HTMLElement {
    const list = el('nav', 'menu-list');
    list.setAttribute('aria-label', 'Ana menü');
    items.forEach((item, i) => {
      const btn = el('button', 'menu-item');
      btn.type = 'button';
      btn.disabled = !item.run;
      btn.append(el('span', 'menu-key', `[${i + 1}]`), el('span', 'menu-label', item.label), el('span', 'menu-hint', item.hint));
      if (item.run) btn.addEventListener('click', item.run);
      list.appendChild(btn);
    });
    const wrap = el('div');
    wrap.appendChild(list);
    const last = getLastOperator(deps.store);
    const foot = el('div', 'menu-foot');
    foot.append(el('span', '', '↑↓ gezin · Enter seç · 1-6 kısayol'));
    if (last) foot.append(el('span', '', `son operatör: ${last}`));
    wrap.appendChild(foot);
    if (notice) wrap.appendChild(el('p', 'menu-note tone-warn', notice));
    return wrap;
  }

  function panelFrame(title: string, body: HTMLElement): HTMLElement {
    const frame = el('div', 'menu-panel');
    const back = el('button', 'btn tone-accent menu-back', '← [GERİ]');
    back.type = 'button';
    back.addEventListener('click', () => open('home'));
    frame.append(el('h2', 'menu-panel-title', title), body, back);
    return frame;
  }

  function board(): HTMLElement {
    const body = el('div', 'boards');
    for (const diff of DIFFICULTIES) {
      const box = el('div', 'board');
      fillBoard(box, {
        diff,
        time: content.difficulties[diff].time,
        tone: DIFFICULTY_TONE[diff],
        entries: getLeaderboard(deps.store, diff).slice(0, 5),
      });
      body.appendChild(box);
    }
    body.appendChild(el('p', 'menu-note', '⏭ işaretli koşularda soru atlanmıştır; atlamasız koşuların altında sıralanırlar.'));
    return panelFrame('[LİDERLİK TABLOSU]', body);
  }

  function howto(): HTMLElement {
    const d = content.difficulties;
    const p = content.penalties;
    const body = el('div', 'howto');
    const steps: string[] = [
      `Kod adını gir ve zorluk seç: KOLAY ${d.KOLAY.time} sn, ORTA ${d.ORTA.time} sn, ZOR ${d.ZOR.time} sn.`,
      'Karşına 3 soru çıkar. Her doğru cevap sana bir anahtar verir.',
      `Yanlış cevap ${p.wrongAnswer} saniye götürür.`,
      `Takılırsan "hint" yaz; ipucu bedavadır. İpucundan sonra "skip" ile soruyu atlayabilirsin: ${d.KOLAY.skipCost}/${d.ORTA.skipCost}/${d.ZOR.skipCost} sn ceza, koşu başına ${content.skipsPerRun} hak.`,
      'Soru atladığın koşu, liderlik tablosunda atlamasız koşuların altında sıralanır.',
      `3 anahtarı tireyle birleştirip Master Key'i gir: 1.ANAHTAR‑2.ANAHTAR‑3.ANAHTAR. Hatalı giriş ${p.masterKey} saniye götürür.`,
      'Yeni bir soru ekrana yazılırken süre durur; yazı bitince akmaya başlar. Enter yazıyı hemen tamamlar.',
    ];
    const list = el('ol', 'howto-steps');
    steps.forEach((t) => list.appendChild(el('li', '', t)));
    const cmds: [string, string][] = [
      ['hint', 'ipucu'],
      ['skip', 'soruyu atla'],
      ['status', 'süre ve anahtarlar'],
      ['leaderboard', 'rekorlar'],
      ['clear', 'ekranı temizle'],
      ['reset', 'baştan başla'],
      ['menu', 'ana menü'],
      ['help', 'tüm komutlar'],
    ];
    const grid = el('div', 'howto-cmds');
    cmds.forEach(([c, t]) => grid.append(el('code', 'tone-accent', c), el('span', 'tone-dim', t)));
    body.append(list, el('h3', 'howto-sub', 'KOMUTLAR'), grid);
    return panelFrame('[NASIL OYNANIR]', body);
  }

  function settings(): HTMLElement {
    const body = el('div', 'menu-list');
    const row = (label: string, value: string, run: () => void, cls = ''): void => {
      const btn = el('button', `menu-item ${cls}`);
      btn.type = 'button';
      btn.append(el('span', 'menu-label', label), el('span', 'menu-hint', value));
      btn.addEventListener('click', () => {
        run();
        render();
      });
      body.appendChild(btn);
    };
    row('SES', deps.settings.sound ? '🔊 AÇIK' : '🔇 KAPALI', deps.onToggleSound);
    row('EFEKTLER', deps.settings.fx ? '✨ TAM' : '◌ AZ', deps.onToggleFx);
    row('LİDERLİK TABLOSUNU SIFIRLA', 'onay ister', deps.onResetBoard, 'menu-item-warn');
    const frame = panelFrame('[AYARLAR]', body);
    frame.insertBefore(
      el('p', 'menu-note', 'EFEKTLER: AZ seçilirse parlama, tarama çizgileri, sarsıntı ve yazılma animasyonları kapanır.'),
      frame.lastElementChild,
    );
    return frame;
  }

  function render(): void {
    const keep = root.contains(document.activeElement)
      ? Array.from(root.querySelectorAll('button')).indexOf(document.activeElement as HTMLButtonElement)
      : -1;
    const inner = el('div', 'menu-inner');
    inner.appendChild(header());
    inner.appendChild(panel === 'home' ? home() : panel === 'board' ? board() : panel === 'howto' ? howto() : settings());
    root.replaceChildren(inner);
    const buttons = enabledButtons();
    (buttons[keep >= 0 && panel === 'settings' ? Math.min(keep, buttons.length - 1) : 0] ?? buttons[0])?.focus();
  }

  const enabledButtons = (): HTMLButtonElement[] =>
    Array.from(root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));

  /** Arrow keys move between buttons, digits pick a home item, Esc goes back. */
  function onKey(e: KeyboardEvent): boolean {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const buttons = enabledButtons();
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      buttons[(at + step + buttons.length) % buttons.length]?.focus();
      return true;
    }
    if (e.key === 'Escape' || e.key === 'Backspace') {
      if (panel !== 'home') open('home');
      return true;
    }
    if (panel === 'home' && /^[1-9]$/.test(e.key)) {
      items[Number(e.key) - 1]?.run?.();
      return true;
    }
    return false;
  }

  return {
    show(): void {
      panel = 'home';
      notice = '';
      root.hidden = false;
      render();
    },
    hide(): void {
      root.hidden = true;
    },
    /** Re-draws the current panel, e.g. after the leaderboard was cleared. */
    refresh(): void {
      if (!root.hidden) render();
    },
    onKey,
  };
}
