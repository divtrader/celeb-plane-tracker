// airplanes.live adapter. Same response shape as adsb.lol but includes
// `Access-Control-Allow-Origin: *`, so the browser can call it directly
// from a static site. No API key required.
//
// Preferred entry point is `fetchBulkSnapshot()`, which makes two calls
// (LADD = privacy-opted-out aircraft like celebrity jets, plus MIL =
// military aircraft like Air Force One) and returns a Map keyed by both
// registration and ICAO hex. That's 2 requests per poll instead of one
// per tail, which dodges Cloudflare's per-IP rate limit completely.

const BASE = "https://api.airplanes.live/v2";

export class AirplanesLiveAdapter {
  constructor({ fetchImpl } = {}) {
    // Native `fetch` requires `this` to be Window. Storing it as
    // `this.fetch` and calling `this.fetch(url)` throws "Illegal
    // invocation" because the receiver is the adapter. Wrap the global
    // in an arrow function so the bare call is preserved.
    this._http = fetchImpl ?? ((url, init) => fetch(url, init));
  }

  async fetchByRegistration(reg) {
    return this._fetch(`${BASE}/reg/${encodeURIComponent(reg)}`, reg);
  }

  async fetchByIcao(hex) {
    return this._fetch(`${BASE}/hex/${encodeURIComponent(hex.toLowerCase())}`, null);
  }

  // Returns Map<upperReg | lowerHex, Aircraft>. Each aircraft is indexed
  // under both its registration AND its ICAO hex so callers can look up
  // by either key.
  async fetchBulkSnapshot() {
    const [ladd, mil] = await Promise.all([
      this._fetchList(`${BASE}/ladd`),
      this._fetchList(`${BASE}/mil`),
    ]);

    const byKey = new Map();
    const ingest = (list) => {
      for (const raw of list) {
        const ac = this._parseAircraft(raw, null);
        if (!ac) continue;
        if (ac.reg)  byKey.set(ac.reg.toUpperCase(),  ac);
        if (ac.icao) byKey.set(ac.icao.toLowerCase(), ac);
      }
    };
    ingest(ladd);
    ingest(mil);
    return byKey;
  }

  async _fetchList(url) {
    const res = await this._rawFetch(url);
    const data = await res.json();
    return Array.isArray(data?.ac) ? data.ac : [];
  }

  async _rawFetch(url) {
    let res;
    try {
      res = await this._http(url, { headers: { Accept: "application/json" } });
    } catch (e) {
      const err = new Error(`network/CORS error (likely Cloudflare throttle): ${e.message}`);
      err.rateLimited = true;
      throw err;
    }
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
    return res;
  }

  _parseAircraft(ac, fallbackReg) {
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

  async _fetch(url, fallbackReg) {
    const res = await this._rawFetch(url);
    const data = await res.json();
    const ac = Array.isArray(data?.ac) ? data.ac[0] : null;
    return this._parseAircraft(ac, fallbackReg);
  }
}
