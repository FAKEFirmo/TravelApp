// Builds src/data/places.json, the offline place catalog (cities + airports).
// Sources: GeoNames cities5000 (every place with 5,000+ people, CC BY 4.0) and OurAirports (public domain).
// Country names come from the same world-atlas polygons the globe highlights, so they always match.
// Run: npm run places   (needs internet and the `unzip` command)
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { geoBounds, geoContains, geoDistance } from 'd3-geo';
import { countryFeatures, isCrimea } from '../src/world.ts';

const GEONAMES = 'https://download.geonames.org/export/dump/';
const AIRPORTS = 'https://davidmegginson.github.io/ourairports-data/airports.csv';

const world = createRequire(import.meta.url)('world-atlas/countries-50m.json');
const countries = countryFeatures(world).map(f => ({ f, b: geoBounds(f) }));
const km = (a, b) => geoDistance([a.lng, a.lat], [b.lng, b.lat]) * 6371;
const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;

// Point in country, with a bounding-box check first (60k points × 241 shapes would otherwise take minutes)
const inBox = ([[w, s], [e, n]], lng, lat) => lat >= s && lat <= n && (w <= e ? lng >= w && lng <= e : lng >= w || lng <= e);
const polygonCountry = p => countries.find(({ f, b }) => inBox(b, p.lng, p.lat) && geoContains(f, [p.lng, p.lat]))?.f.properties.name;

// Downloads retry: download.geonames.org is sometimes briefly unreachable
async function get(url, tries = 6) {
  for (let i = 1; ; i++) {
    try { const r = await fetch(url); if (r.ok) return r; throw new Error(`${url}: HTTP ${r.status}`); }
    catch (e) { if (i >= tries) throw e; console.warn(`retrying ${url} (${e.cause?.code ?? e.message})`); await new Promise(r => setTimeout(r, 5000 * i)); }
  }
}
const text = async url => (await get(url)).text();
async function unzipText(url) {
  const dir = mkdtempSync(join(tmpdir(), 'places-')), file = join(dir, 'f.zip');
  writeFileSync(file, Buffer.from(await (await get(url)).arrayBuffer()));
  try { return execFileSync('unzip', ['-p', file], { maxBuffer: 1 << 30 }).toString('utf8'); }
  finally { rmSync(dir, { recursive: true }); }
}
const tsv = s => s.trim().split('\n').filter(l => !l.startsWith('#')).map(l => l.split('\t'));

// Region names ("IT.09" → "Lombardy") to tell same-named towns apart
const regions = Object.fromEntries(tsv(await text(GEONAMES + 'admin1CodesASCII.txt')).map(r => [r[0], r[1]]));

// Other-language names for bigger cities, so "Cracow", "Milano" or "Londra" find them. Latin script only (the
// search box is typed in Latin letters), skipping codes like "MIL" and spelling variants that only differ by accents.
const fold = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function altNames(name, ascii, alts) {
  const seen = new Set([fold(name), fold(ascii)]), out = [];
  for (const a of alts.split(',')) {
    const f = fold(a);
    // Proper names start with a capital: drops lowercase romanisations like "lun dun"
    if (a.length < 3 || a.length > 30 || !/^\p{Lu}/u.test(a) || /[^\p{Script=Latin}\s'.-]/u.test(a) || a === a.toUpperCase() || seen.has(f)) continue;
    seen.add(f); out.push(a);
  }
  return out.join('|');
}

// geonameid, name, asciiname, alternatenames, lat, lng, class, code, country, cc2, admin1, …, population
const SKIP = new Set(['PPLX', 'PPLA5', 'PPLH', 'PPLQ', 'PPLW', 'PPLCH']); // city sections, historical, abandoned, destroyed
const cities = tsv(await unzipText(GEONAMES + 'cities5000.zip'))
  .filter(r => !SKIP.has(r[7]) && !/\d/.test(r[1])) // numbered districts ("Paris 15 Vaugirard") aren't towns
  .map(r => {
    const p = { lat: round(+r[4], 3), lng: round(+r[5], 3) };
    const region = regions[`${r[8]}.${r[10]}`];
    const pop = +r[14] || 0;
    return { ...p, id: 'g' + r[0], name: r[1], iso: r[8], country: polygonCountry(p), rank: pop,
      region: region && region !== r[1] ? region : '', alt: pop >= 50_000 ? altNames(r[1], r[2], r[3]) : '' };
  });

// Points just off the simplified coastline: use the name most other places with that ISO code got
const votes = {};
for (const c of cities) if (c.country) (votes[c.iso] ??= {})[c.country] = (votes[c.iso][c.country] ?? 0) + 1;
const isoName = Object.fromEntries(Object.entries(votes).map(([iso, v]) => [iso, Object.entries(v).sort((a, b) => b[1] - a[1])[0][0]]));
// Territories too small for the 1:50m map
const SMALL = { CC: 'Cocos (Keeling) Islands', CX: 'Christmas Island', GI: 'Gibraltar', MC: 'Monaco', MO: 'Macao',
  PN: 'Pitcairn Islands', TK: 'Tokelau', TV: 'Tuvalu', UM: 'U.S. Minor Outlying Islands' };
const fallback = (p, iso) => isCrimea(p.lng, p.lat) ? 'Ukraine' : isoName[iso] ?? SMALL[iso] ?? iso;
for (const c of cities) c.country ??= fallback(c, c.iso);

// 1° grid of cities, so linking airports only looks at nearby ones
const grid = new Map();
for (const c of cities) {
  const k = `${Math.floor(c.lat)},${Math.floor(c.lng)}`;
  grid.get(k)?.push(c) ?? grid.set(k, [c]);
}
const nearby = p => {
  const out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
    out.push(...grid.get(`${Math.floor(p.lat) + dy},${(((Math.floor(p.lng) + dx + 180) % 360) + 360) % 360 - 180}`) ?? []);
  return out;
};

// Airports where GeoNames splits the city in a way no simple rule gets right
const OVERRIDE = { VCE: 'Venice' }; // GeoNames counts Mestre (mainland Venice) separately and bigger

const parseCsv = s => {
  const [head, ...rows] = s.trim().split('\n').map(line =>
    [...line.matchAll(/("(?:[^"]|"")*"|[^,]*)(,|$)/g)].slice(0, -1).map(m => m[1].replace(/^"|"$/g, '').replace(/""/g, '"')));
  return rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
};
const airports = parseCsv(await text(AIRPORTS))
  .filter(a => a.iata_code && a.scheduled_service === 'yes' && (a.type === 'large_airport' || a.type === 'medium_airport'))
  .map(a => {
    const p = { lat: round(+a.latitude_deg, 4), lng: round(+a.longitude_deg, 4) };
    // Link to the city the airport serves, within 70 km. Score = population / (km + 10)²: big and close wins
    // (Malpensa → Milan, not the village it sits in). The city named in the airport's address wins if it scores at
    // least half the best (Dubai over Sharjah, Bergamo over Milan, JFK → New York City).
    const score = ([c, d]) => c.rank / (d + 10) ** 2;
    const near = nearby(p).map(c => [c, km(p, c)]).filter(([, d]) => d < 70).sort((x, y) => score(y) - score(x));
    const m = a.municipality?.toLowerCase();
    const named = m && near.find(([c]) => { const n = c.name.toLowerCase(); return n.startsWith(m) || m.startsWith(n); });
    const forced = OVERRIDE[a.iata_code] && near.find(([c]) => c.name === OVERRIDE[a.iata_code]);
    const city = (forced ?? (named && score(named) >= score(near[0]) / 2 ? named : near[0]))?.[0];
    return { ...p, id: 'a' + a.iata_code, name: a.name, iata: a.iata_code, city: city?.id,
      country: city?.country ?? polygonCountry(p) ?? fallback(p, a.iso_country), rank: a.type === 'large_airport' ? 2 : 1 };
  });

// Compact rows: [id, name, country, lat, lng, rank, iata, cityId, region, otherNames ('|'-separated)]
const rows = [...cities, ...airports].map(p => [p.id, p.name, p.country, p.lat, p.lng, p.rank, p.iata ?? '', p.city ?? '', p.region ?? '', p.alt ?? '']);
mkdirSync('src/data', { recursive: true });
writeFileSync('src/data/places.json', JSON.stringify(rows));
console.log(`${cities.length} cities, ${airports.length} airports`);
