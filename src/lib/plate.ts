/** Normalize plate by removing spaces and uppercasing for comparison */
export function normalizePlate(plate: string): string {
  return plate.replace(/[\s\-]/g, '').toUpperCase();
}

/** Format plate into standard Korean format: 12가 3456 */
export function formatPlate(raw: string): string {
  const n = normalizePlate(raw);
  // New format: 2-3 digits + 1 Korean char + 4 digits (e.g. 12가3456)
  const m = n.match(/^(\d{2,3})([가-힣])(\d{4})$/);
  if (m) return `${m[1]}${m[2]} ${m[3]}`;
  return raw.toUpperCase();
}

/** Returns true if two plates refer to the same vehicle (ignoring spaces) */
export function samePlate(a: string, b: string): boolean {
  return normalizePlate(a) === normalizePlate(b);
}

/** Auto-format as user types: insert space before 4 trailing digits */
export function liveFormat(raw: string): string {
  const stripped = raw.replace(/[\s\-]/g, '').toUpperCase();
  const m = stripped.match(/^(\d{2,3}[가-힣])(\d{1,4})$/);
  if (m) return `${m[1]} ${m[2]}`;
  return stripped;
}
