import { useEffect, useMemo, useRef, useState } from 'react';
import Globe from 'react-globe.gl';
import type { CountryFeature } from '../geo/countries';
import type { Visit } from '../storage/schema';

export type ViewMode = 'countries' | 'cities' | 'both';

export type GlobeFocus = {
  lat: number;
  lng: number;
  altitude?: number;
};

export type GlobeViewState = Required<GlobeFocus>;

function useViewportSize() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

/**
 * A simple globe used for the "overview". When zooming in far enough,
 * the app can switch to a more detailed 2D map (MapLibre).
 */
export function GlobeView(props: {
  visits: Visit[];
  visitedCountries: CountryFeature[];
  mode: ViewMode;
  focus?: GlobeFocus | null;
  onPickCoords?: (coords: { lat: number; lng: number }) => void;
  onViewChange?: (view: GlobeViewState) => void;
}) {
  const { visits, visitedCountries, mode, focus, onPickCoords, onViewChange } = props;

  const globeRef = useRef<any>(null);
  const { w, h } = useViewportSize();

  const points = useMemo(() => (mode === 'countries' ? [] : visits), [mode, visits]);
  const polys = useMemo(() => (mode === 'cities' ? [] : visitedCountries), [mode, visitedCountries]);

  // Apply focus
  useEffect(() => {
    if (!focus) return;
    const g = globeRef.current;
    if (!g?.pointOfView) return;
    g.pointOfView({ lat: focus.lat, lng: focus.lng, altitude: focus.altitude ?? 1.6 }, 900);
  }, [focus?.lat, focus?.lng, focus?.altitude]);

  // Report view changes (lat/lng/altitude)
  useEffect(() => {
    if (!onViewChange) return;

    const g = globeRef.current;
    if (!g?.pointOfView) return;

    let raf = 0;
    let last: GlobeViewState | null = null;

    const tick = () => {
      const pov = g.pointOfView();
      if (pov && typeof pov.lat === 'number' && typeof pov.lng === 'number') {
        const next: GlobeViewState = {
          lat: pov.lat,
          lng: pov.lng,
          altitude: typeof pov.altitude === 'number' ? pov.altitude : 1.6
        };

        if (
          !last ||
          Math.abs(last.lat - next.lat) > 1e-4 ||
          Math.abs(last.lng - next.lng) > 1e-4 ||
          Math.abs(last.altitude - next.altitude) > 1e-4
        ) {
          last = next;
          onViewChange(next);
        }
      }
      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(raf);
  }, [onViewChange]);

  return (
    <Globe
      ref={globeRef}
      width={w}
      height={h}
      backgroundColor="#0b1020"
      // Offline-friendly textures (local files).
      // Files are sourced from the three-globe example assets.
      globeImageUrl="/assets/earth-blue-marble.jpg"
      bumpImageUrl="/assets/earth-topology.png"
      showAtmosphere={true}
      atmosphereAltitude={0.18}
      // Countries
      polygonsData={polys}
      polygonGeoJsonGeometry="geometry"
      polygonLabel={(d: any) => d?.properties?.name}
      polygonCapColor={() => 'rgba(0, 200, 255, 0.62)'}
      polygonSideColor={() => 'rgba(0, 200, 255, 0.12)'}
      polygonStrokeColor={() => 'rgba(0, 0, 0, 0.35)'}
      polygonAltitude={0.01}
      // Cities (📍 pin markers)
      // Using htmlElements ensures the "tip" of the pin points to the exact coordinate.
      htmlElementsData={points}
      htmlLat={(d: any) => d.lat}
      htmlLng={(d: any) => d.lng}
      htmlAltitude={() => 0.01}
      htmlElement={(d: any) => {
        const el = document.createElement('div');
        el.className = 'pinMarker';
        el.title = d?.cityName ?? '';
        el.textContent = '📍';
        return el;
      }}
      // Pick coords
      onGlobeClick={
        onPickCoords ? ({ lat, lng }: any) => onPickCoords({ lat, lng }) : undefined
      }
    />
  );
}
