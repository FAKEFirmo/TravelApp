import { useEffect, useMemo, useRef, useState } from 'react';
import { GlassSurface } from '../components/GlassSurface';
import type { CountryFeature } from '../geo/countries';
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

function formatShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function JournalScreen(props: {
  trips: Trip[];
  activeTripId: string;
  onChangeTrip: (tripId: string) => void;

  allVisits: Visit[];
  visitedCountries: CountryFeature[];

  onCreateTrip: () => void;
  onRemoveTrip: (tripId: string) => void;
  onSaveTripNotes: (tripId: string, notes: string) => Promise<void>;
  onFlyToVisit: (visit: Visit) => void;

  onExport: () => void;
  onImport: (bundle: ExportBundle, replace: boolean) => Promise<void>;
}) {
  const {
    trips,
    activeTripId,
    onChangeTrip,
    allVisits,
    visitedCountries,
    onCreateTrip,
    onRemoveTrip,
    onSaveTripNotes,
    onFlyToVisit,
    onExport,
    onImport
  } = props;

  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});

  const pressTimerRef = useRef<number | null>(null);
  const pressTripIdRef = useRef<string | null>(null);
  const pressFiredRef = useRef(false);

  const fileInputMergeRef = useRef<HTMLInputElement | null>(null);
  const fileInputReplaceRef = useRef<HTMLInputElement | null>(null);

  const countriesList = useMemo(
    () =>
      visitedCountries
        .map((c) => c.properties?.name ?? '')
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [visitedCountries]
  );

  const visitsByTrip = useMemo(() => {
    const map = new Map<string, Visit[]>();
    for (const v of allVisits) {
      const list = map.get(v.tripId) ?? [];
      list.push(v);
      map.set(v.tripId, list);
    }
    return map;
  }, [allVisits]);

  useEffect(() => {
    setDraftNotes((prev) => {
      const next: Record<string, string> = {};
      for (const t of trips) {
        next[t.id] = prev[t.id] ?? t.notes ?? '';
      }
      return next;
    });
  }, [trips]);

  useEffect(() => clearPressTimer, []);

  function clearPressTimer() {
    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  }

  function onTripPressStart(tripId: string) {
    clearPressTimer();
    pressFiredRef.current = false;
    pressTripIdRef.current = tripId;
    pressTimerRef.current = window.setTimeout(() => {
      pressFiredRef.current = true;
      setExpandedTripId((prev) => (prev === tripId ? null : tripId));
    }, 600);
  }

  function onTripPressEnd() {
    clearPressTimer();
    pressTripIdRef.current = null;
  }

  function onTripClick(tripId: string) {
    if (pressFiredRef.current) {
      pressFiredRef.current = false;
      return;
    }
    onChangeTrip(tripId);
  }

  return (
    <div className="screenRoot">
      <div className="screenScroll">
        <GlassSurface className="card sectionCard" style={{ borderRadius: 20 }}>
          <div className="rowSpace">
            <div>
              <div className="cardTitle">Countries</div>
              <div className="smallMuted">{countriesList.length} visited</div>
            </div>

            <button onClick={onExport} title="Export trips + visits to JSON">
              Export
            </button>
          </div>

          <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
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

          <div className="blurScrollWrap" style={{ marginTop: 10 }}>
            <div className="blurScrollList countriesScroll">
              {countriesList.length === 0 ? (
                <div className="smallMuted">No countries yet.</div>
              ) : (
                countriesList.map((name) => (
                  <div key={name} className="countryRow">
                    {name}
                  </div>
                ))
              )}
            </div>
            <div className="blurTopEdge" />
            <div className="blurBottomEdge" />
          </div>
        </GlassSurface>

        <div style={{ height: 14 }} />

        <GlassSurface className="card sectionCard" style={{ borderRadius: 20 }}>
          <div className="rowSpace" style={{ alignItems: 'flex-start' }}>
            <div>
              <div className="cardTitle">Trips</div>
              <div className="smallMuted">
                Active: {activeTripId === ALL_TRIPS_ID ? 'All trips' : trips.find((t) => t.id === activeTripId)?.title ?? 'Trip'}
              </div>
            </div>
            <button onClick={onCreateTrip} title="Create a new trip">
              + Trip
            </button>
          </div>

          <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
            <button
              onClick={() => onChangeTrip(ALL_TRIPS_ID)}
              className={activeTripId === ALL_TRIPS_ID ? 'tripFilterActive' : ''}
            >
              All trips
            </button>
            {trips.map((trip) => (
              <button
                key={trip.id}
                onClick={() => onChangeTrip(trip.id)}
                className={activeTripId === trip.id ? 'tripFilterActive' : ''}
              >
                {trip.title}
              </button>
            ))}
          </div>

          <div className="smallMuted" style={{ marginTop: 10 }}>
            Hold a trip card for details.
          </div>

          <div className="blurScrollWrap" style={{ marginTop: 10 }}>
            <div className="blurScrollList tripsScroll">
              {trips.length === 0 ? (
                <div className="smallMuted">No trips yet.</div>
              ) : (
                trips.map((trip) => {
                  const tripVisits = visitsByTrip.get(trip.id) ?? [];
                  const isExpanded = expandedTripId === trip.id;
                  const isActive = activeTripId === trip.id;
                  const draft = draftNotes[trip.id] ?? '';

                  return (
                    <div
                      key={trip.id}
                      className={['tripCard', isExpanded ? 'isExpanded' : '', isActive ? 'isActive' : '']
                        .filter(Boolean)
                        .join(' ')}
                      onPointerDown={() => onTripPressStart(trip.id)}
                      onPointerUp={onTripPressEnd}
                      onPointerCancel={onTripPressEnd}
                      onPointerLeave={onTripPressEnd}
                      onClick={() => onTripClick(trip.id)}
                    >
                      <div className="rowSpace">
                        <div>
                          <div style={{ fontWeight: 780 }}>{trip.title}</div>
                          <div className="smallMuted">{tripVisits.length} cities</div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveTrip(trip.id);
                          }}
                          title="Delete trip"
                        >
                          Delete
                        </button>
                      </div>

                      {!isExpanded ? (
                        <div className="smallMuted" style={{ marginTop: 8 }}>
                          {trip.notes?.trim() ? trip.notes : 'No notes yet.'}
                        </div>
                      ) : (
                        <div style={{ marginTop: 10 }}>
                          <div className="smallMuted" style={{ marginBottom: 8 }}>
                            Cities
                          </div>
                          {tripVisits.length === 0 ? (
                            <div className="smallMuted">No cities added yet.</div>
                          ) : (
                            <div className="tripCitiesList">
                              {tripVisits.map((visit) => (
                                <button
                                  key={visit.id}
                                  className="tripCityRow"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onFlyToVisit(visit);
                                  }}
                                  title="Fly to this visit on map"
                                >
                                  <span>{visit.cityName}</span>
                                  <span className="smallMuted">
                                    {visit.arrivalAt ? formatShort(visit.arrivalAt) : ''}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}

                          <div className="smallMuted" style={{ marginTop: 10, marginBottom: 6 }}>
                            Notes
                          </div>
                          <textarea
                            value={draft}
                            onChange={(e) =>
                              setDraftNotes((prev) => ({ ...prev, [trip.id]: e.target.value }))
                            }
                            rows={4}
                            style={{ width: '100%', resize: 'vertical' }}
                          />
                          <div className="row" style={{ marginTop: 8 }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onSaveTripNotes(trip.id, draft);
                              }}
                            >
                              Save notes
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            <div className="blurTopEdge" />
            <div className="blurBottomEdge" />
          </div>
        </GlassSurface>
      </div>
    </div>
  );
}
