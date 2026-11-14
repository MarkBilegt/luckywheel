/**
 * Wheel sounds, made with the Web Audio API (no audio files to download or license).
 *  - tick: a short wooden "clack" each time a slice divider passes the pointer
 *  - win:  a ~3 s brass fanfare with drums, bells, coins and applause (fanfare.ts)
 *
 * Browsers only allow sound after the visitor interacts, so call unlockAudio() from the click
 * that starts the spin.
 */

import { buildFanfare } from './fanfare';

const MUTE_KEY = 'lw:muted';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    /* private mode etc. — the toggle still works for this visit */
  }
  if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : currentVolume, ctx.currentTime, 0.02);
}

let currentVolume = 0.7;

/** Creates/resumes the audio engine. Must be called from a click or tap. `volume` is 0–1. */
export function unlockAudio(volume: number): void {
  currentVolume = Math.max(0, Math.min(1, volume));
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
      master = ctx.createGain();
      master.connect(ctx.destination);
      // 30 ms of white noise, reused for every tick's "clack".
      noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.03), ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume();
    master!.gain.value = isMuted() ? 0 : currentVolume;
  } catch {
    ctx = null; // no sound available; the wheel works without it
  }
}

function ready(): AudioContext | null {
  return ctx && master && ctx.state === 'running' && !isMuted() ? ctx : null;
}

/** Shapes a gain node: quick attack, exponential fade. */
function envelope(c: AudioContext, start: number, peak: number, attack: number, decay: number): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);
  return g;
}

/** One "clack" of the pointer flap hitting a peg. Slight random pitch so it doesn't sound robotic. */
export function playTick(at?: number): (() => void) | undefined {
  const c = ready();
  if (!c || !noise) return;
  const t = at ?? c.currentTime;

  // Body: a short falling blip.
  const osc = c.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(1500 + Math.random() * 250, t);
  osc.frequency.exponentialRampToValueAtTime(420, t + 0.035);
  const body = envelope(c, t, 0.35, 0.002, 0.05);
  osc.connect(body).connect(master!);
  osc.start(t);
  osc.stop(t + 0.07);

  // Snap: a burst of filtered noise.
  const src = c.createBufferSource();
  src.buffer = noise;
  const hp = c.createBiquadFilter();
  hp.type = 'bandpass';
  hp.frequency.value = 3200;
  hp.Q.value = 0.9;
  const snap = envelope(c, t, 0.5, 0.001, 0.025);
  src.connect(hp).connect(snap).connect(master!);
  src.start(t);
  src.stop(t + 0.03);
  return () => {
    try {
      osc.stop();
      src.stop();
    } catch {
      /* already finished */
    }
  };
}

/**
 * Converts a page time (performance.now() ms) to the audio-clock time at which a sound must be
 * scheduled so it is *heard* at that moment, allowing for the speakers' output delay.
 */
function audioTimeFor(c: AudioContext, pageMs: number): number {
  const stamp = c.getOutputTimestamp?.();
  if (stamp && stamp.contextTime && stamp.performanceTime) {
    // The browser tells us which audio time is coming out of the speakers right now (incl. latency).
    return stamp.contextTime + (pageMs - stamp.performanceTime) / 1000;
  }
  const latency = (c.outputLatency || 0) || c.baseLatency || 0;
  return c.currentTime + (pageMs - performance.now()) / 1000 - latency;
}

/**
 * Schedules ticks so each is heard at `startMs + times[i] * 1000` (page clock, performance.now()).
 * Ticks already in the past are skipped. Returns a function that cancels any that haven't played.
 */
export function scheduleTicks(times: number[], startMs = performance.now()): () => void {
  const c = ready();
  if (!c) return () => {};
  const now = c.currentTime;
  const stops: (() => void)[] = [];
  for (const t of times) {
    const at = audioTimeFor(c, startMs + t * 1000);
    if (at < now) continue;
    const stop = playTick(at);
    if (stop) stops.push(stop);
  }
  return () => stops.forEach((stop) => stop());
}

/** The big winning fanfare (brass, drums, bells, coins, applause, hall reverb). See fanfare.ts. */
export function playWin(): void {
  const c = ready();
  if (!c) return;
  buildFanfare(c, master!, c.currentTime + 0.03);
}
