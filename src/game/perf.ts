const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";

export const gecko = /firefox/i.test(ua);

/** Cap backing-store DPR for fill-heavy awaken rendering. */
export function canvasDpr() {
  const raw = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const w = typeof window !== "undefined" ? window.innerWidth || 390 : 390;
  const h = typeof window !== "undefined" ? window.innerHeight || 844 : 844;
  const cssPx = w * h;
  if (gecko) return Math.min(raw, cssPx > 700000 ? 1 : 1.25);
  if (cssPx > 500000) return Math.min(raw, 1.25);
  return Math.min(raw, 1.5);
}
