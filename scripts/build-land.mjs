// Builds src/data/land.bin: the globe's country fills and borders, already triangulated, plus the ground
// elevation of every vertex so the globe can raise mountains (terrain relief).
// Triangulating the 50m shapes takes a while, so it happens here once instead of on every app start.
// Layout: u32 header length, header JSON (padded to 4 bytes), then Float32 positions + Uint32 index for land,
// the same for borders, then Int16 elevations (metres) for land and border vertices.
// Elevation: "Terrain Tiles" on AWS (Mapzen terrarium encoding; SRTM, GMTED, ETOPO1 and others, free to use with
// attribution), zoom 4 = 4096 × 4096 px for the world (~10 km per pixel at the equator). Tiles are cached in
// node_modules/.cache/terrain so later runs work offline.
// Run: npm run land   (after changing world.ts, the radii below or the mesh resolution)
globalThis.window = globalThis; // the geometry libs look for window.THREE
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { inflateSync, deflateSync, crc32 } from 'node:zlib';
import { createRequire } from 'node:module';
import { countryFeatures } from '../src/world.ts';

const require = createRequire(import.meta.url);
const ConicPolygonGeometry = (await import(require.resolve('three-conic-polygon-geometry'))).default;
const GeoJsonGeometry = (await import(require.resolve('three-geojson-geometry'))).default;
const R = { land: 100.3, border: 100.4 }; // keep in sync with R in src/globe.ts
const RES = 0.5; // max triangle edge in degrees: finer = smoother mountains, bigger file
const Z = 4, SIZE = 256 << Z;

// ---------- elevation ----------
/** Minimal PNG decoder for the tiles: 8-bit RGB or RGBA, not interlaced */
function decodePng(buf) {
  let w = 0, h = 0, ch = 3; const idat = [];
  for (let o = 8; o < buf.length;) {
    const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), data = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ch = data[9] === 6 ? 4 : 3; if (data[8] !== 8 || data[12]) throw new Error('unsupported PNG'); }
    if (type === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = w * ch, out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[y * stride + x - ch] : 0, b = y ? out[(y - 1) * stride + x] : 0, c = x >= ch && y ? out[(y - 1) * stride + x - ch] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      out[y * stride + x] = (line[x] + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f]) & 255;
    }
  }
  return { w, h, ch, px: out };
}

const cache = new URL('../node_modules/.cache/terrain/', import.meta.url);
mkdirSync(cache, { recursive: true });
const elev = new Int16Array(SIZE * SIZE);
let fetched = 0;
for (let ty = 0; ty < 1 << Z; ty++) for (let tx = 0; tx < 1 << Z; tx++) {
  const file = new URL(`${Z}-${tx}-${ty}.png`, cache);
  if (!existsSync(file)) {
    const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${tx}/${ty}.png`);
    if (!r.ok) throw new Error(`terrain tile ${tx},${ty}: HTTP ${r.status}`);
    writeFileSync(file, Buffer.from(await r.arrayBuffer())); fetched++;
  }
  const { w, ch, px } = decodePng(readFileSync(file));
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const i = (y * w + x) * ch;
    elev[(ty * 256 + y) * SIZE + tx * 256 + x] = Math.round(px[i] * 256 + px[i + 1] + px[i + 2] / 256 - 32768);
  }
}
/** Elevation in metres at lat/lng (bilinear, Web Mercator tiles; clamped near the poles), never below sea level */
function height(lat, lng) {
  const la = Math.max(-85, Math.min(85, lat)) * Math.PI / 180;
  const fx = ((lng + 180) / 360) * SIZE - 0.5, fy = (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * SIZE - 0.5;
  const x0 = Math.floor(fx), y0 = Math.max(0, Math.min(SIZE - 2, Math.floor(fy))), dx = fx - x0, dy = Math.max(0, Math.min(1, fy - y0));
  const at = (x, y) => elev[y * SIZE + ((x % SIZE) + SIZE) % SIZE];
  const v = (at(x0, y0) * (1 - dx) + at(x0 + 1, y0) * dx) * (1 - dy) + (at(x0, y0 + 1) * (1 - dx) + at(x0 + 1, y0 + 1) * dx) * dy;
  return Math.max(0, Math.round(v));
}
// ---------- relief texture ----------
// Equirectangular RGB: red = hillshade (sun from the north-west, 45° high; flat ground ≈ 179), green
// = elevation (0–6,000 m → 0–255) for the snowy tint, blue unused (no alpha: browsers mangle colour where alpha is 0). The globe paints it onto the land, so valleys and ridges show at
// ~10 km detail even though the mesh itself is much coarser.
const TW = 4096, TH = 2048, ZF = 4; // texture size; ZF exaggerates slopes so gentle hills still read
const tex = Buffer.alloc(TW * TH * 3);
const sun = (() => { const az = 315 * Math.PI / 180, alt = 45 * Math.PI / 180; return [-Math.cos(alt) * Math.sin(-az), Math.cos(alt) * Math.cos(az), Math.sin(alt)]; })();
for (let y = 0; y < TH; y++) {
  const lat = 90 - (y + 0.5) * 180 / TH, d = 180 / TH, mPerDeg = 111320;
  const kx = 1 / (2 * d * mPerDeg * Math.max(0.05, Math.cos(lat * Math.PI / 180))), ky = 1 / (2 * d * mPerDeg);
  for (let x = 0; x < TW; x++) {
    const lng = (x + 0.5) * 360 / TW - 180, h = height(lat, lng);
    const dzdx = (height(lat, lng + d) - height(lat, lng - d)) * kx * ZF, dzdy = (height(lat + d, lng) - height(lat - d, lng)) * ky * ZF;
    const n = Math.hypot(dzdx, dzdy, 1), shade = Math.max(0, (-dzdx * sun[0] - dzdy * sun[1] + sun[2]) / n);
    tex[(y * TW + x) * 3] = Math.round(Math.min(1, shade / 0.71 * 0.7) * 255);
    tex[(y * TW + x) * 3 + 1] = Math.min(255, Math.round(h / 6000 * 255));
  }
}
/** Minimal PNG encoder: 8-bit RGB, "sub" filter on every row */
function encodePng(px, w, h) {
  const rows = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) {
    rows[y * (w * 3 + 1)] = 1;
    for (let x = 0; x < w * 3; x++) rows[y * (w * 3 + 1) + 1 + x] = (px[y * w * 3 + x] - (x >= 3 ? px[y * w * 3 + x - 3] : 0)) & 255;
  }
  const chunk = (type, data) => {
    const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length); b.write(type, 4, 'ascii'); data.copy(b, 8);
    b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length); return b;
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w); ihdr.writeUInt32BE(h, 4); ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
writeFileSync(new URL('../src/data/relief.png', import.meta.url), encodePng(tex, TW, TH));

// three-globe's axes: y up through the north pole, lng 0 toward +z
const heightAt = (x, y, z) => height(90 - Math.acos(y / Math.hypot(x, y, z)) * 180 / Math.PI, Math.atan2(x, z) * 180 / Math.PI);
const heights = arr => Int16Array.from({ length: arr.length / 3 }, (_, i) => heightAt(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]));

// ---------- shapes ----------
const features = countryFeatures(require('world-atlas/countries-50m.json'));
const polysOf = f => f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
const pos = [], idx = [], names = [], starts = [], counts = [];
for (const f of features) {
  const start = pos.length / 3;
  for (const poly of polysOf(f)) {
    const g = new ConicPolygonGeometry(poly, 0, R.land, false, true, false, RES);
    const base = pos.length / 3;
    for (const v of g.attributes.position.array) pos.push(v);
    for (const i of g.index.array) idx.push(base + i);
  }
  names.push(f.properties.name); starts.push(start); counts.push(pos.length / 3 - start);
}
const b = new GeoJsonGeometry({ type: 'MultiPolygon', coordinates: features.flatMap(polysOf) }, R.border, RES);
const bPos = b.attributes.position.array;

// Sanity check of the axis convention: Mont Blanc must come out high
const mb = (90 - 45.83) * Math.PI / 180, ml = 6.86 * Math.PI / 180;
const montBlanc = heightAt(Math.sin(mb) * Math.sin(ml), Math.cos(mb), Math.sin(mb) * Math.cos(ml));
if (montBlanc < 2500) throw new Error(`axis convention looks wrong: Mont Blanc at ${montBlanc} m`);

const sections = [new Float32Array(pos), new Uint32Array(idx), new Float32Array(bPos), new Uint32Array(b.index.array), heights(pos), heights(bPos)];
let header = Buffer.from(JSON.stringify({ names, starts, counts, sizes: sections.map(s => s.length) }));
header = Buffer.concat([header, Buffer.alloc((4 - header.length % 4) % 4, 32)]);
const len = Buffer.alloc(4); len.writeUInt32LE(header.length);
writeFileSync(new URL('../src/data/land.bin', import.meta.url), Buffer.concat([len, header, ...sections.map(s => Buffer.from(s.buffer, s.byteOffset, s.byteLength))]));
console.log(`land.bin: ${names.length} countries, ${pos.length / 3} + ${bPos.length / 3} vertices (${fetched} terrain tiles downloaded, Mont Blanc ${montBlanc} m)`);
