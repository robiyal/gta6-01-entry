// Dusthaven audio: everything synthesized with WebAudio — no audio files.
// Engine hum, skids, sirens, gunshots, punches, chimes and a desert-blues
// music loop (A-minor pentatonic bass + sparse lead) on a lookahead scheduler.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineNodes = null;
  let sirenNodes = null;
  let musicTimer = null;
  let musicStep = 0;
  let nextNoteTime = 0;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume();
  }

  function env(node, t0, a, peak, d) {
    node.gain.setValueAtTime(0.0001, t0);
    node.gain.linearRampToValueAtTime(peak, t0 + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    env(g, t0, 0.005, vol, dur);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function noiseBurst(dur, filterFreq, vol, type = 'lowpass') {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    const g = ctx.createGain();
    env(g, t0, 0.004, vol, dur);
    src.connect(f).connect(g).connect(master);
    src.start(t0);
  }

  // ---- Engine: two detuned saws + sub sine, pitch follows speed.
  function engineStart() {
    if (!ensure() || engineNodes) return;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 58;
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 28;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 1.2;
    const g = ctx.createGain(); g.gain.value = 0.0;
    o1.connect(f); o2.connect(f); sub.connect(f);
    f.connect(g).connect(master);
    o1.start(); o2.start(); sub.start();
    engineNodes = { o1, o2, sub, f, g };
  }
  function engineUpdate(speed01, on) {
    if (!engineNodes) return;
    const t = ctx.currentTime;
    const target = on && !muted ? 0.05 + speed01 * 0.06 : 0.0;
    engineNodes.g.gain.setTargetAtTime(target, t, 0.1);
    const freq = 55 + speed01 * 130;
    engineNodes.o1.frequency.setTargetAtTime(freq, t, 0.08);
    engineNodes.o2.frequency.setTargetAtTime(freq * 1.03, t, 0.08);
    engineNodes.sub.frequency.setTargetAtTime(freq * 0.5, t, 0.08);
    engineNodes.f.frequency.setTargetAtTime(320 + speed01 * 900, t, 0.1);
  }

  // ---- Siren: alternating two-tone square wave.
  function siren(on) {
    if (on) {
      if (!ensure() || sirenNodes) return;
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 720;
      const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 0.55;
      const lfoGain = ctx.createGain(); lfoGain.gain.value = 190;
      lfo.connect(lfoGain).connect(o.frequency);
      const g = ctx.createGain(); g.gain.value = 0.045;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
      o.connect(f).connect(g).connect(master);
      o.start(); lfo.start();
      sirenNodes = { o, lfo, g };
    } else if (sirenNodes) {
      try { sirenNodes.o.stop(); sirenNodes.lfo.stop(); } catch { /* already stopped */ }
      sirenNodes = null;
    }
  }

  // ---- Music: A-minor pentatonic, 100 BPM, bass + sparse lead, scheduled
  // a bar ahead so it never stutters on the main thread.
  const BASS = [55, 0, 55, 0, 65.41, 0, 49, 0, 55, 0, 55, 0, 82.41, 0, 73.42, 0];
  const LEAD = [220, 0, 0, 261.63, 0, 0, 329.63, 0, 0, 0, 293.66, 0, 0, 261.63, 0, 0];
  function scheduleNote(freq, t0, dur, vol, type) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }
  function musicStart() {
    if (!ensure() || musicTimer) return;
    nextNoteTime = ctx.currentTime + 0.1;
    const stepDur = 60 / 100 / 2; // 8th notes at 100 BPM
    musicTimer = setInterval(() => {
      if (muted) { nextNoteTime = Math.max(nextNoteTime, ctx.currentTime + 0.1); return; }
      while (nextNoteTime < ctx.currentTime + 0.35) {
        const i = musicStep % 16;
        if (BASS[i]) scheduleNote(BASS[i], nextNoteTime, stepDur * 1.8, 0.11, 'triangle');
        if (LEAD[i] && musicStep % 32 < 16) scheduleNote(LEAD[i], nextNoteTime, stepDur * 2.4, 0.05, 'sine');
        // Dusty hi-hat tick on the off-beats.
        if (i % 4 === 2) {
          const t0 = nextNoteTime;
          const len = Math.floor(ctx.sampleRate * 0.03);
          const buf = ctx.createBuffer(1, len, ctx.sampleRate);
          const d = buf.getChannelData(0);
          for (let k = 0; k < len; k++) d[k] = (Math.random() * 2 - 1) * (1 - k / len) * 0.4;
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
          const g = ctx.createGain(); g.gain.value = 0.12;
          src.connect(f).connect(g).connect(master);
          src.start(t0);
        }
        nextNoteTime += stepDur;
        musicStep += 1;
      }
    }, 90);
  }
  function musicStop() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  return {
    unlock, engineStart, engineUpdate, siren, musicStart, musicStop,
    gunshot() { noiseBurst(0.16, 1800, 0.5); blip(160, 0.12, 'sine', 0.5, 50); },
    punch() { noiseBurst(0.09, 500, 0.5); blip(120, 0.08, 'sine', 0.4, 60); },
    reload() { blip(700, 0.05, 'square', 0.12); setTimeout(() => blip(900, 0.05, 'square', 0.12), 250); },
    pickup() { blip(660, 0.12, 'sine', 0.25); setTimeout(() => blip(880, 0.18, 'sine', 0.25), 110); },
    complete() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.22), i * 130)); },
    fail() { blip(220, 0.3, 'sawtooth', 0.18, 110); },
    crash() { noiseBurst(0.25, 900, 0.5); },
    skid() { noiseBurst(0.12, 2400, 0.1, 'bandpass'); },
    click() { blip(900, 0.04, 'square', 0.1); },
    busted() { blip(392, 0.2, 'square', 0.18); setTimeout(() => blip(311, 0.4, 'square', 0.18), 200); },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() { return muted; },
  };
}
