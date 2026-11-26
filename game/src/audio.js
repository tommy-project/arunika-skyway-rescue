// Procedural Web Audio only: no sound files. Engine hum follows throttle,
// wind noise follows airspeed, plus a beacon chime, a warning beep, a
// touchdown thump and a success jingle. Audio starts on the first user
// gesture and never blocks the game if autoplay is restricted.
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let windSource = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      // Engine: two detuned sawtooth oscillators through a low-pass filter.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 70;
      const engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 71.5;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
      engineOsc2.start();
      // Wind: looped noise buffer through a band-pass filter.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      windSource = ctx.createBufferSource();
      windSource.buffer = buf;
      windSource.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(ctx.destination);
      windSource.start();
      started = true;
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, when) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + (when || 0);
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol || 0.15, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  return {
    // Call from any user gesture (click or keypress) so autoplay allows it.
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    setFlight(throttle, speed, stalled) {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      engineGain.gain.setTargetAtTime(0.05 + throttle * 0.09, t, 0.1);
      engineOsc.frequency.setTargetAtTime(55 + throttle * 90 + (stalled ? 12 : 0), t, 0.1);
      windGain.gain.setTargetAtTime(Math.min(0.16, speed * 0.0022), t, 0.15);
      windFilter.frequency.setTargetAtTime(400 + speed * 12, t, 0.15);
    },
    setMuted(value) {
      muted = value;
      if (ctx) {
        const t = ctx.currentTime;
        if (engineGain) engineGain.gain.setTargetAtTime(value ? 0 : 0.08, t, 0.05);
        if (windGain) windGain.gain.setTargetAtTime(0, t, 0.05);
      }
    },
    isMuted() {
      return muted;
    },
    chime() {
      tone(880, 0.35, 'sine', 0.18, 0);
      tone(1318, 0.5, 'sine', 0.15, 0.09);
    },
    supply() {
      tone(660, 0.2, 'triangle', 0.14, 0);
    },
    beep() {
      tone(440, 0.12, 'square', 0.08, 0);
    },
    thump() {
      if (!ctx || muted) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, t0);
      osc.frequency.exponentialRampToValueAtTime(45, t0 + 0.18);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.35, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.25);
    },
    jingle() {
      const notes = [523, 659, 784, 1047];
      for (let i = 0; i < notes.length; i += 1) tone(notes[i], 0.4, 'triangle', 0.16, i * 0.13);
    },
    crash() {
      if (!ctx || muted) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, t0);
      osc.frequency.exponentialRampToValueAtTime(30, t0 + 0.5);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.25, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.55);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.6);
    },
  };
}
