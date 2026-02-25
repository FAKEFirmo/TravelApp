# TravelApp

An offline-first trip diary with an interactive 3D globe.

## Features (MVP)

- Rotatable/zoomable 3D globe.
- Toggle layers:
  - **Countries**: highlights visited countries.
  - **Cities**: pins for visited cities.
  - **Both**.
- Offline local storage (IndexedDB).
- Import/export your data as JSON.
- PWA offline support (service worker caching) once installed/visited.

## Tech

- React + TypeScript + Vite
- `react-globe.gl` (3D globe)
- `world-atlas` + `topojson-client` (country polygons)
- `idb` (IndexedDB)
- `vite-plugin-pwa` (offline caching)

## Getting started

```bash
npm install
npm run dev
```

Build + preview:

```bash
npm run build
npm run preview
```

## Offline usage

### PWA offline

- Visit the app once online.
- Use the browser "Install" action (Chrome/Edge/Android) to install it.
- After installation, the app shell and local assets are cached and it will continue to run offline.

### Fully-offline APK (optional)

If you want an Android install that works offline on first launch, wrap the web build with Capacitor.

See: `docs/android.md`.

## Data notes

- Country polygons come from `world-atlas` and use ISO 3166-1 **numeric** country codes in the GeoJSON `feature.id`.
- Visits store `countryId` as a string numeric code.

