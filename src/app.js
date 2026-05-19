import { CELEBRITY_TAILS } from "./tails.js";
import { AirplanesLiveAdapter } from "./adsb/airplaneslive.js";
import { MockAdapter, MOCK_ROUTES } from "./adsb/mock.js";
import { AMSTERDAM_ZONE, GeofenceTracker } from "./geofence.js";
import { FlightStateTracker } from "./flightState.js";
import { loadAirports, nearestAirport } from "./airports.js";
import { lookupRoute, computeProgress } from "./routes.js";
import { Voice } from "./voice.js";
import { Chime } from "./chime.js";

// Demo mode (?demo=1) swaps to a local MockAdapter with no rate limits.
const DEMO_MODE = new URLSearchParams(window.location.search).has("demo");

// One bulk fetch per poll (LADD + MIL aircraft, ~850 total) replaces the
// previous per-tail loop — so we no longer need per-request spacing and
// rate-limit risk drops to near zero.
const POLL_INTERVAL_MS = DEMO_MODE ? 4_000 : 30_000;

const EUROPE_CENTER = [50.5, 8.0];
const EUROPE_ZOOM = 5;

const adsb = DEMO_MODE ? new MockAdapter() : new AirplanesLiveAdapter();
const voice = new Voice();
const chime = new Chime();

// Demo mode is faster than reality and needs deterministic route data,
// so we don't burn real adsbdb requests on mock callsigns.
const routeFor = DEMO_MODE
  ? (callsign) => Promise.resolve(MOCK_ROUTES[callsign?.trim().toUpperCase()] ?? null)
  : lookupRoute;
if (DEMO_MODE) console.log("[demo] scripted scenario active — real ADS-B fetch disabled");
const tailsByReg = new Map(CELEBRITY_TAILS.map((t) => [t.reg.toUpperCase(), t]));

const els = {
  statusDot: document.getElementById("status-dot"),
  statusText: document.getElementById("status-text"),
  trackedCount: document.getElementById("tracked-count"),
  airborneCount: document.getElementById("airborne-count"),
  lastUpdate: document.getElementById("last-update"),
  startBtn: document.getElementById("start-btn"),
  alertBanner: document.getElementById("alert-banner"),
  panelCount: document.getElementById("panel-count"),
  celebList: document.getElementById("celeb-list"),
  eventCard: document.getElementById("event-card"),
  historyList: document.getElementById("history-list"),
  pollProgress: document.getElementById("poll-progress"),
  pollStats: document.getElementById("poll-stats"),
  panelToggle: document.getElementById("panel-toggle"),
  panel: document.getElementById("panel"),
};

// Pull-tab collapse: slides the panel off-screen so the user sees the
// whole map. The tab parks at the viewport's right edge while collapsed
// so it can be pulled back. State persists in localStorage.
const PANEL_COLLAPSED_KEY = "celeb-tracker.panelCollapsed";
function applyPanelState(collapsed) {
  document.body.classList.toggle("panel-collapsed", collapsed);
  // Belt-and-suspenders: set the transform inline too. The CSS rule
  // body.panel-collapsed #panel { transform: translateX(100%) } *should*
  // be enough, but on the user's tablet Chromium build it wasn't taking
  // effect — likely a cached/parser quirk. Inline style wins regardless.
  els.panel.style.transform = collapsed ? "translateX(100%)" : "translateX(0)";
  els.panelToggle.setAttribute("aria-label", collapsed ? "Show tracked list" : "Hide tracked list");
}
applyPanelState(localStorage.getItem(PANEL_COLLAPSED_KEY) === "1");

function togglePanel(e) {
  // Defensive: in live mode the click sometimes gets caught up in
  // Leaflet's pointer handling. Stop propagation + preventDefault to
  // ensure the click reaches us cleanly.
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const next = !document.body.classList.contains("panel-collapsed");
  applyPanelState(next);
  localStorage.setItem(PANEL_COLLAPSED_KEY, next ? "1" : "0");
  setTimeout(() => map.invalidateSize(false), 340);
}
els.panelToggle.addEventListener("click", togglePanel);
// Pointerdown as a redundant trigger — fires before click and sidesteps
// any 300ms click-delay weirdness on touch devices.
els.panelToggle.addEventListener("pointerdown", (e) => { e.stopPropagation(); });

// Live per-sweep counters surfaced in the HUD. Helps debug rate-limit
// issues and gives the kiosk something to watch between events.
const sweep = { current: null, idx: 0, total: 0, ok: 0, err: 0, rate: 0, skip: 0 };
let countdownTimer = null;

function renderSweepUi() {
  if (sweep.current) {
    els.pollProgress.innerHTML =
      `<span class="reg">${sweep.current}</span> · ${sweep.idx}/${sweep.total}`;
  }
  if (sweep.total > 0) {
    els.pollStats.innerHTML =
      `<span class="stat-ok">✓ ${sweep.ok}</span>` +
      `<span class="stat-err">✗ ${sweep.err}</span>` +
      `<span class="stat-rate">⏸ ${sweep.rate}</span>` +
      (sweep.skip ? `<span class="stat-skip">↷ ${sweep.skip}</span>` : "");
  }
}

function startCountdown(seconds) {
  if (countdownTimer) clearInterval(countdownTimer);
  const target = Date.now() + seconds * 1000;
  const tick = () => {
    const remaining = Math.max(0, Math.ceil((target - Date.now()) / 1000));
    els.pollProgress.innerHTML = `<span class="countdown">Next sweep in ${remaining}s</span>`;
    if (remaining === 0) clearInterval(countdownTimer);
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

function highlightPollingRow(reg) {
  document.querySelectorAll(".celeb-row.polling").forEach((el) => el.classList.remove("polling"));
  if (reg) {
    const row = document.querySelector(`.celeb-row[data-reg="${reg}"]`);
    if (row) row.classList.add("polling");
  }
}

// Persistent state across reloads — saves flight trails, takeoff
// airports, route lookups, and the activity history. Expired entries
// (older than TRAIL_MAX_AGE_MS) get dropped on load so old flights
// don't accumulate forever.
const TRAILS_KEY = "celeb-tracker.trails-v1";
const HISTORY_KEY = "celeb-tracker.history-v1";
const TRAIL_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function loadPersisted() {
  try {
    const trailsRaw = JSON.parse(localStorage.getItem(TRAILS_KEY) || "{}");
    const historyRaw = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    const now = Date.now();
    const trails = {};
    for (const [reg, data] of Object.entries(trailsRaw)) {
      if (data && data.savedAt && now - data.savedAt < TRAIL_MAX_AGE_MS) {
        trails[reg] = data;
      }
    }
    // Only keep recent history entries too — within the same TTL window.
    const history = historyRaw.filter((e) => e?.at && now - e.at < TRAIL_MAX_AGE_MS);
    return { trails, history };
  } catch {
    return { trails: {}, history: [] };
  }
}
const persisted = loadPersisted();

// Per-tail snapshot used by the roster panel.
// phase: "cruising" | "zone" | "ground" | "nosignal"
const tailState = new Map(
  CELEBRITY_TAILS.map((t) => {
    const reg = t.reg.toUpperCase();
    const saved = persisted.trails[reg] || {};
    return [reg, {
      meta: t,
      phase: "nosignal",
      ac: null,
      inZone: false,
      updatedAt: null,
      // Seed the trail from localStorage so the previously-flown line
      // shows up immediately on next observation.
      savedPositions: Array.isArray(saved.positions) ? saved.positions : null,
      takeoffAirport: saved.takeoffAirport || null,
      route: saved.route ?? undefined,
    }];
  })
);

// Keep the full flown path, not a rolling window. Caps high enough for
// a transatlantic crossing (~9 h at 30 s polling = 1080 points) without
// risking polyline-perf issues on the kiosk.
const TRAIL_MAX_POINTS = 1500;

const map = L.map("map", { zoomControl: true, preferCanvas: true }).setView(EUROPE_CENTER, EUROPE_ZOOM);
L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
  maxZoom: 19,
  subdomains: "abcd",
  attribution: "© OpenStreetMap · © CARTO",
}).addTo(map);

L.circle([AMSTERDAM_ZONE.center.lat, AMSTERDAM_ZONE.center.lon], {
  radius: AMSTERDAM_ZONE.radiusKm * 1000,
  color: "#f0883e",
  weight: 1.5,
  fillColor: "#f0883e",
  fillOpacity: 0.05,
  dashArray: "4 6",
  interactive: false,
}).addTo(map);

// Day/night terminator overlay — subtle shading of the night hemisphere
// that follows the subsolar point. Refreshes once a minute.
if (typeof L.terminator === "function") {
  const terminator = L.terminator({
    fillColor: "#000",
    fillOpacity: 0.28,
    color: "#000",
    weight: 0,
    interactive: false,
  }).addTo(map);
  setInterval(() => terminator.setTime(), 60_000);
}

const trailLayer = L.layerGroup().addTo(map);
const markers = new Map(); // reg -> { marker, trail, positions[], inZone }
const originMarkers = new Map(); // reg -> Leaflet circleMarker at origin airport

const PLANE_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"><path d="M12 1.5 L13 10 L22 12.5 L22 13.6 L13 13.2 L13 17.5 L16.5 18.8 L16.5 19.6 L13 19.2 L12 21.5 L11 19.2 L7.5 19.6 L7.5 18.8 L11 17.5 L11 13.2 L2 13.6 L2 12.5 L11 10 Z"/></svg>`;

function planeIcon(track, inZone) {
  const angle = typeof track === "number" ? track : 0;
  return L.divIcon({
    className: "plane-icon-wrapper",
    html: `<div class="plane-icon ${inZone ? "in-zone" : ""}" style="transform: rotate(${angle}deg)">${PLANE_SVG}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function labelHtml(meta, ac) {
  const alt = typeof ac.alt === "number" ? `${Math.round(ac.alt / 100) * 100} ft` : "—";
  const spd = typeof ac.speed === "number" ? `${Math.round(ac.speed)} kt` : "—";
  return `<strong>${meta.name}</strong><br><span style="color:#8b949e">${meta.reg} · ${alt} · ${spd}</span>`;
}

// The flown path: every observed position, prefixed by the origin
// airport so the trail shows the full journey from takeoff onward. We
// prefer adsbdb's filed origin (commercial routes), fall back to the
// airport we detected from the takeoff position.
function trailOrigin(reg) {
  const state = tailState.get(reg);
  return state?.route?.origin ?? state?.takeoffAirport ?? null;
}

function trailLatLngs(reg) {
  const entry = markers.get(reg);
  if (!entry) return [];
  const origin = trailOrigin(reg);
  return origin
    ? [[origin.lat, origin.lon], ...entry.positions]
    : entry.positions.slice();
}

function refreshTrail(reg) {
  const entry = markers.get(reg);
  if (entry) entry.trail.setLatLngs(trailLatLngs(reg));
  refreshOriginMarker(reg);
}

function refreshOriginMarker(reg) {
  const origin = trailOrigin(reg);
  let dot = originMarkers.get(reg);
  if (origin && markers.has(reg)) {
    if (!dot) {
      dot = L.circleMarker([origin.lat, origin.lon], {
        radius: 5,
        weight: 2,
        color: "#79c0ff",
        fillColor: "#1f6feb",
        fillOpacity: 0.7,
        interactive: false,
      }).addTo(trailLayer);
      dot.bindTooltip(origin.name || origin.icao || "Origin", {
        permanent: false,
        direction: "top",
        offset: [0, -6],
        className: "plane-label",
      });
      originMarkers.set(reg, dot);
    } else {
      dot.setLatLng([origin.lat, origin.lon]);
      dot.setTooltipContent(origin.name || origin.icao || "Origin");
    }
  } else if (dot) {
    trailLayer.removeLayer(dot);
    originMarkers.delete(reg);
  }
}

function upsertMarker(reg, ac, meta, inZone) {
  const latlng = [ac.lat, ac.lon];
  let entry = markers.get(reg);
  if (!entry) {
    const state = tailState.get(reg);
    // Seed with persisted positions from localStorage when present so
    // the previously-flown trail shows up on the very first poll after
    // a page reload.
    const initial = state?.savedPositions?.length
      ? [...state.savedPositions, latlng]
      : [latlng];
    if (state) state.savedPositions = null;

    const marker = L.marker(latlng, { icon: planeIcon(ac.track, inZone) }).addTo(map);
    const trail = L.polyline(initial, {
      color: "#58a6ff",
      weight: 3,
      opacity: 0.8,
      smoothFactor: 1.2,
      lineCap: "round",
      lineJoin: "round",
      interactive: false,
      className: "plane-beam",
    }).addTo(trailLayer);
    marker.bindTooltip(labelHtml(meta, ac), {
      permanent: true,
      direction: "right",
      offset: [14, 0],
      className: "plane-label",
    });
    entry = { marker, trail, positions: initial, inZone };
    markers.set(reg, entry);
  } else {
    entry.marker.setLatLng(latlng);
    entry.marker.setIcon(planeIcon(ac.track, inZone));
    entry.marker.setTooltipContent(labelHtml(meta, ac));
    entry.positions.push(latlng);
    if (entry.positions.length > TRAIL_MAX_POINTS) entry.positions.shift();
    entry.trail.setStyle({ color: inZone ? "#f0883e" : "#58a6ff" });
    entry.inZone = inZone;
  }
  refreshTrail(reg);
}

function removeMarker(reg) {
  const entry = markers.get(reg);
  if (!entry) return;
  map.removeLayer(entry.marker);
  trailLayer.removeLayer(entry.trail);
  markers.delete(reg);
  const dot = originMarkers.get(reg);
  if (dot) {
    trailLayer.removeLayer(dot);
    originMarkers.delete(reg);
  }
}

function setStatus(state, text) {
  els.statusDot.className = `dot dot-${state}`;
  els.statusText.textContent = text;
}

const PHASE_LABEL = {
  cruising: "Cruising",
  zone: "In zone",
  ground: "On ground",
  nosignal: "No signal",
};
const PHASE_ORDER = { zone: 0, cruising: 1, ground: 2, nosignal: 3 };

// Initials avatar with a deterministic color hashed from the name. Real
// portraits can be opt-in per-celeb later via meta.image; falls back to
// initials when no image URL is set.
function avatarInitials(name) {
  return name
    .split(/[\s&·]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
}
function hashHue(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}
function avatarHtml(meta) {
  const hue = hashHue(meta.name);
  const initials = avatarInitials(meta.name);
  return `<span class="avatar" style="background: linear-gradient(135deg, hsl(${hue}, 55%, 40%), hsl(${(hue + 30) % 360}, 55%, 28%));">${initials}</span>`;
}

// Aircraft silhouettes — three sizes tuned to the celeb fleet. Heavy =
// Boeing 757/767/VC-25A; light = small biz jets (Citation, Learjet,
// Challenger 350/600); mid = the typical Gulfstream / Global / Falcon.
function aircraftSize(type) {
  const t = (type || "").toLowerCase();
  if (/\b(7[45]7|vc-?25|767|wide|jumbo)\b/.test(t)) return "heavy";
  if (/citation|learjet|challenger 3|challenger 6/.test(t)) return "light";
  return "mid";
}
const SILHOUETTE_PATH = {
  heavy: "M12 1 L13.6 8.5 L23 12 L23 13.7 L13.6 13.2 L13.6 17 L17.5 19 L17.5 19.9 L13.6 19.4 L12 22 L10.4 19.4 L6.5 19.9 L6.5 19 L10.4 17 L10.4 13.2 L1 13.7 L1 12 L10.4 8.5 Z",
  mid:   "M12 1.5 L13 10 L22 12.5 L22 13.6 L13 13.2 L13 17.5 L16.5 18.8 L16.5 19.6 L13 19.2 L12 21.5 L11 19.2 L7.5 19.6 L7.5 18.8 L11 17.5 L11 13.2 L2 13.6 L2 12.5 L11 10 Z",
  light: "M12 3 L13 10.5 L20 12.8 L20 13.5 L13 13 L13 17 L15.5 18.3 L15.5 19 L13 18.6 L12 20.5 L11 18.6 L8.5 19 L8.5 18.3 L11 17 L11 13 L4 13.5 L4 12.8 L11 10.5 Z",
};
function silhouetteHtml(type) {
  const size = aircraftSize(type);
  return `<svg class="row-silhouette" viewBox="0 0 24 24" aria-hidden="true"><path d="${SILHOUETTE_PATH[size]}"/></svg>`;
}

function fmtAlt(alt) {
  if (typeof alt !== "number") return null;
  if (alt >= 18_000) return `FL${Math.round(alt / 100)}`;
  return `${Math.round(alt / 100) * 100} ft`;
}
function fmtSpeed(s) {
  return typeof s === "number" ? `${Math.round(s)} kt` : null;
}

function renderPanel() {
  const rows = [...tailState.values()].sort((a, b) => {
    const p = PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase];
    return p !== 0 ? p : a.meta.name.localeCompare(b.meta.name);
  });

  const html = rows.map((s) => {
    const { meta, phase, ac } = s;
    const alt = ac ? fmtAlt(ac.alt) : null;
    const spd = ac ? fmtSpeed(ac.speed) : null;
    const stats = phase === "nosignal"
      ? `<span class="stat-empty">—</span>`
      : `<span>${alt ?? '<span class="stat-empty">—</span>'}</span><span>${spd ?? '<span class="stat-empty">—</span>'}</span>`;
    const uncertain = meta.uncertain ? `<span class="uncertain-badge" title="Tail unverified — curate before trusting">?</span>` : "";
    const clickable = ac && !ac.onGround ? "" : "unclickable";

    // Prefer real route progress when adsbdb returned a flight plan.
    // Fall back to altitude (0 → 45000 ft) when no route is available
    // (common for private jets that file as their own N-number).
    let progressBar = "";
    if (s.route && ac) {
      const { pct, traveledKm, totalKm } = computeProgress(s.route, ac.lat, ac.lon);
      const pctNum = Math.round(pct * 100);
      const origCode = s.route.origin.iata || s.route.origin.icao;
      const destCode = s.route.destination.iata || s.route.destination.icao;
      const origName = s.route.origin.name || origCode;
      const destName = s.route.destination.name || destCode;
      const title = `${pctNum}% · ${Math.round(traveledKm)} / ${Math.round(totalKm)} km`;
      progressBar = `
        <div class="row-route" title="${title}">
          <span class="row-route-iata">${origCode}</span>
          <div class="row-progress"><div class="row-progress-fill" style="width: ${pctNum}%"></div></div>
          <span class="row-route-iata">${destCode}</span>
        </div>
        <div class="row-route-names">${origName} <span class="row-arrow">→</span> ${destName}</div>`;
    } else if (s.takeoffAirport && ac) {
      // We saw the takeoff so we know origin, but no filed destination.
      const code = s.takeoffAirport.iata || s.takeoffAirport.icao;
      const name = s.takeoffAirport.name || code;
      progressBar = `
        <div class="row-route-origin">
          <span class="row-origin-label">Departed from</span>
          <span class="row-origin-name"><span class="row-origin-code">${code}</span> · ${name}</span>
        </div>`;
    } else if (ac && typeof ac.alt === "number") {
      const altPct = Math.max(3, Math.min(100, (ac.alt / 45_000) * 100));
      progressBar = `<div class="row-altbar" title="Altitude only — no route available"><div class="row-altbar-fill" style="width: ${altPct}%"></div></div>`;
    }

    return `
      <li class="celeb-row phase-${phase} ${clickable}" data-reg="${meta.reg.toUpperCase()}">
        ${avatarHtml(meta)}
        <span class="row-name">${meta.name}${uncertain}</span>
        <span class="row-phase">${PHASE_LABEL[phase]}</span>
        <div class="row-meta">${silhouetteHtml(meta.aircraft)}${meta.reg} · ${meta.aircraft}</div>
        <div class="row-stats">${stats}</div>
        ${progressBar}
      </li>`;
  }).join("");

  els.celebList.innerHTML = html;
  const visibleAirborne = rows.filter((s) => s.phase === "cruising" || s.phase === "zone").length;
  els.panelCount.textContent = `${visibleAirborne} live`;
}

els.celebList.addEventListener("click", (e) => {
  const row = e.target.closest(".celeb-row");
  if (!row || row.classList.contains("unclickable")) return;
  const reg = row.dataset.reg;
  const s = tailState.get(reg);
  if (!s?.ac) return;
  map.flyTo([s.ac.lat, s.ac.lon], 8, { duration: 0.8 });
});

const EVENT_LABEL = {
  takeoff: "Took off",
  landing: "Landed",
  zone: `Entered ${AMSTERDAM_ZONE.name}`,
  spotted: "Spotted in flight",
};
const EVENT_ICON = {
  takeoff: "🛫",
  landing: "🛬",
  zone: "📍",
  spotted: "📡",
};

// Auto-fly: takeoff / landing / zone events briefly fly the map to the
// event's lat/lon, then fly back to the previous view after FLYTO_HOLD_MS.
// "Spotted" events are intentionally excluded — they fire in bursts on
// the first poll and would whip the map around.
const FLYTO_HOLD_MS = 4000;
let flyReturnView = null;
let flyReturnTimer = null;

function flyToEvent(ac) {
  if (!ac || typeof ac.lat !== "number") return;
  if (!flyReturnTimer) {
    flyReturnView = { center: map.getCenter(), zoom: map.getZoom() };
  } else {
    clearTimeout(flyReturnTimer);
  }
  map.flyTo([ac.lat, ac.lon], Math.max(6, Math.min(8, map.getZoom() + 2)), {
    duration: 1.2,
    easeLinearity: 0.35,
  });
  flyReturnTimer = setTimeout(() => {
    if (flyReturnView) {
      map.flyTo(flyReturnView.center, flyReturnView.zoom, { duration: 1.1, easeLinearity: 0.35 });
    }
    flyReturnTimer = null;
    flyReturnView = null;
  }, FLYTO_HOLD_MS);
}
const HISTORY_MAX = 20;
// Seeded from localStorage so the activity strip survives page reloads.
const eventHistory = [...persisted.history];

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 30) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function showEventCard(evt) {
  const card = els.eventCard;
  card.className = `type-${evt.type}`;
  card.querySelector(".event-icon").textContent = EVENT_ICON[evt.type];
  const title = evt.meta.descriptor
    ? `${evt.meta.name} <span class="event-descriptor">— ${evt.meta.descriptor}</span>`
    : evt.meta.name;
  card.querySelector(".event-title").innerHTML = title;
  const action = evt.airport
    ? `${EVENT_LABEL[evt.type]} ${evt.type === "takeoff" ? "from" : "at"} ${evt.airport.name} in a ${evt.meta.aircraft}`
    : `${EVENT_LABEL[evt.type]} in a ${evt.meta.aircraft}`;
  card.querySelector(".event-action").textContent = action;
  const stats = [evt.meta.reg];
  if (evt.airport) stats.push(evt.airport.icao);
  const alt = fmtAlt(evt.ac?.alt);
  const spd = fmtSpeed(evt.ac?.speed);
  if (alt) stats.push(alt);
  if (spd) stats.push(spd);
  card.querySelector(".event-stats").textContent = stats.join(" · ");
  card.classList.remove("hidden");
  clearTimeout(card._timer);
  card._timer = setTimeout(() => card.classList.add("hidden"), 10_000);
}

function renderHistory() {
  if (eventHistory.length === 0) {
    els.historyList.innerHTML = `<li class="history-empty">Nothing yet — waiting for the first event.</li>`;
    return;
  }
  els.historyList.innerHTML = eventHistory.map((e, i) => {
    const clickable = e.ac && typeof e.ac.lat === "number" ? "" : "unclickable";
    return `
      <li class="history-item type-${e.type} ${clickable}" data-idx="${i}">
        <span class="history-icon">${EVENT_ICON[e.type]}</span>
        <div class="history-text">
          <div class="history-name">${e.meta.name}</div>
          <div class="history-meta">${EVENT_LABEL[e.type]} · ${timeAgo(e.at)}</div>
        </div>
      </li>`;
  }).join("");
}

els.eventCard.addEventListener("click", () => {
  clearTimeout(els.eventCard._timer);
  els.eventCard.classList.add("hidden");
});

els.historyList.addEventListener("click", (e) => {
  const item = e.target.closest(".history-item");
  if (!item || item.classList.contains("unclickable")) return;
  const evt = eventHistory[+item.dataset.idx];
  if (evt?.ac) map.flyTo([evt.ac.lat, evt.ac.lon], 8, { duration: 0.8 });
});

setInterval(renderHistory, 30_000); // refresh "Xm ago" labels

function fireEvent({ type, meta, ac }) {
  // Only takeoff/landing events have a meaningful "from/at airport" — at
  // cruise altitude the nearest airport is misleading. Skip airport lookup
  // entirely for zone-entry and spotted alerts.
  const airport = (type === "takeoff" || type === "landing") && ac
    ? nearestAirport(ac.lat, ac.lon)
    : null;
  const evt = { type, meta, ac, airport, at: Date.now() };
  console.log(`[ALERT ${type}]`, meta.name, meta.reg, airport ? `@ ${airport.icao}` : "");
  eventHistory.unshift(evt);
  if (eventHistory.length > HISTORY_MAX) eventHistory.pop();
  saveHistory();
  showEventCard(evt);
  renderHistory();
  if (type !== "spotted") flyToEvent(ac);
  return evt;
}

function saveTrails() {
  try {
    const data = {};
    const now = Date.now();
    for (const [reg, entry] of markers.entries()) {
      const state = tailState.get(reg);
      data[reg] = {
        positions: entry.positions,
        takeoffAirport: state?.takeoffAirport ?? null,
        route: state?.route ?? null,
        savedAt: now,
      };
    }
    localStorage.setItem(TRAILS_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn("[persist trails]", err.message);
  }
}

function saveHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(eventHistory));
  } catch (err) {
    console.warn("[persist history]", err.message);
  }
}

function pulseZone() {
  const center = [AMSTERDAM_ZONE.center.lat, AMSTERDAM_ZONE.center.lon];
  const baseRadius = AMSTERDAM_ZONE.radiusKm * 1000;
  const startedAt = performance.now();
  const duration = 1800;
  const wave = L.circle(center, {
    radius: baseRadius,
    color: "#f0883e",
    weight: 3,
    fillColor: "#f0883e",
    fillOpacity: 0.18,
    interactive: false,
  }).addTo(map);

  function frame(now) {
    const t = Math.min((now - startedAt) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
    wave.setRadius(baseRadius * (1 + ease * 0.5));
    wave.setStyle({ opacity: 1 - ease, fillOpacity: 0.18 * (1 - ease) });
    if (t < 1) requestAnimationFrame(frame);
    else map.removeLayer(wave);
  }
  requestAnimationFrame(frame);
}

function named(meta) {
  return meta.descriptor ? `${meta.name}, ${meta.descriptor},` : meta.name;
}

// Wait at most `timeoutMs` for the route lookup; if it doesn't resolve
// in time, announce without the destination. Private-jet callsigns
// usually aren't in adsbdb so this race short-circuits cleanly.
function raceForRoute(callsign, timeoutMs = 1500) {
  if (!callsign) return Promise.resolve(null);
  return Promise.race([
    routeFor(callsign).catch(() => null),
    new Promise((r) => setTimeout(() => r(null), timeoutMs)),
  ]);
}

const geofence = new GeofenceTracker(AMSTERDAM_ZONE, ({ reg, meta, zone }) => {
  const ac = tailState.get(reg)?.ac ?? null;
  fireEvent({ type: "zone", meta, ac });
  pulseZone();
  chime.zoneEntry();
  voice.speak(`${named(meta)} just entered ${zone.name} in a ${meta.aircraft}`);
});

const flightState = new FlightStateTracker({
  onSpotted: ({ meta, ac }) => {
    // Page just loaded and this celeb was already airborne — log to
    // activity so the user knows they're up, but no chime/voice (they
    // didn't *just* take off).
    fireEvent({ type: "spotted", meta, ac });
  },
  onTakeoff: ({ meta, ac }) => {
    const evt = fireEvent({ type: "takeoff", meta, ac });
    chime.takeoff();
    // Remember the takeoff airport on the tail's state — drives the
    // "Departed from X" line in the panel when no full route is known.
    const state = tailState.get(meta.reg.toUpperCase());
    if (state && evt.airport) state.takeoffAirport = evt.airport;
    refreshTrail(meta.reg.toUpperCase());
    renderPanel();

    raceForRoute(ac.flight).then((route) => {
      const from = evt.airport ? ` from ${evt.airport.name}` : "";
      const to   = route?.destination?.name ? ` heading to ${route.destination.name}` : "";
      voice.speak(`${named(meta)} just took off${from}${to} in a ${meta.aircraft}`);
    });
  },
  onLanding: ({ meta, ac }) => {
    const evt = fireEvent({ type: "landing", meta, ac });
    chime.landing();
    const state = tailState.get(meta.reg.toUpperCase());
    if (state) state.takeoffAirport = null;
    const where = evt.airport ? ` at ${evt.airport.name}` : "";
    voice.speak(`${named(meta)} just landed${where} in a ${meta.aircraft}`);
  },
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pollOnce() {
  setStatus("loading", "Fetching snapshot…");
  sweep.current = "snapshot";
  sweep.idx = 0;
  sweep.total = CELEBRITY_TAILS.length;
  sweep.ok = sweep.err = sweep.rate = sweep.skip = 0;
  els.pollProgress.innerHTML = `<span class="reg">Fetching bulk snapshot…</span>`;
  els.pollStats.innerHTML = "";

  let snapshot;
  let lastErrorMsg = null;
  try {
    snapshot = await adsb.fetchBulkSnapshot();
    sweep.ok = 1;
  } catch (err) {
    if (err.rateLimited) sweep.rate = 1;
    else sweep.err = 1;
    lastErrorMsg = err.message;
    console.warn("[adsb snapshot]", err.message);
    snapshot = new Map();
  }

  let airborne = 0;
  let matched = 0;

  for (const tail of CELEBRITY_TAILS) {
    sweep.idx++;
    const reg = tail.reg.toUpperCase();
    const ac = snapshot.get(reg)
            || (tail.icao ? snapshot.get(tail.icao.toLowerCase()) : null);
    const state = tailState.get(reg);
    state.updatedAt = Date.now();

    if (ac) {
      matched++;
      flightState.observe(reg, ac, tail);
      if (ac.onGround) {
        removeMarker(reg);
        geofence.forget(reg);
        state.phase = "ground";
        state.ac = ac;
        state.inZone = false;
        state.route = undefined;
        state.takeoffAirport = null;
      } else {
        airborne++;
        state.ac = ac;
        const inZone = geofence.update(reg, { lat: ac.lat, lon: ac.lon }, tail);
        upsertMarker(reg, ac, tail, inZone);
        state.phase = inZone ? "zone" : "cruising";
        state.inZone = inZone;
        if (state.route === undefined && ac.flight) {
          routeFor(ac.flight).then((route) => {
            state.route = route ?? null;
            refreshTrail(reg); // prepend origin once it's known
            renderPanel();
          });
        }
      }
    } else {
      removeMarker(reg);
      geofence.forget(reg);
      state.phase = "nosignal";
      state.ac = null;
      state.inZone = false;
      state.route = undefined;
      state.takeoffAirport = null;
    }
  }

  sweep.current = null;
  els.pollProgress.innerHTML = `<span class="reg">${matched}</span> of ${sweep.total} in snapshot`;
  const detail = lastErrorMsg ? ` <span class="stat-detail">${lastErrorMsg}</span>` : "";
  els.pollStats.innerHTML =
    sweep.rate > 0 ? `<span class="stat-rate">⏸ blocked</span>${detail}` :
    sweep.err  > 0 ? `<span class="stat-err">✗ snapshot fetch failed</span>${detail}` :
                     `<span class="stat-ok">✓ ${snapshot.size} aircraft cached</span>`;
  els.airborneCount.textContent = String(airborne);
  els.lastUpdate.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  renderPanel();
  saveTrails();

  if (sweep.rate > 0) setStatus("err", "Rate-limited — backing off");
  else if (sweep.err > 0) setStatus("err", "Source unreachable");
  else setStatus("ok", "Live");
}

async function tryWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      await navigator.wakeLock.request("screen");
    }
  } catch {
    // wake lock is best-effort; kiosk browser handles screen-on separately
  }
}

// Polling and map rendering run immediately on page load — no gesture needed.
// The Start button is only for unlocking Web Audio + speech, which browsers
// require to be initiated by a user click.
function enableAudio() {
  els.startBtn.classList.add("hidden");
  voice.unlock();
  chime.unlock();
  tryWakeLock();
}

els.startBtn.addEventListener("click", enableAudio);
els.trackedCount.textContent = String(CELEBRITY_TAILS.length);
setStatus("loading", "Starting…");
renderPanel(); // initial render — every tail starts as "no signal"

if (DEMO_MODE) {
  const badge = document.createElement("div");
  badge.id = "demo-badge";
  badge.textContent = "DEMO MODE — scripted scenario, no live data";
  document.body.appendChild(badge);
}

loadAirports();

// Self-chained polling: wait POLL_INTERVAL_MS *after* the previous sweep
// finishes. Using setInterval would let sweeps overlap when a sweep takes
// longer than the interval, doubling the request rate and tripping
// airplanes.live's rate limit.
async function pollLoop() {
  try {
    await pollOnce();
  } catch (err) {
    console.error("[pollLoop]", err);
  }
  // A bulk-snapshot rate-limit is a true Cloudflare IP block — nudging
  // sooner than 5 min just resets the cooldown timer.
  const wait = sweep.rate > 0 ? 5 * 60_000 : POLL_INTERVAL_MS;
  startCountdown(Math.round(wait / 1000));
  setTimeout(pollLoop, wait);
}
pollLoop();

// Some browsers populate the voice list asynchronously.
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => voice.pickVoice();
}
