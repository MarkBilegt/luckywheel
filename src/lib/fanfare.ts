/**
 * The winning fanfare: an original ~3 s celebration built from Web Audio parts.
 *
 *   0.00  drum boom + cymbal, brass section starts a rising call (with harmony and bass)
 *   0.77  snare roll builds up into…
 *   1.05  BIG hit: boom + crash + full held brass chord with vibrato,
 *         glockenspiel runs up and down, coins shimmer, the crowd claps
 *   ~3.2  everything rings out in the reverb
 *
 * Everything goes through a hall reverb and a limiter, so it's big but never distorts.
 * Works with a live AudioContext or an OfflineAudioContext (used to test it).
 */

// Notes (Hz)
const C2 = 65.41, G2 = 98, C3 = 130.81;
const C4 = 261.63, E4 = 329.63, G4 = 392;
const C5 = 523.25, E5 = 659.25, G5 = 783.99, A5 = 880, B5 = 987.77;
const C6 = 1046.5, E6 = 1318.51, G6 = 1567.98, C7 = 2093, E7 = 2637.02, G7 = 3135.96, C8 = 4186.01;

export const FANFARE_SECONDS = 3.4;

export function buildFanfare(c: BaseAudioContext, out: AudioNode, t0: number): void {
  // ---------- shared chain: (dry + reverb) → limiter → out ----------
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 10;
  limiter.ratio.value = 4;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  const makeup = c.createGain();
  makeup.gain.value = 0.95; // peaks stay under full scale even at 100% volume
  limiter.connect(makeup).connect(out);

  const reverb = c.createConvolver();
  reverb.buffer = hallImpulse(c, 2.4);
  const reverbReturn = c.createGain();
  reverbReturn.gain.value = 0.55;
  reverb.connect(reverbReturn).connect(limiter);

  /** Routes a voice to the mix, panned, with some of it sent to the reverb. */
  const route = (node: AudioNode, pan: number, wet: number) => {
    const p = c.createStereoPanner();
    p.pan.value = pan;
    node.connect(p);
    p.connect(limiter);
    if (wet > 0) {
      const send = c.createGain();
      send.gain.value = wet;
      p.connect(send).connect(reverb);
    }
  };

  const noise = noiseBuffer(c, 2.5);

  // ---------- instruments ----------

  /** Brass: three detuned sawtooths through a filter that opens as the note speaks. */
  const brass = (f: number, s: number, d: number, peak: number, pan = 0, vibrato = false) => {
    const amp = c.createGain();
    amp.gain.setValueAtTime(0, t0 + s);
    amp.gain.linearRampToValueAtTime(peak, t0 + s + 0.03);
    amp.gain.linearRampToValueAtTime(peak * 0.75, t0 + s + 0.15);
    amp.gain.setValueAtTime(peak * 0.75, t0 + s + d);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + s + d + 0.18);

    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 2;
    filter.frequency.setValueAtTime(Math.max(300, f * 1.2), t0 + s);
    filter.frequency.exponentialRampToValueAtTime(Math.min(9000, f * 9), t0 + s + 0.05);
    filter.frequency.exponentialRampToValueAtTime(Math.min(7000, f * 4), t0 + s + 0.3);
    filter.connect(amp);
    route(amp, pan, 0.3);

    let lfoDepth: GainNode | null = null;
    let lfo: OscillatorNode | null = null;
    if (vibrato) {
      lfo = c.createOscillator();
      lfo.frequency.value = 5.5;
      lfoDepth = c.createGain();
      lfoDepth.gain.setValueAtTime(0, t0 + s);
      lfoDepth.gain.linearRampToValueAtTime(f * 0.007, t0 + s + 0.6);
      lfo.connect(lfoDepth);
      lfo.start(t0 + s);
      lfo.stop(t0 + s + d + 0.25);
    }
    for (const cents of [-8, 0, 8]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = cents;
      if (lfoDepth) lfoDepth.connect(o.frequency);
      o.connect(filter);
      o.start(t0 + s);
      o.stop(t0 + s + d + 0.25);
    }
  };

  /** Deep drum: a sine that drops in pitch. */
  const boom = (s: number, peak: number) => {
    const o = c.createOscillator();
    o.frequency.setValueAtTime(150, t0 + s);
    o.frequency.exponentialRampToValueAtTime(42, t0 + s + 0.3);
    const g = c.createGain();
    g.gain.setValueAtTime(peak, t0 + s);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + s + 0.5);
    o.connect(g);
    route(g, 0, 0.2);
    o.start(t0 + s);
    o.stop(t0 + s + 0.55);
  };

  /** Cymbal crash: bright noise with a long tail. */
  const crash = (s: number, peak: number, length: number) => {
    const src = c.createBufferSource();
    src.buffer = noise;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5500;
    const g = c.createGain();
    g.gain.setValueAtTime(peak, t0 + s);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + s + length);
    src.connect(hp).connect(g);
    route(g, 0, 0.35);
    src.start(t0 + s);
    src.stop(t0 + s + length);
  };

  /** Snare: a noise crack plus a short tone. */
  const snare = (s: number, peak: number) => {
    const src = c.createBufferSource();
    src.buffer = noise;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2000;
    bp.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(peak, t0 + s);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + s + 0.12);
    src.connect(bp).connect(g);
    route(g, 0.1, 0.25);
    src.start(t0 + s, Math.random());
    src.stop(t0 + s + 0.13);

    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 190;
    const tg = c.createGain();
    tg.gain.setValueAtTime(peak * 0.6, t0 + s);
    tg.gain.exponentialRampToValueAtTime(0.0001, t0 + s + 0.08);
    o.connect(tg);
    route(tg, 0.1, 0.1);
    o.start(t0 + s);
    o.stop(t0 + s + 0.09);
  };

  /** Glockenspiel: a sine plus a slightly out-of-tune overtone, ringing. */
  const bell = (f: number, s: number, peak: number, pan: number) => {
    for (const [mult, level, ring] of [[1, 1, 0.9], [2.76, 0.35, 0.4], [5.4, 0.12, 0.2]] as const) {
      const o = c.createOscillator();
      o.frequency.value = f * mult;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0 + s);
      g.gain.exponentialRampToValueAtTime(peak * level, t0 + s + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + s + ring);
      o.connect(g);
      route(g, pan, 0.5);
      o.start(t0 + s);
      o.stop(t0 + s + ring + 0.05);
    }
  };

  /** One hand clap: a few very short noise bursts. */
  const clap = (s: number, peak: number, pan: number) => {
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900 + Math.random() * 1400;
    bp.Q.value = 0.9;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0 + s);
    for (const [dt, lvl] of [[0, 1], [0.008, 0.7], [0.017, 0.9]] as const) {
      g.gain.setValueAtTime(peak * lvl, t0 + s + dt);
      g.gain.exponentialRampToValueAtTime(peak * 0.15, t0 + s + dt + 0.007);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + s + 0.09);
    const src = c.createBufferSource();
    src.buffer = noise;
    src.connect(bp).connect(g);
    route(g, pan, 0.2);
    src.start(t0 + s, Math.random() * 2);
    src.stop(t0 + s + 0.1);
  };

  // ---------- the score ----------
  const HIT = 1.05;

  // Opening: boom + light cymbal.
  boom(0, 0.65);
  crash(0, 0.08, 0.9);

  // Lead call (rising), harmony a third/sixth below, bass underneath.
  const lead: [number, number, number][] = [
    [G4, 0.0, 0.1], [C5, 0.11, 0.1], [E5, 0.22, 0.1], [G5, 0.33, 0.2],
    [E5, 0.55, 0.1], [G5, 0.66, 0.1], [A5, 0.77, 0.12], [B5, 0.9, 0.12],
  ];
  const harmony: [number, number, number][] = [
    [E4, 0.0, 0.1], [G4, 0.11, 0.1], [C5, 0.22, 0.1], [E5, 0.33, 0.2],
    [C5, 0.55, 0.1], [E5, 0.66, 0.1], [E5, 0.77, 0.12], [G5, 0.9, 0.12],
  ];
  // Kept a little lighter than the hit, so the hit feels like the big moment.
  lead.forEach(([f, s, d]) => brass(f, s, d, 0.14, -0.15));
  harmony.forEach(([f, s, d]) => brass(f, s, d, 0.085, 0.2));
  brass(C3, 0, 0.5, 0.16);
  brass(G2, 0.55, 0.45, 0.16);

  // Snare roll building into the hit.
  for (let i = 0; i < 8; i++) snare(0.77 + i * 0.035, 0.12 + i * 0.04);

  // THE HIT: boom, big crash, full brass chord with vibrato, bass.
  boom(HIT, 1);
  crash(HIT, 0.32, 2.3);
  [C4, E4, G4, C5, E5, G5].forEach((f, i) => brass(f, HIT, 1.75, 0.1, i % 2 ? 0.45 : -0.45, true));
  brass(C6, HIT, 1.75, 0.13, 0, true); // the top note sings out
  brass(C3, HIT, 1.75, 0.2);
  brass(C2, HIT, 1.75, 0.16);

  // Glockenspiel: run up, then sparkle back down.
  [C6, E6, G6, C7, E7, G7, C8].forEach((f, i) => bell(f, HIT + 0.02 + i * 0.06, 0.13, i % 2 ? 0.5 : -0.5));
  [G7, E7, C7, G6, E6, C6].forEach((f, i) => bell(f, HIT + 0.62 + i * 0.075, 0.09, i % 2 ? -0.4 : 0.4));

  // Coins shimmering.
  for (let i = 0; i < 16; i++) {
    bell(2600 + Math.random() * 2600, HIT + 0.05 + Math.random() * 1.5, 0.045, Math.random() * 1.6 - 0.8);
  }

  // The crowd claps: dense at first, thinning out.
  for (let i = 0; i < 55; i++) {
    const s = HIT + 0.05 + Math.pow(Math.random(), 1.6) * 2.0;
    const fade = 1 - (s - HIT) / 2.2;
    clap(s, 0.18 * Math.max(0.15, fade), Math.random() * 1.4 - 0.7);
  }
}

/** A stereo "hall" impulse: decaying noise, so the convolver sounds like a big room. */
function hallImpulse(c: BaseAudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return buf;
}

function noiseBuffer(c: BaseAudioContext, seconds: number): AudioBuffer {
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
