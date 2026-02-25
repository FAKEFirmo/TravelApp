export function uid(prefix = 'id'): string {
  // randomUUID is available in modern browsers.
  const ruuid = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (ruuid) return ruuid();
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}
