import type { CountryFeature } from '../geo/countries';
import type { Visit } from '../storage/schema';
import type { GlobeFocus, ViewMode } from '../components/GlobeView';
import { HybridMapView } from '../components/HybridMapView';

export function MapScreen(props: {
  visits: Visit[];
  visitedCountries: CountryFeature[];
  mode: ViewMode;
  focus?: GlobeFocus | null;

  isPicking: boolean;
  pickedCoords: { lat: number; lng: number } | null;
  onPickCoords: (coords: { lat: number; lng: number }) => void;
}) {
  const { visits, visitedCountries, mode, focus, isPicking, pickedCoords, onPickCoords } = props;

  return (
    <div className="screenRoot">
      <HybridMapView
        visits={visits}
        visitedCountries={visitedCountries}
        mode={mode}
        focus={focus}
        pickMode={isPicking && !pickedCoords}
        onPickCoords={onPickCoords}
      />

      {isPicking && !pickedCoords ? (
        <div className="mapHint">Tap the globe / map to pick a location…</div>
      ) : null}
    </div>
  );
}
