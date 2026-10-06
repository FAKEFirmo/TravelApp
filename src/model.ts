// Data model, reference data and derived views. No imports, so `npm test` can run it directly in Node.

export type Mode = 'flight' | 'train' | 'bus' | 'car' | 'ferry';
export type Kind = 'museum' | 'sight' | 'beach' | 'ski' | 'hike' | 'food';

/** A place snapshot. Trips store copies, so they never depend on the catalog version. */
export interface Place {
  id: string; name: string; country: string; lat: number; lng: number;
  iata?: string;
  city?: Place; // airports point to their city, so stops group by city
}
export interface Leg {
  from: Place; to: Place; mode: Mode;
  date: string; // YYYY-MM-DD
  info?: string; // flight number, operator…
  aircraft?: string; seat?: string; cls?: string; // flights only
}
export interface Activity {
  id: string; stop: string; // id of the stop's city place
  kind: Kind; title: string; date: string; note?: string;
  lat: number; lng: number;
  photos: string[]; // photo ids, files live in the app data folder
}
export interface Trip { id: string; name: string; legs: Leg[]; activities: Activity[] }
export interface Library { version: 1; trips: Trip[] }

export const MODES: Record<Mode, { icon: string; color: string; label: string }> = {
  flight: { icon: 'Plane', color: '#ffd166', label: 'Flight' },
  train: { icon: 'TrainFront', color: '#7bdff2', label: 'Train' },
  bus: { icon: 'Bus', color: '#f28482', label: 'Bus' },
  car: { icon: 'Car', color: '#b8e986', label: 'Car' },
  ferry: { icon: 'Ship', color: '#b8a9ff', label: 'Ferry' },
};
export const KINDS: Record<Kind, { icon: string; label: string }> = {
  museum: { icon: 'Landmark', label: 'Museum' },
  sight: { icon: 'Camera', label: 'Sightseeing' },
  beach: { icon: 'TreePalm', label: 'Beach' },
  ski: { icon: 'MountainSnow', label: 'Skiing' },
  hike: { icon: 'Footprints', label: 'Hike' },
  food: { icon: 'UtensilsCrossed', label: 'Food' },
};

// ponytail: hand-picked airlines; swap for the full OpenFlights list when more are needed
export const AIRLINES: Record<string, string> = {
  AZ: 'ITA Airways', BA: 'British Airways', EK: 'Emirates', DL: 'Delta Air Lines', A3: 'Aegean Airlines',
  FR: 'Ryanair', U2: 'easyJet', LH: 'Lufthansa', AF: 'Air France', KL: 'KLM', JL: 'Japan Airlines', NH: 'ANA',
  TP: 'TAP Air Portugal', IB: 'Iberia', VY: 'Vueling', LX: 'SWISS', OS: 'Austrian', SN: 'Brussels Airlines',
  SK: 'SAS', AY: 'Finnair', TK: 'Turkish Airlines', QR: 'Qatar Airways', EY: 'Etihad', AA: 'American Airlines',
  UA: 'United Airlines', AC: 'Air Canada', W6: 'Wizz Air', EW: 'Eurowings', SQ: 'Singapore Airlines', CX: 'Cathay Pacific',
};

export interface Aircraft {
  name: string; short: string; len: number; span: number; // metres
  seats: string; range: number; cruise: number; eng: number; prop?: boolean; // km, km/h
}
// Typical published figures
export const AIRCRAFT: Record<string, Aircraft> = {
  AT76: { name: 'ATR 72-600', short: 'ATR 72', len: 27.2, span: 27.1, seats: '68–78', range: 1500, cruise: 510, eng: 2, prop: true },
  DH8D: { name: 'De Havilland Dash 8-400', short: 'Dash 8', len: 32.8, span: 28.4, seats: '68–90', range: 2000, cruise: 556, eng: 2, prop: true },
  CRJ9: { name: 'Bombardier CRJ900', short: 'CRJ900', len: 36.2, span: 24.9, seats: '76–90', range: 2900, cruise: 830, eng: 2 },
  E190: { name: 'Embraer E190', short: 'E190', len: 36.2, span: 28.7, seats: '96–114', range: 4500, cruise: 830, eng: 2 },
  E195: { name: 'Embraer E195', short: 'E195', len: 38.7, span: 28.7, seats: '100–124', range: 4200, cruise: 830, eng: 2 },
  BCS3: { name: 'Airbus A220-300', short: 'A220', len: 38.7, span: 35.1, seats: '120–150', range: 6300, cruise: 830, eng: 2 },
  A319: { name: 'Airbus A319', short: 'A319', len: 33.8, span: 35.8, seats: '124–156', range: 6900, cruise: 830, eng: 2 },
  A320: { name: 'Airbus A320', short: 'A320', len: 37.6, span: 35.8, seats: '150–180', range: 6100, cruise: 830, eng: 2 },
  A321: { name: 'Airbus A321', short: 'A321', len: 44.5, span: 35.8, seats: '180–220', range: 7400, cruise: 830, eng: 2 },
  B738: { name: 'Boeing 737-800', short: '737-800', len: 39.5, span: 35.8, seats: '162–189', range: 5400, cruise: 840, eng: 2 },
  B38M: { name: 'Boeing 737 MAX 8', short: '737 MAX', len: 39.5, span: 35.9, seats: '162–178', range: 6500, cruise: 840, eng: 2 },
  B752: { name: 'Boeing 757-200', short: '757', len: 47.3, span: 38.1, seats: '200–230', range: 7200, cruise: 850, eng: 2 },
  B763: { name: 'Boeing 767-300ER', short: '767', len: 54.9, span: 47.6, seats: '218–261', range: 11000, cruise: 850, eng: 2 },
  A332: { name: 'Airbus A330-200', short: 'A330-200', len: 58.8, span: 60.3, seats: '220–260', range: 13400, cruise: 870, eng: 2 },
  A333: { name: 'Airbus A330-300', short: 'A330', len: 63.7, span: 60.3, seats: '250–300', range: 11750, cruise: 870, eng: 2 },
  A339: { name: 'Airbus A330-900neo', short: 'A330neo', len: 63.7, span: 64, seats: '260–300', range: 13300, cruise: 870, eng: 2 },
  B788: { name: 'Boeing 787-8', short: '787-8', len: 56.7, span: 60.1, seats: '240–250', range: 13600, cruise: 900, eng: 2 },
  B789: { name: 'Boeing 787-9', short: '787-9', len: 62.8, span: 60.1, seats: '280–300', range: 14000, cruise: 900, eng: 2 },
  B78X: { name: 'Boeing 787-10', short: '787-10', len: 68.3, span: 60.1, seats: '300–330', range: 11900, cruise: 900, eng: 2 },
  A359: { name: 'Airbus A350-900', short: 'A350', len: 66.8, span: 64.8, seats: '300–350', range: 15000, cruise: 900, eng: 2 },
  A35K: { name: 'Airbus A350-1000', short: 'A350-1000', len: 73.8, span: 64.8, seats: '350–410', range: 16100, cruise: 900, eng: 2 },
  B772: { name: 'Boeing 777-200ER', short: '777-200', len: 63.7, span: 60.9, seats: '300–320', range: 13000, cruise: 905, eng: 2 },
  B77W: { name: 'Boeing 777-300ER', short: '777', len: 73.9, span: 64.8, seats: '350–400', range: 13650, cruise: 905, eng: 2 },
  B744: { name: 'Boeing 747-400', short: '747', len: 70.7, span: 64.4, seats: '400–420', range: 13400, cruise: 910, eng: 4 },
  B748: { name: 'Boeing 747-8', short: '747-8', len: 76.3, span: 68.4, seats: '410–470', range: 14300, cruise: 915, eng: 4 },
  A388: { name: 'Airbus A380-800', short: 'A380', len: 72.7, span: 79.8, seats: '500–600', range: 15000, cruise: 903, eng: 4 },
};
export const CLASSES = ['Economy', 'Premium Economy', 'Business', 'First'];

const rad = (d: number) => d * Math.PI / 180;
/** Great-circle distance in km (haversine) */
export function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// ---------- Derived views ----------
export interface LegView extends Leg { trip: Trip; i: number; km: number }
export interface Stop { place: Place; arrive?: LegView; depart?: LegView; acts: Activity[]; transit: boolean }
export interface TripView {
  trip: Trip; legs: LegView[]; km: number; places: Place[]; countries: Set<string>; stops: Stop[]; start: string;
}

export const cityOf = (p: Place) => p.city ?? p;

export function view(trip: Trip): TripView {
  const legs = trip.legs.map((l, i) => ({ ...l, trip, i, km: km(l.from, l.to) }));
  const places = [...new Map(legs.flatMap(l => [l.from, l.to]).map(p => [p.id, p])).values()];
  // Stops = consecutive leg endpoints grouped by city (Malpensa counts as Milan)
  const stops: Stop[] = [];
  const at = (p: Place) => {
    const c = cityOf(p); let s = stops.at(-1);
    if (s?.place.id !== c.id) stops.push(s = { place: c, acts: [], transit: false });
    return s;
  };
  for (const l of legs) { at(l.from).depart = l; at(l.to).arrive = l; }
  for (const a of [...trip.activities].sort((x, y) => x.date.localeCompare(y.date)))
    (stops.find(s => s.place.id === a.stop && s.arrive) ?? stops.find(s => s.place.id === a.stop))?.acts.push(a);
  // A same-day airport stopover with nothing done there is a transit
  for (const s of stops) s.transit = !!(s.arrive && s.depart && s.place.iata && !s.acts.length && s.arrive.date === s.depart.date);
  return {
    trip, legs, places, stops,
    km: legs.reduce((sum, l) => sum + l.km, 0),
    countries: new Set(places.map(p => p.country)),
    start: legs[0]?.date ?? '',
  };
}
