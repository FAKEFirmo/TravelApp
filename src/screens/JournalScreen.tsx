import { useMemo, useRef } from 'react';
import { GlassSurface } from '../components/GlassSurface';
import { getAllCountries, getCountryName, type CountryFeature } from '../geo/countries';
import type { ExportBundle, Trip, Visit } from '../storage/schema';

const ALL_TRIPS_ID = '__all__';

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Failed reading file'));
    reader.readAsText(file);
  });
}

export function JournalScreen(props: {
  mode: 'countries' | 'cities' | 'both';
  onChangeMode: (mode: 'countries' | 'cities' | 'both') => void;

  trips: Trip[];
  activeTripId: string;
  onChangeTrip: (tripId: string) => void;

  visits: Visit[];
  visitedCountries: CountryFeature[];

  onCreateTrip: () => void;
  onRemoveTrip: (tripId: string) => void;

  onRemoveVisit: (visitId: string) => void;
  onFlyToVisit: (visit: Visit) => void;

  onExport: () => void;
  onImport: (bundle: ExportBundle, replace: boolean) => Promise<void>;
}) {
  const {
    mode,
    onChangeMode,
    trips,
    activeTripId,
    onChangeTrip,
    visits,
    visitedCountries,
    onCreateTrip,
    onRemoveTrip,
    onRemoveVisit,
    onFlyToVisit,
    onExport,
    onImport
  } = props;

  const allCountries = useMemo(() => getAllCountries(), []);

  const visitedCountriesCount = visitedCountries.length;
  const visitedCitiesCount = visits.length;

  const fileInputMergeRef = useRef<HTMLInputElement | null>(null);
  const fileInputReplaceRef = useRef<HTMLInputElement | null>(null);

  const activeTripTitle =
    activeTripId === ALL_TRIPS_ID
      ? 'All trips'
      : trips.find((t) => t.id === activeTripId)?.title ?? 'Trip';

  return (
    <div className="screenRoot">
      <div className="screenScroll">
        <GlassSurface className="card" style={{ borderRadius: 20 }}>
          <div className="rowSpace">
            <div>
              <div className="cardTitle">TravelApp</div>
              <div className="smallMuted">
                Countries: {visitedCountriesCount} • Cities: {visitedCitiesCount}
              </div>
            </div>

            <button onClick={onExport} title="Export trips + visits to JSON">
              Export
            </button>
          </div>

          <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
            <button
              onClick={() => fileInputMergeRef.current?.click()}
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
              ref={fileInputMergeRef}
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.currentTarget.value = '';
                if (!f) return;
                try {
                  const txt = await readFileAsText(f);
                  const parsed = JSON.parse(txt) as ExportBundle;
                  await onImport(parsed, false);
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
                  const txt = await readFileAsText(f);
                  const parsed = JSON.parse(txt) as ExportBundle;
                  await onImport(parsed, true);
                } catch (err) {
                  alert(`Import failed: ${String(err)}`);
                }
              }}
            />
          </div>
        </GlassSurface>

        <div style={{ height: 14 }} />

        <GlassSurface className="card" style={{ borderRadius: 20 }}>
          <div className="rowSpace">
            <div>
              <div className="cardTitle">Trip</div>
              <div className="smallMuted">Currently: {activeTripTitle}</div>
            </div>
            <div className="row">
              <button onClick={onCreateTrip} title="Create a new trip">
                + Trip
              </button>
              <button
                disabled={activeTripId === ALL_TRIPS_ID}
                onClick={() => activeTripId !== ALL_TRIPS_ID && onRemoveTrip(activeTripId)}
                title="Delete selected trip"
              >
                🗑
              </button>
            </div>
          </div>

          <div className="row" style={{ marginTop: 10 }}>
            <select value={activeTripId} onChange={(e) => onChangeTrip(e.target.value)}>
              <option value={ALL_TRIPS_ID}>All trips</option>
              {trips.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>
        </GlassSurface>

        <div style={{ height: 14 }} />

        <GlassSurface className="card" style={{ borderRadius: 20 }}>
          <div className="rowSpace">
            <div>
              <div className="cardTitle">Map overlays</div>
              <div className="smallMuted">Countries shading + city pins</div>
            </div>
          </div>

          <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
            <button onClick={() => onChangeMode('countries')} disabled={mode === 'countries'}>
              Countries
            </button>
            <button onClick={() => onChangeMode('cities')} disabled={mode === 'cities'}>
              Cities
            </button>
            <button onClick={() => onChangeMode('both')} disabled={mode === 'both'}>
              Both
            </button>
          </div>
        </GlassSurface>

        <div style={{ height: 14 }} />

        <GlassSurface className="card" style={{ borderRadius: 20 }}>
          <div className="rowSpace">
            <div>
              <div className="cardTitle">Visits</div>
              <div className="smallMuted">Tap a visit to fly to it on the map</div>
            </div>
            <div className="smallMuted">{visits.length}</div>
          </div>

          {visits.length === 0 ? (
            <div style={{ marginTop: 10 }} className="smallMuted">
              No visits yet.
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, marginTop: 12 }}>
              {visits.map((v) => (
                <li
                  key={v.id}
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'center',
                    padding: '10px 10px',
                    borderRadius: 14,
                    border: '1px solid rgba(255,255,255,0.10)',
                    marginBottom: 10,
                    background: 'rgba(0,0,0,0.15)'
                  }}
                >
                  <button
                    style={{
                      flex: 1,
                      textAlign: 'left',
                      border: 'none',
                      background: 'transparent',
                      padding: 0
                    }}
                    title="Fly to this visit"
                    onClick={() => onFlyToVisit(v)}
                  >
                    <div style={{ fontWeight: 750 }}>{v.cityName}</div>
                    <div className="smallMuted">
                      {getCountryName(v.countryId)}
                      {v.visitedAt ? ` • ${v.visitedAt}` : ''}
                    </div>
                  </button>
                  <button title="Delete visit" onClick={() => onRemoveVisit(v.id)}>
                    🗑
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div style={{ marginTop: 10 }} className="smallMuted">
            Countries in dataset: {allCountries.length}
          </div>
        </GlassSurface>
      </div>
    </div>
  );
}
