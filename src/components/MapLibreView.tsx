import { useEffect, useMemo, useRef } from 'react';
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import type { CountryFeature } from '../geo/countries';
import type { Visit } from '../storage/schema';
import type { ViewMode } from './GlobeView';

export type MapViewState = {
  lat: number;
  lng: number;
  zoom: number;
};

const DEFAULT_STYLE_URL = 'https://demotiles.maplibre.org/style.json';

function visitsToGeoJson(visits: Visit[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: visits.map((v) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [v.lng, v.lat] },
      properties: {
        id: v.id,
        cityName: v.cityName,
        countryId: v.countryId,
        tripId: v.tripId,
        arrivalAt: v.arrivalAt ?? null,
        departureAt: v.departureAt ?? null
      }
    }))
  };
}

function countriesToGeoJson(countries: CountryFeature[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: countries as any
  };
}

export function MapLibreView(props: {
  /**
   * Incrementing token used to trigger an imperative map jump/fly.
   * (Useful when switching from globe -> map.)
   */
  syncToken: number;
  center: { lat: number; lng: number };
  zoom: number;

  visits: Visit[];
  visitedCountries: CountryFeature[];
  mode: ViewMode;

  /** If provided, enables "tap to pick coordinates" in the map. */
  onPickCoords?: (coords: { lat: number; lng: number }) => void;
  onMove?: (state: MapViewState) => void;

  /** If true, clicks should be interpreted as picking coords. */
  pickMode?: boolean;

  /** override the MapLibre style URL */
  styleUrl?: string;
}) {
  const {
    syncToken,
    center,
    zoom,
    visits,
    visitedCountries,
    mode,
    onPickCoords,
    onMove,
    pickMode,
    styleUrl
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const isLoadedRef = useRef(false);

  const visitsGeo = useMemo(() => visitsToGeoJson(visits), [visits]);
  const countriesGeo = useMemo(
    () => countriesToGeoJson(visitedCountries),
    [visitedCountries]
  );

  // Create map
  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl ?? DEFAULT_STYLE_URL,
      center: [center.lng, center.lat],
      zoom,
      attributionControl: false
    });

    mapRef.current = map;


    map.on('load', () => {
      isLoadedRef.current = true;

      // Sources
      if (!map.getSource('visited-countries')) {
        map.addSource('visited-countries', {
          type: 'geojson',
          data: countriesGeo as any
        });
      }

      if (!map.getSource('visits')) {
        map.addSource('visits', {
          type: 'geojson',
          data: visitsGeo as any
        });
      }

      // Layers
      if (!map.getLayer('visited-countries-fill')) {
        map.addLayer({
          id: 'visited-countries-fill',
          type: 'fill',
          source: 'visited-countries',
          paint: {
            'fill-color': 'rgba(0, 200, 255, 0.35)',
            'fill-outline-color': 'rgba(0, 200, 255, 0.55)'
          }
        });
      }

      if (!map.getLayer('visits-circle')) {
        map.addLayer({
          id: 'visits-circle',
          type: 'circle',
          source: 'visits',
          paint: {
            'circle-radius': 6,
            'circle-color': 'rgba(255, 220, 120, 0.9)',
            'circle-stroke-width': 1,
            'circle-stroke-color': 'rgba(0,0,0,0.35)'
          }
        });
      }

      // Apply visibility
      applyModeVisibility(map, mode);
    });

    // Keep parent informed about camera changes
    const onMoveEnd = () => {
      if (!mapRef.current) return;
      const c = mapRef.current.getCenter();
      onMove?.({ lat: c.lat, lng: c.lng, zoom: mapRef.current.getZoom() });
    };

    map.on('moveend', onMoveEnd);

    // Click / pick coordinates
    map.on('click', (e) => {
      if (!pickMode || !onPickCoords) return;
      onPickCoords({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    return () => {
      isLoadedRef.current = false;
      mapRef.current = null;
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync camera when requested
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Only jump after the map has loaded styles.
    if (!isLoadedRef.current) {
      // If not loaded yet, it'll start at the props center/zoom already.
      return;
    }

    map.jumpTo({ center: [center.lng, center.lat], zoom });
  }, [syncToken, center.lat, center.lng, zoom]);

  // Update data sources
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;

    const src = map.getSource('visits') as any;
    if (src?.setData) src.setData(visitsGeo);

    const csrc = map.getSource('visited-countries') as any;
    if (csrc?.setData) csrc.setData(countriesGeo);
  }, [visitsGeo, countriesGeo]);

  // Update visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;
    applyModeVisibility(map, mode);
  }, [mode]);

  return <div ref={containerRef} className="maplibreRoot" />;
}

function applyModeVisibility(map: MapLibreMap, mode: ViewMode) {
  const showCountries = mode === 'countries' || mode === 'both';
  const showCities = mode === 'cities' || mode === 'both';

  if (map.getLayer('visited-countries-fill')) {
    map.setLayoutProperty(
      'visited-countries-fill',
      'visibility',
      showCountries ? 'visible' : 'none'
    );
  }

  if (map.getLayer('visits-circle')) {
    map.setLayoutProperty('visits-circle', 'visibility', showCities ? 'visible' : 'none');
  }
}
