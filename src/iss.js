// International Space Station tracker.
//
// Live position from wheretheiss.at (CORS-friendly, no key, refreshed
// per app-poll). Pass prediction computed locally with satellite.js +
// a TLE fetched once a day from celestrak.org and cached in
// localStorage.

const ISS_NORAD = 25544;
const POSITION_URL = `https://api.wheretheiss.at/v1/satellites/${ISS_NORAD}`;
const TLE_URL = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${ISS_NORAD}&FORMAT=TLE`;

const TLE_CACHE_KEY = "celeb-tracker.iss-tle-v1";
const TLE_TTL_MS = 12 * 60 * 60_000; // refresh twice a day

let cachedTLE = null;       // { line1, line2, fetchedAt }
let satrec = null;          // parsed satrec from satellite.js

export async function fetchPosition() {
  const res = await fetch(POSITION_URL, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`wheretheiss.at HTTP ${res.status}`);
  const d = await res.json();
  return {
    lat: d.latitude,
    lon: d.longitude,
    altKm: d.altitude,
    velocityKph: d.velocity,
    visibility: d.visibility,      // "daylight" | "eclipsed"
    footprintKm: d.footprint,      // ground-visibility radius
    timestampMs: d.timestamp * 1000,
  };
}

async function loadTLE() {
  try {
    const cached = JSON.parse(localStorage.getItem(TLE_CACHE_KEY) || "null");
    if (cached?.fetchedAt && Date.now() - cached.fetchedAt < TLE_TTL_MS) {
      cachedTLE = cached;
      return cached;
    }
  } catch {}
  // Fetch fresh
  const res = await fetch(TLE_URL);
  if (!res.ok) throw new Error(`celestrak HTTP ${res.status}`);
  const text = (await res.text()).trim().split("\n");
  const line1 = text[1]?.trim();
  const line2 = text[2]?.trim();
  if (!line1 || !line2) throw new Error("malformed TLE response");
  cachedTLE = { line1, line2, fetchedAt: Date.now() };
  try { localStorage.setItem(TLE_CACHE_KEY, JSON.stringify(cachedTLE)); } catch {}
  return cachedTLE;
}

function ensureSatrec() {
  if (satrec) return satrec;
  if (!cachedTLE) return null;
  if (typeof satellite === "undefined") return null;
  satrec = satellite.twoline2satrec(cachedTLE.line1, cachedTLE.line2);
  return satrec;
}

export async function initOrbit() {
  await loadTLE();
  ensureSatrec();
}

// Compute the next overhead pass for an observer location. A "pass"
// here = ISS rising above PASS_MIN_ELEVATION degrees. Returns null if
// no pass found within the next 48 hours (rare; ISS passes most
// latitudes several times a day).
const PASS_MIN_ELEVATION = 10; // degrees above horizon
const SEARCH_WINDOW_MS = 48 * 60 * 60_000;
const STEP_MS = 30_000; // 30s coarse step

export function nextPass(observerLat, observerLon, observerAltKm = 0.01, fromMs = Date.now()) {
  const sat = ensureSatrec();
  if (!sat) return null;
  const obs = {
    latitude:  satellite.degreesToRadians(observerLat),
    longitude: satellite.degreesToRadians(observerLon),
    height:    observerAltKm,
  };

  let inPass = false;
  let passStart = null;
  let maxElevDeg = 0;
  let maxElevAt = null;

  for (let t = fromMs; t < fromMs + SEARCH_WINDOW_MS; t += STEP_MS) {
    const elevDeg = elevationAt(sat, obs, new Date(t));
    if (elevDeg == null) continue;

    if (elevDeg > PASS_MIN_ELEVATION) {
      if (!inPass) {
        inPass = true;
        passStart = t;
        maxElevDeg = elevDeg;
        maxElevAt = t;
      } else if (elevDeg > maxElevDeg) {
        maxElevDeg = elevDeg;
        maxElevAt = t;
      }
    } else if (inPass) {
      // Pass ended — return its peak details
      return {
        startMs: passStart,
        endMs: t,
        peakMs: maxElevAt,
        maxElevDeg,
      };
    }
  }
  return null;
}

function elevationAt(sat, obs, date) {
  const pv = satellite.propagate(sat, date);
  if (!pv?.position) return null;
  const gmst = satellite.gstime(date);
  const ecf = satellite.eciToEcf(pv.position, gmst);
  const look = satellite.ecfToLookAngles(obs, ecf);
  return satellite.radiansToDegrees(look.elevation);
}
