const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

class FakeAudio {
  constructor(src) { this.src = src; this.paused = true; this.events = {}; }
  addEventListener(name, callback) { this.events[name] = callback; }
  play() { this.paused = false; this.plays = (this.plays || 0) + 1; return Promise.resolve(); }
}
const context = { Audio: FakeAudio };
vm.runInNewContext(fs.readFileSync('src/audio.js', 'utf8') + '\nthis.AudioEngine = AudioEngine;', context);
const audio = new context.AudioEngine();
audio.setMuted(true);
audio.startMusic();
assert.strictEqual(audio.music.muted, true);
assert.strictEqual(audio.music.volume, 0.25);
for (let i = 1; i <= 4; i++) {
  assert.strictEqual(audio.music.src, `assets/music/track-${i}.mp3`);
  assert.ok(fs.statSync(audio.music.src).size > 0);
  audio.music.events.ended();
}
assert.strictEqual(audio.music.src, 'assets/music/track-1.mp3');
assert.strictEqual(audio.music.plays, 5);
audio.setMuted(false);
assert.strictEqual(audio.music.muted, false);
audio.startMusic();
assert.strictEqual(audio.music.plays, 5);
console.log('Music starts, cycles all four tracks, repeats, and follows mute.');
