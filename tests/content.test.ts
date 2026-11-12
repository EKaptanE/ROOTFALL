// Catalog rules. Ported from reference/sim_test.js and reference/test_terminal.py.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../src/engine/types';
import { content } from './helpers';

const all = content.categories.flatMap((c) => DIFFICULTIES.flatMap((d) => c.questions[d]));

describe('content catalog', () => {
  it('has 6 categories x 3 difficulties x 7 questions with unique ids', () => {
    expect(content.categories).toHaveLength(6);
    for (const cat of content.categories) for (const d of DIFFICULTIES) expect(cat.questions[d], `${cat.id} ${d}`).toHaveLength(7);
    expect(new Set(all.map((q) => q.id)).size).toBe(126);
  });

  it('every question has text, a hint and at least one answer', () => {
    for (const q of all) expect(Boolean(q.text && q.hint && q.answers.length), q.id).toBe(true);
  });

  it('no question accepts its own input echoed back (e.g. "0x1A = ?" accepting 0x1A)', () => {
    for (const q of all) {
      const tokens: string[] = q.text.toUpperCase().match(/[0-9A-FX]{2,}/g) ?? [];
      for (const ans of q.answers) expect(tokens.includes(ans) && /\d/.test(ans), `echo answer ${ans} in ${q.id}`).toBe(false);
    }
  });

  it('no word answer leaks into the question, hint or guide', () => {
    for (const q of all) {
      const blob = `${q.text} ${q.hint} ${(q.guide ?? []).join(' ')}`.toUpperCase();
      for (const ans of q.answers) {
        if (/^[A-Z]{3,}$/.test(ans)) expect(new RegExp(`\\b${ans}\\b`).test(blob), `answer ${ans} leaks in ${q.id}`).toBe(false);
      }
    }
  });

  it('keeps the known cipher samples', () => {
    expect(content.categories[0].questions.KOLAY[0].text.endsWith('X L W V')).toBe(true);
    expect(content.categories[0].questions.ZOR[0].text.endsWith('K H O O R')).toBe(true);
  });

  it('difficulty times, skip costs and penalties', () => {
    expect(DIFFICULTIES.map((d) => content.difficulties[d].time)).toEqual([60, 75, 90]);
    expect(DIFFICULTIES.map((d) => content.difficulties[d].skipCost)).toEqual([10, 15, 20]);
    expect(content.penalties).toEqual({ wrongAnswer: 3, masterKey: 5 });
  });

  it('key words are distinct and contain no hyphens', () => {
    expect(new Set(content.keyWords).size).toBe(content.keyWords.length);
    for (const k of content.keyWords) expect(k).toMatch(/^[A-Z]+$/);
  });
});

describe('source hygiene', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const files = ['index.html', ...readdirSync(join(root, 'src'), { recursive: true }).map((f) => join('src', String(f)))]
    .filter((f) => /\.(ts|css|html)$/.test(f));
  const source = files.map((f) => readFileSync(join(root, f), 'utf8')).join('\n');

  it('loads nothing from the network (works offline)', () => {
    expect(source).not.toMatch(/(src|href)=["']https?:\/\//);
    expect(source).not.toMatch(/url\(["']?https?:\/\//);
    expect(source).not.toMatch(/\bfetch\(|XMLHttpRequest/);
  });

  it('has no event-era leftovers and no difficulty-order engine', () => {
    expect(source).not.toMatch(/\bCES\b|BEDAVA|Tanışma|\bstant/);
    for (const gone of ['DIFFICULTY_PERMUTATIONS', 'activePermutation', 'ZORLUK DÜZENİ', 'ZORLUK MOTORU']) expect(source).not.toContain(gone);
  });
});
