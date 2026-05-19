// Geofence: simple circular zone around a point.
// v1 uses Schiphol as the anchor with a radius wide enough to cover Amsterdam
// terminal airspace; Amsterdam FIR is much larger and can be modelled as a
// polygon later.

export const SCHIPHOL = { lat: 52.3086, lon: 4.7639 };

export const AMSTERDAM_ZONE = {
  name: "Amsterdam airspace",
  center: SCHIPHOL,
  radiusKm: 80,
};

const EARTH_RADIUS_KM = 6371;

function toRad(deg) { return (deg * Math.PI) / 180; }

export function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(x));
}

export function isInside(zone, point) {
  return haversineKm(zone.center, point) <= zone.radiusKm;
}

// Tracks per-tail inside/outside state and fires `onEnter` on the
// outside→inside transition only (so we don't re-alert every poll).
export class GeofenceTracker {
  constructor(zone, onEnter) {
    this.zone = zone;
    this.onEnter = onEnter;
    this.inside = new Map(); // reg -> boolean
  }

  update(reg, point, meta) {
    const nowInside = isInside(this.zone, point);
    const wasInside = this.inside.get(reg) === true;
    this.inside.set(reg, nowInside);
    if (nowInside && !wasInside) {
      this.onEnter({ reg, point, meta, zone: this.zone });
    }
    return nowInside;
  }

  forget(reg) {
    this.inside.delete(reg);
  }
}
