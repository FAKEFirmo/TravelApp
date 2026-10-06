// Builds src/data/places.json, the offline place catalog (cities + airports).
// Sources (public domain): OurAirports, Natural Earth populated places.
// Country names come from the same world-atlas polygons the globe highlights, so they always match.
// Run: node scripts/build-places.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';
import { geoContains, geoDistance } from 'd3-geo';

const AIRPORTS = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const CITIES = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places_simple.geojson';

const world = createRequire(import.meta.url)('world-atlas/countries-50m.json');
const countries = feature(world, world.objects.countries).features;
const km = (a, b) => geoDistance([a.lng, a.lat], [b.lng, b.lat]) * 6371;
const round = n => Math.round(n * 1e4) / 1e4;

// CSV with quoted fields (no embedded newlines in this file)
const parseCsv = text => {
  const [head, ...rows] = text.trim().split('\n').map(line =>
    [...line.matchAll(/("(?:[^"]|"")*"|[^,]*)(,|$)/g)].slice(0, -1).map(m => m[1].replace(/^"|"$/g, '').replace(/""/g, '"')));
  return rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
};

const countryAt = (p, fallback) => countries.find(c => geoContains(c, [p.lng, p.lat]))?.properties.name ?? fallback;

const ne = await (await fetch(CITIES)).json();
const cities = ne.features.map(f => {
  const p = f.properties, c = { lat: round(p.latitude), lng: round(p.longitude) };
  return { ...c, id: 'c' + p.ne_id, name: p.name, country: countryAt(c, p.adm0name), rank: p.pop_max ?? 0, iso: p.iso_a2 };
});
const isoName = Object.fromEntries(cities.map(c => [c.iso, c.country]));

const csv = parseCsv(await (await fetch(AIRPORTS)).text());
const airports = csv
  .filter(a => a.iata_code && a.scheduled_service === 'yes' && (a.type === 'large_airport' || a.type === 'medium_airport'))
  .map(a => {
    const p = { lat: round(+a.latitude_deg), lng: round(+a.longitude_deg) };
    // Link to a city within 60 km: same name wins, else biggest-and-closest (Malpensa → Milan, not the next town)
    const near = cities.map(c => [c, km(p, c)]).filter(([, d]) => d < 60).sort((x, y) => y[0].rank / (y[1] + 5) ** 2 - x[0].rank / (x[1] + 5) ** 2);
    const city = (near.find(([c]) => a.municipality?.startsWith(c.name)) ?? near[0])?.[0];
    return { ...p, id: 'a' + a.iata_code, name: a.name, iata: a.iata_code, city: city?.id,
      country: city?.country ?? countryAt(p, isoName[a.iso_country] ?? a.iso_country), rank: a.type === 'large_airport' ? 2 : 1 };
  });

// Compact rows: [id, name, country, lat, lng, rank, iata?, cityId?]
const rows = [...cities, ...airports].map(p => [p.id, p.name, p.country, p.lat, p.lng, p.rank, p.iata ?? '', p.city ?? '']);
mkdirSync('src/data', { recursive: true });
writeFileSync('src/data/places.json', JSON.stringify(rows));
console.log(`${cities.length} cities, ${airports.length} airports`);
