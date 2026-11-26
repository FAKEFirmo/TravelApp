// The 3D globe: countries, trip arcs, stop + activity markers, camera moves.
import Globe from 'globe.gl';
import { TextureLoader, SRGBColorSpace, Group, Mesh, LineSegments, LineBasicMaterial, BufferAttribute, BufferGeometry, Color, ShaderMaterial, LinearFilter } from 'three';
import GeoJsonGeometry from 'three-geojson-geometry';
import landUrl from './data/land.bin?url';
import reliefUrl from './data/relief.png';
import satelliteUrl from './assets/earth-blue-marble.jpg';
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
// Radii (globe radius 100) of the layers above the ocean sphere; gaps sized for the camera's near plane below.
// land and border are baked into land.bin: rerun `npm run land` after changing them
const R = { grid: 100.1, land: 100.3, border: 100.4 };
const MARK_ALT = 0.005; // dots and line ends sit just above land and borders (radius 100.5)
const noRaycast = () => {}; // these layers never need picking: skipping them keeps pointer moves cheap

const RELIEF = 0.0007; // globe units per metre of elevation: ~45× real, so ranges stand out on the globe's edge

/**
 * Land painted like a relief map: the flat stylized country colours, times the hillshade in relief.png
 * (scripts/build-land.mjs; ~10 km detail, sun from the north-west), fading toward snow on high ground.
 * The texture is looked up by each pixel's lat/lng, so the mesh needs no texture coordinates.
 */
const reliefMaterial = (tex: any) => new ShaderMaterial({
  vertexColors: true,
  uniforms: { relief: { value: tex }, on: { value: 0 } },
  vertexShader: `varying vec3 vColor; varying vec3 vPos;
    void main() { vColor = color; vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D relief; uniform float on; varying vec3 vColor; varying vec3 vPos;
    void main() {
      vec3 p = normalize(vPos);
      vec4 t = texture2D(relief, vec2(atan(p.x, p.z) / 6.2831853 + 0.5, 0.5 + asin(p.y) / 3.1415927));
      vec3 col = mix(vColor, vec3(0.86, 0.89, 1.0), smoothstep(0.78, 0.97, t.g) * 0.6 * on);
      // shadowed slopes darken the colour; sunlit ones also get a pale highlight, so relief shows on dark blue too
      float shade = mix(1.0, clamp(1.0 + (t.r / 0.7 - 1.0) * 1.9, 0.3, 1.9), on);
      gl_FragColor = vec4(col * min(shade, 1.0) + max(shade - 1.0, 0.0) * vec3(0.3, 0.33, 0.42), 1.0);
      #include <colorspace_fragment>
    }`,
});

/**
 * All countries as ONE mesh (+ one line object for borders, one for the grid) instead of ~3 objects per
 * country: 3 draw calls instead of ~720, and nothing to hit-test while dragging. Colours live in a
 * per-vertex buffer so selecting a trip just rewrites numbers. The shapes come pre-triangulated from
 * land.bin (scripts/build-land.mjs), with each vertex's elevation for the terrain relief.
 */
function countryLayer(buf: ArrayBuffer, tex: any) {
  const hlen = new DataView(buf).getUint32(0, true);
  const { names, starts, counts, sizes } = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hlen)));
  let at = 4 + hlen;
  const types = [Float32Array, Uint32Array, Float32Array, Uint32Array, Int16Array, Int16Array];
  const [landPos, landIdx, borderPos, borderIdx, landH, borderH] = sizes.map((n: number, i: number) => {
    const a = new types[i](buf, at, n); at += n * types[i].BYTES_PER_ELEMENT; return a;
  });
  /** Positions raised by elevation (each vertex pushed out along its own direction) */
  const raised = (pos: Float32Array, h: Int16Array) => pos.map((v, i) => {
    const j = i - i % 3, r = Math.hypot(pos[j], pos[j + 1], pos[j + 2]);
    return v * (r + h[j / 3] * RELIEF) / r;
  });
  const geometry = (pos: Float32Array, idx: Uint32Array) => {
    const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(pos, 3)); g.setIndex(new BufferAttribute(idx, 1)); return g;
  };
  const ranges = names.map((name: string, i: number) => ({ name, start: starts[i], count: counts[i] }));
  const land = geometry(landPos, landIdx), borderGeo = geometry(borderPos, borderIdx);
  land.setAttribute('color', new BufferAttribute(new Float32Array(landPos.length), 3));
  // Flat and raised versions, built once; the relief switch just swaps which one is drawn
  const flat = { land: landPos, border: borderPos }, high = { land: raised(landPos, landH), border: raised(borderPos, borderH) };
  const material = reliefMaterial(tex);
  const landMesh = new Mesh(land, material);
  const borders = new LineSegments(borderGeo, new LineBasicMaterial({ color: STYLE.border, transparent: true, opacity: 0.28 }));
  const grid = new LineSegments(new GeoJsonGeometry({ type: 'MultiLineString', coordinates: GRID }, R.grid, 3),
    new LineBasicMaterial({ color: '#aabeff', transparent: true, opacity: 0.1, depthWrite: false }));
  const group = new Group();
  group.add(grid, landMesh, borders);
  for (const o of [landMesh, borders, grid]) o.raycast = noRaycast;
  const c = new Color(), colors = land.attributes.color;
  let relief = false;
  return {
    group,
    relief(on: boolean) {
      material.uniforms.on.value = on && tex.image ? 1 : 0; // shading waits for the texture
      if (on === relief) return;
      relief = on;
      const v = on ? high : flat;
      land.setAttribute('position', new BufferAttribute(v.land, 3));
      borderGeo.setAttribute('position', new BufferAttribute(v.border, 3));
      land.computeBoundingSphere(); borderGeo.computeBoundingSphere();
    },
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
  // Tall, narrow screens (phones) fit less east–west, and the bottom sheet covers part of the height: zoom out more
  const narrow = Math.max(1, 0.75 * innerHeight / innerWidth);
  return { lat, lng, altitude: Math.min(2.6, Math.max(min, span * narrow / 3000)) };
}

type Mark = { lat: number; lng: number; p?: Place; label?: boolean; a?: Activity; more?: number };

export function createGlobe(el: HTMLElement, state: () => GlobeState, on: GlobeEvents) {
  let sat = false, wantRelief = false, lastAlt = 2.4, satTex: any = null, layer: ReturnType<typeof countryLayer> | null = null, zoomTimer = 0;
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
    // Start/end at the dots' height: on the bare surface the last bit of each line hid under the raised land
    .arcStartAltitude((l: any) => MARK_ALT + lift(l.from.lat, l.from.lng)).arcEndAltitude((l: any) => MARK_ALT + lift(l.to.lat, l.to.lng))
    .arcLabel((l: any) => `${icon(MODES[l.mode as keyof typeof MODES].icon)} <b>${esc(l.from.name)} → ${esc(l.to.name)}</b><br>${esc(l.trip.name)} · ${fmt(l.km)} km`)
    .onArcClick((l: any) => { const t = s().trips.find(t => t.trip === l.trip); if (t) on.trip(t); })
    .htmlLat('lat').htmlLng('lng').htmlAltitude((m: any) => MARK_ALT + lift(m.lat, m.lng)).htmlTransitionDuration(0)
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
        if (m.label) el.innerHTML = `<span>${esc(p.iata ? `${p.iata} airport` : p.name)}</span>`;
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

  // The relief texture fills in when it arrives; the land shows flat until then
  // Ground height for dots and line ends, so they sit on the raised terrain: read once from relief.png's
  // elevation channel at half resolution (~20 km, about the mesh's own detail)
  let ground: Uint8ClampedArray | null = null;
  const GW = 2048, GH = 1024;
  const lift = (lat: number, lng: number) => {
    if (!ground || !wantRelief) return 0;
    const x = Math.min(GW - 1, Math.floor((lng + 180) / 360 * GW)), y = Math.min(GH - 1, Math.floor((90 - lat) / 180 * GH));
    return ground[(y * GW + x) * 4 + 1] / 255 * 6000 * RELIEF / 100; // metres → globe altitude units (radius 100)
  };
  const reliefTex = new TextureLoader().load(reliefUrl, (t: any) => {
    const c = document.createElement('canvas'); c.width = GW; c.height = GH;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(t.image, 0, 0, GW, GH);
    ground = g.getImageData(0, 0, GW, GH).data;
    layer?.relief(wantRelief); restack();
  });
  /** Re-place dots and arc ends after the terrain changed (height data arrived, relief switched) */
  function restack() { globe.arcsData([...globe.arcsData()]); scale(lastAlt, true); }
  reliefTex.generateMipmaps = false; reliefTex.minFilter = LinearFilter; // no mipmaps: they'd draw a seam at the date line
  fetch(landUrl).then(r => r.arrayBuffer()).then(buf => {
    layer = countryLayer(buf, reliefTex); layer.relief(wantRelief);
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
    // Every place a line ends at gets its own dot, so dots always sit on the line ends. Only the names are
    // thinned out: cities before airports, and a name only shows if no shown name is within ~alt*400 km (≈ 45px)
    const named: Place[] = [];
    if (current) for (const p of [...places].sort((a, b) => +!!a.iata - +!!b.iata))
      if (named.every(q => km(p, q) > alt * 400)) named.push(p);
    let marks: Mark[] = places.map(p => ({ p, lat: p.lat, lng: p.lng, label: named.includes(p) }));
    // Detail view: activity icons appear once zoomed in; too-close ones fold into a +N badge
    if (detail && current && alt < 0.6) {
      const gap = alt * 250, acts: Mark[] = [];
      for (const a of current.trip.activities) {
        const near = acts.find(m => km(a, m.a!) <= gap);
        if (near) near.more!++; else acts.push({ a, lat: a.lat, lng: a.lng, more: 0 });
      }
      marks = [...marks.filter(m => acts.every(b => km(m, b) > 0.5)), ...acts]; // hide only dots right under an icon
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
      // Overview: face the middle of everywhere you've been (then slowly rotate), not wherever the globe stopped
      const all = trips.flatMap(t => t.places);
      const pov = current ? centre(current.places) : all.length ? { ...centre(all), altitude: 2.4 } : { altitude: 2.4 };
      if (!stay && current?.places.length !== 0) globe.pointOfView(pov, 1200);
      scale(stay ? lastAlt : pov.altitude, true);
    },
    fly(points: { lat: number; lng: number }[], min = points.length === 1 ? 0.12 : 0.15) {
      globe.arcColor(arcColor);
      globe.pointOfView(centre(points, min), 1000);
    },
    /** Terrain relief on/off (mountains raised and shaded) */
    relief(on: boolean) { wantRelief = on; layer?.relief(on); paintCountries(); restack(); },
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
