// The 3D globe: countries, trip arcs, stop + activity markers, camera moves.
import Globe from 'globe.gl';
import { TextureLoader, SRGBColorSpace, Group, Mesh, MeshBasicMaterial, LineSegments, LineBasicMaterial, BufferAttribute, Color } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import ConicPolygonGeometry from 'three-conic-polygon-geometry';
import GeoJsonGeometry from 'three-geojson-geometry';
import worldUrl from 'world-atlas/countries-50m.json?url';
import satelliteUrl from './assets/earth-blue-marble.jpg';
import { countryFeatures } from './world';
import { MODES, KINDS, km, type Activity, type LegView, type Place, type TripView } from './model';
import { icon, esc, rgba, fmt } from './ui';

export interface GlobeState {
  trips: TripView[]; current: TripView | null; focused: LegView | null; detail: boolean; visited: Set<string>;
}
export interface GlobeEvents { trip(t: TripView): void; place(p: Place): void; act(a: Activity): void }

const STYLE = { ocean: '#13204a', land: '#2b4580', visited: '#e3b25a', border: '#cddaff' };
const range = (a: number, b: number, step: number) => Array.from({ length: Math.floor((b - a) / step) + 1 }, (_, i) => a + i * step);
// Graticule every 30° as [lng, lat] lines, under the land so it only shows on the ocean
const GRID = [
  ...range(-180, 150, 30).map(lng => range(-90, 90, 3).map(lat => [lng, lat])),
  ...range(-60, 60, 30).map(lat => range(-180, 180, 3).map(lng => [lng, lat])),
];
// Radii (globe radius 100) of the layers above the ocean sphere; gaps sized for the camera's near plane below
const R = { grid: 100.1, land: 100.3, border: 100.4 };
const noRaycast = () => {}; // these layers never need picking: skipping them keeps pointer moves cheap

/**
 * All countries as ONE mesh (+ one line object for borders, one for the grid) instead of ~3 objects per
 * country: 3 draw calls instead of ~720, and nothing to hit-test while dragging. Colours live in a
 * per-vertex buffer so selecting a trip just rewrites numbers.
 */
function countryLayer(features: any[]) {
  const ranges: { name: string; start: number; count: number }[] = [];
  const caps: any[] = [];
  let vertices = 0;
  for (const f of features) {
    const polys: number[][][][] = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const start = vertices;
    for (const poly of polys) {
      let g = new ConicPolygonGeometry(poly, 0, R.land, false, true, false, 5);
      if (g.index) { const flat = g.toNonIndexed(); g.dispose(); g = flat; } // count vertices as merged
      g.clearGroups();
      vertices += g.attributes.position.count;
      caps.push(g);
    }
    ranges.push({ name: f.properties.name, start, count: vertices - start });
  }
  const land = mergeGeometries(caps);
  caps.forEach(g => g.dispose());
  land.setAttribute('color', new BufferAttribute(new Float32Array(land.attributes.position.count * 3), 3));
  const landMesh = new Mesh(land, new MeshBasicMaterial({ vertexColors: true }));
  const borders = new LineSegments(
    new GeoJsonGeometry({ type: 'MultiPolygon', coordinates: features.flatMap(f => f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) }, R.border, 5),
    new LineBasicMaterial({ color: STYLE.border, transparent: true, opacity: 0.28 }));
  const grid = new LineSegments(new GeoJsonGeometry({ type: 'MultiLineString', coordinates: GRID }, R.grid, 3),
    new LineBasicMaterial({ color: '#aabeff', transparent: true, opacity: 0.1, depthWrite: false }));
  const group = new Group();
  group.add(grid, landMesh, borders);
  for (const o of [landMesh, borders, grid]) o.raycast = noRaycast;
  const c = new Color(), colors = land.attributes.color;
  return {
    group,
    paint(visited: Set<string>, sat: boolean) {
      landMesh.visible = grid.visible = !sat;
      borders.material.opacity = sat ? 0.18 : 0.28;
      for (const r of ranges) {
        c.set(visited.has(r.name) ? STYLE.visited : STYLE.land);
        for (let i = r.start; i < r.start + r.count; i++) colors.setXYZ(i, c.r, c.g, c.b);
      }
      colors.needsUpdate = true;
    },
  };
}
const rad = (d: number) => d * Math.PI / 180;

/** Spherical mean of points → camera target that fits them (handles the antimeridian) */
export function centre(points: { lat: number; lng: number }[], min = 0.35) {
  let x = 0, y = 0, z = 0;
  for (const p of points) {
    x += Math.cos(rad(p.lat)) * Math.cos(rad(p.lng)); y += Math.cos(rad(p.lat)) * Math.sin(rad(p.lng)); z += Math.sin(rad(p.lat));
  }
  const lat = Math.atan2(z, Math.hypot(x, y)) * 180 / Math.PI, lng = Math.atan2(y, x) * 180 / Math.PI;
  const span = Math.max(...points.map(p => km({ lat, lng }, p)));
  return { lat, lng, altitude: Math.min(2.6, Math.max(min, span / 3000)) };
}

type Mark = { lat: number; lng: number; p?: Place; label?: boolean; a?: Activity; more?: number };

export function createGlobe(el: HTMLElement, state: () => GlobeState, on: GlobeEvents) {
  let sat = false, lastAlt = 2.4, satTex: any = null, layer: ReturnType<typeof countryLayer> | null = null, zoomTimer = 0;
  const s = state;
  const paintCountries = () => { const { current, visited } = s(); layer?.paint(current ? current.countries : visited, sat); };
  const arcColor = (l: any) => {
    const { current, focused } = s();
    return rgba(MODES[l.mode as keyof typeof MODES].color, !current ? 0.7 : focused && l !== focused ? 0.2 : 1);
  };

  const globe = new Globe(el, { rendererConfig: { antialias: true, powerPreference: 'high-performance' } })
    .backgroundColor('rgba(0,0,0,0)')
    .atmosphereColor('#9fb4ff').atmosphereAltitude(0.18)
    .customLayerData([]).customThreeObject(() => layer!.group)
    .arcStartLat((l: any) => l.from.lat).arcStartLng((l: any) => l.from.lng)
    .arcEndLat((l: any) => l.to.lat).arcEndLng((l: any) => l.to.lng)
    .arcColor(arcColor)
    .arcAltitudeAutoScale(0.4)
    .arcLabel((l: any) => `${icon(MODES[l.mode as keyof typeof MODES].icon)} <b>${esc(l.from.name)} → ${esc(l.to.name)}</b><br>${esc(l.trip.name)} · ${fmt(l.km)} km`)
    .onArcClick((l: any) => { const t = s().trips.find(t => t.trip === l.trip); if (t) on.trip(t); })
    .htmlLat('lat').htmlLng('lng').htmlAltitude(0.005).htmlTransitionDuration(0)
    .htmlElement((d: object) => {
      const m = d as Mark, el = document.createElement('div');
      if (m.a) {
        const a = m.a;
        el.className = 'mk poi';
        el.title = m.more ? `${a.title} +${m.more} more nearby` : a.title;
        el.innerHTML = icon(KINDS[a.kind].icon) + (m.more ? `<b>+${m.more}</b>` : '');
        el.onclick = () => on.act(a);
      } else {
        const p = m.p!;
        el.className = 'mk';
        el.title = `${p.name}${p.iata ? ` (${p.iata})` : ''} · ${p.country}`;
        if (m.label) el.innerHTML = `<span>${esc(p.name)}</span>`;
        el.onclick = () => on.place(p);
      }
      return el;
    })
    // Rebuilding arcs/markers is the costly part of a zoom: do it once the gesture pauses
    .onZoom(({ altitude }: { altitude: number }) => { clearTimeout(zoomTimer); zoomTimer = setTimeout(() => scale(altitude), 120); });

  const mat = globe.globeMaterial() as any;
  const paint = () => {
    mat.color.set(sat ? '#ffffff' : STYLE.ocean); mat.emissive.set(sat ? '#000000' : '#0b1438');
    mat.emissiveIntensity = 0.6; mat.shininess = 6;
  };
  paint();
  const controls = globe.controls() as any;
  controls.autoRotateSpeed = 0.35;
  // Zoom limits in globe units (radius 100): not closer than the 1:50m data stays sharp, not farther than a small globe
  controls.minDistance = 106; controls.maxDistance = 520;
  // Phones are 3x: rendering at 2x looks the same and halves the GPU work
  globe.renderer().setPixelRatio(Math.min(devicePixelRatio, 2));
  // Near plane at 1 (the camera never gets closer than ~6 units to the surface) gives the depth buffer enough
  // precision to keep grid, land and borders apart without the slower logarithmic depth buffer
  const camera = globe.camera() as any;
  camera.near = 1; camera.updateProjectionMatrix();

  const fit = () => globe.width(innerWidth).height(innerHeight);
  addEventListener('resize', fit); fit();

  fetch(worldUrl).then(r => r.json()).then((w: any) => {
    layer = countryLayer(countryFeatures(w));
    paintCountries();
    globe.customLayerData([{}]); // new datum → globe.gl asks customThreeObject for the (now built) layer
  });

  // Keep arcs a near-constant screen width and declutter markers for the current zoom
  function scale(alt: number, force = false) {
    if (!force && Math.abs(alt - lastAlt) / lastAlt < 0.15) return;
    lastAlt = alt;
    const { trips, current, detail } = s();
    globe.arcStroke((current ? 0.8 : 0.35) * Math.min(1, Math.max(0.01, alt / 2.4)));
    const places = current ? current.places : [...new Map(trips.flatMap(t => t.places).map(p => [p.id, p])).values()];
    // Cities before airports; a place only shows if nothing shown is within ~alt*400 km (≈ 45px)
    const shown: Place[] = [];
    for (const p of [...places].sort((a, b) => +!!a.iata - +!!b.iata))
      if (shown.every(q => km(p, q) > alt * 400)) shown.push(p);
    let marks: Mark[] = shown.map(p => ({ p, lat: p.lat, lng: p.lng, label: !!current }));
    // Detail view: activity icons appear once zoomed in; too-close ones fold into a +N badge
    if (detail && current && alt < 0.6) {
      const gap = alt * 250, acts: Mark[] = [];
      for (const a of current.trip.activities) {
        const near = acts.find(m => km(a, m.a!) <= gap);
        if (near) near.more!++; else acts.push({ a, lat: a.lat, lng: a.lng, more: 0 });
      }
      marks = [...marks.filter(m => acts.every(b => km(m, b) > gap)), ...acts];
    }
    globe.htmlElementsData(marks);
  }

  return {
    /** Re-draw after a selection or data change and move the camera (unless `stay`) */
    refresh(stay = false) {
      const { trips, current } = s();
      globe.arcsData(current ? current.legs : trips.flatMap(t => t.legs))
        .arcDashLength(current ? 0.5 : 1).arcDashGap(current ? 0.08 : 0).arcDashAnimateTime(current ? 2500 : 0)
        .arcColor(arcColor);
      paintCountries();
      globe.controls().autoRotate = !current;
      const pov = current ? centre(current.places) : { altitude: 2.4 };
      if (!stay && current?.places.length !== 0) globe.pointOfView(pov, 1200);
      scale(stay ? lastAlt : pov.altitude, true);
    },
    fly(points: { lat: number; lng: number }[], min = points.length === 1 ? 0.12 : 0.15) {
      globe.arcColor(arcColor);
      globe.pointOfView(centre(points, min), 1000);
    },
    /** Shift the globe vertically (px) so it stays centred in the area a bottom sheet leaves free */
    offset(y: number) { globe.globeOffset([0, y]); },
    satellite(on: boolean) {
      sat = on;
      // Load the texture once and swap it in/out ourselves: globeImageUrl's async load could land after
      // switching back to stylized and tint the ocean almost black
      satTex ??= new TextureLoader().load(satelliteUrl, (t: any) => { t.colorSpace = SRGBColorSpace; mat.needsUpdate = true; });
      mat.map = on ? satTex : null; mat.needsUpdate = true;
      paintCountries();
      paint();
    },
  };
}
