// Airport reverse-lookup. Loads a curated airports.json on first call and
// returns the nearest airport within DEFAULT_RADIUS_NM of a given lat/lon.
//
// Curation, not completeness: the bundled list focuses on commercial hubs
// and well-known business-jet airports. Expand data/airports.json over time.

import { haversineKm } from "./geofence.js";

const DEFAULT_RADIUS_NM = 5;     // ~9.26 km — covers typical takeoff/landing positions
const NM_TO_KM = 1.852;

let cache = null;
let loadPromise = null;

export function loadAirports(url = "./data/airports.json") {
  if (cache) return Promise.resolve(cache);
  if (loadPromise) return loadPromise;
  loadPromise = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`airports.json ${r.status}`);
      return r.json();
    })
    .then((data) => {
      cache = data;
      return cache;
    })
    .catch((err) => {
      console.warn("[airports] failed to load:", err.message);
      cache = []; // remember the failure so we don't retry every call
      return cache;
    });
  return loadPromise;
}

// Synchronous lookup. Returns null until loadAirports() has resolved.
export function nearestAirport(lat, lon, radiusNm = DEFAULT_RADIUS_NM) {
  if (!cache || cache.length === 0) return null;
  const maxKm = radiusNm * NM_TO_KM;
  let best = null;
  let bestDist = maxKm;
  for (const ap of cache) {
    const d = haversineKm({ lat, lon }, { lat: ap.lat, lon: ap.lon });
    if (d < bestDist) {
      best = ap;
      bestDist = d;
    }
  }
  return best;
}
