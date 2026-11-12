import raw from '../content/rootfall-content.json';
import { loadContent } from '../src/engine/content';
import { Game } from '../src/engine/game';
import type { KeyValueStore, Out } from '../src/engine/types';

export const content = loadContent(raw);

/** Small deterministic generator so failures can be reproduced. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function memoryStore(): KeyValueStore & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => { data[k] = v; },
    removeItem: (k) => { delete data[k]; },
  };
}

/** A game wired to a fake clock, an in-memory store and a captured output log. */
export function harness(seed = 1) {
  const out: Out[] = [];
  const clock = { ms: 1_000_000 };
  const store = memoryStore();
  const game = new Game({ content, store, emit: (o) => out.push(o), now: () => clock.ms, rng: seededRng(seed) });
  const text = (from = 0): string =>
    out
      .slice(from)
      .map((o) => {
        if (o.type === 'line') return o.spans.map((s) => s.t).join('');
        if (o.type === 'card') return [o.title, ...o.rows.map((r) => `${r.label}: ${r.value.t}`), ...o.body.map((l) => l.spans.map((s) => s.t).join(''))].join('\n');
        if (o.type === 'buttons') return o.buttons.map((b) => b.label).join(' ');
        if (o.type === 'code') return o.lines.join('\n');
        if (o.type === 'confirm') return o.message;
        return '';
      })
      .join('\n');
  /** Moves the clock forward one second at a time, ticking like the UI does. */
  const advance = (seconds: number) => {
    for (let i = 0; i < seconds * 4; i++) {
      clock.ms += 250;
      game.tick();
    }
  };
  /** Boots, enters a name and picks a difficulty. */
  const begin = (choice = '2', name = 'Tester') => {
    game.start();
    game.bootDone();
    game.handleInput(name);
    game.handleInput(choice);
  };
  const solveAll = () => {
    while (game.state === 'STAGE') game.handleInput(game.stages[game.keys.length].q.answers[0].toLowerCase());
  };
  return { game, out, clock, store, text, advance, begin, solveAll };
}
