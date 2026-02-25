import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { Trip, Visit, ExportBundle } from './schema';

interface TravelDB extends DBSchema {
  trips: {
    key: string;
    value: Trip;
    indexes: { 'by-createdAt': string };
  };
  visits: {
    key: string;
    value: Visit;
    indexes: { 'by-tripId': string; 'by-countryId': string; 'by-createdAt': string };
  };
}

const DB_NAME = 'travelapp';
const DB_VERSION = 1;

let dbMemo: Promise<IDBPDatabase<TravelDB>> | null = null;

export function db(): Promise<IDBPDatabase<TravelDB>> {
  if (!dbMemo) {
    dbMemo = openDB<TravelDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const trips = db.createObjectStore('trips', { keyPath: 'id' });
        trips.createIndex('by-createdAt', 'createdAt');

        const visits = db.createObjectStore('visits', { keyPath: 'id' });
        visits.createIndex('by-tripId', 'tripId');
        visits.createIndex('by-countryId', 'countryId');
        visits.createIndex('by-createdAt', 'createdAt');
      }
    });
  }
  return dbMemo;
}

export async function listTrips(): Promise<Trip[]> {
  const d = await db();
  const trips = await d.getAll('trips');
  return trips.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function upsertTrip(trip: Trip): Promise<void> {
  const d = await db();
  await d.put('trips', trip);
}

export async function deleteTrip(tripId: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(['visits', 'trips'], 'readwrite');

  // Delete visits for this trip.
  const idx = tx.objectStore('visits').index('by-tripId');
  let cursor = await idx.openCursor(tripId);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }

  await tx.objectStore('trips').delete(tripId);
  await tx.done;
}

export async function listVisits(tripId: string): Promise<Visit[]> {
  const d = await db();
  const visits = await d.getAllFromIndex('visits', 'by-tripId', tripId);
  // show newest first
  return visits.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listAllVisits(): Promise<Visit[]> {
  const d = await db();
  const visits = await d.getAll('visits');
  return visits.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}


export async function upsertVisit(visit: Visit): Promise<void> {
  const d = await db();
  await d.put('visits', visit);
}

export async function deleteVisit(visitId: string): Promise<void> {
  const d = await db();
  await d.delete('visits', visitId);
}

export async function exportAll(): Promise<ExportBundle> {
  const d = await db();
  const trips = await d.getAll('trips');
  const visits = await d.getAll('visits');
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    trips,
    visits
  };
}

export async function importAll(bundle: ExportBundle, opts?: { replace?: boolean }): Promise<void> {
  if (bundle.version !== 1) throw new Error(`Unsupported export version: ${bundle.version}`);

  const d = await db();
  const tx = d.transaction(['trips', 'visits'], 'readwrite');

  if (opts?.replace) {
    await tx.objectStore('trips').clear();
    await tx.objectStore('visits').clear();
  }

  for (const t of bundle.trips ?? []) {
    await tx.objectStore('trips').put(t);
  }
  for (const v of bundle.visits ?? []) {
    await tx.objectStore('visits').put(v);
  }

  await tx.done;
}
