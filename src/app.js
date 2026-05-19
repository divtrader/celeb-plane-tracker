import { CELEBRITY_TAILS } from "./tails.js";
import { AdsbLolAdapter } from "./adsb/adsblol.js";
import { AMSTERDAM_ZONE, GeofenceTracker } from "./geofence.js";
import { FlightStateTracker } from "./flightState.js";
import { loadAirports, nearestAirport } from "./airports.js";
import { Voice } from "./voice.js";
import { Chime } from "./chime.js";

const POLL_INTERVAL_MS = 60_000;
const REQUEST_SPACING_MS = 250; // be polite to adsb.lol — stagger per-tail lookups

const EUROPE_CENTER = [50.5, 8.0];
const EUROPE_ZOOM = 5;

const adsb = new AdsbLolAdapter();
const voice = new Voice();
const chime = new Chime();
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
};

// Per-tail snapshot used by the roster panel.
// phase: "cruising" | "zone" | "ground" | "nosignal"
const tailState = new Map(
  CELEBRITY_TAILS.map((t) => [t.reg.toUpperCase(), {
    meta: t,
    phase: "nosignal",
    ac: null,
    inZone: false,
    updatedAt: null,
  }])
);

const TRAIL_MAX_POINTS = 30; // ~30 minutes at 60s poll

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

const trailLayer = L.layerGroup().addTo(map);
const markers = new Map(); // reg -> { marker, trail, positions[], inZone }

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

function upsertMarker(reg, ac, meta, inZone) {
  const latlng = [ac.lat, ac.lon];
  let entry = markers.get(reg);
  if (!entry) {
    const marker = L.marker(latlng, { icon: planeIcon(ac.track, inZone) }).addTo(map);
    const trail = L.polyline([latlng], {
      color: "#58a6ff",
      weight: 2,
      opacity: 0.45,
      smoothFactor: 1.5,
      interactive: false,
    }).addTo(trailLayer);
    marker.bindTooltip(labelHtml(meta, ac), {
      permanent: true,
      direction: "right",
      offset: [14, 0],
      className: "plane-label",
    });
    entry = { marker, trail, positions: [latlng], inZone };
    markers.set(reg, entry);
  } else {
    entry.marker.setLatLng(latlng);
    entry.marker.setIcon(planeIcon(ac.track, inZone));
    entry.marker.setTooltipContent(labelHtml(meta, ac));
    entry.positions.push(latlng);
    if (entry.positions.length > TRAIL_MAX_POINTS) entry.positions.shift();
    entry.trail.setLatLngs(entry.positions);
    entry.trail.setStyle({ color: inZone ? "#f0883e" : "#58a6ff" });
    entry.inZone = inZone;
  }
}

function removeMarker(reg) {
  const entry = markers.get(reg);
  if (!entry) return;
  map.removeLayer(entry.marker);
  trailLayer.removeLayer(entry.trail);
  markers.delete(reg);
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
    return `
      <li class="celeb-row phase-${phase} ${clickable}" data-reg="${meta.reg.toUpperCase()}">
        <span class="row-dot"></span>
        <span class="row-name">${meta.name}${uncertain}</span>
        <span class="row-phase">${PHASE_LABEL[phase]}</span>
        <div class="row-meta">${meta.reg} · ${meta.aircraft}</div>
        <div class="row-stats">${stats}</div>
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
};
const EVENT_ICON = {
  takeoff: "🛫",
  landing: "🛬",
  zone: "📍",
};
const HISTORY_MAX = 20;
const eventHistory = [];

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
  card.querySelector(".event-title").textContent = evt.meta.name;
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
  // entirely for zone-entry alerts.
  const airport = (type === "takeoff" || type === "landing") && ac
    ? nearestAirport(ac.lat, ac.lon)
    : null;
  const evt = { type, meta, ac, airport, at: Date.now() };
  console.log(`[ALERT ${type}]`, meta.name, meta.reg, airport ? `@ ${airport.icao}` : "");
  eventHistory.unshift(evt);
  if (eventHistory.length > HISTORY_MAX) eventHistory.pop();
  showEventCard(evt);
  renderHistory();
  return evt;
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

const geofence = new GeofenceTracker(AMSTERDAM_ZONE, ({ reg, meta, zone }) => {
  const ac = tailState.get(reg)?.ac ?? null;
  fireEvent({ type: "zone", meta, ac });
  pulseZone();
  chime.zoneEntry();
  voice.speak(`${meta.name} just entered ${zone.name} in a ${meta.aircraft}`);
});

const flightState = new FlightStateTracker({
  onTakeoff: ({ meta, ac }) => {
    const evt = fireEvent({ type: "takeoff", meta, ac });
    chime.takeoff();
    const where = evt.airport ? ` from ${evt.airport.name}` : "";
    voice.speak(`${meta.name} just took off${where} in a ${meta.aircraft}`);
  },
  onLanding: ({ meta, ac }) => {
    const evt = fireEvent({ type: "landing", meta, ac });
    chime.landing();
    const where = evt.airport ? ` at ${evt.airport.name}` : "";
    voice.speak(`${meta.name} just landed${where} in a ${meta.aircraft}`);
  },
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pollOnce() {
  setStatus("loading", "Polling…");
  let airborne = 0;
  let errors = 0;

  for (const tail of CELEBRITY_TAILS) {
    const reg = tail.reg.toUpperCase();
    try {
      const ac = await adsb.fetchByRegistration(reg);
      const state = tailState.get(reg);
      state.updatedAt = Date.now();
      if (ac) {
        flightState.observe(reg, ac, tail);
        if (ac.onGround) {
          removeMarker(reg);
          geofence.forget(reg);
          state.phase = "ground";
          state.ac = ac;
          state.inZone = false;
        } else {
          airborne++;
          state.ac = ac; // assign before geofence.update so the zone callback sees current data
          const inZone = geofence.update(reg, { lat: ac.lat, lon: ac.lon }, tail);
          upsertMarker(reg, ac, tail, inZone);
          state.phase = inZone ? "zone" : "cruising";
          state.inZone = inZone;
        }
      } else {
        removeMarker(reg);
        geofence.forget(reg);
        state.phase = "nosignal";
        state.ac = null;
        state.inZone = false;
      }
    } catch (err) {
      errors++;
      console.warn(`[adsb] ${reg}:`, err.message);
    }
    await sleep(REQUEST_SPACING_MS);
    renderPanel(); // live update as each tail comes back
  }

  els.airborneCount.textContent = String(airborne);
  els.lastUpdate.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  if (errors === 0) {
    setStatus("ok", "Live");
  } else if (errors < CELEBRITY_TAILS.length) {
    setStatus("ok", `Live (${errors} errors)`);
  } else {
    setStatus("err", "Source unreachable");
  }
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

loadAirports();
pollOnce();
setInterval(pollOnce, POLL_INTERVAL_MS);

// Some browsers populate the voice list asynchronously.
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => voice.pickVoice();
}
