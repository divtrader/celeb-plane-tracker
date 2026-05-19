// adsb.lol v2 adapter — public, no API key required.
// Docs: https://api.adsb.lol/

const BASE = "https://api.adsb.lol/v2";

export class AdsbLolAdapter {
  constructor({ fetchImpl = fetch } = {}) {
    this.fetch = fetchImpl;
  }

  async fetchByRegistration(reg) {
    const res = await this.fetch(`${BASE}/registration/${encodeURIComponent(reg)}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`adsb.lol ${res.status} for ${reg}`);
    const data = await res.json();
    const ac = Array.isArray(data?.ac) ? data.ac[0] : null;
    if (!ac || typeof ac.lat !== "number" || typeof ac.lon !== "number") return null;

    const onGround = ac.alt_baro === "ground";
    const altNum = typeof ac.alt_baro === "number" ? ac.alt_baro
                 : typeof ac.alt_geom === "number" ? ac.alt_geom
                 : null;

    return {
      reg,
      icao: ac.hex ?? null,
      lat: ac.lat,
      lon: ac.lon,
      alt: onGround ? null : altNum,
      speed: ac.gs ?? null,
      track: ac.track ?? null,
      squawk: ac.squawk ?? null,
      onGround,
      seenAt: Date.now() - (ac.seen ?? 0) * 1000,
    };
  }
}
