// Small UI helpers shared by the globe and the panel.
import {
  createElement, Plane, TrainFront, Bus, Car, Ship, Landmark, Camera, TreePalm, MountainSnow, Footprints, UtensilsCrossed,
  ArrowLeft, Plus, Globe, ChevronRight, X, ImagePlus, Armchair, Trash2, Pencil, Ellipsis, Satellite, Map,
} from 'lucide';

// Only the icons we use, so the bundle stays small
const ICONS = {
  Plane, TrainFront, Bus, Car, Ship, Landmark, Camera, TreePalm, MountainSnow, Footprints, UtensilsCrossed,
  ArrowLeft, Plus, Globe, ChevronRight, X, ImagePlus, Armchair, Trash2, Pencil, Ellipsis, Satellite, Map,
};
export const icon = (name: string) => {
  const el = createElement(ICONS[name as keyof typeof ICONS]);
  el.setAttribute('class', 'lucide'); el.setAttribute('width', '16'); el.setAttribute('height', '16');
  return el.outerHTML;
};

/** Escape user text before it goes into innerHTML */
export const esc = (s = '') => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
export const rgba = (hex: string, a: number) => `rgba(${hex.slice(1).match(/../g)!.map(h => parseInt(h, 16))},${a})`;
export const fmt = (n: number) => Math.round(n).toLocaleString('en');
/** "2025-05-02" → "2 May" (or any Intl format) */
export const dfmt = (iso: string, o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) =>
  iso ? new Date(iso + 'T00:00').toLocaleDateString('en-GB', o) : '';
export const hm = (min: number) => `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m`;

/** Promise-based confirm built on <dialog> (native confirm() isn't reliable in every webview) */
export function ask(message: string, ok = 'Delete'): Promise<boolean> {
  const d = document.getElementById('ask') as HTMLDialogElement;
  d.querySelector('p')!.textContent = message;
  d.querySelector<HTMLButtonElement>('[value=ok]')!.textContent = ok;
  d.returnValue = '';
  d.showModal();
  return new Promise(res => d.addEventListener('close', () => res(d.returnValue === 'ok'), { once: true }));
}

/**
 * Swipe-left to reveal a row's actions (touch or mouse drag). The row needs a `.swipe` child holding the content
 * and a sibling `.swipe-actions`. Click anywhere else closes it.
 */
export function enableSwipe(root: HTMLElement) {
  let row: HTMLElement | null = null, x0 = 0, dx = 0, base = 0, W = 0, moved = false;
  const set = (el: HTMLElement, x: number, anim = true) => {
    el.style.transition = anim ? 'transform .2s ease' : 'none';
    el.style.transform = x ? `translateX(${x}px)` : '';
    el.closest('.swipeable')!.classList.toggle('open', x < 0);
  };
  const closeAll = (except?: Element) => root.querySelectorAll<HTMLElement>('.swipeable.open .swipe')
    .forEach(el => el !== except && set(el, 0));
  root.addEventListener('pointerdown', e => {
    const t = e.target as Element;
    moved = false;
    if (t.closest('.swipe-actions')) return;
    const el = t.closest<HTMLElement>('.swipe');
    closeAll(el ?? undefined);
    if (!el || t.closest('button')) return;
    row = el; x0 = e.clientX; dx = 0;
    W = el.parentElement!.querySelector<HTMLElement>('.swipe-actions')!.offsetWidth;
    base = el.closest('.swipeable.open') ? -W : 0;
  });
  addEventListener('pointermove', e => {
    if (!row) return;
    dx = e.clientX - x0;
    if (Math.abs(dx) > 6) moved = true;
    if (moved) set(row, Math.min(0, Math.max(-W * 1.3, base + dx)), false);
  });
  const end = () => {
    if (!row) return;
    if (moved) set(row, base + dx < -W / 2 ? -W : 0);
    else if (base) { set(row, 0); moved = true; } // tapping an open row just closes it
    row = null;
  };
  addEventListener('pointerup', end); addEventListener('pointercancel', end);
  // A drag must not also count as a click on the row
  root.addEventListener('click', e => { if (moved) { e.stopPropagation(); moved = false; } }, true);
}
