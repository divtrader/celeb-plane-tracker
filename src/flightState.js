// Detects takeoff and landing transitions from per-poll observations.
//
// Phases per tail: "ground" | "airborne". The first observation of a tail
// records its phase silently (so a celeb who is already mid-flight when the
// tracker boots doesn't trigger a spurious takeoff). After that, transitions
// fire the corresponding callback.
//
// A disappearance (the adapter returns null) is *not* treated as a landing in
// v1 — too noisy, since transponders can briefly drop signal mid-flight. If
// the last airborne reading was low and slow we could infer a landing, but
// that's a future iteration.

const PHASE_GROUND = "ground";
const PHASE_AIRBORNE = "airborne";

export class FlightStateTracker {
  constructor({ onTakeoff, onLanding, onSpotted }) {
    this.onTakeoff = onTakeoff;
    this.onLanding = onLanding;
    this.onSpotted = onSpotted; // fired on first sighting if already airborne
    this.state = new Map(); // reg -> { phase, primed }
  }

  observe(reg, ac, meta) {
    const phase = ac.onGround ? PHASE_GROUND : PHASE_AIRBORNE;
    const prior = this.state.get(reg);

    if (!prior) {
      // First sighting — silent for ground (no fake takeoff later), but
      // emit a "spotted" event when already airborne so the activity
      // log shows celebs that were up when the page loaded.
      this.state.set(reg, { phase, primed: true });
      if (phase === PHASE_AIRBORNE && this.onSpotted) {
        this.onSpotted({ reg, ac, meta });
      }
      return;
    }

    if (prior.phase === PHASE_GROUND && phase === PHASE_AIRBORNE) {
      this.onTakeoff({ reg, ac, meta });
    } else if (prior.phase === PHASE_AIRBORNE && phase === PHASE_GROUND) {
      this.onLanding({ reg, ac, meta });
    }

    this.state.set(reg, { phase, primed: true });
  }

  forget(reg) {
    // Leave state intact when a tail goes silent — if it reappears in the
    // same phase, no false transition fires. Call explicitly only if you
    // want to fully reset a tail.
  }

  reset(reg) {
    this.state.delete(reg);
  }
}
