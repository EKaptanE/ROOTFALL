import type { Difficulty, KeyValueStore, LeaderboardEntry } from './types';

export const LEADERBOARD_STORAGE_KEY = 'rootfall_lb';
const MAX_ENTRIES = 150;

/** Sorted fastest first. Entries without a difficulty (pre-v7) count as ORTA. */
export function getLeaderboard(store: KeyValueStore, diff?: Difficulty): LeaderboardEntry[] {
  try {
    const list = JSON.parse(store.getItem(LEADERBOARD_STORAGE_KEY) || '[]');
    if (Array.isArray(list)) {
      return list
        .filter((e) => e && typeof e.timeUsed === 'number' && typeof e.name === 'string')
        .filter((e) => !diff || (e.diff || 'ORTA') === diff)
        .sort((a, b) => a.timeUsed - b.timeUsed);
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
    board.sort((a, b) => a.timeUsed - b.timeUsed);
    store.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(board.slice(0, MAX_ENTRIES)));
  } catch {
    /* storage full or unavailable: the run still counts on screen */
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
