import type { Category, Content, Difficulty, Question } from './types';

export interface Stage {
  cat: Category;
  q: Question;
  key: string;
}

export interface LastRun {
  catKey: string;
  ids: string[];
}

export const EMPTY_LAST_RUN: LastRun = { catKey: '', ids: [] };

export function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const catKeyOf = (cats: Category[]): string =>
  cats
    .map((c) => c.id)
    .sort()
    .join();

/**
 * 3 distinct categories, one question each at the chosen difficulty, 3 distinct key words.
 * The category set and the question ids differ from the previous run.
 */
export function buildRun(
  content: Content,
  diff: Difficulty,
  last: LastRun,
  rng: () => number,
): { stages: Stage[]; last: LastRun } {
  let cats: Category[];
  do {
    cats = shuffle(content.categories, rng).slice(0, 3);
  } while (catKeyOf(cats) === last.catKey);

  const keys = shuffle(content.keyWords, rng).slice(0, 3);
  const stages = cats.map((cat, i) => {
    const pool = cat.questions[diff];
    const fresh = pool.filter((q) => !last.ids.includes(q.id));
    const list = fresh.length ? fresh : pool;
    return { cat, q: list[Math.floor(rng() * list.length)], key: keys[i] };
  });
  return { stages, last: { catKey: catKeyOf(cats), ids: stages.map((s) => s.q.id) } };
}
