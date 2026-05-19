// Flight-route lookup via adsbdb.com. Maps an ADS-B callsign to its filed
// origin + destination airports so we can show a real progress bar.
//
// Caveat: private-jet callsigns are often the registration itself
// ("N628TS"), which usually isn't in the public route database. So this
// returns null for many tracked celeb tails — that's expected. The UI
// falls back to an altitude bar when no route is found.

import { haversineKm } from "./geofence.js";

const BASE = "https://api.adsbdb.com/v0";

const cache = new Map();    // callsign -> Route | null
const inflight = new Map(); // callsign -> Promise<Route | null>

function normalize(callsign) {
  return callsign?.trim().toUpperCase() || "";
}

export async function lookupRoute(callsign) {
  const key = normalize(callsign);
  if (!key) return null;
  if (cache.has(key)) return cache.get(key);
  if (inflight.has(key)) return inflight.get(key);

  const p = fetch(`${BASE}/callsign/${encodeURIComponent(key)}`, {
    headers: { Accept: "application/json" },
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      const fr = data?.response?.flightroute;
      if (!fr?.origin?.latitude || !fr?.destination?.latitude) return null;
      return {
        callsign: key,
        origin: {
          icao: fr.origin.icao_code,
          iata: fr.origin.iata_code,
          name: fr.origin.name,
          lat: fr.origin.latitude,
          lon: fr.origin.longitude,
        },
        destination: {
          icao: fr.destination.icao_code,
          iata: fr.destination.iata_code,
          name: fr.destination.name,
          lat: fr.destination.latitude,
          lon: fr.destination.longitude,
        },
      };
    })
    .catch((err) => {
      console.warn(`[routes] ${key}:`, err.message);
      return null;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, p);
  const route = await p;
  cache.set(key, route);
  return route;
}

export function clearRouteCache(callsign) {
  cache.delete(normalize(callsign));
}

// Progress along the great-circle route from origin to destination, given
// current lat/lon. Returns { pct: 0..1, traveledKm, totalKm }. Note: this
// is great-circle, not actual filed routing — close enough for a visual.
export function computeProgress(route, lat, lon) {
  const totalKm = haversineKm(route.origin, route.destination);
  const traveledKm = haversineKm(route.origin, { lat, lon });
  if (totalKm <= 0) return { pct: 0, traveledKm: 0, totalKm: 0 };
  return {
    pct: Math.max(0, Math.min(1, traveledKm / totalKm)),
    traveledKm,
    totalKm,
  };
}
