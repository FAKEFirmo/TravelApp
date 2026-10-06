// Persistence: the library JSON + photo files, via the Rust commands in src-tauri/src/lib.rs.
// Outside Tauri (plain browser preview) it falls back to localStorage + in-memory photos.
import { invoke, convertFileSrc, isTauri } from '@tauri-apps/api/core';
import { sep } from '@tauri-apps/api/path';
import type { Library } from './model';

const KEY = 'little-prince-library';
const tauri = isTauri();
let photosDir = '';
const memPhotos = new Map<string, string>(); // ponytail: browser preview only, lost on reload

export async function load(): Promise<Library> {
  if (tauri) photosDir = await invoke<string>('photos_dir');
  const text = tauri ? await invoke<string>('load_library') : localStorage.getItem(KEY) ?? '';
  if (!text) return { version: 1, trips: [] };
  const lib = JSON.parse(text) as Library; // throws on a corrupt file: the caller must not save over it
  if (lib.version !== 1) throw new Error(`Unsupported library version ${lib.version}`);
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
  for (const [name, blob] of files) {
    if (tauri) await invoke('save_photo', new Uint8Array(await blob.arrayBuffer()), { headers: { name } });
    else memPhotos.set(name, URL.createObjectURL(blob));
  }
  return id;
}

export async function deletePhoto(id: string) {
  for (const name of [`${id}.jpg`, `${id}.thumb.jpg`])
    tauri ? await invoke('delete_photo', { name }) : memPhotos.delete(name);
}

export const photoUrl = (id: string, thumb = false) => {
  const name = `${id}${thumb ? '.thumb' : ''}.jpg`;
  return tauri ? convertFileSrc(photosDir + sep() + name) : memPhotos.get(name) ?? '';
};
