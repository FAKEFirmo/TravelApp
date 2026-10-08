# Little Prince

An offline travel journal on a 3D globe. Log trips as legs (flight, train, bus, car, ferry), see them as arcs on the globe, and record what you did at each stop, with photos.

Everything stays on the device: no account, no network.

Platforms: macOS first, then Android (Samsung), then Windows. Built with [Tauri 2](https://tauri.app), TypeScript and [globe.gl](https://globe.gl).

## Try it

- **Web / iPhone, no App Store needed:** open <https://fakefirmo.github.io/TravelApp/> in Safari, then tap Share → **Add to Home Screen**. It runs full-screen and works offline. Trips and photos are stored only on that device.
- **macOS:** download the `.dmg` from the latest [Build run](https://github.com/FAKEFirmo/TravelApp/actions/workflows/build.yml) → *Artifacts*. The app is unsigned, so the first time right-click it and choose **Open**.

## Mac widget (personal use)

A "Travel globe" desktop widget: your visited countries, routes and totals on a globe that turns a little every 10 minutes (macOS widgets can't animate live). It's signed with your own Apple Development certificate (a free Apple ID in Xcode is enough), so it's for your own Mac:

```sh
npm run widget   # builds the app with the widget, signs it, installs it in /Applications
```

Then right-click the desktop → **Edit Widgets** → search "Little Prince". Code: `widget/`, `scripts/install-mac-widget.sh`.

## Develop

Requires Node 22+ and Rust (`rustup`).

```sh
npm install
npm run tauri dev               # run the app
npm run tauri build             # release bundle (.app / .dmg)
npm test                        # model checks
cd src-tauri && cargo test      # storage checks
```

## Layout

| Path | What |
|---|---|
| `src/main.ts` | App state, side panel, trip and activity forms |
| `src/globe.ts` | Globe rendering, markers, camera |
| `src/model.ts` | Data model, derived views (stops), airline and aircraft reference data |
| `src/store.ts` | Persistence and photos (falls back to localStorage in a plain browser) |
| `src/ui.ts` | Icons, escaping, confirm dialog, swipe-to-reveal |
| `src-tauri/src/lib.rs` | Native storage commands |
| `src/data/places.json` | Offline place catalog (generated) |

## Data

Stored in the app data folder (`~/Library/Application Support/com.littleprince.app` on macOS):

- `library.json`: all trips. Saves are atomic, and the previous version is kept as `library.bak.json`.
- `photos/`: each photo is stored at up to 2048 px, plus a 320 px thumbnail.

Back up that folder to back up everything, or use the in-app **Backup** page (pull the trip list up past its end, hold until the ring fills, then let go; or ⌘B on Mac): it exports one `.json` file with all trips and photos, and imports it on any device (add to existing trips or replace them).

## Place catalog

`src/data/places.json` is generated from [GeoNames](https://www.geonames.org) `cities5000` (about 64,000 places with 5,000+ inhabitants, licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)) and [OurAirports](https://ourairports.com/data/) (public domain). Each airport is linked to the city it serves, and each place's country comes from the same `world-atlas` polygons the globe draws. To regenerate it (needs internet and `unzip`):

```sh
npm run places
```

Country shapes come from `world-atlas` (Natural Earth). The satellite texture is NASA Blue Marble (public domain). Icons are from [Lucide](https://lucide.dev).
