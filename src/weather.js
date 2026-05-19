// Open-Meteo cloud-cover forecast for the ISS pass visibility check.
// Free, no API key, CORS-friendly. Returns hourly cloud cover (%) for
// the next 7 days. Cached in localStorage for an hour so we don't
// hammer the API on every refresh.

const FORECAST_KEY = "celeb-tracker.weather-v1";
const FORECAST_TTL_MS = 60 * 60_000; // 1 hour

let cachedForecast = null; // { lat, lon, times[], clouds[], fetchedAt }

function endpoint(lat, lon) {
  return `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&hourly=cloud_cover&forecast_days=7&timezone=UTC`;
}

export async function loadCloudForecast(lat, lon) {
  try {
    const cached = JSON.parse(localStorage.getItem(FORECAST_KEY) || "null");
    if (cached?.fetchedAt && Date.now() - cached.fetchedAt < FORECAST_TTL_MS &&
        Math.abs(cached.lat - lat) < 0.5 && Math.abs(cached.lon - lon) < 0.5) {
      cachedForecast = cached;
      return cached;
    }
  } catch {}
  try {
    const res = await fetch(endpoint(lat, lon));
    if (!res.ok) throw new Error(`open-meteo HTTP ${res.status}`);
    const data = await res.json();
    const times = (data?.hourly?.time || []).map((t) => new Date(t + "Z").getTime());
    const clouds = data?.hourly?.cloud_cover || [];
    if (!times.length) throw new Error("no hourly data");
    cachedForecast = { lat, lon, times, clouds, fetchedAt: Date.now() };
    try { localStorage.setItem(FORECAST_KEY, JSON.stringify(cachedForecast)); } catch {}
    return cachedForecast;
  } catch (err) {
    console.warn("[weather]", err.message);
    return null;
  }
}

// Returns cloud cover (%) at the given timestamp, or null if outside
// the forecast window. Picks the nearest hourly sample.
export function cloudCoverAt(timestampMs) {
  if (!cachedForecast) return null;
  const { times, clouds } = cachedForecast;
  if (timestampMs < times[0] || timestampMs > times[times.length - 1]) return null;
  let lo = 0, hi = times.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= timestampMs) lo = mid; else hi = mid;
  }
  return Math.abs(times[lo] - timestampMs) <= Math.abs(times[hi] - timestampMs)
    ? clouds[lo] : clouds[hi];
}
