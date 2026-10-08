// Prints the widget's country shapes: world-atlas 1:110m (with the same Crimea fix as the globe), coordinates
// rounded to 0.1°, as [{ n: name, p: rings of [lng, lat] }]. Small enough for a widget (~100 KB).
import { createRequire } from 'node:module';
import { countryFeatures } from '../src/world.ts';

const world = createRequire(import.meta.url)('world-atlas/countries-110m.json');
const r = n => Math.round(n * 10) / 10;
const out = countryFeatures(world).map(f => {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  return { n: f.properties.name, p: polys.flat().map(ring => ring.map(([lng, lat]) => [r(lng), r(lat)])) };
});
process.stdout.write(JSON.stringify(out));
