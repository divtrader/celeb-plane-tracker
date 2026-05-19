// airplanes.live adapter. Same response shape as adsb.lol but includes
// `Access-Control-Allow-Origin: *`, so the browser can call it directly
// from a static site. No API key required.

const BASE = "https://api.airplanes.live/v2";

export class AirplanesLiveAdapter {
  constructor({ fetchImpl = fetch } = {}) {
    this.fetch = fetchImpl;
  }

  async fetchByRegistration(reg) {
    return this._fetch(`${BASE}/reg/${encodeURIComponent(reg)}`, reg);
  }

  async fetchByIcao(hex) {
    return this._fetch(`${BASE}/hex/${encodeURIComponent(hex.toLowerCase())}`, null);
  }

  async _fetch(url, fallbackReg) {
    const res = await this.fetch(url, { headers: { Accept: "application/json" } });
    if (res.status === 429) {
      const err = new Error("rate-limited (HTTP 429)");
      err.status = 429;
      err.rateLimited = true;
      throw err;
    }
    if (!res.ok) {
      const err = new Error(`airplanes.live HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    const ac = Array.isArray(data?.ac) ? data.ac[0] : null;
    if (!ac || typeof ac.lat !== "number" || typeof ac.lon !== "number") return null;

    const onGround = ac.alt_baro === "ground";
    const altNum = typeof ac.alt_baro === "number" ? ac.alt_baro
                 : typeof ac.alt_geom === "number" ? ac.alt_geom
                 : null;

    return {
      reg: ac.r ?? fallbackReg ?? null,
      icao: ac.hex ?? null,
      flight: typeof ac.flight === "string" ? ac.flight.trim() : null,
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
