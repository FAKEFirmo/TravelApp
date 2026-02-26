import { useEffect, useMemo, useRef, useState } from 'react';
import { BottomBar, type BottomTab } from './components/BottomBar';
import { GlassSurface } from './components/GlassSurface';
import type { GlobeFocus, ViewMode } from './components/GlobeView';
import { getAllCountries, getCountryName, type CountryFeature } from './geo/countries';
import type { ExportBundle, Trip, Visit } from './storage/schema';
import * as DB from './storage/db';
import { uid } from './utils/uid';
import { JournalScreen } from './screens/JournalScreen';
import { MapScreen } from './screens/MapScreen';

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

export default function App() {
  const allCountries = useMemo(() => getAllCountries(), []);

  const [tab, setTab] = useState<BottomTab>('map');

  const [mode, setMode] = useState<ViewMode>('countries');

  const [trips, setTrips] = useState<Trip[]>([]);
  const [activeTripId, setActiveTripId] = useState<string>(ALL_TRIPS_ID);

  const [visits, setVisits] = useState<Visit[]>([]);
  const [visitedCountries, setVisitedCountries] = useState<CountryFeature[]>([]);

  const [focus, setFocus] = useState<GlobeFocus | null>(null);

  // Add visit flow
  const [isAddingVisit, setIsAddingVisit] = useState(false);
  const [pickedCoords, setPickedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [cityName, setCityName] = useState('');
  const [countryId, setCountryId] = useState('');
  const [arrivalAt, setArrivalAt] = useState('');
  const [departureAt, setDepartureAt] = useState('');
  const [countrySearch, setCountrySearch] = useState('');

  // Add action sheet
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);

  const filteredCountries = useMemo(() => {
    const q = countrySearch.trim().toLowerCase();
    if (!q) return allCountries;
    return allCountries.filter((c) => (c.properties?.name ?? '').toLowerCase().includes(q));
  }, [allCountries, countrySearch]);

  const cityOptionsForCountry = useMemo(() => {
    if (!countryId) return [] as string[];
    const set = new Set(
      visits
        .filter((v) => String(v.countryId) === String(countryId))
        .map((v) => v.cityName)
        .filter(Boolean)
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [visits, countryId]);

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
    // best-effort migration for older local DBs
    DB.migrateV2IfNeeded();
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
      alert('Select a specific trip first (Journal tab → Trip selector).');
      setTab('journal');
      return;
    }

    setIsAddingVisit(true);
    setPickedCoords(null);
    setCityName('');
    setCountryId('');
    setArrivalAt('');
    setDepartureAt('');
    setCountrySearch('');
    setTab('map');
  }

  function stopAddVisit() {
    setIsAddingVisit(false);
    setPickedCoords(null);
  }

  async function saveVisit() {
    if (!isAddingVisit || !pickedCoords) return;
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
      arrivalAt: arrivalAt || undefined,
      departureAt: departureAt || undefined,
      createdAt: new Date().toISOString()
    };

    await DB.upsertVisit(v);
    await refreshVisits(activeTripId);

    // Fly to the newly added visit.
    setFocus({ lat: v.lat, lng: v.lng, altitude: 1.35 });

    // Keep add mode enabled, but reset the form so user can tap again.
    setPickedCoords(null);
    setCityName('');
    setCountryId('');
    setArrivalAt('');
    setDepartureAt('');
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

  async function doImport(bundle: ExportBundle, replace: boolean) {
    await DB.importAll(bundle, { replace });
    await refreshTrips();
    await refreshVisits(activeTripId);
  }

  function onFlyToVisit(v: Visit) {
    setFocus({ lat: v.lat, lng: v.lng, altitude: 1.35 });
    setTab('map');
  }

  return (
    <div className="screenRoot">
      {tab === 'map' ? (
        <MapScreen
          visits={visits}
          visitedCountries={visitedCountries}
          mode={mode}
          focus={focus}
          isPicking={isAddingVisit}
          pickedCoords={pickedCoords}
          onPickCoords={(coords) => {
            if (!isAddingVisit) return;
            setPickedCoords(coords);
          }}
        />
      ) : (
        <JournalScreen
          mode={mode}
          onChangeMode={setMode}
          trips={trips}
          activeTripId={activeTripId}
          onChangeTrip={setActiveTripId}
          visits={visits}
          visitedCountries={visitedCountries}
          onCreateTrip={createTrip}
          onRemoveTrip={removeTrip}
          onRemoveVisit={removeVisit}
          onFlyToVisit={onFlyToVisit}
          onExport={doExport}
          onImport={doImport}
        />
      )}

      <BottomBar
        activeTab={tab}
        onChangeTab={(next) => {
          setTab(next);
          setIsAddSheetOpen(false);
        }}
        onPressAdd={() => setIsAddSheetOpen(true)}
      />

      {isAddSheetOpen ? (
        <AddActionSheet
          isAddingVisit={isAddingVisit}
          canAddVisit={activeTripId !== ALL_TRIPS_ID}
          onClose={() => setIsAddSheetOpen(false)}
          onAddTrip={() => {
            setIsAddSheetOpen(false);
            createTrip();
          }}
          onAddVisit={() => {
            setIsAddSheetOpen(false);
            startAddVisit();
          }}
          onStopAddVisit={() => {
            setIsAddSheetOpen(false);
            stopAddVisit();
          }}
        />
      ) : null}

      {isAddingVisit && pickedCoords ? (
        <VisitFormSheet
          coords={pickedCoords}
          cityName={cityName}
          onChangeCity={setCityName}
          countrySearch={countrySearch}
          onChangeCountrySearch={setCountrySearch}
          countryId={countryId}
          onChangeCountryId={setCountryId}
          arrivalAt={arrivalAt}
          onChangeArrivalAt={setArrivalAt}
          departureAt={departureAt}
          onChangeDepartureAt={setDepartureAt}
          cityOptions={cityOptionsForCountry}
          countries={filteredCountries}
          onCancel={() => {
            // Keep add mode on, but hide the form.
            setPickedCoords(null);
          }}
          onStop={() => {
            stopAddVisit();
          }}
          onSave={saveVisit}
        />
      ) : null}
    </div>
  );
}

function AddActionSheet(props: {
  isAddingVisit: boolean;
  canAddVisit: boolean;
  onClose: () => void;
  onAddTrip: () => void;
  onAddVisit: () => void;
  onStopAddVisit: () => void;
}) {
  const { isAddingVisit, canAddVisit, onClose, onAddTrip, onAddVisit, onStopAddVisit } = props;

  return (
    <div
      className="sheetBackdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Actions"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <GlassSurface className="sheet">
        <div className="rowSpace" style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 800 }}>Actions</div>
          <button onClick={onClose}>Close</button>
        </div>

        <button className="sheetButton" onClick={onAddTrip}>
          <span>Add new trip</span>
          <span style={{ opacity: 0.7 }}>＋</span>
        </button>

        <div style={{ height: 10 }} />

        {isAddingVisit ? (
          <button className="sheetButton" onClick={onStopAddVisit}>
            <span>Finish adding visits</span>
            <span style={{ opacity: 0.7 }}>✓</span>
          </button>
        ) : (
          <button
            className="sheetButton"
            onClick={onAddVisit}
            disabled={!canAddVisit}
            title={!canAddVisit ? 'Select a specific trip first (Journal tab).' : undefined}
          >
            <span>Add visit (tap on map)</span>
            <span style={{ opacity: 0.7 }}>📍</span>
          </button>
        )}

        {!canAddVisit && !isAddingVisit ? (
          <div className="smallMuted" style={{ marginTop: 10 }}>
            Tip: pick a trip in the Journal tab first.
          </div>
        ) : null}
      </GlassSurface>
    </div>
  );
}

function VisitFormSheet(props: {
  coords: { lat: number; lng: number };
  cityName: string;
  onChangeCity: (v: string) => void;

  arrivalAt: string;
  onChangeArrivalAt: (v: string) => void;

  departureAt: string;
  onChangeDepartureAt: (v: string) => void;

  countrySearch: string;
  onChangeCountrySearch: (v: string) => void;

  countryId: string;
  onChangeCountryId: (v: string) => void;

  cityOptions: string[];

  countries: CountryFeature[];

  onCancel: () => void;
  onStop: () => void;
  onSave: () => void;
}) {
  const {
    coords,
    cityName,
    onChangeCity,
    arrivalAt,
    onChangeArrivalAt,
    departureAt,
    onChangeDepartureAt,
    countrySearch,
    onChangeCountrySearch,
    countryId,
    onChangeCountryId,
    cityOptions,
    countries,
    onCancel,
    onStop,
    onSave
  } = props;

  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);

  const canNext =
    (step === 0 && !!countryId) ||
    (step === 1 && !!cityName.trim()) ||
    (step === 2 && !!arrivalAt) ||
    (step === 3 && true);

  function next() {
    if (!canNext) return;
    setStep((s) => (s === 3 ? 3 : ((s + 1) as any)));
  }

  function back() {
    setStep((s) => (s === 0 ? 0 : ((s - 1) as any)));
  }

  return (
    <div
      className="sheetBackdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Add visit"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <GlassSurface className="sheet">
        <div className="rowSpace" style={{ marginBottom: 10 }}>
          <div>
            <div style={{ fontWeight: 850 }}>New visit</div>
            <div className="smallMuted">
              Picked: lat {coords.lat.toFixed(4)} • lng {coords.lng.toFixed(4)}
            </div>
          </div>
          <div className="row">
            <button onClick={onStop} title="Stop adding visits">
              Done
            </button>
            <button onClick={onCancel}>Close</button>
          </div>
        </div>

        {/* Step indicator */}
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginBottom: 10 }}>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: i === step ? 'rgba(0,200,255,0.9)' : 'rgba(255,255,255,0.18)'
              }}
            />
          ))}
        </div>

        {step === 0 ? (
          <div>
            <label className="smallMuted">Country</label>
            <input
              value={countrySearch}
              onChange={(e) => onChangeCountrySearch(e.target.value)}
              placeholder="Type to filter countries…"
              style={{ marginTop: 6, marginBottom: 8 }}
            />
            <select value={countryId} onChange={(e) => onChangeCountryId(e.target.value)}>
              <option value="" disabled>
                Select…
              </option>
              {countries.map((c) => (
                <option key={String(c.id)} value={String(c.id)}>
                  {c.properties?.name}
                </option>
              ))}
            </select>
            {countryId ? (
              <div className="smallMuted" style={{ marginTop: 8 }}>
                Selected: {getCountryName(countryId)}
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 1 ? (
          <div>
            <label className="smallMuted">City</label>
            <input
              list="city-options"
              value={cityName}
              onChange={(e) => onChangeCity(e.target.value)}
              placeholder="Type to search / filter…"
              style={{ marginTop: 6 }}
            />
            <datalist id="city-options">
              {cityOptions
                .filter((c) => c.toLowerCase().includes(cityName.trim().toLowerCase()))
                .slice(0, 50)
                .map((c) => (
                  <option key={c} value={c} />
                ))}
            </datalist>
            <div className="smallMuted" style={{ marginTop: 8 }}>
              Suggestions come from your existing saved visits in this country (offline-friendly).
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div>
            <label className="smallMuted">Arrival time</label>
            <input
              type="datetime-local"
              value={arrivalAt}
              onChange={(e) => onChangeArrivalAt(e.target.value)}
              style={{ marginTop: 6 }}
            />
          </div>
        ) : null}

        {step === 3 ? (
          <div>
            <label className="smallMuted">Departure time</label>
            <input
              type="datetime-local"
              value={departureAt}
              onChange={(e) => onChangeDepartureAt(e.target.value)}
              style={{ marginTop: 6 }}
            />
            <div className="smallMuted" style={{ marginTop: 8 }}>
              Departure is optional. Leave blank if unknown.
            </div>
          </div>
        ) : null}

        <div style={{ marginTop: 12 }} className="row">
          <button onClick={back} disabled={step === 0}>
            Back
          </button>
          {step < 3 ? (
            <button onClick={next} disabled={!canNext} style={{ flex: 1 }}>
              Next
            </button>
          ) : (
            <button onClick={onSave} style={{ flex: 1 }}>
              Save
            </button>
          )}
        </div>

        <div className="smallMuted" style={{ marginTop: 10 }}>
          Flow: Country → City → Arrival → Departure.
        </div>
      </GlassSurface>
    </div>
  );
}
