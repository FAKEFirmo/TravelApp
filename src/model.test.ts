// npm test — checks the trip → stops derivation, the one piece of non-trivial logic in the model.
import assert from 'node:assert/strict';
import { view, km, type Place, type Trip } from './model.ts';

const p = (id: string, lat: number, lng: number, extra: Partial<Place> = {}): Place => ({ id, name: id, country: 'X', lat, lng, ...extra });
const MIL = p('MIL', 45.46, 9.19), ROM = p('ROM', 41.9, 12.5), DXB = p('DXB', 25.25, 55.36, { iata: 'DXB' });
const MXP = p('MXP', 45.63, 8.73, { iata: 'MXP', city: MIL });

const trip: Trip = {
  id: 't', name: 'Test', activities: [
    { id: 'a2', stop: 'ROM', kind: 'food', title: 'Dinner', date: '2025-05-04', lat: 0, lng: 0, photos: [] },
    { id: 'a1', stop: 'ROM', kind: 'sight', title: 'Colosseum', date: '2025-05-03', lat: 0, lng: 0, photos: [] },
  ],
  legs: [
    { from: MXP, to: DXB, mode: 'flight', date: '2025-05-01' },
    { from: DXB, to: ROM, mode: 'flight', date: '2025-05-01' },
    { from: ROM, to: MIL, mode: 'train', date: '2025-05-06' },
  ],
};
const v = view(trip);
assert.deepEqual(v.stops.map(s => s.place.id), ['MIL', 'DXB', 'ROM', 'MIL'], 'airports group under their city');
assert.equal(v.stops[1].transit, true, 'same-day airport stopover is a transit');
assert.equal(v.stops[2].transit, false);
assert.deepEqual(v.stops[2].acts.map(a => a.title), ['Colosseum', 'Dinner'], 'activities sorted by date');
assert.equal(v.start, '2025-05-01');
assert.equal(Math.round(km(MIL, ROM)), 477);
// Airport → city transfer stays inside the city's stop; an older catalog's Milan (different id) still merges
const MIL2 = { ...MIL, id: 'MIL-new' };
const v2 = view({ id: 't2', name: 'T2', activities: [
  { id: 'a', stop: 'MIL-new', kind: 'food', title: 'Risotto', date: '2025-06-01', lat: 0, lng: 0, photos: [] }], legs: [
  { from: ROM, to: MXP, mode: 'flight', date: '2025-06-01' },
  { from: MXP, to: MIL2, mode: 'train', date: '2025-06-01' },
  { from: MIL2, to: ROM, mode: 'train', date: '2025-06-03' },
] });
assert.deepEqual(v2.stops.map(s => s.place.name), ['ROM', 'MIL', 'ROM']);
assert.equal(v2.stops[1].transfers.length, 1, 'MXP → Milan is a transfer inside Milan');
assert.equal(v2.stops[1].arrive?.mode, 'flight');
assert.equal(v2.stops[1].depart?.date, '2025-06-03');
assert.deepEqual(v2.stops[1].acts.map(a => a.title), ['Risotto'], 'activity found via the merged id');
console.log('model ok');
