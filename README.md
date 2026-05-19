# celeb-plane-tracker

Static web app that polls [adsb.lol](https://api.adsb.lol/) every 60s for a hand-curated list of celebrity tail numbers, renders them on a Europe-centered Leaflet map, and triggers a Web Speech voice alert when any tracked aircraft enters an Amsterdam-area geofence.

Designed to run fullscreen in Fully Kiosk Browser on Android.

## Run locally

No build step. Serve the directory over HTTP (file:// will block ES modules and fetch):

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Tap **Start tracking** to unlock the Web Speech API (browsers require a user gesture) and begin polling.

## Files

- `index.html` — page shell, HUD, Leaflet
- `styles.css` — dark theme, kiosk-friendly layout
- `src/app.js` — main loop, marker rendering, status
- `src/tails.js` — seed list of celebrity tail numbers (curate over time)
- `src/geofence.js` — circular zone + entry-transition tracker
- `src/voice.js` — Web Speech API wrapper
- `src/adsb/adapter.js` — adapter interface (docs only)
- `src/adsb/adsblol.js` — adsb.lol v2 implementation

## Swapping ADS-B source

Implement the contract documented in `src/adsb/adapter.js` and change the import in `src/app.js`:

```js
// import { AdsbLolAdapter } from "./adsb/adsblol.js";
import { AdsbExchangeAdapter } from "./adsb/adsbexchange.js";
const adsb = new AdsbExchangeAdapter({ apiKey: "…" });
```

## Tuning

- Poll interval: `POLL_INTERVAL_MS` in `src/app.js`
- Request spacing (per-tail stagger): `REQUEST_SPACING_MS` in `src/app.js`
- Geofence center / radius: `AMSTERDAM_ZONE` in `src/geofence.js`
- Tail list: `src/tails.js`
