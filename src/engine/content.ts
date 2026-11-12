import type { Category, Content, Difficulty } from './types';
import { DIFFICULTIES } from './types';

/** Turns the raw JSON (content/rootfall-content.json) into typed content, failing loudly on a bad shape. */
export function loadContent(raw: any): Content {
  const fail = (msg: string): never => {
    throw new Error(`rootfall-content: ${msg}`);
  };
  if (!raw || typeof raw !== 'object') fail('not an object');
  const difficulties = {} as Content['difficulties'];
  for (const d of DIFFICULTIES) {
    const cfg = raw.difficulties?.[d];
    if (!cfg || typeof cfg.time !== 'number' || typeof cfg.skipCost !== 'number') fail(`difficulty ${d}`);
    difficulties[d] = { time: cfg.time, skipCost: cfg.skipCost };
  }
  if (!Array.isArray(raw.keyWords) || raw.keyWords.length < 3) fail('keyWords');
  if (!Array.isArray(raw.categories) || raw.categories.length < 4) fail('categories');
  const categories: Category[] = raw.categories.map((c: any) => {
    const questions = {} as Record<Difficulty, Category['questions'][Difficulty]>;
    for (const d of DIFFICULTIES) {
      const list = c.questions?.[d];
      if (!Array.isArray(list) || !list.length) fail(`${c.id} ${d} has no questions`);
      questions[d] = list;
    }
    return { id: c.id, icon: c.icon, title: c.title, inputPlaceholder: c.inputPlaceholder, questions };
  });
  return {
    difficulties,
    penalties: {
      wrongAnswer: raw.penalties?.wrongAnswer ?? 3,
      masterKey: raw.penalties?.masterKey ?? 5,
    },
    keyWords: raw.keyWords,
    categories,
  };
}
