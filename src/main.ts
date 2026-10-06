// App shell: state, side panel, forms. Globe drawing lives in globe.ts, storage in store.ts.
import placesUrl from './data/places.json?url';
import {
  MODES, KINDS, AIRLINES, AIRCRAFT, CLASSES, view, cityOf,
  type Aircraft, type Activity, type Kind, type Leg, type LegView, type Library, type Mode, type Place, type Stop, type Trip, type TripView,
} from './model';
import { load, save, addPhoto, deletePhoto, photoUrl } from './store';
import { createGlobe } from './globe';
import { icon, esc, fmt, dfmt, hm, ask, enableSwipe } from './ui';

const n = (k: number, one: string, many = one + 's') => `${k} ${k === 1 ? one : many}`;
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const list = $('#list');

// ---------- State ----------
let lib: Library = { version: 1, trips: [] };
let trips: TripView[] = [];
let current: TripView | null = null, focused: LegView | null = null, detail = false;
let tab: 'timeline' | 'photos' = 'timeline', query = '';
let visited = new Set<string>();
let canSave = false; // stays false if the library failed to load, so we never overwrite it

const globe = createGlobe($('#globe'), () => ({ trips, current, focused, detail, visited }), {
  trip: t => select(t),
  place: p => current ? globe.fly([p]) : select(trips.find(t => t.places.some(q => q.id === p.id)) ?? null),
  act: a => globe.fly([a], 0.07),
});

function rebuild() {
  trips = lib.trips.map(view).sort((a, b) => a.start.localeCompare(b.start));
  current = trips.find(t => t.trip === current?.trip) ?? null;
  focused = current?.legs.find(l => l.i === focused?.i) ?? null;
  if (!current) detail = false;
  visited = new Set(trips.flatMap(t => [...t.countries]));
  $('#stats').innerHTML = [
    [trips.length, 'trips'], [trips.reduce((n, t) => n + t.legs.length, 0), 'legs'],
    [visited.size, 'countries'], [fmt(trips.reduce((n, t) => n + t.km, 0)), 'km'],
  ].map(([v, k]) => `<div class="stat"><b>${v}</b><small>${k}</small></div>`).join('');
}

/** Apply a change: recompute, redraw, persist */
async function commit() {
  rebuild(); render(true); globe.refresh(true);
  if (!canSave) return showError('Changes are not being saved because the library could not be loaded.');
  try { await save(lib); } catch (e) { showError(`Could not save: ${e}`); }
}

function showError(msg: string) {
  const el = document.createElement('div');
  el.className = 'err'; el.textContent = msg;
  document.body.append(el); setTimeout(() => el.remove(), 8000);
}

function select(t: TripView | null) {
  if (t !== current) detail = false;
  current = t; focused = null; tab = 'timeline';
  if (t) sheet('half');
  render(); globe.refresh();
}

function fly(points: { lat: number; lng: number }[], leg: LegView | null = null, min?: number) {
  focused = leg;
  globe.fly(points, min);
  render(true);
}

// ---------- Panel ----------
function render(keepScroll = false) {
  const top = list.scrollTop;
  if (!current) detail = false;
  $('aside').classList.toggle('detail', detail);
  list.innerHTML = detail && current ? renderDetail(current) : renderList();
  list.scrollTop = keepScroll ? top : 0;
}

const modeIcons = (t: TripView) => [...new Set(t.legs.map(l => l.mode))].map(m => icon(MODES[m].icon)).join('');
const tripDates = (t: TripView) => t.start ? dfmt(t.start, { month: 'short', year: 'numeric' }) : '';
const code = (p: Place) => esc(p.iata || p.name);

function renderList() {
  if (!trips.length) return `<div class="empty"><b>No trips yet</b>Add your first one with “New trip”.</div>`;
  const q = norm(query.trim());
  const shown = q ? trips.filter(t => norm([t.trip.name, ...t.places.map(p => `${p.name} ${p.city?.name ?? ''} ${p.country}`)].join(' ')).includes(q)) : trips;
  if (!shown.length) return `<div class="empty"><b>No matches</b>No trip or place matches “${esc(query)}”.</div>`;
  return shown.map(t => `
    <div class="trip swipeable ${t === current ? 'on' : ''}" data-id="${t.trip.id}">
      <div class="swipe">
        <div class="top"><span class="name">${esc(t.trip.name)}</span><span class="modes">${modeIcons(t)}</span></div>
        <div class="meta">${tripDates(t)} · ${t.legs.length} legs · ${fmt(t.km)} km</div>
        <ul class="legs">${t.legs.map(l => `
          <li data-i="${l.i}" class="${l === focused ? 'on' : ''}"><span class="dot" style="background:${MODES[l.mode].color}26;color:${MODES[l.mode].color}">${icon(MODES[l.mode].icon)}</span>
            <span>${code(l.from)} → ${code(l.to)}<small>${dfmt(l.date)}${l.info ? ' · ' + esc(l.info) : ''}</small></span>
            <span class="km">${fmt(l.km)} km</span></li>`).join('')}
        </ul>
        <button class="open" data-open>Open trip${icon('ChevronRight')}</button>
      </div>
      <div class="swipe-actions"><button class="danger" data-del-trip="${t.trip.id}">${icon('Trash2')}Delete</button></div>
    </div>`).join('');
}

function stopWhen(s: Stop) {
  if (!s.arrive) return `Start · ${dfmt(s.depart!.date)}`;
  if (!s.depart) return `End · ${dfmt(s.arrive.date)}`;
  if (s.transit) return `Transit · ${dfmt(s.arrive.date)}`;
  return `${dfmt(s.arrive.date)} – ${dfmt(s.depart.date)} · ${esc(s.place.country)}`;
}

function renderDetail(t: TripView) {
  const stops = t.stops.filter(s => s.arrive && s.depart && !s.transit);
  return `
    <div class="dh"><button class="back" data-back title="Back">${icon('ArrowLeft')}</button>
      <div><h2>${esc(t.trip.name)}</h2><div class="meta">${tripDates(t)}</div></div>
      <details class="menu"><summary title="More">${icon('Ellipsis')}</summary>
        <div><button data-edit-trip>${icon('Pencil')}Edit trip</button>
          <button class="del" data-del-trip="${t.trip.id}">${icon('Trash2')}Delete trip</button></div></details></div>
    <div class="stats">${[[stops.length, 'stops'], [t.trip.activities.length, 'activities'], [t.countries.size, 'countries'], [fmt(t.km), 'km']]
      .map(([v, k]) => `<div class="stat"><b>${v}</b><small>${k}</small></div>`).join('')}</div>
    <div class="seg"><button class="${tab === 'timeline' ? 'on' : ''}" data-tab="timeline">Timeline</button>
      <button class="${tab === 'photos' ? 'on' : ''}" data-tab="photos">Photos · ${tripPhotos(t).length}</button></div>
    ${tab === 'photos' ? renderPhotos(t) : `<ol class="tl">${t.stops.map((s, i) => {
      const l = s.depart;
      return `
      <li class="stop ${s.transit ? 'transit' : ''}"><span class="pin"></span>
        <div class="sh" data-stop="${i}"><b>${esc(s.place.name)}</b><small>${stopWhen(s)}</small></div>
        ${s.acts.map(a => `
          <div class="act swipeable">
            <div class="swipe" data-act="${a.id}"><span class="ic">${icon(KINDS[a.kind].icon)}</span>
              <span>${esc(a.title)}<small>${dfmt(a.date)} · ${KINDS[a.kind].label}${a.note ? ' · ' + esc(a.note) : ''}</small>${a.photos.length ? `
                <span class="ph">${a.photos.slice(0, 4).map(p => `<img src="${photoUrl(p, true)}" alt="" data-photo="${p}">`).join('')}${
                  a.photos.length > 4 ? `<em>+${a.photos.length - 4}</em>` : ''}</span>` : ''}</span></div>
            <div class="swipe-actions"><button class="edit" data-edit-act="${a.id}">${icon('Pencil')}Edit</button>
              <button class="danger" data-del-act="${a.id}">${icon('Trash2')}Delete</button></div>
          </div>`).join('')}
        ${s.arrive && s.depart && !s.transit ? `<button class="add" data-add="${i}">${icon('Plus')}Add activity</button>` : ''}
      </li>${l ? `
      <li class="leg ${l === focused ? 'on' : ''}" data-i="${l.i}"><span class="ic" style="color:${MODES[l.mode].color}">${icon(MODES[l.mode].icon)}</span>
        <span>${MODES[l.mode].label}${l.info ? ' · ' + esc(l.info) : ''}${l.aircraft && AIRCRAFT[l.aircraft] ? ' · ' + AIRCRAFT[l.aircraft].short : ''} · ${dfmt(l.date)}</span>
        <span class="km">${fmt(l.km)} km</span></li>${l === focused && l.mode === 'flight' ? `<li class="fcw">${flightCard(l)}</li>` : ''}` : ''}`;
    }).join('')}
    </ol>`}`;
}

/** Every photo of a trip in timeline order, with the activity it belongs to */
const tripPhotos = (t: TripView) => t.stops.flatMap(s => s.acts.flatMap(a => a.photos.map(id => ({ id, a }))));
function renderPhotos(t: TripView) {
  const ps = tripPhotos(t);
  if (!ps.length) return `<div class="empty"><b>No photos yet</b>Add photos to an activity and they'll show up here.</div>`;
  return `<div class="pgrid">${ps.map(p => `<img src="${photoUrl(p.id, true)}" alt="${esc(p.a.title)}" data-photo="${p.id}">`).join('')}</div>`;
}

// Top-down silhouette from length / wingspan / engines; fixed 84 m frame so planes compare to scale
function planeSvg(a: Aircraft) {
  const L = a.len, S = a.span, d = Math.max(3, L * 0.075), le = L * 0.06, root = L * 0.2;
  const sw = a.prop ? 0 : S / 2 * 0.55, tip = L * 0.05, hs = S * 0.34, ht = -L * 0.4;
  const wing = (k: number) => `${le},${k * d / 2} ${le - sw},${k * S / 2} ${le - sw - tip},${k * S / 2} ${le - root},${k * d / 2}`;
  const tail = (k: number) => `${ht + L * 0.06},${k * d / 3} ${ht - hs * 0.35},${k * hs / 2} ${ht - hs * 0.35 - L * 0.04},${k * hs / 2} ${ht - L * 0.04},${k * d / 3}`;
  const engines = (a.eng === 4 ? [0.2, 0.36] : [0.3]).flatMap(f => [1, -1].map(k =>
    `<ellipse cx="${le - sw * f + L * 0.04}" cy="${k * S / 2 * f}" rx="${L * 0.04}" ry="${d * 0.32}"/>`)).join('');
  return `<svg class="plane" viewBox="-42 -42 84 84" preserveAspectRatio="xMidYMid meet">
    <g fill="rgba(255,246,220,.9)"><polygon points="${wing(1)}"/><polygon points="${wing(-1)}"/>
      <polygon points="${tail(1)}"/><polygon points="${tail(-1)}"/>
      <rect x="${-L / 2}" y="${-d / 2}" width="${L}" height="${d}" rx="${d / 2}"/>
      <g fill="rgba(255,209,102,.9)">${engines}</g></g></svg>`;
}

function flightCard(l: LegView) {
  const al = l.info?.match(/^([A-Z0-9]{2})\s?\d+/)?.[1], airline = al && AIRLINES[al], a = l.aircraft ? AIRCRAFT[l.aircraft] : undefined;
  return `<div class="fc">
    <div class="fc-top"><span class="al">${al || icon('Plane')}</span>
      <div><b>${airline ? airline + ' · ' : ''}${esc(l.info || 'Flight')}</b>
        <small>${code(l.from)} → ${code(l.to)} · ${dfmt(l.date)} · ${fmt(l.km)} km${a ? ' · ≈ ' + hm(l.km / a.cruise * 60 + 30) : ''}</small></div></div>
    ${a ? `${planeSvg(a)}
    <div class="ac">${a.name}<small>drawn to scale</small></div>
    <dl><div><dt>Seats</dt><dd>${a.seats}</dd></div><div><dt>Range</dt><dd>${fmt(a.range)} km</dd></div>
      <div><dt>Cruise</dt><dd>${a.cruise} km/h</dd></div><div><dt>Length</dt><dd>${a.len} m</dd></div>
      <div><dt>Wingspan</dt><dd>${a.span} m</dd></div><div><dt>Engines</dt><dd>${a.eng}${a.prop ? ' · turboprop' : ''}</dd></div></dl>`
      : `<div class="seat" style="color:var(--muted)">No aircraft set — edit the trip to add one</div>`}
    ${l.seat || l.cls ? `<div class="seat">${icon('Armchair')} ${[l.seat && 'Seat ' + esc(l.seat), l.cls && esc(l.cls)].filter(Boolean).join(' · ')}</div>` : ''}
  </div>`;
}

// ---------- Panel events ----------
const findAct = (id: string) => current!.trip.activities.find(a => a.id === id)!;

list.addEventListener('click', async e => {
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => (e.target as Element).closest<T>(sel);
  let el: HTMLElement | null;
  if ((el = q('[data-del-trip]'))) return deleteTrip(lib.trips.find(t => t.id === el!.dataset.delTrip)!);
  if (q('[data-edit-trip]')) { q('details')?.removeAttribute('open'); return openTrip(current!.trip); }
  if ((el = q('[data-del-act]'))) return deleteAct(findAct(el.dataset.delAct!));
  if ((el = q('[data-edit-act]'))) return openAct(current!.stops.find(s => s.acts.some(a => a.id === el!.dataset.editAct))!, findAct(el.dataset.editAct!));
  if ((el = q('[data-photo]'))) return openGallery(el.dataset.photo!);
  if ((el = q('[data-add]'))) return openAct(current!.stops[+el.dataset.add!]);
  if (q('[data-open]')) { detail = true; sheet('full'); render(); return globe.refresh(true); }
  if ((el = q('[data-tab]'))) { tab = el.dataset.tab as typeof tab; return render(); }
  if (q('[data-back]')) return back();
  if ((el = q('[data-act]'))) return fly([findAct(el.dataset.act!)], null, 0.07);
  if ((el = q('[data-stop]'))) {
    const s = current!.stops[+el.dataset.stop!];
    return s.acts.length ? fly([s.place, ...s.acts], null, 0.1) : fly([s.place]);
  }
  if ((el = q('[data-i]'))) { const l = current!.legs[+el.dataset.i!]; return fly([l.from, l.to], l === focused ? null : l); }
  if ((el = q('.trip'))) { const t = trips.find(t => t.trip.id === el!.dataset.id)!; select(t === current ? null : t); }
});
enableSwipe(list);

function back() { detail = false; focused = null; tab = 'timeline'; sheet('half'); render(); globe.refresh(true); }
$('#all').onclick = () => select(null);
$<HTMLInputElement>('#search').addEventListener('input', e => {
  query = (e.target as HTMLInputElement).value;
  if (detail) back(); else render();
  if (query) sheet('half');
});
addEventListener('keydown', e => {
  if (e.key === 'Escape' && !document.querySelector('dialog[open]')) detail ? back() : select(null);
});
// ---------- Photo viewer: arrows, keys or swipe through the whole trip ----------
const lightbox = $<HTMLDialogElement>('#lightbox');
let gallery: { id: string; a: Activity }[] = [], gi = 0, swipeX: number | null = null, swiped = false;
function showPhoto(i: number) {
  gi = (i + gallery.length) % gallery.length;
  const { id, a } = gallery[gi];
  lightbox.querySelector('img')!.src = photoUrl(id);
  lightbox.querySelector('.cap')!.textContent = `${a.title} · ${dfmt(a.date)}${gallery.length > 1 ? ` · ${gi + 1}/${gallery.length}` : ''}`;
}
function openGallery(id: string) {
  gallery = current ? tripPhotos(current) : [];
  if (!gallery.some(p => p.id === id)) return;
  lightbox.toggleAttribute('data-single', gallery.length < 2);
  showPhoto(gallery.findIndex(p => p.id === id));
  lightbox.showModal();
}
lightbox.querySelector('.prev')!.innerHTML = icon('ChevronLeft');
lightbox.querySelector('.next')!.innerHTML = icon('ChevronRight');
lightbox.addEventListener('click', e => {
  const nav = (e.target as Element).closest<HTMLElement>('[data-step]');
  if (nav) showPhoto(gi + +nav.dataset.step!);
  else if (!swiped) lightbox.close();
  swiped = false;
});
lightbox.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') showPhoto(gi + (e.key === 'ArrowRight' ? 1 : -1));
});
lightbox.addEventListener('pointerdown', e => { swipeX = e.clientX; });
lightbox.addEventListener('pointerup', e => {
  if (swipeX === null) return;
  const dx = e.clientX - swipeX; swipeX = null;
  if (Math.abs(dx) > 50 && gallery.length > 1) { swiped = true; showPhoto(gi + (dx < 0 ? 1 : -1)); }
});

// ---------- Bottom sheet (phones): collapsed / half / full, dragged by the grabber or header ----------
const aside = $('aside'), phone = matchMedia('(max-width: 760px)');
type Detent = 'collapsed' | 'half' | 'full';
let detent: Detent = 'collapsed';
function detentY(d: Detent) {
  const h = aside.offsetHeight;
  const peek = $('#grab').offsetHeight + $('header').offsetHeight + 8; // grabber + title + stats + search
  return d === 'full' ? 0 : d === 'half' ? Math.round(h * 0.42) : Math.max(0, h - peek);
}
function placeSheet(y: number) {
  aside.style.setProperty('--sheet-y', y + 'px');
  // keep the globe centred in the space above the sheet
  // (sheet top on screen = offsetTop + y; free area is [0, top], its centre vs. the screen centre)
  globe.offset(phone.matches ? Math.min(0, (aside.offsetTop + y) / 2 - innerHeight / 2) : 0);
}
function sheet(d: Detent) {
  detent = d;
  if (phone.matches) placeSheet(detentY(d));
}
{
  let y0 = 0, start = 0, dragging = false;
  const down = (e: PointerEvent) => {
    if ((e.target as Element).closest('input, button') || !phone.matches) return;
    dragging = true; y0 = e.clientY; start = detentY(detent);
    aside.classList.add('dragging');
  };
  $('#grab').addEventListener('pointerdown', down);
  $('header').addEventListener('pointerdown', down);
  addEventListener('pointermove', e => { if (dragging) placeSheet(Math.max(0, start + e.clientY - y0)); });
  addEventListener('pointerup', e => {
    if (!dragging) return;
    dragging = false; aside.classList.remove('dragging');
    const y = start + e.clientY - y0;
    if (Math.abs(e.clientY - y0) < 6) return sheet(detent === 'collapsed' ? 'half' : detent); // tap on grabber opens
    // snap to the nearest detent (detail view can't collapse below half)
    const ds: Detent[] = detail ? ['half', 'full'] : ['collapsed', 'half', 'full'];
    sheet(ds.reduce((a, b) => Math.abs(detentY(b) - y) < Math.abs(detentY(a) - y) ? b : a));
  });
  addEventListener('resize', () => sheet(detent));
  phone.addEventListener('change', () => { aside.style.removeProperty('--sheet-y'); sheet(detent); });
}

async function deleteTrip(trip: Trip) {
  const photos = trip.activities.reduce((s, a) => s + a.photos.length, 0);
  if (!await ask(`Delete “${trip.name}”? Its ${n(trip.legs.length, 'leg')}, ${n(trip.activities.length, 'activity', 'activities')} and ${n(photos, 'photo')} will be removed. This can't be undone.`)) return;
  lib.trips = lib.trips.filter(t => t !== trip);
  if (current?.trip === trip) select(null);
  await commit();
  for (const a of trip.activities) for (const p of a.photos) deletePhoto(p).catch(console.error);
}

async function deleteAct(a: Activity) {
  if (!await ask(`Delete “${a.title}”${a.photos.length ? ` and its ${n(a.photos.length, 'photo')}` : ''}?`)) return;
  current!.trip.activities = current!.trip.activities.filter(x => x !== a);
  await commit();
  for (const p of a.photos) deletePhoto(p).catch(console.error);
}

// ---------- Place catalog + search ----------
const known = new Map<string, Place>(); // catalog + every place already used in the library
let index: { p: Place; n: string }[] = [];
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const label = (p: Place) => p.name + (p.iata ? ` (${p.iata})` : '');

async function loadCatalog() {
  const rows: [string, string, string, number, number, number, string, string][] = await (await fetch(placesUrl)).json();
  const byId = new Map(rows.map(([id, name, country, lat, lng, , iata]) => [id, { id, name, country, lat, lng, ...(iata && { iata }) } as Place]));
  for (const [id, , , , , , , city] of rows) if (city) byId.get(id)!.city = byId.get(city);
  const rank = new Map(rows.map(r => [r[0], r[5]]));
  // Cities by population first, then airports (large before medium)
  index = [...byId.values()].sort((a, b) => +!!a.iata - +!!b.iata || rank.get(b.id)! - rank.get(a.id)!).map(p => ({ p, n: norm(p.city && !p.name.includes(p.city.name) ? `${p.name} ${p.city.name}` : p.name) })); // "tokyo" finds Narita
  for (const p of byId.values()) known.set(p.id, p);
}

function search(q: string) {
  const n = norm(q.trim());
  if (n.length < 2) return [];
  const hits: [number, Place][] = [];
  for (const { p, n: name } of index) {
    const lvl = p.iata?.toLowerCase() === n ? 0 : name.startsWith(n) ? 1 : name.includes(' ' + n) ? 2 : name.includes(n) ? 3 : -1;
    if (lvl >= 0) hits.push([lvl, p]);
  }
  return hits.sort((a, b) => a[0] - b[0]).slice(0, 8).map(h => h[1]); // stable sort keeps the rank order
}

// One dropdown, shared by every place input in the trip form
const suggest = $('#suggest');
let sugInput: HTMLInputElement | null = null, sugItems: Place[] = [], sugOn = 0;
function pick(input: HTMLInputElement, p: Place) {
  input.value = label(p); input.dataset.id = p.id; input.setCustomValidity('');
  suggest.hidden = true;
  // Where a leg ends is where the next one starts, if that's still empty
  const next = input.name === 'to' && input.closest('.leg-edit')?.nextElementSibling?.querySelector<HTMLInputElement>('[name=from]');
  if (next && !next.value) pick(next, p);
}
function showSuggest(input: HTMLInputElement) {
  sugInput = input; sugItems = search(input.value); sugOn = 0;
  if (!sugItems.length) { suggest.hidden = true; return; }
  const r = input.getBoundingClientRect();
  Object.assign(suggest.style, { left: r.left + 'px', top: r.bottom + 4 + 'px', width: Math.max(r.width, 260) + 'px' });
  suggest.innerHTML = sugItems.map((p, i) => `<li data-k="${i}" class="${i ? '' : 'on'}">${icon(p.iata ? 'Plane' : 'Map')}
    <span>${esc(label(p))}</span><small>${esc(p.city && p.city.name !== p.name ? p.city.name : p.country)}</small></li>`).join('');
  suggest.hidden = false;
}
suggest.addEventListener('pointerdown', e => {
  e.preventDefault(); // keep focus in the input
  const li = (e.target as Element).closest<HTMLElement>('li');
  if (li && sugInput) pick(sugInput, sugItems[+li.dataset.k!]);
});

// ---------- Trip form ----------
const tripForm = $<HTMLDialogElement>('#tripForm');
const legRows = $('#legRows');
let editing: Trip | null = null, legN = 0;
const field = (row: Element, name: string) => row.querySelector<HTMLInputElement>(`[name=${name}]`)!;

function addLeg(leg?: Leg) {
  const n = legN++, prev = legRows.lastElementChild;
  legRows.insertAdjacentHTML('beforeend', `<div class="leg-edit">
    <div class="chips">${Object.entries(MODES).map(([k, m]) => `
      <label title="${m.label}"><input type="radio" name="mode${n}" value="${k}" ${k === (leg?.mode ?? 'flight') ? 'checked' : ''}>${icon(m.icon)}</label>`).join('')}
      <button type="button" class="rm" title="Remove leg">${icon('X')}</button></div>
    <div class="row"><input name="from" placeholder="From" required autocomplete="off" data-place>
      <input name="to" placeholder="To" required autocomplete="off" data-place></div>
    <div class="row"><input name="date" type="date" required><input name="info" maxlength="40" placeholder="Flight no., operator… (optional)"></div>
    <div class="row fl"><input name="aircraft" list="aircraftList" placeholder="Aircraft (optional)" autocomplete="off" style="flex:2">
      <input name="seat" maxlength="6" placeholder="Seat" style="flex:1"></div>
    <div class="row fl"><select name="cls" style="flex:1">${CLASSES.map(c => `<option>${c}</option>`).join('')}</select></div>
  </div>`);
  const row = legRows.lastElementChild!;
  const setPlace = (name: string, p?: Place) => { if (p) { known.set(p.id, p); pick(field(row, name), p); } };
  if (leg) {
    setPlace('from', leg.from); setPlace('to', leg.to);
    field(row, 'date').value = leg.date; field(row, 'info').value = leg.info ?? '';
    field(row, 'aircraft').value = leg.aircraft ? AIRCRAFT[leg.aircraft]?.name ?? '' : '';
    field(row, 'seat').value = leg.seat ?? ''; field(row, 'cls').value = leg.cls ?? 'Economy';
  } else if (prev) { // next leg starts where the previous one ended
    setPlace('from', known.get(field(prev, 'to').dataset.id ?? ''));
    field(row, 'date').value = field(prev, 'date').value;
  }
}
legRows.addEventListener('input', e => {
  const t = e.target as HTMLInputElement;
  if (t.dataset.place === undefined) return;
  delete t.dataset.id;
  t.setCustomValidity('Pick a place from the list');
  showSuggest(t);
});
legRows.addEventListener('keydown', e => {
  if (suggest.hidden || e.target !== sugInput) return;
  const lis = suggest.querySelectorAll('li');
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    sugOn = (sugOn + (e.key === 'ArrowDown' ? 1 : lis.length - 1)) % lis.length;
    lis.forEach((li, i) => li.classList.toggle('on', i === sugOn));
  } else if (e.key === 'Enter') { e.preventDefault(); pick(sugInput!, sugItems[sugOn]); }
  else if (e.key === 'Escape') { e.preventDefault(); suggest.hidden = true; }
});
legRows.addEventListener('focusout', () => setTimeout(() => {
  if (!legRows.contains(document.activeElement)) suggest.hidden = true;
}));
legRows.addEventListener('click', e => {
  const rm = (e.target as Element).closest('.rm');
  if (rm && legRows.children.length > 1) rm.closest('.leg-edit')!.remove();
});
$('#addLeg').onclick = () => addLeg();

function openTrip(trip?: Trip) {
  editing = trip ?? null;
  tripForm.querySelector('form')!.reset();
  $('#tripTitle').textContent = trip ? 'Edit trip' : 'New trip';
  field(tripForm, 'name').value = trip?.name ?? '';
  legRows.innerHTML = '';
  if (trip) trip.legs.forEach(l => addLeg(l)); else { addLeg(); addLeg(); }
  tripForm.showModal();
}
$('#newTrip').onclick = () => openTrip();

tripForm.querySelector('form')!.addEventListener('submit', e => {
  if (e.submitter?.getAttribute('value') !== 'save') return;
  const rows = [...legRows.children];
  // Legs must be in date order
  rows.forEach((r, i) => field(r, 'date').setCustomValidity(
    i && field(r, 'date').value < field(rows[i - 1], 'date').value ? 'This leg is earlier than the previous one' : ''));
  if (!(e.target as HTMLFormElement).reportValidity()) return e.preventDefault();
  const legs: Leg[] = rows.map(r => {
    const mode = r.querySelector<HTMLInputElement>('[type=radio]:checked')!.value as Mode;
    const leg: Leg = { from: known.get(field(r, 'from').dataset.id!)!, to: known.get(field(r, 'to').dataset.id!)!, mode, date: field(r, 'date').value };
    const info = field(r, 'info').value.trim();
    if (info) leg.info = mode === 'flight' ? info.toUpperCase() : info;
    if (mode === 'flight') {
      const ac = Object.keys(AIRCRAFT).find(k => AIRCRAFT[k].name === field(r, 'aircraft').value);
      Object.assign(leg, ac && { aircraft: ac }, field(r, 'seat').value && { seat: field(r, 'seat').value.toUpperCase() }, { cls: field(r, 'cls').value });
    }
    return leg;
  });
  const name = field(tripForm, 'name').value.trim();
  if (editing) Object.assign(editing, { name, legs });
  else lib.trips.push(editing = { id: crypto.randomUUID(), name, legs, activities: [] });
  const trip = editing;
  commit().then(() => select(trips.find(t => t.trip === trip) ?? null));
});

// ---------- Activity form ----------
const actForm = $<HTMLDialogElement>('#actForm');
let actStop: Stop | null = null, actEditing: Activity | null = null, removed = new Set<string>();
$('#kinds').innerHTML = Object.entries(KINDS).map(([k, m], i) =>
  `<label><input type="radio" name="kind" value="${k}" ${i ? '' : 'checked'}>${icon(m.icon)}${m.label}</label>`).join('');

function thumbs(files: FileList | null) {
  const old = (actEditing?.photos ?? []).map(p => `<div class="old ${removed.has(p) ? 'gone' : ''}"><img src="${photoUrl(p, true)}" alt="">
    <button type="button" data-rm="${p}" title="${removed.has(p) ? 'Keep' : 'Remove'}">${icon(removed.has(p) ? 'Plus' : 'X')}</button></div>`);
  $('#thumbs').innerHTML = [...old, ...[...files ?? []].map(f => `<img src="${URL.createObjectURL(f)}" alt="">`)].join('');
}
function openAct(stop: Stop, a?: Activity) {
  actStop = stop; actEditing = a ?? null; removed = new Set();
  const f = actForm.querySelector('form')!;
  f.reset();
  $('#actTitle').textContent = a ? 'Edit activity' : 'Add activity';
  $('#actStop').textContent = ' · ' + stop.place.name;
  $('#dropLabel').innerHTML = `${icon('ImagePlus')} Add photos`;
  field(f, 'title').value = a?.title ?? '';
  field(f, 'date').value = a?.date ?? stop.arrive?.date ?? '';
  f.querySelector<HTMLTextAreaElement>('[name=note]')!.value = a?.note ?? '';
  f.querySelector<HTMLInputElement>(`[name=kind][value=${a?.kind ?? 'museum'}]`)!.checked = true;
  thumbs(null);
  actForm.showModal();
}
field(actForm, 'photos').onchange = e => thumbs((e.target as HTMLInputElement).files);
$('#thumbs').addEventListener('click', e => {
  const b = (e.target as Element).closest<HTMLElement>('[data-rm]');
  if (!b) return;
  removed.has(b.dataset.rm!) ? removed.delete(b.dataset.rm!) : removed.add(b.dataset.rm!);
  thumbs(field(actForm, 'photos').files);
});

actForm.querySelector('form')!.addEventListener('submit', async e => {
  if (e.submitter?.getAttribute('value') !== 'save') return;
  e.preventDefault(); // close only once photos are stored
  // Snapshot inputs now: photo processing is async and the form may be reset before it finishes
  const f = new FormData(e.target as HTMLFormElement), files = [...field(actForm, 'photos').files ?? []], gone = new Set(removed);
  const stop = actStop!, editingAct = actEditing, trip = current!.trip, btn = $<HTMLButtonElement>('#actSave');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const added: string[] = [];
    for (const file of files) added.push(await addPhoto(file));
    const a: Activity = editingAct ?? { id: crypto.randomUUID(), stop: '', kind: 'museum', title: '', date: '', lat: 0, lng: 0, photos: [] };
    // ponytail: activities sit on their stop's city until offline maps allow dropping a precise pin
    const city = cityOf(stop.place);
    Object.assign(a, {
      stop: city.id, lat: city.lat, lng: city.lng, kind: f.get('kind') as Kind,
      title: String(f.get('title')).trim(), date: String(f.get('date')), note: String(f.get('note')).trim(),
      photos: [...a.photos.filter(p => !gone.has(p)), ...added],
    });
    if (!editingAct) trip.activities.push(a);
    actForm.close();
    await commit();
    for (const p of gone) deletePhoto(p).catch(console.error);
  } catch (err) {
    showError(`Could not save the activity: ${err}`);
  } finally {
    btn.disabled = false; btn.textContent = 'Save';
  }
});

// ---------- Static bits ----------
$('#all').innerHTML = `${icon('Globe')}All trips`;
$('#newTrip').innerHTML = `${icon('Plus')}New trip`;
$('#fab').innerHTML = icon('Plus');
$('#fab').onclick = () => openTrip();
$('#layers').innerHTML = icon('Layers');
$('#addLeg').innerHTML = `${icon('Plus')}Add leg`;
$('#legend').innerHTML = Object.values(MODES)
  .map(m => `<span style="color:${m.color}">${icon(m.icon)} <span style="color:var(--text)">${m.label}</span></span>`).join('');
document.body.insertAdjacentHTML('beforeend', `<datalist id="aircraftList">${
  Object.values(AIRCRAFT).map(a => `<option value="${a.name}">`).join('')}</datalist>`);
$('.views').addEventListener('click', e => {
  const v = (e.target as HTMLElement).dataset.view;
  if (!v) return;
  setView(v === 'satellite');
});
let satellite = false;
function setView(sat: boolean) {
  satellite = sat;
  document.querySelectorAll<HTMLElement>('.views button').forEach(b => b.classList.toggle('on', (b.dataset.view === 'satellite') === sat));
  globe.satellite(sat);
}
$('#layers').onclick = () => setView(!satellite);

// Static starfield behind the globe
function stars() {
  const c = $<HTMLCanvasElement>('#stars'), x = c.getContext('2d')!;
  c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio;
  for (let i = 0; i < 260; i++) {
    x.globalAlpha = Math.random() * 0.7 + 0.1; x.fillStyle = i % 9 ? '#cfd8ff' : '#ffe2a0';
    x.beginPath(); x.arc(Math.random() * c.width, Math.random() * c.height, Math.random() * 1.2 * devicePixelRatio, 0, 7); x.fill();
  }
}
stars(); addEventListener('resize', stars);

// ---------- Start ----------
try {
  lib = await load();
  canSave = true;
} catch (e) {
  showError(`Could not open your library (${e}). Nothing will be overwritten; a backup is kept as library.bak.json.`);
}
for (const t of lib.trips) for (const l of t.legs) for (const p of [l.from, l.to]) { known.set(p.id, p); if (p.city) known.set(p.city.id, p.city); }
rebuild(); render(); globe.refresh(); sheet('collapsed');
loadCatalog().catch(e => showError(`Could not load the place catalog: ${e}`));
