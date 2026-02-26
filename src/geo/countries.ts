import countries110m from 'world-atlas/countries-110m.json';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';

/**
 * Countries are sourced from `world-atlas`.
 * Each country feature uses ISO 3166-1 numeric code as `feature.id`.
 */
export type CountryFeature = Feature<Polygon | MultiPolygon, { name: string }> & {
  id?: string | number;
};

let memoCountries: CountryFeature[] | null = null;
let memoById: Map<string, CountryFeature> | null = null;

export function getAllCountries(): CountryFeature[] {
  if (memoCountries) return memoCountries;

  const topology: any = countries110m as any;
  const countriesObj = topology.objects.countries;

  const fc = feature(topology, countriesObj) as FeatureCollection<Polygon | MultiPolygon, any>;

  // Normalize the properties a bit.
  const list = (fc.features as any[]).map((f) =>
    ({
      ...f,
      properties: {
        name: f?.properties?.name ?? 'Unknown'
      }
    })
  ) as CountryFeature[];

  list.sort((a, b) => (a.properties?.name ?? '').localeCompare(b.properties?.name ?? ''));

  memoCountries = list;
  memoById = new Map(list.map((c) => [String(c.id), c]));
  return list;
}

export function getCountryById(countryId: string): CountryFeature | undefined {
  if (!memoById) getAllCountries();
  return memoById?.get(String(countryId));
}

export function getCountryName(countryId: string): string {
  return getCountryById(countryId)?.properties?.name ?? countryId;
}
