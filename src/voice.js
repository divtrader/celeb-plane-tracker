// Web Speech API wrapper. Browsers require a user gesture before
// speechSynthesis will speak, so call `unlock()` from a click handler first.

export class Voice {
  constructor() {
    this.synth = window.speechSynthesis ?? null;
    this.unlocked = false;
    this.voice = null;
  }

  available() {
    return this.synth !== null;
  }

  unlock() {
    if (!this.synth || this.unlocked) return;
    // Speaking an empty utterance from a user gesture primes the engine.
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    this.synth.speak(u);
    this.unlocked = true;
    this.pickVoice();
  }

  pickVoice() {
    if (!this.synth) return;
    const voices = this.synth.getVoices();
    this.voice =
      voices.find((v) => /en[-_](GB|US)/i.test(v.lang) && /female|samantha|google/i.test(v.name)) ||
      voices.find((v) => /^en/i.test(v.lang)) ||
      voices[0] ||
      null;
  }

  speak(text) {
    if (!this.synth) return;
    if (!this.voice) this.pickVoice();
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) u.voice = this.voice;
    u.rate = 1.0;
    u.pitch = 1.0;
    // Queue (don't cancel) — every takeoff/landing should be heard.
    this.synth.speak(u);
  }
}
