// Shared types for the ROOTFALL engine. Nothing in src/engine touches the DOM.

export type Difficulty = 'KOLAY' | 'ORTA' | 'ZOR';
export const DIFFICULTIES: readonly Difficulty[] = ['KOLAY', 'ORTA', 'ZOR'];

export interface Question {
  id: string;
  text: string;
  answers: string[];
  hint: string;
  guide?: string[];
  lang?: string;
  code?: string[];
}

export interface Category {
  id: string;
  icon: string;
  title: string;
  inputPlaceholder: string;
  questions: Record<Difficulty, Question[]>;
}

export interface DifficultyConfig {
  time: number;
  skipCost: number;
}

export interface Content {
  difficulties: Record<Difficulty, DifficultyConfig>;
  /** Seconds lost per wrong stage answer / wrong master key. */
  penalties: { wrongAnswer: number; masterKey: number };
  keyWords: string[];
  categories: Category[];
}

/** Semantic colors. The UI maps them to its theme. */
export type Tone = 'accent' | 'info' | 'text' | 'dim' | 'ok' | 'warn' | 'danger' | 'alert';

export interface Span {
  t: string;
  tone?: Tone;
  bold?: boolean;
  glow?: boolean;
}

export interface Line {
  spans: Span[];
  tone?: Tone;
  bold?: boolean;
  glow?: boolean;
}

export type SoundName = 'key' | 'error' | 'siren' | 'stageClear' | 'fanfare' | 'warning' | 'tick';

export type ButtonAction =
  | { type: 'skip'; run: number; stage: number }
  | { type: 'new-game' }
  | { type: 'reset-board' };

export interface ButtonSpec {
  label: string;
  tone: Tone;
  action: ButtonAction;
}

export interface LeaderboardEntry {
  name: string;
  /** Seconds, one decimal. */
  timeUsed: number;
  key: string;
  diff?: Difficulty;
  date?: string;
}

export interface BoardView {
  diff: Difficulty;
  time: number;
  tone: Tone;
  entries: LeaderboardEntry[];
}

/** Everything the engine tells the UI. Plain data, so tests can inspect it. */
export type Out =
  | ({ type: 'line' } & Line)
  | { type: 'rule'; heavy: boolean; tone: Tone }
  | { type: 'clear' }
  | { type: 'boot'; lines: Line[] }
  | { type: 'boot-skip' }
  | { type: 'code'; lang: string; lines: string[] }
  | { type: 'buttons'; note?: Span[]; buttons: ButtonSpec[] }
  | { type: 'card'; title: string; rows: { label: string; value: Span }[]; body: Line[] }
  | { type: 'leaderboard'; boards: BoardView[] }
  | { type: 'board-reset' }
  | { type: 'confirm'; message: string }
  | { type: 'prompt'; label: string; danger: boolean; placeholder: string }
  | { type: 'sound'; name: SoundName }
  | { type: 'shake' }
  | { type: 'flash'; tone: 'ok' | 'danger' };

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
