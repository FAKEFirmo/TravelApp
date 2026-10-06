// The 3D globe: countries, trip arcs, stop + activity markers, camera moves.
import Globe from 'globe.gl';
import { feature } from 'topojson-client';
import worldUrl from 'world-atlas/countries-50m.json?url';
import satelliteUrl from './assets/earth-blue-marble.jpg';
import { MODES, KINDS, km, type Activity, type LegView, type Place, type TripView } from './model';
import { icon, esc, rgba, fmt } from './ui';

export interface GlobeState {
  trips: TripView[]; current: TripView | null; focused: LegView | null; detail: boolean; visited: Set<string>;
}
export interface GlobeEvents { trip(t: TripView): void; place(p: Place): void; act(a: Activity): void }

const STYLE = { ocean: '#13204a', land: '#2b4580', hover: '#3a5a9c', visited: '#e3b25a', border: 'rgba(205,218,255,.28)' };
const range = (a: number, b: number, step: number) => Array.from({ length: Math.floor((b - a) / step) + 1 }, (_, i) => a + i * step);
// Graticule every 30°, under the land so it only shows on the ocean
const GRID = [
  ...range(-180, 150, 30).map(lng => range(-90, 90, 3).map(lat => [lat, lng])),
  ...range(-60, 60, 30).map(lat => range(-180, 180, 3).map(lng => [lat, lng])),
];
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
  let hovered: object | null = null, sat = false, lastAlt = 2.4;
  const s = state;
  const capColor = (f: any) => {
    if (sat) return f === hovered ? 'rgba(255,255,255,.15)' : 'rgba(0,0,0,0)';
    const { current, visited } = s();
    return (current ? current.countries : visited).has(f.properties.name) ? STYLE.visited : f === hovered ? STYLE.hover : STYLE.land;
  };
  const arcColor = (l: any) => {
    const { current, focused } = s();
    return rgba(MODES[l.mode as keyof typeof MODES].color, !current ? 0.7 : focused && l !== focused ? 0.2 : 1);
  };

  // Log depth buffer: stops country caps, borders and grid lines (fractions of a unit apart) flickering
  const globe = new Globe(el, { rendererConfig: { antialias: true, logarithmicDepthBuffer: true } })
    .backgroundColor('rgba(0,0,0,0)')
    .atmosphereColor('#9fb4ff').atmosphereAltitude(0.18)
    .polygonSideColor(() => 'rgba(0,0,0,0)')
    .polygonStrokeColor(() => STYLE.border)
    .polygonCapColor(capColor)
    .polygonAltitude(0.004)
    .polygonsTransitionDuration(0)
    .polygonLabel((f: any) => esc(f.properties.name))
    .onPolygonHover((f: object | null) => { hovered = f; globe.polygonCapColor(capColor); })
    .pathsData(GRID).pathPointLat((p: any) => p[0]).pathPointLng((p: any) => p[1]).pathPointAlt(0.0015)
    .pathColor(() => 'rgba(170,190,255,.10)').pathStroke(null as any).pathTransitionDuration(0)
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
    .onZoom(({ altitude }) => scale(altitude));

  const mat = globe.globeMaterial() as any;
  const paint = () => {
    mat.color.set(sat ? '#ffffff' : STYLE.ocean); mat.emissive.set(sat ? '#000000' : '#0b1438');
    mat.emissiveIntensity = 0.6; mat.shininess = 6;
  };
  paint();
  globe.controls().autoRotateSpeed = 0.35;

  const fit = () => globe.width(innerWidth).height(innerHeight);
  addEventListener('resize', fit); fit();

  fetch(worldUrl).then(r => r.json())
    .then((w: any) => globe.polygonsData((feature(w, w.objects.countries) as any).features));

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
        .arcColor(arcColor).polygonCapColor(capColor);
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
      globe.globeImageUrl(on ? satelliteUrl : null as any)
        .polygonCapColor(capColor)
        .polygonStrokeColor(() => on ? 'rgba(255,255,255,.12)' : STYLE.border)
        .pathsData(on ? [] : GRID);
      paint();
    },
  };
}
