// Builds src/data/land.bin: the globe's country fills and borders, already triangulated.
// Triangulating the 50m shapes takes ~6-10 s, so it happens here once instead of on every app start.
// Layout: u32 header length, header JSON (padded to 4 bytes), then Float32 positions + Uint32 index for land,
// then the same for borders. Run: npm run land   (after changing world.ts or the radii below)
globalThis.window = globalThis; // the geometry libs look for window.THREE
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { countryFeatures } from '../src/world.ts';

const require = createRequire(import.meta.url);
const ConicPolygonGeometry = (await import(require.resolve('three-conic-polygon-geometry'))).default;
const GeoJsonGeometry = (await import(require.resolve('three-geojson-geometry'))).default;
const R = { land: 100.3, border: 100.4 }; // keep in sync with R in src/globe.ts

const features = countryFeatures(require('world-atlas/countries-50m.json'));
const polysOf = f => f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
const pos = [], idx = [], names = [], starts = [], counts = [];
for (const f of features) {
  const start = pos.length / 3;
  for (const poly of polysOf(f)) {
    const g = new ConicPolygonGeometry(poly, 0, R.land, false, true, false, 5);
    const base = pos.length / 3;
    pos.push(...g.attributes.position.array);
    for (const i of g.index.array) idx.push(base + i);
  }
  names.push(f.properties.name); starts.push(start); counts.push(pos.length / 3 - start);
}
const b = new GeoJsonGeometry({ type: 'MultiPolygon', coordinates: features.flatMap(polysOf) }, R.border, 5);

const sections = [new Float32Array(pos), new Uint32Array(idx), new Float32Array(b.attributes.position.array), new Uint32Array(b.index.array)];
let header = Buffer.from(JSON.stringify({ names, starts, counts, sizes: sections.map(s => s.length) }));
header = Buffer.concat([header, Buffer.alloc((4 - header.length % 4) % 4, 32)]);
const len = Buffer.alloc(4); len.writeUInt32LE(header.length);
writeFileSync(new URL('../src/data/land.bin', import.meta.url), Buffer.concat([len, header, ...sections.map(s => Buffer.from(s.buffer))]));
console.log(`land.bin: ${names.length} countries, ${pos.length / 3} + ${b.attributes.position.count} vertices`);
