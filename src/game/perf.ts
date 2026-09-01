const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";

export const gecko = /firefox/i.test(ua);

export function canvasDpr() {
  const raw = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  if (gecko) {
    const w = typeof window !== "undefined" ? window.innerWidth || 390 : 390;
    const h = typeof window !== "undefined" ? window.innerHeight || 844 : 844;
    return Math.min(raw, w * h > 700000 ? 1 : 1.25);
  }
  return Math.min(raw, 1.5);
}
