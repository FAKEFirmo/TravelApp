import { useEffect, useMemo, useRef, useState } from 'react';
import { GlobeView, type GlobeFocus, type ViewMode } from './components/GlobeView';
import { getAllCountries, getCountryName, type CountryFeature } from './geo/countries';
import type { ExportBundle, Trip, Visit } from './storage/schema';
import * as DB from './storage/db';
import { uid } from './utils/uid';

const ALL_TRIPS_ID = '__all__';

function downloadJson(filename: string, obj: unknown) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Failed reading file'));
    reader.readAsText(file);
  });
}

export default function App() {
  const allCountries = useMemo(() => getAllCountries(), []);

  const [mode, setMode] = useState<ViewMode>('countries');

  const [trips, setTrips] = useState<Trip[]>([]);
  const [activeTripId, setActiveTripId] = useState<string>(ALL_TRIPS_ID);

  const [visits, setVisits] = useState<Visit[]>([]);
  const [visitedCountries, setVisitedCountries] = useState<CountryFeature[]>([]);

  const [focus, setFocus] = useState<GlobeFocus | null>(null);

  // Add visit flow
  const [isAdding, setIsAdding] = useState(false);
  const [pickedCoords, setPickedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [cityName, setCityName] = useState('');
  const [countryId, setCountryId] = useState('');
  const [visitedAt, setVisitedAt] = useState('');
  const [countrySearch, setCountrySearch] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputReplaceRef = useRef<HTMLInputElement | null>(null);

  const filteredCountries = useMemo(() => {
    const q = countrySearch.trim().toLowerCase();
    if (!q) return allCountries;
    return allCountries.filter((c) => (c.properties?.name ?? '').toLowerCase().includes(q));
  }, [allCountries, countrySearch]);

  async function refreshTrips() {
    const list = await DB.listTrips();

    // Bootstrap a default trip if repo starts empty.
    if (list.length === 0) {
      const t: Trip = {
        id: uid('trip'),
        title: 'My Travels',
        createdAt: new Date().toISOString()
      };
      await DB.upsertTrip(t);
      const list2 = await DB.listTrips();
      setTrips(list2);
      return;
    }

    setTrips(list);
  }

  async function refreshVisits(tripId: string) {
    const list = tripId === ALL_TRIPS_ID ? await DB.listAllVisits() : await DB.listVisits(tripId);
    setVisits(list);

    const visitedSet = new Set(list.map((v) => String(v.countryId)));
    setVisitedCountries(allCountries.filter((c) => visitedSet.has(String(c.id))));
  }

  useEffect(() => {
    refreshTrips();
  }, []);

  useEffect(() => {
    refreshVisits(activeTripId);
    // reset focus when switching views
    setFocus(null);
  }, [activeTripId]);

  async function createTrip() {
    const title = prompt('Trip title?');
    if (!title) return;

    const t: Trip = {
      id: uid('trip'),
      title: title.trim(),
      createdAt: new Date().toISOString()
    };

    await DB.upsertTrip(t);
    await refreshTrips();
    setActiveTripId(t.id);
  }

  async function removeTrip(tripId: string) {
    const t = trips.find((x) => x.id === tripId);
    const ok = confirm(`Delete trip “${t?.title ?? tripId}” and all its visits?`);
    if (!ok) return;

    await DB.deleteTrip(tripId);
    await refreshTrips();

    // If we deleted the currently selected trip, go to All trips.
    if (activeTripId === tripId) {
      setActiveTripId(ALL_TRIPS_ID);
    } else {
      await refreshVisits(activeTripId);
    }
  }

  function startAddVisit() {
    if (activeTripId === ALL_TRIPS_ID) {
      alert('Select a specific trip to add a visit.');
      return;
    }
    setIsAdding(true);
    setPickedCoords(null);
    setCityName('');
    setCountryId('');
    setVisitedAt('');
    setCountrySearch('');
  }

  function cancelAddVisit() {
    setIsAdding(false);
    setPickedCoords(null);
  }

  async function saveVisit() {
    if (!isAdding || !pickedCoords) return;
    if (!activeTripId || activeTripId === ALL_TRIPS_ID) return;

    const city = cityName.trim();
    if (!city) {
      alert('City name is required.');
      return;
    }
    if (!countryId) {
      alert('Country is required.');
      return;
    }

    const v: Visit = {
      id: uid('visit'),
      tripId: activeTripId,
      cityName: city,
      countryId,
      lat: pickedCoords.lat,
      lng: pickedCoords.lng,
      visitedAt: visitedAt || undefined,
      createdAt: new Date().toISOString()
    };

    await DB.upsertVisit(v);
    await refreshVisits(activeTripId);

    // Fly to the newly added visit.
    setFocus({ lat: v.lat, lng: v.lng, altitude: 1.3 });

    // keep adding mode, but clear coords + form
    setPickedCoords(null);
    setCityName('');
    setCountryId('');
    setVisitedAt('');
  }

  async function removeVisit(visitId: string) {
    const v = visits.find((x) => x.id === visitId);
    const ok = confirm(`Delete visit “${v?.cityName ?? visitId}”?`);
    if (!ok) return;

    await DB.deleteVisit(visitId);
    await refreshVisits(activeTripId);
  }

  async function doExport() {
    const bundle = await DB.exportAll();
    downloadJson(`travelapp-export-${new Date().toISOString().slice(0, 10)}.json`, bundle);
  }

  async function doImport(file: File, replace: boolean) {
    const txt = await readFileAsText(file);
    const parsed = JSON.parse(txt) as ExportBundle;
    await DB.importAll(parsed, { replace });
    await refreshTrips();
    await refreshVisits(activeTripId);
  }

  const visitedCountriesCount = visitedCountries.length;
  const visitedCitiesCount = visits.length;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Side panel (replace with React Bits later) */}
      <div
        style={{
          position: 'absolute',
          zIndex: 10,
          top: 12,
          left: 12,
          width: 340,
          maxWidth: '92vw',
          padding: 12,
          borderRadius: 14,
          background: 'rgba(0,0,0,0.58)',
          color: 'white',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>TravelApp</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>
              Countries: {visitedCountriesCount} • Cities: {visitedCitiesCount}
            </div>
          </div>
          <button onClick={doExport} title="Export trips + visits to JSON">
            Export
          </button>
        </div>

        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Import (merge) trips + visits from JSON"
          >
            Import (merge)
          </button>
          <button
            onClick={() => fileInputReplaceRef.current?.click()}
            title="Import (replace) trips + visits from JSON"
          >
            Import (replace)
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.currentTarget.value = '';
              if (!f) return;
              try {
                await doImport(f, false);
              } catch (err) {
                alert(`Import failed: ${String(err)}`);
              }
            }}
          />
          <input
            ref={fileInputReplaceRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.currentTarget.value = '';
              if (!f) return;
              const ok = confirm('Replace ALL local data with the imported file?');
              if (!ok) return;
              try {
                await doImport(f, true);
              } catch (err) {
                alert(`Import failed: ${String(err)}`);
              }
            }}
          />
        </div>

        <hr style={{ margin: '12px 0' }} />

        <div>
          <label style={{ fontSize: 12, opacity: 0.85 }}>Trip</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <select
              value={activeTripId}
              onChange={(e) => setActiveTripId(e.target.value)}
              title="Select a trip"
            >
              <option value={ALL_TRIPS_ID}>All trips</option>
              {trips.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <button onClick={createTrip} title="Create a new trip">
              +
            </button>
            <button
              disabled={activeTripId === ALL_TRIPS_ID}
              onClick={() => activeTripId !== ALL_TRIPS_ID && removeTrip(activeTripId)}
              title="Delete selected trip"
            >
              🗑
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <label style={{ fontSize: 12, opacity: 0.85 }}>View</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button onClick={() => setMode('countries')} disabled={mode === 'countries'}>
              Countries
            </button>
            <button onClick={() => setMode('cities')} disabled={mode === 'cities'}>
              Cities
            </button>
            <button onClick={() => setMode('both')} disabled={mode === 'both'}>
              Both
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button onClick={startAddVisit} disabled={activeTripId === ALL_TRIPS_ID}>
            Add visit
          </button>
          <button onClick={cancelAddVisit} disabled={!isAdding}>
            Done
          </button>
        </div>

        {isAdding ? (
          <div style={{ marginTop: 10 }}>
            {!pickedCoords ? (
              <div style={{ fontSize: 13, opacity: 0.9 }}>
                Tap the globe to pick coordinates.
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 12, opacity: 0.85 }}>
                  Picked: lat {pickedCoords.lat.toFixed(4)} • lng {pickedCoords.lng.toFixed(4)}
                </div>

                <div style={{ marginTop: 8 }}>
                  <label style={{ fontSize: 12, opacity: 0.85 }}>City name</label>
                  <input value={cityName} onChange={(e) => setCityName(e.target.value)} placeholder="e.g., Rome" />
                </div>

                <div style={{ marginTop: 8 }}>
                  <label style={{ fontSize: 12, opacity: 0.85 }}>Visited date (optional)</label>
                  <input type="date" value={visitedAt} onChange={(e) => setVisitedAt(e.target.value)} />
                </div>

                <div style={{ marginTop: 8 }}>
                  <label style={{ fontSize: 12, opacity: 0.85 }}>Country</label>
                  <input
                    value={countrySearch}
                    onChange={(e) => setCountrySearch(e.target.value)}
                    placeholder="Search countries…"
                    style={{ marginBottom: 8 }}
                  />
                  <select value={countryId} onChange={(e) => setCountryId(e.target.value)}>
                    <option value="" disabled>
                      Select…
                    </option>
                    {filteredCountries.map((c) => (
                      <option key={String(c.id)} value={String(c.id)}>
                        {c.properties?.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                  <button onClick={saveVisit}>Save</button>
                  <button
                    onClick={() => {
                      setPickedCoords(null);
                      setCityName('');
                      setCountryId('');
                      setVisitedAt('');
                    }}
                  >
                    Reset
                  </button>
                </div>

                {countryId ? (
                  <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
                    Country selected: {getCountryName(countryId)}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 10, fontSize: 13, opacity: 0.9 }}>
            Tip: select a trip, hit <b>Add visit</b>, then tap the globe.
          </div>
        )}

        <hr style={{ margin: '12px 0' }} />

        <div style={{ maxHeight: 260, overflow: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontWeight: 700, flex: 1 }}>Visits</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>{visits.length}</div>
          </div>

          {visits.length === 0 ? (
            <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }}>No visits yet.</div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, marginTop: 8 }}>
              {visits.map((v) => (
                <li
                  key={v.id}
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    padding: '8px 8px',
                    borderRadius: 10,
                    border: '1px solid rgba(255,255,255,0.10)',
                    marginBottom: 8
                  }}
                >
                  <button
                    style={{ flex: 1, textAlign: 'left' }}
                    title="Fly to this visit"
                    onClick={() => setFocus({ lat: v.lat, lng: v.lng, altitude: 1.35 })}
                  >
                    <div style={{ fontWeight: 650 }}>{v.cityName}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      {getCountryName(v.countryId)}
                      {v.visitedAt ? ` • ${v.visitedAt}` : ''}
                    </div>
                  </button>
                  <button title="Delete visit" onClick={() => removeVisit(v.id)}>
                    🗑
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Globe */}
      <GlobeView
        visits={visits}
        visitedCountries={visitedCountries}
        mode={mode}
        focus={focus}
        onPickCoords={isAdding && !pickedCoords ? (coords) => setPickedCoords(coords) : undefined}
      />
    </div>
  );
}
