/** A lamp is freshly extinguished only when it was not already in the out window. */
export function searchlightBreaksOnHit(out: number): boolean {
  return !(out > 0);
}
