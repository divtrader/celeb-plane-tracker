// Celebrity portrait thumbnails via Wikipedia's pageimages API. Cached
// in localStorage for 30 days so we don't hammer Wikipedia on every
// page load. CORS is allowed via `origin=*`.
//
// The lookup queries Wikipedia with a slug derived from the celeb's
// display name (parens stripped, "&" split). Entries can override the
// derived slug with an explicit `wikipedia` field on the tail metadata
// when the name is ambiguous (e.g. Drake → "Drake (musician)").

const CACHE_KEY = "celeb-tracker.portraits-v1";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const API_BASE = "https://en.wikipedia.org/w/api.php";
const PARALLEL = 4;

const cache = new Map(); // upperName → { url: string|null, fetchedAt: number }

function loadCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    const now = Date.now();
    for (const [name, entry] of Object.entries(raw)) {
      if (entry?.fetchedAt && now - entry.fetchedAt < CACHE_TTL_MS) {
        cache.set(name, entry);
      }
    }
  } catch {
    // ignore — start fresh
  }
}
function saveCache() {
  try {
    const out = {};
    for (const [name, entry] of cache.entries()) out[name] = entry;
    localStorage.setItem(CACHE_KEY, JSON.stringify(out));
  } catch {
    // localStorage full or disabled — silent
  }
}

function deriveQuery(meta) {
  if (meta.wikipedia) return meta.wikipedia;
  return meta.name
    .replace(/\s*\([^)]*\)/g, "")  // strip "(VC-25A)" / "(G700)" etc.
    .split("&")[0]                  // "Jay-Z & Beyoncé" → "Jay-Z"
    .trim();
}

async function fetchOne(meta) {
  const key = meta.name.toUpperCase();
  if (cache.has(key)) return;
  const query = deriveQuery(meta);
  const url =
    `${API_BASE}?action=query&format=json&prop=pageimages` +
    `&piprop=thumbnail&pithumbsize=160` +
    `&titles=${encodeURIComponent(query)}&origin=*&redirects=1`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const pages = data?.query?.pages || {};
    const page = Object.values(pages)[0];
    const thumb = page?.thumbnail?.source || null;
    cache.set(key, { url: thumb, fetchedAt: Date.now() });
  } catch (err) {
    console.warn(`[portrait] ${meta.name}:`, err.message);
    cache.set(key, { url: null, fetchedAt: Date.now() });
  }
}

export async function prefetchPortraits(tails, onProgress) {
  loadCache();
  const todo = tails.filter((t) => !cache.has(t.name.toUpperCase()));
  if (todo.length === 0) return;
  let i = 0;
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      while (i < todo.length) {
        const meta = todo[i++];
        await fetchOne(meta);
        onProgress?.();
      }
    })
  );
  saveCache();
}

export function getPortrait(name) {
  return cache.get(name.toUpperCase())?.url || null;
}
