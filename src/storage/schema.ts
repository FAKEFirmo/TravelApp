export type Trip = {
  id: string;
  title: string;
  createdAt: string; // ISO
};

export type Visit = {
  id: string;
  tripId: string;
  cityName: string;
  countryId: string; // ISO 3166-1 numeric code, as string (matches world-atlas feature.id)
  lat: number;
  lng: number;
  arrivalAt?: string; // ISO datetime
  departureAt?: string; // ISO datetime
  createdAt: string; // ISO
};

export type ExportBundle = {
  version: 1;
  exportedAt: string;
  trips: Trip[];
  visits: Visit[];
};
