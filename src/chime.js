// Short synthesized chimes that play before voice alerts to grab attention.
// Uses Web Audio API directly — no audio assets to ship.
// Must call `unlock()` from a user gesture before any sound will play.

export class Chime {
  constructor() {
    this.ctx = null;
  }

  unlock() {
    if (this.ctx) return;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
  }

  _tone(freq, startOffset, duration, gainPeak = 0.18) {
    const t0 = this.ctx.currentTime + startOffset;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(gainPeak, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  _sequence(notes, step = 0.14, duration = 0.22) {
    if (!this.ctx) return;
    notes.forEach((freq, i) => this._tone(freq, i * step, duration));
  }

  takeoff() { this._sequence([523.25, 659.25, 783.99]); }   // C5 - E5 - G5 (ascending)
  landing() { this._sequence([783.99, 659.25, 523.25]); }   // G5 - E5 - C5 (descending)
  zoneEntry() {
    if (!this.ctx) return;
    this._tone(880, 0, 0.18, 0.22);   // A5
    this._tone(880, 0.22, 0.18, 0.22); // A5 again
  }
}
