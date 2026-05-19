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
  menuBtn: document.getElementById("menu-btn"),
  menuBadge: document.getElementById("menu-badge"),
  panel: document.getElementById("panel"),
};

// Burger menu: panel is hidden by default, slides in from the right when
// the hamburger is clicked. Closing also works by tapping the hamburger
// (it animates into an X while open) or pressing Escape.
els.menuBtn.addEventListener("click", () => {
  const isOpen = els.panel.classList.toggle("open");
  els.menuBtn.classList.toggle("open", isOpen);
  els.menuBtn.setAttribute("aria-expanded", String(isOpen));
  els.menuBtn.setAttribute("aria-label", isOpen ? "Close tracked list" : "Open tracked list");
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && els.panel.classList.contains("open")) {
    els.menuBtn.click();
  }
});
// Tap-outside-to-close — expected gesture on touch devices where Escape
// isn't reachable. Skip when the tap is inside the panel or on the
// burger button itself.
document.addEventListener("click", (e) => {
  if (!els.panel.classList.contains("open")) return;
  if (e.target.closest("#panel") || e.target.closest("#menu-btn")) return;
  els.menuBtn.click();
});

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

    // Prefer real route progress when adsbdb returned a flight plan.
    // Fall back to altitude (0 → 45000 ft) when no route is available
    // (common for private jets that file as their own N-number).
    let progressBar = "";
    if (s.route && ac) {
      const { pct, traveledKm, totalKm } = computeProgress(s.route, ac.lat, ac.lon);
      const pctNum = Math.round(pct * 100);
      const orig = s.route.origin.iata || s.route.origin.icao;
      const dest = s.route.destination.iata || s.route.destination.icao;
      const title = `${pctNum}% · ${Math.round(traveledKm)} / ${Math.round(totalKm)} km`;
      progressBar = `
        <div class="row-route" title="${title}">
          <span class="row-route-iata">${orig}</span>
          <div class="row-progress"><div class="row-progress-fill" style="width: ${pctNum}%"></div></div>
          <span class="row-route-iata">${dest}</span>
        </div>`;
    } else if (ac && typeof ac.alt === "number") {
      const altPct = Math.max(3, Math.min(100, (ac.alt / 45_000) * 100));
      progressBar = `<div class="row-altbar" title="Altitude only — no route available"><div class="row-altbar-fill" style="width: ${altPct}%"></div></div>`;
    }

    return `
      <li class="celeb-row phase-${phase} ${clickable}" data-reg="${meta.reg.toUpperCase()}">
        <span class="row-dot"></span>
        <span class="row-name">${meta.name}${uncertain}</span>
        <span class="row-phase">${PHASE_LABEL[phase]}</span>
        <div class="row-meta">${meta.reg} · ${meta.aircraft}</div>
        <div class="row-stats">${stats}</div>
        ${progressBar}
      </li>`;
  }).join("");

  els.celebList.innerHTML = html;
  const visibleAirborne = rows.filter((s) => s.phase === "cruising" || s.phase === "zone").length;
  const anyInZone = rows.some((s) => s.phase === "zone");
  els.panelCount.textContent = `${visibleAirborne} live`;

  // Sync the hamburger badge: hidden when nothing's airborne, blue with
  // count when celebs are cruising, pulsing orange when one's in zone.
  if (visibleAirborne === 0) {
    els.menuBadge.classList.add("hidden");
  } else {
    els.menuBadge.classList.remove("hidden");
    els.menuBadge.textContent = String(visibleAirborne);
    els.menuBadge.classList.toggle("zone", anyInZone);
  }
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
