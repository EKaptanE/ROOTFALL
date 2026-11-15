import { formatSeconds } from '../engine/answers';
import type { BoardView } from '../engine/types';

/** Fills `el` with one difficulty's leaderboard. Used by the terminal and the main menu. */
export function fillBoard(el: HTMLElement, view: BoardView): void {
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
    const skipped = e.skips ? ` ⏭${e.skips}` : '';
    const cells: [string, string][] = [
      ['board-rank tone-accent bold', `${medal} #${i + 1}`],
      ['board-name bold', e.name],
      [`board-time bold ${e.skips ? 'tone-alert' : 'tone-ok'}`, `${formatSeconds(e.timeUsed)} sn${skipped}`],
      ['board-date tone-dim', e.date ?? ''],
    ];
    for (const [cls, text] of cells) {
      const c = document.createElement('span');
      c.className = cls;
      c.textContent = text;
      row.appendChild(c);
    }
    if (e.skips) row.title = 'Bu koşuda soru atlandı; atlamasız koşuların altında sıralanır.';
    el.appendChild(row);
  });
}
