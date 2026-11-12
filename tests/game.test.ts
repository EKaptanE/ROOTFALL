// Behaviour of the engine. The first block is the port of reference/sim_test.js;
// the rest covers the app rules (wrong-answer penalty, clock-based timer, decimals).
import { describe, expect, it } from 'vitest';
import { checkMasterKey, isCorrectAnswer } from '../src/engine/answers';
import { getLeaderboard } from '../src/engine/leaderboard';
import { DIFFICULTIES } from '../src/engine/types';
import { content, harness } from './helpers';

describe('full runs (port of sim_test.js)', () => {
  it('plays every difficulty: skip rules, wrong answers, master key penalty, victory', () => {
    const h = harness(7);
    const { game } = h;
    const wrong = content.penalties.wrongAnswer;
    let prevIds: string[] | null = null;
    for (const [choice, diff, time] of [['1', 'KOLAY', 60], ['2', 'ORTA', 75], ['zor', 'ZOR', 90], ['3', 'ZOR', 90]] as const) {
      game.start();
      expect(game.state).toBe('INIT_TYPING');
      game.bootDone();
      expect(game.state).toBe('AWAIT_NAME');
      game.handleInput('Tester');
      expect(game.state).toBe('AWAIT_DIFFICULTY');
      game.handleInput('9');
      expect(game.state).toBe('AWAIT_DIFFICULTY');
      game.handleInput(choice);
      expect(game.totalSeconds).toBe(time);
      const stages = game.stages;
      expect(new Set(stages.map((s) => s.cat.id)).size).toBe(3);
      stages.forEach((s) => expect(s.cat.questions[diff]).toContain(s.q));
      const runIds = stages.map((s) => s.q.id);
      if (prevIds) runIds.forEach((id) => expect(prevIds, `repeat question ${id}`).not.toContain(id));
      prevIds = runIds;
      const cost = content.difficulties[diff].skipCost;

      // Stage 1: skip is locked until hint, then costs time and still grants the key
      game.handleInput('skip');
      expect(game.keys).toHaveLength(0);
      game.handleInput('hint');
      game.handleInput('skip');
      expect(game.keys).toHaveLength(1);
      expect(game.remainingSeconds()).toBe(time - cost);
      // Stage 2: the hint was for stage 1, so skip is locked again
      game.handleInput('skip');
      expect(game.keys).toHaveLength(1);

      for (const s of stages.slice(1)) {
        game.handleInput('definitely-wrong');
        expect(game.state).toBe('STAGE');
        game.handleInput(s.q.answers[0].toLowerCase());
      }
      expect(game.state).toBe('MASTER_KEY');
      expect(game.remainingSeconds()).toBe(time - cost - 2 * wrong);
      game.handleInput(game.keys.join(''));
      expect(game.remainingSeconds()).toBe(time - cost - 2 * wrong - 5);
      game.handleInput(game.keys.join('-').toLowerCase());
      expect(game.state).toBe('VICTORY');
    }
    expect(getLeaderboard(h.store, 'ZOR')).toHaveLength(2);
    expect(getLeaderboard(h.store, 'KOLAY')).toHaveLength(1);
    expect(h.text()).not.toContain('->');
  });
});

describe('run builder', () => {
  it('never repeats the previous category set or questions, over many retries', () => {
    for (const diff of ['1', '2', '3']) {
      const h = harness(Number(diff) * 11);
      let prevSet = '';
      let prevIds: string[] = [];
      for (let i = 0; i < 60; i++) {
        h.begin(diff);
        const set = h.game.stages.map((s) => s.cat.id).sort().join();
        const ids = h.game.stages.map((s) => s.q.id);
        expect(set).not.toBe(prevSet);
        ids.forEach((id) => expect(prevIds).not.toContain(id));
        expect(new Set(h.game.stages.map((s) => s.key)).size).toBe(3);
        prevSet = set;
        prevIds = ids;
      }
    }
  });
});

describe('timer', () => {
  it('follows the clock, not the number of ticks', () => {
    const h = harness();
    h.begin('1');
    h.clock.ms += 10_000; // e.g. the window was in the background: no ticks at all
    expect(h.game.remainingSeconds()).toBe(50);
    h.game.tick();
    expect(h.game.state).toBe('STAGE');
  });

  it('shows --:-- before a run and starts on difficulty choice', () => {
    const h = harness();
    h.game.start();
    h.game.bootDone();
    expect(h.game.remainingSeconds()).toBeNull();
    h.game.handleInput('Tester');
    expect(h.game.timerRunning).toBe(false);
    h.game.handleInput('orta');
    expect(h.game.timerRunning).toBe(true);
    expect(h.game.remainingSeconds()).toBe(75);
  });

  it('fires each alert once at 60/40/20% and a heartbeat every second after that', () => {
    for (const [choice, marks] of [['1', [36, 24, 12]], ['2', [45, 30, 15]], ['3', [54, 36, 18]]] as const) {
      const h = harness();
      h.begin(choice);
      const total = h.game.totalSeconds;
      h.advance(total - 1);
      const t = h.text();
      expect(t).toContain(`ZAMAN UYARISI: Kalan süre ${marks[0]} saniye`);
      expect(t).toContain(`KRİTİK ZAMAN UYARISI: Son ${marks[1]} saniye`);
      expect(t).toContain(`KIRMIZI ALARM: Son ${marks[2]} saniye`);
      expect(h.out.filter((o) => o.type === 'sound' && o.name === 'warning')).toHaveLength(3);
      expect(h.out.filter((o) => o.type === 'sound' && o.name === 'tick')).toHaveLength(marks[2]);
      expect(h.game.urgent).toBe(true);
      expect(h.game.state).toBe('STAGE');
    }
  });

  it('a penalty that jumps past a threshold still raises the strongest alert once', () => {
    const h = harness();
    h.begin('1'); // 60 s, alerts at 36/24/12
    h.advance(20); // 40 left
    h.game.handleInput('hint');
    h.game.handleInput('skip'); // -10 -> 30 left, crosses 36
    expect(h.out.filter((o) => o.type === 'sound' && o.name === 'warning')).toHaveLength(1);
    expect(h.text()).toContain('ZAMAN UYARISI');
  });

  it('locks the system when time runs out, and retry gives a fresh run', () => {
    const h = harness();
    h.begin('1');
    const first = h.game.stages.map((s) => s.q.id);
    h.advance(61);
    expect(h.game.state).toBe('FAILED');
    expect(h.game.remainingSeconds()).toBe(0);
    expect(h.text()).toContain('SÜRE DOLDU. SİSTEM KİLİTLENDİ.');
    expect(h.text()).toContain('TRACE ROUTE AKTİF');
    expect(h.text()).toContain('YENİDEN DENE');
    h.game.handleInput('1'); // answers are ignored after lockout
    expect(h.game.state).toBe('FAILED');
    h.game.handleInput('retry');
    h.game.bootDone();
    h.game.handleInput('Tester');
    h.game.handleInput('1');
    h.game.stages.forEach((s) => expect(first).not.toContain(s.q.id));
  });
});

describe('stage answers', () => {
  it('a wrong answer costs 3 seconds and can end the run', () => {
    const h = harness();
    h.begin('1');
    h.game.handleInput('xyz');
    expect(h.game.remainingSeconds()).toBe(57);
    expect(h.text()).toContain('[-] HATALI: "xyz". (-3 SANİYE)');
    for (let i = 0; i < 19; i++) h.game.handleInput('xyz');
    expect(h.game.state).toBe('FAILED');
  });

  it('commands and hints cost nothing', () => {
    const h = harness();
    h.begin('2');
    for (const cmd of ['help', 'status', 'hint', 'leaderboard', 'clear', 'HINT', 'Status']) h.game.handleInput(cmd);
    expect(h.game.remainingSeconds()).toBe(75);
    expect(h.game.state).toBe('STAGE');
  });

  it('normalizes case, spaces, quotes and Turkish dotted/dotless I', () => {
    expect(isCorrectAnswer('  pi ng ', ['PING'])).toBe(true);
    expect(isCorrectAnswer('PİNG', ['PING'])).toBe(true);
    expect(isCorrectAnswer('lınux', ['LINUX'])).toBe(true);
    expect(isCorrectAnswer('"i++"', ['I++'])).toBe(true);
    expect(isCorrectAnswer('i--', ['I++'])).toBe(false);
  });

  it('never accepts the question text itself or an empty-ish answer', () => {
    const h = harness();
    h.begin('3');
    const q = h.game.stages[0].q;
    h.game.handleInput(q.text);
    expect(h.game.keys).toHaveLength(0);
  });
});

describe('hint and skip', () => {
  it('shows the skip button once per question, and a stale button does nothing', () => {
    const h = harness();
    h.begin('2');
    h.game.handleInput('hint');
    h.game.handleInput('hint');
    const rows = h.out.filter((o) => o.type === 'buttons');
    expect(rows).toHaveLength(1);
    const stale = rows[0].type === 'buttons' ? rows[0].buttons[0].action : null;
    expect(stale).toMatchObject({ type: 'skip', stage: 0 });
    h.game.handleInput(h.game.stages[0].q.answers[0]);
    expect(h.game.keys).toHaveLength(1);
    h.game.action(stale!); // button from question 1, now on question 2
    expect(h.game.keys).toHaveLength(1);
    expect(h.game.remainingSeconds()).toBe(75);
  });

  it('clear re-renders the question and keeps the skip unlocked', () => {
    const h = harness();
    h.begin('2');
    h.game.handleInput('hint');
    const mark = h.out.length;
    h.game.handleInput('clear');
    expect(h.text(mark)).toContain(h.game.stages[0].q.text);
    h.game.handleInput('skip');
    expect(h.game.keys).toHaveLength(1);
  });

  it('counts skips on the victory card', () => {
    const h = harness();
    h.begin('3');
    h.game.handleInput('hint');
    h.game.handleInput('skip');
    h.solveAll();
    h.game.handleInput(h.game.keys.join('-'));
    expect(h.text()).toContain('ATLANAN SORU: 1 / 3');
  });
});

describe('master key', () => {
  const toMaster = (seed = 3) => {
    const h = harness(seed);
    h.begin('2');
    h.solveAll();
    expect(h.game.state).toBe('MASTER_KEY');
    return h;
  };

  it('lists keys one per line and never shows the joined key', () => {
    const h = toMaster();
    const t = h.text();
    h.game.keys.forEach((k, i) => expect(t).toContain(`  ${i + 1}: [${k}]`));
    expect(t).toContain('GİRİŞ FORMATI: 1.ANAHTAR-2.ANAHTAR-3.ANAHTAR (Örn: ABC-DEF-GHI)');
    h.game.handleInput('status');
    h.game.handleInput('hint');
    h.game.handleInput('clear');
    expect(h.text()).not.toContain(h.game.keys.join('-'));
  });

  it('clear lists the keys again', () => {
    const h = toMaster();
    const mark = h.out.length;
    h.game.handleInput('clear');
    h.game.keys.forEach((k, i) => expect(h.text(mark)).toContain(`  ${i + 1}: [${k}]`));
  });

  it('explains forgotten hyphens and charges 5 seconds for any wrong entry', () => {
    const h = toMaster();
    h.game.handleInput(h.game.keys.join(' '));
    expect(h.text()).toContain('TİRE (-) koymayı unuttunuz!');
    expect(h.game.remainingSeconds()).toBe(70);
    h.game.handleInput('AAA-BBB-CCC');
    expect(h.game.remainingSeconds()).toBe(65);
    expect(h.game.state).toBe('MASTER_KEY');
  });

  it('accepts brackets, spaces and lowercase', () => {
    expect(checkMasterKey('[zero] - [neo] - [nexus]', ['ZERO', 'NEO', 'NEXUS'])).toBe('ok');
    expect(checkMasterKey('zeroneonexus', ['ZERO', 'NEO', 'NEXUS'])).toBe('missing-hyphens');
    expect(checkMasterKey('NEO-ZERO-NEXUS', ['ZERO', 'NEO', 'NEXUS'])).toBe('wrong');
  });

  it('wrong entries can run the clock out', () => {
    const h = toMaster();
    for (let i = 0; i < 15; i++) h.game.handleInput('NOPE');
    expect(h.game.state).toBe('FAILED');
  });
});

describe('victory and leaderboard', () => {
  it('records time used with one decimal, the difficulty and a full date', () => {
    const h = harness();
    h.begin('1', 'Neo');
    h.clock.ms += 12_340;
    h.solveAll();
    h.game.handleInput(h.game.keys.join('-'));
    expect(h.game.state).toBe('VICTORY');
    const [entry] = getLeaderboard(h.store, 'KOLAY');
    expect(entry).toMatchObject({ name: 'Neo', timeUsed: 12.3, diff: 'KOLAY' });
    expect(entry.date).toMatch(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/);
    expect(entry.key).toMatch(new RegExp(`^${h.game.keys.join('-')}-[0-9A-F]{4}$`));
    const t = h.text();
    expect(t).toContain('ROOT ACCESS GRANTED // LEVEL 4 CLEARANCE');
    expect(t).toContain('TAMAMLANMA SÜRESİ: 12,3 Saniye');
    expect(t).toContain('Derecen yerel liderlik tablosuna kaydedildi');
    expect(h.game.timerRunning).toBe(false);
  });

  it('keeps one board per difficulty, fastest first, old entries count as ORTA', () => {
    const h = harness();
    h.store.setItem('rootfall_lb', JSON.stringify([
      { name: 'old', timeUsed: 40, key: 'X' },
      { name: 'slow', timeUsed: 50, key: 'X', diff: 'ZOR' },
      { name: 'fast', timeUsed: 20.5, key: 'X', diff: 'ZOR' },
    ]));
    expect(getLeaderboard(h.store, 'ORTA').map((e) => e.name)).toEqual(['old']);
    expect(getLeaderboard(h.store, 'ZOR').map((e) => e.name)).toEqual(['fast', 'slow']);
    h.game.start();
    h.game.bootDone();
    h.game.handleInput('skor');
    const lb = h.out.find((o) => o.type === 'leaderboard');
    expect(lb && lb.type === 'leaderboard' && lb.boards.map((b) => b.diff)).toEqual([...DIFFICULTIES]);
  });

  it('clearing the leaderboard always asks first', () => {
    const h = harness();
    h.store.setItem('rootfall_lb', JSON.stringify([{ name: 'a', timeUsed: 1, key: 'X', diff: 'ORTA' }]));
    h.game.start();
    h.game.bootDone();
    h.game.handleInput('reset-board');
    expect(h.out.some((o) => o.type === 'confirm')).toBe(true);
    expect(getLeaderboard(h.store)).toHaveLength(1);
    h.game.resolveConfirm(false);
    expect(getLeaderboard(h.store)).toHaveLength(1);
    expect(h.text()).toContain('iptal edildi');
    h.game.resolveConfirm(true); // no pending request: must do nothing
    expect(getLeaderboard(h.store)).toHaveLength(1);
    h.game.action({ type: 'reset-board' });
    h.game.resolveConfirm(true);
    expect(getLeaderboard(h.store)).toHaveLength(0);
  });

  it('survives corrupt storage', () => {
    const h = harness();
    h.store.setItem('rootfall_lb', '{not json');
    expect(getLeaderboard(h.store)).toEqual([]);
  });
});

describe('screen rules', () => {
  it('never shows a per-question difficulty label or order', () => {
    const h = harness();
    h.begin('3');
    h.solveAll();
    const afterChoice = h.text().split('KÖK ERİŞİM PROTOKOLÜNE GEÇİLİYOR')[1];
    expect(afterChoice).not.toMatch(/KOLAY|ORTA|\bZOR\b/);
  });

  it('name needs at least 2 characters; Enter during boot only skips the animation', () => {
    const h = harness();
    h.game.start();
    h.game.handleInput('Neo');
    expect(h.out.some((o) => o.type === 'boot-skip')).toBe(true);
    expect(h.game.state).toBe('AWAIT_NAME');
    h.game.handleInput('x');
    expect(h.game.state).toBe('AWAIT_NAME');
    h.game.handleInput('Neo');
    expect(h.game.state).toBe('AWAIT_DIFFICULTY');
  });
});
