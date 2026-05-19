// Scripted scenario adapter for demo / dev. Activated via ?demo=1 in the
// URL. Loops every SCENARIO_MS so all event types fire repeatedly.
//
// Cast (everyone else returns null = no signal):
//   • Drake (N767CJ)           — Full KJFK → EHAM flight: ground at origin,
//                                takeoff at t=0.08, cruises east, enters
//                                Amsterdam zone at t=0.65, lands at t=0.92.
//                                Demonstrates takeoff, geofence, landing.
//   • Taylor Swift (N621MM)    — Sits on ground at KTEB then takes off at
//                                t=0.20, climbs, cruises. Demonstrates a
//                                second takeoff alert.
//   • Air Force One (ADFDF8)   — Cruises over the eastern US. Demonstrates
//                                ICAO hex lookup working alongside reg.

const SCENARIO_MS = 3 * 60_000; // 3-minute loop — fast enough to watch

const JFK    = { lat: 40.6413, lon: -73.7781 };
const AMS    = { lat: 52.3086, lon:   4.7639 };
const TEB    = { lat: 40.8501, lon: -74.0608 };
const KDEN   = { lat: 39.8561, lon:-104.6737 };

function lerp(a, b, t) { return a + (b - a) * t; }

function clamp01(t) { return Math.max(0, Math.min(1, t)); }

// Bearing from a to b in degrees true. Spherical, good enough for visuals.
function bearing(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const φ1 = toRad(a.lat), φ2 = toRad(b.lat);
  const Δλ = toRad(b.lon - a.lon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function scenarioProgress() {
  return ((Date.now() - SCENARIO_START) % SCENARIO_MS) / SCENARIO_MS;
}

const SCENARIO_START = Date.now();

// Per-tail scripts. Each returns an Aircraft shape (matching the real
// adapters) or null when off-network.
const scripts = {
  N767CJ() { // Drake: full transatlantic flight
    const t = scenarioProgress();
    const onGroundStart = t < 0.08;
    const onGroundEnd   = t > 0.95;
    const flying = !onGroundStart && !onGroundEnd;

    let lat, lon, alt, speed, track, onGround;
    if (onGroundStart) {
      lat = JFK.lat; lon = JFK.lon;
      alt = null; speed = 20; track = 60; onGround = true;
    } else if (onGroundEnd) {
      lat = AMS.lat; lon = AMS.lon;
      alt = null; speed = 25; track = 60; onGround = true;
    } else {
      // 0.08 → 0.95 maps to 0 → 1 across the great-circle route
      const p = (t - 0.08) / (0.95 - 0.08);
      lat = lerp(JFK.lat, AMS.lat, p);
      lon = lerp(JFK.lon, AMS.lon, p);
      // Climb / cruise / descent profile
      if (p < 0.08)      alt = Math.round(lerp(2_000, 38_000, p / 0.08));
      else if (p > 0.92) alt = Math.round(lerp(38_000, 1_500, (p - 0.92) / 0.08));
      else               alt = 38_000;
      speed = p < 0.05 || p > 0.95 ? 250 : 480;
      track = bearing(JFK, AMS);
      onGround = false;
    }

    return {
      reg: "N767CJ", icao: "ac9876", flight: "AIRDRAKE",
      lat, lon, alt, speed, track, squawk: "1200",
      onGround, seenAt: Date.now(),
    };
  },

  N621MM() { // Taylor Swift: ground → takeoff at t=0.20 → cruise
    const t = scenarioProgress();
    if (t < 0.20) {
      return {
        reg: "N621MM", icao: "a12345", flight: "N621MM",
        lat: TEB.lat, lon: TEB.lon, alt: null, speed: 0, track: 0,
        squawk: "1200", onGround: true, seenAt: Date.now(),
      };
    }
    // Climb out heading west toward Aspen, looping for visual variety
    const p = clamp01((t - 0.20) / 0.40);
    const climbAlt = p < 0.15 ? Math.round(lerp(1_000, 41_000, p / 0.15)) : 41_000;
    return {
      reg: "N621MM", icao: "a12345", flight: "N621MM",
      lat: lerp(TEB.lat, 39.2,  Math.min(p, 1)),
      lon: lerp(TEB.lon, -90.0, Math.min(p, 1)),
      alt: climbAlt, speed: p < 0.1 ? 250 : 460, track: 265,
      squawk: "1200", onGround: false, seenAt: Date.now(),
    };
  },

  // Air Force One — accessed via ICAO hex
  ADFDF8() {
    const t = scenarioProgress();
    // Slow east-west drift over central US at FL280
    return {
      reg: "82-8000", icao: "adfdf8", flight: "AF1",
      lat: KDEN.lat + Math.sin(t * Math.PI * 2) * 1.5,
      lon: KDEN.lon + (t - 0.5) * 6,
      alt: 28_000, speed: 410, track: 90,
      squawk: "1200", onGround: false, seenAt: Date.now(),
    };
  },
};

export class MockAdapter {
  async fetchByRegistration(reg) {
    const script = scripts[reg.toUpperCase()];
    return script ? script() : null;
  }
  async fetchByIcao(hex) {
    const script = scripts[hex.toUpperCase()];
    return script ? script() : null;
  }
}

// Preset routes for the demo callsigns — used to drive the progress bar
// without depending on adsbdb being able to resolve mock callsigns.
export const MOCK_ROUTES = {
  AIRDRAKE: {
    origin:      { icao: "KJFK", iata: "JFK", name: "John F Kennedy", lat: JFK.lat, lon: JFK.lon },
    destination: { icao: "EHAM", iata: "AMS", name: "Schiphol",       lat: AMS.lat, lon: AMS.lon },
  },
  N621MM: {
    origin:      { icao: "KTEB", iata: "TEB", name: "Teterboro",      lat: TEB.lat, lon: TEB.lon },
    destination: { icao: "KASE", iata: "ASE", name: "Aspen-Pitkin",   lat: 39.2232, lon: -106.8687 },
  },
};
