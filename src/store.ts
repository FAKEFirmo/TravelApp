// Persistence: the library JSON + photo files, via the Rust commands in src-tauri/src/lib.rs.
// Outside Tauri (web / home-screen app) it uses localStorage for the library and IndexedDB for photos.
import { invoke, convertFileSrc, isTauri } from '@tauri-apps/api/core';
import { sep } from '@tauri-apps/api/path';
import type { Library } from './model';

const KEY = 'little-prince-library';
const tauri = isTauri();
let photosDir = '';
const urls = new Map<string, string>(); // web: photo file name → object URL

// ---------- IndexedDB (web only): one object store of photo blobs keyed by file name ----------
let dbp: Promise<IDBDatabase> | null = null;
const db = () => dbp ??= new Promise((ok, fail) => {
  const r = indexedDB.open('little-prince', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('photos');
  r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error);
});
async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const tx = (await db()).transaction('photos', mode), req = fn(tx.objectStore('photos'));
  return new Promise((ok, fail) => { tx.oncomplete = () => ok(req?.result); tx.onerror = tx.onabort = () => fail(tx.error); });
}
async function webUrl(name: string) {
  if (!urls.has(name)) {
    const blob = await idb<Blob>('readonly', s => s.get(name));
    if (blob) urls.set(name, URL.createObjectURL(blob));
  }
  return urls.get(name) ?? '';
}

export async function load(): Promise<Library> {
  if (tauri) photosDir = await invoke<string>('photos_dir');
  const text = tauri ? await invoke<string>('load_library') : localStorage.getItem(KEY) ?? '';
  if (!text) return { version: 1, trips: [] };
  const lib = JSON.parse(text) as Library; // throws on a corrupt file: the caller must not save over it
  if (lib.version !== 1) throw new Error(`Unsupported library version ${lib.version}`);
  if (!tauri) {
    navigator.storage?.persist?.(); // ask the browser not to evict our data
    // Thumbnails are needed synchronously while rendering, so load them up front; full photos load on demand
    await Promise.all(lib.trips.flatMap(t => t.activities.flatMap(a => a.photos.map(id => webUrl(`${id}.thumb.jpg`)))));
  }
  return lib;
}

// Saves run one after another so an older write can never land after a newer one
let queue: Promise<unknown> = Promise.resolve();
export function save(lib: Library) {
  const json = JSON.stringify(lib);
  return queue = queue.then(() => tauri ? invoke('save_library', { json }) : localStorage.setItem(KEY, json));
}

const MAX = 2048, THUMB = 320;
async function jpeg(img: ImageBitmap, max: number, quality: number) {
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise<Blob>((ok, fail) => c.toBlob(b => b ? ok(b) : fail(new Error('encode failed')), 'image/jpeg', quality));
}

/** Stores a photo (longest side ≤ 2048 px) plus a 320 px thumbnail. Returns its id. */
export async function addPhoto(file: File) {
  const id = crypto.randomUUID();
  const img = await createImageBitmap(file); // applies EXIF rotation
  const files: [string, Blob][] = [[`${id}.jpg`, await jpeg(img, MAX, 0.88)], [`${id}.thumb.jpg`, await jpeg(img, THUMB, 0.8)]];
  img.close();
  for (const [name, blob] of files) await writePhotoFile(name, blob);
  return id;
}

/** Store one photo file (`<id>.jpg` or `<id>.thumb.jpg`) */
export async function writePhotoFile(name: string, blob: Blob) {
  if (tauri) await invoke('save_photo', new Uint8Array(await blob.arrayBuffer()), { headers: { name } });
  else { await idb('readwrite', s => { s.put(blob, name); }); urls.set(name, URL.createObjectURL(blob)); }
}

/** Read one photo file back (undefined if it's missing) */
export async function readPhotoFile(name: string): Promise<Blob | undefined> {
  if (!tauri) return idb<Blob>('readonly', s => s.get(name));
  try { return new Blob([await invoke<ArrayBuffer>('read_photo', { name })], { type: 'image/jpeg' }); } catch { return undefined; }
}

/**
 * Hand a finished file to the user. Native: written to Downloads (Mac) / the app's Files folder (iPhone).
 * Web: the share sheet when available (iPhone: Save to Files, AirDrop…), otherwise a normal download.
 * Returns a short description of where it went.
 */
export async function saveFile(name: string, blob: Blob): Promise<string> {
  if (tauri) return invoke<string>('export_backup', new Uint8Array(await blob.arrayBuffer()), { headers: { name } });
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return 'the place you picked'; }
    catch (e) { if ((e as Error).name === 'AbortError') throw e; } // cancelled: stop; not allowed: fall back to a download
  }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  return 'your Downloads';
}

export async function deletePhoto(id: string) {
  for (const name of [`${id}.jpg`, `${id}.thumb.jpg`])
    if (tauri) await invoke('delete_photo', { name });
    else { await idb('readwrite', s => { s.delete(name); }); URL.revokeObjectURL(urls.get(name) ?? ''); urls.delete(name); }
}

/** Thumbnail URL, available synchronously (preloaded on the web) */
export const photoUrl = (id: string, thumb = false) => {
  const name = `${id}${thumb ? '.thumb' : ''}.jpg`;
  return tauri ? convertFileSrc(photosDir + sep() + name) : urls.get(name) ?? '';
};
/** Full-size photo URL (loaded from IndexedDB on demand on the web) */
export const fullPhotoUrl = (id: string) => tauri ? Promise.resolve(photoUrl(id)) : webUrl(`${id}.jpg`);

/** Hand the macOS widget a summary of the trips (no-op outside the Mac app built with the widget) */
export const updateWidget = (data: object) => { if (tauri) invoke('write_widget', { json: JSON.stringify(data) }).catch(() => {}); };
