import { clamp } from "./Physics";

let ctx: AudioContext | null = null;
let masterVolume = 1;

/** Set the global volume multiplier (0 = silent, 1 = full). */
export function setMasterVolume(v: number) {
  masterVolume = clamp(v, 0, 1);
}

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

/** Unlock AudioContext on first user gesture (required by browsers) */
export function unlockAudio() {
  const resume = () => {
    if (ctx?.state === "suspended") ctx.resume();
  };
  for (const evt of ["touchstart", "mousedown", "keydown"]) {
    window.addEventListener(evt, resume, { once: false, passive: true });
  }
}

/** Create a white noise AudioBuffer of the given duration. */
function noiseBuffer(ac: AudioContext, duration: number): AudioBuffer {
  const len = Math.ceil(ac.sampleRate * duration);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** Create a GainNode with an exponential decay envelope. */
function decayGain(ac: AudioContext, now: number, volume: number, duration: number): GainNode {
  const gain = ac.createGain();
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  return gain;
}

/** Play a bandpass-filtered noise burst routed to destination. Returns the source node. */
function filteredNoiseBurst(
  ac: AudioContext,
  now: number,
  duration: number,
  volume: number,
  freq: number,
  q: number,
  freqEnd?: number,
): AudioBufferSourceNode {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, duration);

  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = q;
  if (freqEnd !== undefined) {
    bp.frequency.setValueAtTime(freq, now);
    bp.frequency.exponentialRampToValueAtTime(freqEnd, now + duration);
  } else {
    bp.frequency.value = freq;
  }

  src
    .connect(bp)
    .connect(decayGain(ac, now, volume, duration))
    .connect(ac.destination);
  src.start(now);
  src.stop(now + duration);
  return src;
}

/** Rate-limited sound player — prevents audio spam from rapid physics events. */
class RateLimitedSound {
  private lastTime = 0;
  private active = 0;
  private cooldown: number;
  private maxConcurrent: number;
  private play: (ac: AudioContext, now: number, intensity: number, onEnded: () => void) => void;

  constructor(
    cooldown: number,
    maxConcurrent: number,
    play: (ac: AudioContext, now: number, intensity: number, onEnded: () => void) => void,
  ) {
    this.cooldown = cooldown;
    this.maxConcurrent = maxConcurrent;
    this.play = play;
  }

  trigger(intensity: number, volume = 1): void {
    const effectiveVol = masterVolume * volume;
    if (effectiveVol < 0.01) return;

    const ac = getCtx();
    if (ac.state === "suspended") return;
    const now = ac.currentTime;

    if (now - this.lastTime < this.cooldown) return;
    if (this.active >= this.maxConcurrent) return;
    this.lastTime = now;
    this.active++;

    this.play(ac, now, intensity * effectiveVol, () => {
      this.active--;
    });
  }
}

const bounceSound = new RateLimitedSound(0.04, 3, (ac, now, intensity, onEnded) => {
  const vol = 0.02 + intensity * intensity * 0.35;
  const pitch = 250 + (1 - intensity) * 600;
  const dur = 0.03 + intensity * 0.1;

  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(pitch, now);
  osc.frequency.exponentialRampToValueAtTime(pitch * 0.4, now + dur);

  osc.connect(decayGain(ac, now, vol, dur)).connect(ac.destination);
  osc.start(now);
  osc.stop(now + dur);
  osc.onended = onEnded;
});

const woodSound = new RateLimitedSound(0.05, 3, (ac, now, intensity, onEnded) => {
  const vol = 0.015 + intensity * intensity * 0.25;
  const dur = 0.02 + intensity * 0.05;
  const freq = 800 + (1 - intensity) * 600;

  const src = filteredNoiseBurst(ac, now, dur, vol, freq, 2);
  src.onended = onEnded;
});

/** Short bounce thud — rate-limited to avoid overwhelming audio */
export function playBounce(intensity: number, volume = 1) {
  bounceSound.trigger(intensity, volume);
}

/** Woody clack for box/polygon collisions — rate-limited */
export function playWoodHit(intensity: number, volume = 1) {
  woodSound.trigger(intensity, volume);
}

/** Synthesized explosion: filtered noise burst + low-frequency boom */
export function playExplosion(volume = 0.5) {
  const ac = getCtx();
  if (ac.state === "suspended") ac.resume();
  const now = ac.currentTime;

  // Noise burst (crackle / blast)
  filteredNoiseBurst(ac, now, 0.4, volume, 800, 0.8, 200);

  // Low boom (sub bass)
  const boomDur = 0.5;
  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(80, now);
  osc.frequency.exponentialRampToValueAtTime(20, now + boomDur);

  osc.connect(decayGain(ac, now, volume * 0.8, boomDur)).connect(ac.destination);
  osc.start(now);
  osc.stop(now + boomDur);

  // Mid-frequency crunch
  filteredNoiseBurst(ac, now, 0.25, volume * 0.4, 2000, 1.5, 400);
}
