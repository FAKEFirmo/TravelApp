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

function useViewportSize() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

export function GlobeView(props: {
  visits: Visit[];
  visitedCountries: CountryFeature[];
  mode: ViewMode;
  focus?: GlobeFocus | null;
  onPickCoords?: (coords: { lat: number; lng: number }) => void;
}) {
  const { visits, visitedCountries, mode, focus, onPickCoords } = props;

  const globeRef = useRef<any>(null);
  const { w, h } = useViewportSize();

  const points = useMemo(() => (mode === 'countries' ? [] : visits), [mode, visits]);
  const polys = useMemo(() => (mode === 'cities' ? [] : visitedCountries), [mode, visitedCountries]);

  useEffect(() => {
    if (!focus) return;
    const g = globeRef.current;
    if (!g?.pointOfView) return;
    g.pointOfView({ lat: focus.lat, lng: focus.lng, altitude: focus.altitude ?? 1.6 }, 900);
  }, [focus?.lat, focus?.lng, focus?.altitude]);

  return (
    <Globe
      ref={globeRef}
      width={w}
      height={h}
      backgroundColor="#0b1020"
      // Offline-friendly textures (local files).
      globeImageUrl="/assets/earth-day.jpg"
      bumpImageUrl="/assets/earth-bump.jpg"
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
      // Cities
      pointsData={points}
      pointLat="lat"
      pointLng="lng"
      pointLabel={(d: any) => d?.cityName}
      pointColor={() => 'rgba(255, 220, 120, 0.9)'}
      pointRadius={0.25}
      pointAltitude={0.02}
      // Pick coords
      onGlobeClick={onPickCoords ? ({ lat, lng }: any) => onPickCoords({ lat, lng }) : undefined}
    />
  );
}
