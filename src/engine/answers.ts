/** Turkish keyboards produce İ/ı for the i key; fold both to plain I so "PİNG" equals "PING". */
export const foldTurkishI = (s: string): string => s.replace(/[\u0130\u0131]/g, 'I').replace(/\u0307/g, '');

/** Uppercase, strip whitespace and quote characters. */
export const normalizeAnswer = (s: string): string => foldTurkishI(s).toUpperCase().replace(/[\s'"`]/g, '');

/** Lowercase form used to recognise commands (hint, skip, ...). */
export const normalizeCommand = (s: string): string => foldTurkishI(s).toLowerCase();

export const isCorrectAnswer = (input: string, accepted: string[]): boolean =>
  accepted.map(normalizeAnswer).includes(normalizeAnswer(input));

export type MasterKeyResult = 'ok' | 'missing-hyphens' | 'wrong';

export function checkMasterKey(input: string, keys: string[]): MasterKeyResult {
  const ks = keys.map((k) => k.replace(/-/g, '').trim().toUpperCase());
  const clean = foldTurkishI(input).trim().toUpperCase().replace(/[[\]\s]/g, '');
  if (clean === ks.join('-')) return 'ok';
  const noSep = foldTurkishI(input).trim().toUpperCase().replace(/[\s\-_,.:;[\]]/g, '');
  if (noSep === ks.join('') && !input.includes('-')) return 'missing-hyphens';
  return 'wrong';
}

/** 23.4 -> "23,4" (Turkish decimal comma). */
export const formatSeconds = (n: number): string => n.toFixed(1).replace('.', ',');

/** Seconds -> "[mm:ss]". */
export function formatClock(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `[${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}]`;
}
