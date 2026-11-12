// All sounds are synthesized with the Web Audio API; there are no audio files.
import type { SoundName } from '../engine/types';

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

/** Creates/resumes the audio context. Browsers only allow this after a user gesture. */
export function unlockAudio(): AudioContext | null {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (Ctor) ctx = new Ctor();
  }
  if (ctx && ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

interface Tone {
  type: OscillatorType;
  from: number;
  to?: number;
  /** 'ramp' glides to `to`; 'step' jumps to it at `stepAt`. */
  stepAt?: number;
  gain: number;
  dur: number;
  at?: number;
}

function tone(c: AudioContext, t: Tone): void {
  const osc = c.createOscillator();
  const gain = c.createGain();
  const start = c.currentTime + (t.at ?? 0);
  osc.type = t.type;
  osc.frequency.setValueAtTime(t.from, start);
  if (t.to !== undefined) {
    if (t.stepAt !== undefined) osc.frequency.setValueAtTime(t.to, start + t.stepAt);
    else osc.frequency.exponentialRampToValueAtTime(t.to, start + t.dur);
  }
  gain.gain.setValueAtTime(t.gain, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + t.dur);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(start);
  osc.stop(start + t.dur);
}

const sequence = (notes: { f: number; d: number }[], type: OscillatorType, gain: number, gap: number): Tone[] => {
  let at = 0.05;
  return notes.map((n) => {
    const t: Tone = { type, from: n.f, gain, dur: n.d, at };
    at += n.d + gap;
    return t;
  });
};

const SOUNDS: Record<SoundName, () => Tone[]> = {
  // short blip on every Enter
  key: () => {
    const f = 700 + Math.random() * 400;
    return [{ type: Math.random() > 0.5 ? 'triangle' : 'square', from: f, to: f * 0.5, gain: 0.035, dur: 0.025 }];
  },
  // low dual sawtooth buzz
  error: () => [130, 85].map((f) => ({ type: 'sawtooth' as const, from: f, to: f * 0.9, stepAt: 0.15, gain: 0.1, dur: 0.32 })),
  // downward sweeping alarm
  siren: () => [{ type: 'sawtooth', from: 440, to: 220, gain: 0.13, dur: 0.4 }],
  // rising C-E-G arpeggio
  stageClear: () => [523.25, 659.25, 783.99].map((f, i) => ({ type: 'sine' as const, from: f, gain: 0.09, dur: 0.18, at: i * 0.08 })),
  fanfare: () =>
    sequence(
      [{ f: 523.25, d: 0.12 }, { f: 659.25, d: 0.12 }, { f: 783.99, d: 0.12 }, { f: 1046.5, d: 0.22 }, { f: 880, d: 0.14 }, { f: 1046.5, d: 0.45 }],
      'square',
      0.07,
      0.02,
    ),
  // two-tone sonar
  warning: () => [660, 880].map((f, i) => ({ type: 'sine' as const, from: f, gain: 0.12, dur: 0.14, at: i * 0.12 })),
  // heartbeat during the last 20%
  tick: () => [{ type: 'triangle', from: 1100, to: 400, gain: 0.03, dur: 0.018 }],
};

export function playSound(name: SoundName): void {
  if (!enabled) return;
  const c = unlockAudio();
  if (!c) return;
  try {
    SOUNDS[name]().forEach((t) => tone(c, t));
  } catch {
    /* audio is decoration; never let it break the game */
  }
}
