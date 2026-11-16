// Procedural sound: every effect is synthesised with WebAudio, so the game ships
// no audio files and makes no network request. One shared noise buffer, reused.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function noise(dur, freq, gain, type = 'lowpass', sweepTo = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (sweepTo > 0) filter.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur);
  }

  function tone(freq, dur, gain, type = 'sine', slideTo = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur);
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    shot(kind) {
      if (kind === 'dmr') { noise(0.22, 2600, 0.5, 'bandpass', 300); tone(140, 0.16, 0.35, 'triangle', 55); }
      else if (kind === 'smg') { noise(0.09, 3200, 0.32, 'bandpass', 500); }
      else if (kind === 'pistol') { noise(0.12, 2200, 0.4, 'bandpass', 350); }
      else { noise(0.16, 1800, 0.5, 'bandpass', 220); tone(110, 0.12, 0.3, 'triangle', 60); }
    },
    distantShot() { noise(0.18, 700, 0.16, 'lowpass', 180); },
    dryFire() { tone(1200, 0.03, 0.12, 'square'); },
    reload() { tone(900, 0.04, 0.14, 'square'); setTimeout(() => tone(620, 0.05, 0.14, 'square'), 260); },
    hit(kill) { tone(kill ? 1560 : 1180, 0.06, 0.2, 'sine'); if (kill) setTimeout(() => tone(1960, 0.09, 0.2, 'sine'), 70); },
    hurt() { noise(0.12, 500, 0.3, 'lowpass'); tone(90, 0.14, 0.25, 'sawtooth', 60); },
    plantBeep() { tone(880, 0.07, 0.18, 'sine'); },
    defuseBeep() { tone(660, 0.07, 0.16, 'sine'); },
    explode() {
      noise(1.1, 900, 0.9, 'lowpass', 60);
      tone(70, 0.9, 0.55, 'sine', 28);
      setTimeout(() => noise(0.5, 400, 0.3, 'lowpass', 90), 120);
    },
    grenadePin() { tone(1400, 0.03, 0.12, 'square'); },
    roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.16, 0.2, 'triangle'), i * 110)); },
    roundLose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.18, 0.18, 'triangle'), i * 120)); },
    buy() { tone(980, 0.05, 0.16, 'sine'); setTimeout(() => tone(1240, 0.06, 0.16, 'sine'), 60); },
    denied() { tone(220, 0.12, 0.2, 'square'); },
  };
}
