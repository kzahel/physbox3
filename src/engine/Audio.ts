let ctx: AudioContext | null = null;

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

/** Synthesized explosion: filtered noise burst + low-frequency boom */
export function playExplosion(volume = 0.5) {
  const ac = getCtx();
  if (ac.state === "suspended") ac.resume();
  const now = ac.currentTime;

  // --- Noise burst (crackle / blast) ---
  const noiseDur = 0.4;
  const noiseLen = Math.ceil(ac.sampleRate * noiseDur);
  const noiseBuf = ac.createBuffer(1, noiseLen, ac.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noiseSrc = ac.createBufferSource();
  noiseSrc.buffer = noiseBuf;

  // Bandpass to shape the noise
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(800, now);
  bp.frequency.exponentialRampToValueAtTime(200, now + noiseDur);
  bp.Q.value = 0.8;

  const noiseGain = ac.createGain();
  noiseGain.gain.setValueAtTime(volume, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + noiseDur);

  noiseSrc.connect(bp).connect(noiseGain).connect(ac.destination);
  noiseSrc.start(now);
  noiseSrc.stop(now + noiseDur);

  // --- Low boom (sub bass) ---
  const boomDur = 0.5;
  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(80, now);
  osc.frequency.exponentialRampToValueAtTime(20, now + boomDur);

  const boomGain = ac.createGain();
  boomGain.gain.setValueAtTime(volume * 0.8, now);
  boomGain.gain.exponentialRampToValueAtTime(0.001, now + boomDur);

  osc.connect(boomGain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + boomDur);

  // --- Mid-frequency crunch ---
  const crunchDur = 0.25;
  const crunchBuf = ac.createBuffer(1, Math.ceil(ac.sampleRate * crunchDur), ac.sampleRate);
  const crunchData = crunchBuf.getChannelData(0);
  for (let i = 0; i < crunchData.length; i++) {
    crunchData[i] = Math.random() * 2 - 1;
  }

  const crunchSrc = ac.createBufferSource();
  crunchSrc.buffer = crunchBuf;

  const crunchBp = ac.createBiquadFilter();
  crunchBp.type = "bandpass";
  crunchBp.frequency.setValueAtTime(2000, now);
  crunchBp.frequency.exponentialRampToValueAtTime(400, now + crunchDur);
  crunchBp.Q.value = 1.5;

  const crunchGain = ac.createGain();
  crunchGain.gain.setValueAtTime(volume * 0.4, now);
  crunchGain.gain.exponentialRampToValueAtTime(0.001, now + crunchDur);

  crunchSrc.connect(crunchBp).connect(crunchGain).connect(ac.destination);
  crunchSrc.start(now);
  crunchSrc.stop(now + crunchDur);
}
