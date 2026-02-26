import { useEffect, useMemo, useRef, useState } from 'react';
import type { CountryFeature } from '../geo/countries';
import type { Visit } from '../storage/schema';
import { GlobeView, type GlobeFocus, type ViewMode } from './GlobeView';
import { MapLibreView, type MapViewState } from './MapLibreView';

export type HybridView = 'globe' | 'map';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// Rough mapping between globe "altitude" (unitless) and MapLibre zoom.
// Tuned by hand for a reasonable feel.
function zoomFromAltitude(altitude: number): number {
  const base = 2.695;
  const scale = 2.5;
  const zoom = base + scale * (Math.log2(1 / Math.max(0.0001, altitude)));
  return clamp(zoom, 0, 16);
}

function altitudeFromZoom(zoom: number): number {
  const base = 2.695;
  const scale = 2.5;
  const alt = Math.pow(2, (base - zoom) / scale);
  return clamp(alt, 0.12, 3);
}

export function HybridMapView(props: {
  visits: Visit[];
  visitedCountries: CountryFeature[];
  mode: ViewMode;

  /** When provided, we fly to this location (on whichever renderer is active). */
  focus?: GlobeFocus | null;

  /** Enable picking coordinates (tap on globe/map). */
  pickMode?: boolean;
  onPickCoords?: (coords: { lat: number; lng: number }) => void;

  /**
   * Force a renderer. If omitted, the renderer switches automatically
   * (globe far away, map when zoomed in).
   */
  forceView?: HybridView;

  /** Called whenever the map view changes (used for auto-switch heuristics). */
  onViewChanged?: (view: { kind: HybridView } & (GlobeFocus & { zoom?: number })) => void;
}) {
  const {
    visits,
    visitedCountries,
    mode,
    focus,
    pickMode,
    onPickCoords,
    forceView,
    onViewChanged
  } = props;

  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Auto-switch thresholds.
  const MAP_IN_ALT = 0.65; // when globe altitude <= this, switch to map
  const GLOBE_BACK_ZOOM = 1.6; // when map zoom <= this, switch back to globe

  const [view, setView] = useState<HybridView>('globe');

  const [lastGlobe, setLastGlobe] = useState<Required<GlobeFocus>>({
    lat: 20,
    lng: 0,
    altitude: 1.6
  });

  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({
    lat: lastGlobe.lat,
    lng: lastGlobe.lng
  });
  const [mapZoom, setMapZoom] = useState<number>(() => zoomFromAltitude(lastGlobe.altitude));
  const [mapSyncToken, setMapSyncToken] = useState(0);

  // Track latest map state (for switching back).
  const lastMapRef = useRef<MapViewState | null>(null);

  // Apply forceView if set.
  useEffect(() => {
    if (!forceView) return;
    setView(forceView);
  }, [forceView]);

  // External focus -> route to appropriate renderer.
  useEffect(() => {
    if (!focus) return;

    // Always record.
    setLastGlobe((prev) => ({
      lat: focus.lat,
      lng: focus.lng,
      altitude: focus.altitude ?? prev.altitude
    }));

    // Sync map camera too (in case we're already on map).
    setMapCenter({ lat: focus.lat, lng: focus.lng });
    if (typeof focus.altitude === 'number') {
      setMapZoom(zoomFromAltitude(focus.altitude));
    }
    setMapSyncToken((x) => x + 1);
  }, [focus?.lat, focus?.lng, focus?.altitude]);

  // Decide if map is allowed
  const canUseRealMap = useMemo(() => isOnline, [isOnline]);

  // Auto-switch logic (globe -> map)
  useEffect(() => {
    if (forceView) return;
    if (!canUseRealMap) {
      setView('globe');
      return;
    }

    if (view === 'globe' && lastGlobe.altitude <= MAP_IN_ALT) {
      setMapCenter({ lat: lastGlobe.lat, lng: lastGlobe.lng });
      setMapZoom(zoomFromAltitude(lastGlobe.altitude));
      setMapSyncToken((x) => x + 1);
      setView('map');
    }
  }, [forceView, view, lastGlobe, canUseRealMap]);

  // Auto-switch logic (map -> globe)
  useEffect(() => {
    if (forceView) return;
    if (view !== 'map') return;

    const lastMap = lastMapRef.current;
    if (!lastMap) return;

    if (lastMap.zoom <= GLOBE_BACK_ZOOM) {
      const alt = altitudeFromZoom(lastMap.zoom);
      setLastGlobe({ lat: lastMap.lat, lng: lastMap.lng, altitude: alt });
      setView('globe');
    }
  }, [forceView, view, mapSyncToken]);

  const showGlobe = view === 'globe';
  const showMap = view === 'map' && canUseRealMap;

  return (
    <div className="hybridRoot">
      <div
        className="hybridLayer"
        style={{
          opacity: showGlobe ? 1 : 0,
          pointerEvents: showGlobe ? 'auto' : 'none'
        }}
      >
        <GlobeView
          visits={visits}
          visitedCountries={visitedCountries}
          mode={mode}
          focus={showGlobe ? focus ?? lastGlobe : null}
          onPickCoords={pickMode ? onPickCoords : undefined}
          onViewChange={(v) => {
            setLastGlobe(v);
            onViewChanged?.({ kind: 'globe', ...v });
          }}
        />

        {!canUseRealMap ? (
          <div className="offlineBadge" aria-live="polite">
            Offline: showing globe only
          </div>
        ) : null}
      </div>

      <div
        className="hybridLayer"
        style={{
          opacity: showMap ? 1 : 0,
          pointerEvents: showMap ? 'auto' : 'none'
        }}
      >
        <MapLibreView
          syncToken={mapSyncToken}
          center={mapCenter}
          zoom={mapZoom}
          visits={visits}
          visitedCountries={visitedCountries}
          mode={mode}
          pickMode={pickMode}
          onPickCoords={onPickCoords}
          onMove={(s) => {
            lastMapRef.current = s;
            onViewChanged?.({ kind: 'map', lat: s.lat, lng: s.lng, altitude: altitudeFromZoom(s.zoom), zoom: s.zoom });

            // If the user zooms out far enough, we switch back to globe.
            if (!forceView && s.zoom <= GLOBE_BACK_ZOOM) {
              setLastGlobe({ lat: s.lat, lng: s.lng, altitude: altitudeFromZoom(s.zoom) });
              setView('globe');
            }
          }}
        />

        {!canUseRealMap ? (
          <div className="offlineBadge" aria-live="polite">
            Offline: map tiles unavailable
          </div>
        ) : null}
      </div>
    </div>
  );
}
