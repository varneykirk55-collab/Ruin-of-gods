'use strict';
// ===================== GOD SIM — procedural audio (WebAudio, placeholder synthesis) =====================
class AudioEngine {
  constructor() { this.ctx = null; this.on = false; this.muted = false; this.volume = 1; this.background = false; this.last = {}; this.loops = {}; }
  startMusic() {
    if (!this.music) {
      this.musicTracks = ['assets/music/track-1.mp3', 'assets/music/track-2.mp3', 'assets/music/track-3.mp3', 'assets/music/track-4.mp3'];
      this.musicIndex = 0;
      this.music = new Audio(this.musicTracks[0]);
      if (this.output) {
        // Mobile Safari uses hardware volume for media elements. Mix the track
        // through Web Audio so the in-game slider controls it on phones too.
        const musicGain = this.ctx.createGain();
        musicGain.gain.value = 0.25;
        this.musicSource = this.ctx.createMediaElementSource(this.music);
        this.musicSource.connect(musicGain);
        musicGain.connect(this.output);
      } else this.music.volume = 0.25 * this.volume;
      this.music.muted = this.muted;
      this.music.addEventListener('ended', () => {
        this.musicIndex = (this.musicIndex + 1) % this.musicTracks.length;
        this.music.src = this.musicTracks[this.musicIndex];
        if (!this.background) this.music.play().catch(() => {});
      });
    }
    if (!this.background && this.music.paused) this.music.play().catch(() => {});
  }
  start() {
    if (this.background) return;
    if (this.music && this.music.paused) this.startMusic();
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC(); this.master = c.createGain(); this.master.gain.value = 0.8;
    const comp = c.createDynamicsCompressor(); this.master.connect(comp); this.output = c.createGain();
    comp.connect(this.output); this.output.connect(c.destination); this.syncVolume();
    this.bus = { amb: c.createGain(), sfx: c.createGain(), voice: c.createGain() }; this.bus.amb.gain.value = 0.9; this.bus.sfx.gain.value = 1; this.bus.voice.gain.value = 0.7;
    for (const k in this.bus) this.bus[k].connect(this.master);
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; this.noise = buf;
    const loop = (name, type, freq, q) => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = c.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(this.bus.amb); s.start(0, Math.random() * 1.5); this.loops[name] = { g, f }; };
    loop('wind', 'bandpass', 420, 0.6); loop('river', 'bandpass', 1500, 0.7); loop('fire', 'bandpass', 2400, 0.5); loop('roar', 'lowpass', 260, 0.4); loop('rumble', 'lowpass', 75, 0.8); loop('rain', 'highpass', 3200, 0.3); loop('flood', 'lowpass', 600, 0.5); loop('gale', 'bandpass', 260, 0.45);
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 36; const og = c.createGain(); og.gain.value = 0; o.connect(og); og.connect(this.bus.amb); o.start(); this.loops.sub = { g: og };
    this.on = true; this.amb = { t: 0 };
  }
  syncVolume() {
    if (this.output) this.output.gain.value = this.muted || this.background ? 0 : this.volume;
    if (this.music) {
      this.music.muted = this.muted || this.background;
      if (!this.musicSource) this.music.volume = 0.25 * this.volume;
    }
  }
  setVolume(value) {
    if (Number.isFinite(value)) this.volume = Math.min(1, Math.max(0, value));
    this.syncVolume();
  }
  setMuted(muted) { this.muted = muted; this.syncVolume(); }

  setBackground(hidden) {
    this.background = hidden;
    this.syncVolume();
    if (hidden) {
      if (this.music) this.music.pause();
      if (this.ctx) this.ctx.suspend().catch(() => {});
    } else if (this.ctx || this.music) {
      this.start();
    }
  }
  mix(m) { // continuous layers, values 0..1
    if (!this.on) return; const t = this.ctx.currentTime, L = this.loops, S = (n, v) => L[n].g.gain.setTargetAtTime(v, t, 0.25);
    const gale = m.tornado || 0;
    S('wind', 0.05 + m.wind * 0.1 + gale * 0.2); S('river', m.river * 0.22); S('fire', m.fire * 0.3); S('roar', m.fire * m.fire * 0.5); S('rumble', Math.max(m.quake * 0.9, gale * 0.35)); S('sub', m.quake * 0.5); S('rain', m.rain * 0.16); S('flood', m.flood * 0.5); S('gale', gale * 0.72);
    L.wind.f.frequency.setTargetAtTime(350 + m.wind * 300 + gale * 240 + Math.sin(t * 0.4) * 80, t, 0.4);
  }
  ambient(dt, m) { // sparse one-shots: birds, crickets, village life
    if (!this.on) return; const a = this.amb; a.t -= dt; if (a.t > 0) return; a.t = 0.25 + Math.random() * 0.5;
    if (m.calm) { if (m.day > 0.5 && Math.random() < 0.35) this.play('chirp', 0.25 * m.near); if (m.day < 0.3 && Math.random() < 0.6) this.play('cricket', 0.12); if (m.village > 0.05 && m.day > 0.4) { const r = Math.random(); if (r < 0.25) this.play('hammer', 0.3 * m.village); else if (r < 0.5) this.play('murmur', 0.3 * m.village); } }
    if (m.fire > 0.05 && Math.random() < 0.8) this.play('crackle', 0.5 * m.fire);
  }
  env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  nz(t, dur, type, f0, f1, q, peak, att, bus) { const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise; s.loop = true; const f = c.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur); const g = c.createGain(); this.env(g, t, att, peak, dur - att); s.connect(f); f.connect(g); g.connect(bus || this.bus.sfx); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05); }
  tone(t, dur, type, f0, f1, peak, att, bus) { const c = this.ctx, o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur); const g = c.createGain(); this.env(g, t, att, peak, dur - att); o.connect(g); g.connect(bus || this.bus.sfx); o.start(t); o.stop(t + dur + 0.05); return o; }
  play(name, vol) {
    if (!this.on || this.background || this.muted || vol < 0.02) return; const now = performance.now(), gap = { thunder: 140, zap: 60, collapse: 70, crack: 90, thud: 60, scream: 160, crackle: 60, splash: 120, ignite: 150, gust: 160, unmake: 70 }[name] || 0; if (gap && now - (this.last[name] || 0) < gap) return; this.last[name] = now;
    const t = this.ctx.currentTime + 0.01, R = Math.random, v = Math.min(1, vol);
    switch (name) {
      case 'collapse': this.nz(t, 0.9 + R() * 0.5, 'lowpass', 900 + R() * 600, 120, 0.7, 0.5 * v, 0.02); this.tone(t, 0.35, 'sine', 90 + R() * 30, 40, 0.5 * v, 0.01); this.nz(t + 0.05, 0.25, 'bandpass', 2500 + R() * 1500, 1200, 2, 0.15 * v, 0.005); break;
      case 'crack': this.nz(t, 0.14 + R() * 0.1, 'bandpass', 2200 + R() * 2500, 700, 1.5, 0.4 * v, 0.003); this.nz(t + 0.03, 0.3, 'lowpass', 500, 150, 0.7, 0.25 * v, 0.01); break;
      case 'thud': this.tone(t, 0.28, 'sine', 110 + R() * 40, 38, 0.6 * v, 0.005); this.nz(t, 0.18, 'lowpass', 500, 120, 0.7, 0.3 * v, 0.005); break;
      case 'boom': this.tone(t, 2.2, 'sine', 70, 24, 1.0 * v, 0.01); this.nz(t, 2.6, 'lowpass', 2800, 70, 0.5, 0.95 * v, 0.01); this.nz(t + 0.12, 3.5, 'lowpass', 400, 60, 0.6, 0.5 * v, 0.4); this.nz(t, 0.3, 'highpass', 3000, 3000, 0.5, 0.3 * v, 0.002); break;
      case 'whoosh': this.nz(t, 2.9, 'bandpass', 300, 2600, 1.2, 0.5 * v, 2.5); this.tone(t, 2.8, 'sawtooth', 420, 90, 0.08 * v, 2.2); break;
      case 'dambreak': this.nz(t, 3.5, 'lowpass', 1800, 200, 0.5, 0.8 * v, 0.3); this.tone(t, 1.2, 'sine', 80, 30, 0.7 * v, 0.02); this.nz(t, 0.5, 'bandpass', 2500, 800, 1.5, 0.4 * v, 0.01); break;
      case 'thunder': this.nz(t, 0.25, 'highpass', 2600, 1500, 0.5, 0.9 * v, 0.002); this.tone(t, 0.7, 'sine', 62, 28, 0.9 * v, 0.005); for (let k = 0; k < 4; k++) this.nz(t + 0.12 + k * 0.45 + R() * 0.3, 1.5 + R() * 1.2, 'lowpass', 520 - k * 70, 70, 0.6, 0.65 * v * (1 - k * 0.18), 0.12); break;
      case 'zap': this.nz(t, 0.35, 'bandpass', 4200, 1500, 3, 0.4 * v, 0.003); this.tone(t, 0.3, 'sawtooth', 120, 90, 0.12 * v, 0.005); break;
      case 'charge': this.nz(t, 0.55, 'bandpass', 180, 3200, 2, 0.3 * v, 0.5); this.tone(t, 0.5, 'sine', 40, 90, 0.4 * v, 0.45); break;
      case 'splash': this.nz(t, 0.4, 'bandpass', 1800, 700, 0.8, 0.3 * v, 0.01); break;
      case 'ignite': this.nz(t, 0.8, 'bandpass', 500, 2200, 0.7, 0.35 * v, 0.25); break;
      case 'crackle': this.nz(t, 0.03 + R() * 0.04, 'bandpass', 2500 + R() * 4000, 2000, 3, 0.25 * v, 0.002); break;
      case 'scream': { const f = 520 + R() * 420, d = 0.45 + R() * 0.6, c = this.ctx, o = this.tone(t, d, 'sawtooth', f, f * (0.75 + R() * 0.2), 0.0001, 0.05, this.bus.voice); const g = c.createGain(), bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100 + R() * 500; bp.Q.value = 2.5; this.env(g, t, 0.06, 0.22 * v, d - 0.06); const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 7 + R() * 5; lg.gain.value = f * 0.05; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + d + 0.1); o.connect(bp); bp.connect(g); g.connect(this.bus.voice); break; }
      case 'chirp': { const f = 2200 + R() * 2200; for (let k = 0; k < 2 + (R() * 3 | 0); k++) this.tone(t + k * 0.09, 0.07, 'sine', f, f * (1.1 + R() * 0.3), 0.07 * v, 0.01, this.bus.amb); break; }
      case 'cricket': for (let k = 0; k < 4; k++) this.tone(t + k * 0.05, 0.03, 'square', 4300, 4300, 0.015 * v / 0.12, 0.005, this.bus.amb); break;
      case 'hammer': this.nz(t, 0.06, 'bandpass', 1700 + R() * 500, 1200, 5, 0.25 * v, 0.002, this.bus.amb); if (R() < 0.6) this.nz(t + 0.28, 0.06, 'bandpass', 1700, 1200, 5, 0.2 * v, 0.002, this.bus.amb); break;
      case 'murmur': this.nz(t, 0.35 + R() * 0.3, 'bandpass', 280 + R() * 300, 240 + R() * 200, 4, 0.12 * v, 0.1, this.bus.amb); break;
      case 'bell': for (const m of [1, 2.01, 2.99, 4.2]) this.tone(t, 2.5 / m, 'sine', 330 * m, 330 * m, 0.14 * v / m, 0.005, this.bus.amb); break;
      case 'ui': this.tone(t, 0.07, 'triangle', 660, 880, 0.08, 0.005); break;
      case 'gust': this.nz(t, 0.75 + R() * 0.45, 'bandpass', 160, 980, 0.55, 0.42 * v, 0.18); this.nz(t, 0.4, 'highpass', 1500, 700, 0.5, 0.16 * v, 0.02); break;
      case 'unmake': this.tone(t, 0.62, 'sine', 1680, 150, 0.22 * v, 0.008); this.tone(t + 0.03, 0.55, 'triangle', 1040, 110, 0.11 * v, 0.02); this.nz(t, 0.7, 'bandpass', 3400, 240, 0.5, 0.24 * v, 0.03); break;
    }
  }
}
