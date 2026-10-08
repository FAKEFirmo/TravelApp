// Backup files: one JSON document with the library and (optionally) every photo as base64.
// ponytail: base64 JSON is ~33% bigger than a zip but needs no library; switch to zip if backups get huge
import { MODES, KINDS, type Library, type Trip } from './model';
import { readPhotoFile, writePhotoFile, deletePhoto } from './store';

interface BackupFile { app: 'little-prince'; format: 1; exported: string; library: Library; photos: Record<string, string> }

const photoIds = (trips: Trip[]) => trips.flatMap(t => t.activities.flatMap(a => a.photos));
const PHOTO_FILES = (id: string) => [`${id}.jpg`, `${id}.thumb.jpg`];

const b64 = (blob: Blob) => new Promise<string>((ok, fail) => {
  const r = new FileReader();
  r.onload = () => { const s = r.result as string; ok(s.slice(s.indexOf(',') + 1)); };
  r.onerror = () => fail(r.error);
  r.readAsDataURL(blob);
});
const unb64 = (s: string) => new Blob([Uint8Array.from(atob(s), c => c.charCodeAt(0))], { type: 'image/jpeg' });

export function backupName() {
  return `little-prince-backup-${new Date().toLocaleDateString('sv')}.json`; // sv locale = YYYY-MM-DD
}

/** Build the backup as a Blob, streaming photo by photo so it never holds one giant string */
export async function exportBackup(lib: Library, withPhotos: boolean): Promise<Blob> {
  const parts: BlobPart[] = [`{"app":"little-prince","format":1,"exported":"${new Date().toISOString()}","library":`,
    JSON.stringify(lib), ',"photos":{'];
  let first = true;
  if (withPhotos) for (const id of photoIds(lib.trips)) for (const name of PHOTO_FILES(id)) {
    const blob = await readPhotoFile(name);
    if (!blob) continue; // a missing file shouldn't block the whole backup
    parts.push(`${first ? '' : ','}"${name}":"`, await b64(blob), '"');
    first = false;
  }
  parts.push('}}');
  return new Blob(parts, { type: 'application/json' });
}

// Imported files are untrusted: check the shape before anything touches the library
const str = (v: unknown): v is string => typeof v === 'string';
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const okPlace = (p: any): boolean => !!p && str(p.id) && str(p.name) && str(p.country) && num(p.lat) && num(p.lng) && (!p.city || okPlace(p.city));
const okTrip = (t: any) => !!t && str(t.id) && str(t.name) && Array.isArray(t.legs) && Array.isArray(t.activities)
  && t.legs.every((l: any) => okPlace(l?.from) && okPlace(l?.to) && l.mode in MODES && str(l.date))
  && t.activities.every((a: any) => !!a && str(a.id) && str(a.title) && a.kind in KINDS && str(a.date) && str(a.stop)
    && num(a.lat) && num(a.lng) && Array.isArray(a.photos) && a.photos.every((p: unknown) => str(p) && /^[\w-]+$/.test(p)));

export async function readBackup(file: File): Promise<BackupFile> {
  let data: any;
  try { data = JSON.parse(await file.text()); } catch { throw new Error("This file isn't a Little Prince backup."); }
  if (data?.app !== 'little-prince' || data.library?.version !== 1 || !Array.isArray(data.library.trips))
    throw new Error("This file isn't a Little Prince backup.");
  if (data.format !== 1) throw new Error('This backup comes from a newer version of the app.');
  if (!data.library.trips.every(okTrip) || typeof data.photos !== 'object') throw new Error('This backup is damaged.');
  return data;
}

export const summary = (b: BackupFile) => ({
  trips: b.library.trips.length,
  activities: b.library.trips.reduce((n, t) => n + t.activities.length, 0),
  photos: Object.keys(b.photos).filter(n => !n.includes('.thumb')).length,
  date: b.exported?.slice(0, 10) ?? '',
});

/**
 * Apply a backup to the library (mutates `lib`). 'merge' adds new trips and replaces ones with the same id;
 * 'replace' swaps the whole library and removes photos that are no longer used.
 */
export async function restoreBackup(lib: Library, b: BackupFile, mode: 'merge' | 'replace') {
  const before = new Set(photoIds(lib.trips));
  if (mode === 'replace') lib.trips = b.library.trips;
  else for (const t of b.library.trips) {
    const i = lib.trips.findIndex(x => x.id === t.id);
    if (i >= 0) lib.trips[i] = t; else lib.trips.push(t);
  }
  const used = new Set(photoIds(lib.trips));
  for (const [name, data] of Object.entries(b.photos))
    if (/^[\w-]+(\.thumb)?\.jpg$/.test(name) && used.has(name.replace(/(\.thumb)?\.jpg$/, '')) && str(data))
      await writePhotoFile(name, unb64(data));
  return [...before].filter(id => !used.has(id)); // photos to delete once the library is saved
}

export const deletePhotos = (ids: string[]) => Promise.all(ids.map(id => deletePhoto(id).catch(console.error)));
