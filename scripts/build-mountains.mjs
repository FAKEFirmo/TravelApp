// Builds src/data/mountains.json: little storybook peaks scattered over the world's mountain ranges.
// Source: Natural Earth 1:50m geography regions (public domain), features of class "Range/mtn".
// Each range is filled with points on a ~1.1° grid (slightly jittered so it doesn't look like a grid); bigger,
// better-known ranges (lower scalerank) get taller peaks. Output: [[lat, lng, height 0–1], …].
// Run: npm run mountains   (needs internet)
import { writeFileSync } from 'node:fs';
import { geoBounds, geoContains } from 'd3-geo';

const URL_NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_geography_regions_polys.geojson';
const STEP = 1.1;
const res = await fetch(URL_NE);
if (!res.ok) throw new Error(`${URL_NE}: HTTP ${res.status}`);
const ranges = (await res.json()).features.filter(f => f.properties.FEATURECLA === 'Range/mtn');

// Deterministic pseudo-random numbers, so rebuilding gives the same file
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const round = n => Math.round(n * 100) / 100;

const peaks = [];
for (const f of ranges) {
  const [[w, s], [e, n]] = geoBounds(f);
  const tall = [1, 1, 0.8, 0.65][Math.min(3, f.properties.SCALERANK)] ?? 0.55;
  const east = e < w ? e + 360 : e; // ranges crossing the antimeridian
  for (let lat = s; lat <= n; lat += STEP) {
    const dLng = STEP / Math.max(0.2, Math.cos(lat * Math.PI / 180)); // keep spacing even toward the poles
    for (let lng = w; lng <= east; lng += dLng) {
      const p = [lng + (rnd() - 0.5) * dLng * 0.8, lat + (rnd() - 0.5) * STEP * 0.8];
      if (p[0] > 180) p[0] -= 360;
      if (geoContains(f, p)) peaks.push([round(p[1]), round(p[0]), round(tall * (0.6 + 0.4 * rnd()))]);
    }
  }
}
writeFileSync(new URL('../src/data/mountains.json', import.meta.url), JSON.stringify(peaks));
console.log(`mountains.json: ${ranges.length} ranges, ${peaks.length} peaks`);
