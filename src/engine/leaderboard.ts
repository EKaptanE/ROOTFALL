import type { Difficulty, KeyValueStore, LeaderboardEntry } from './types';

export const LEADERBOARD_STORAGE_KEY = 'rootfall_lb';
const MAX_ENTRIES = 150;

/** Runs without skips rank above runs with skips; within the same skip count, fastest first. */
const byRank = (a: LeaderboardEntry, b: LeaderboardEntry): number =>
  (a.skips ?? 0) - (b.skips ?? 0) || a.timeUsed - b.timeUsed;

/** Sorted best first. Entries without a difficulty (pre-v7) count as ORTA. */
export function getLeaderboard(store: KeyValueStore, diff?: Difficulty): LeaderboardEntry[] {
  try {
    const list = JSON.parse(store.getItem(LEADERBOARD_STORAGE_KEY) || '[]');
    if (Array.isArray(list)) {
      return list
        .filter((e) => e && typeof e.timeUsed === 'number' && typeof e.name === 'string')
        .filter((e) => !diff || (e.diff || 'ORTA') === diff)
        .sort(byRank);
    }
  } catch {
    /* corrupt or unavailable storage: behave as empty */
  }
  return [];
}

export function saveScore(store: KeyValueStore, entry: LeaderboardEntry): void {
  try {
    const board = getLeaderboard(store);
    board.push({ ...entry, name: entry.name.trim() });
    board.sort(byRank);
    store.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(board.slice(0, MAX_ENTRIES)));
  } catch {
    /* storage full or unavailable: the run still counts on screen */
  }
}

export const OPERATOR_STORAGE_KEY = 'rootfall_operator';

/** The code name used last time, to prefill the name prompt. */
export function getLastOperator(store: KeyValueStore): string {
  try {
    return (store.getItem(OPERATOR_STORAGE_KEY) ?? '').slice(0, 40);
  } catch {
    return '';
  }
}

export function saveLastOperator(store: KeyValueStore, name: string): void {
  try {
    store.setItem(OPERATOR_STORAGE_KEY, name);
  } catch {
    /* not remembered, nothing else changes */
  }
}

export function resetLeaderboard(store: KeyValueStore): boolean {
  try {
    store.removeItem(LEADERBOARD_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** "12.11.2026 21:57" in local time. */
export function formatDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
