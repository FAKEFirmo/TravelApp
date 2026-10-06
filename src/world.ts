// Country shapes for both the globe and the place-catalog script (scripts/build-places.mjs), so they always agree.
import { feature, merge } from 'topojson-client';

/** Crimean peninsula bounding box */
export const isCrimea = (lng: number, lat: number) => lng > 32.4 && lng < 36.7 && lat > 44.3 && lat < 46.3;
const inCrimea = (ring: number[][]) =>
  isCrimea(ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length);

/**
 * world-atlas (Natural Earth "de facto" borders) draws Crimea inside Russia. Move it back to Ukraine, the
 * internationally recognised border, merging it seamlessly with the mainland. Returns GeoJSON features.
 */
export function countryFeatures(world: any): any[] {
  const geoms = world.objects.countries.geometries;
  const ru = geoms.find((g: any) => g.properties.name === 'Russia');
  const ua = geoms.find((g: any) => g.properties.name === 'Ukraine');
  const ruPolys = (feature(world, ru) as any).geometry.coordinates as number[][][][];
  const crimea = ruPolys.findIndex(poly => inCrimea(poly[0]));
  if (crimea < 0) return (feature(world, world.objects.countries) as any).features; // data already fixed upstream
  const crimeaArcs = ru.arcs[crimea];
  const fixedRu = { ...ru, arcs: ru.arcs.filter((_: unknown, i: number) => i !== crimea) };
  return geoms.map((g: any) =>
    g === ru ? feature(world, fixedRu)
      : g === ua ? { type: 'Feature', id: g.id, properties: g.properties, geometry: merge(world, [ua, { type: 'Polygon', arcs: crimeaArcs }]) }
        : feature(world, g));
}
