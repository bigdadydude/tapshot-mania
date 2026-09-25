type P = { x: number; y: number };

export type DoodleMark = {
  kind: "digit" | "shit";
  digit: number;
  pts: { x: number; y: number; on: boolean }[];
  lump: { x: number; y: number; r: number } | null;
};

export type DoodleRun = {
  paint: number;
  marks: DoodleMark[];
  life: number | null;
  grace: number;
};

export const DOODLE_SLOTS = 3;
export const DOODLE_FADE = 2.5;
export const DOODLE_GRACE = 0.45;
export const DOODLE_REFUND = 0.8;

const SIZE = 250;
const RESAMPLE_N = 64;

const RAW: { d: number; pts: P[] }[] = [
  { d: 0, pts: [[50, 8], [72, 14], [88, 36], [90, 58], [74, 82], [50, 94], [26, 82], [10, 58], [12, 36], [28, 14], [50, 8]] },
  { d: 2, pts: [[18, 28], [36, 12], [64, 10], [84, 28], [78, 48], [52, 62], [28, 78], [18, 92], [48, 94], [82, 90]] },
  { d: 3, pts: [[22, 22], [48, 10], [76, 22], [84, 40], [62, 50], [40, 50], [68, 58], [86, 74], [64, 92], [32, 90], [18, 74]] },
  { d: 4, pts: [[72, 8], [28, 58], [86, 58], [70, 42], [68, 8], [68, 96]] },
  { d: 5, pts: [[78, 14], [28, 16], [24, 46], [48, 40], [76, 50], [84, 72], [62, 92], [28, 88], [16, 70]] },
  { d: 6, pts: [[72, 18], [46, 10], [22, 32], [18, 58], [28, 82], [52, 94], [76, 78], [72, 56], [48, 48], [26, 62]] },
  { d: 7, pts: [[16, 16], [84, 12], [62, 42], [46, 68], [34, 96]] },
  { d: 8, pts: [[50, 50], [28, 36], [22, 18], [42, 8], [68, 14], [78, 32], [62, 48], [50, 50], [32, 64], [28, 82], [48, 96], [74, 86], [80, 66], [62, 52]] },
  { d: 9, pts: [[58, 58], [32, 52], [18, 34], [28, 14], [54, 8], [78, 22], [80, 44], [62, 58], [58, 58], [64, 78], [60, 96]] },
].map((row) => ({ d: row.d, pts: row.pts.map(([x, y]) => ({ x, y })) }));

function hypot(a: P, b: P) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function centroid(pts: P[]): P {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  const n = pts.length || 1;
  return { x: x / n, y: y / n };
}

function pathLen(pts: P[]) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += hypot(pts[i - 1]!, pts[i]!);
  return l;
}

function resample(src: P[], n: number): P[] {
  if (src.length === 0) return [];
  const pts = src.map((p) => ({ ...p }));
  const interval = Math.max(0.01, pathLen(pts) / (n - 1));
  const out: P[] = [{ ...pts[0]! }];
  let walked = 0;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1]!;
    const cur = pts[i]!;
    const d = hypot(prev, cur);
    if (walked + d >= interval) {
      const t = (interval - walked) / (d || 1);
      const q = { x: prev.x + t * (cur.x - prev.x), y: prev.y + t * (cur.y - prev.y) };
      out.push(q);
      pts.splice(i, 0, q);
      walked = 0;
    } else walked += d;
  }
  while (out.length < n) out.push({ ...pts[pts.length - 1]! });
  return out.slice(0, n);
}

function rotateAround(pts: P[], rad: number): P[] {
  const c = centroid(pts);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return pts.map((p) => {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    return { x: dx * cos - dy * sin + c.x, y: dx * sin + dy * cos + c.y };
  });
}

function indicative(pts: P[]) {
  const c = centroid(pts);
  return Math.atan2(c.y - pts[0]!.y, c.x - pts[0]!.x);
}

function scaleSquare(pts: P[], size: number): P[] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  return pts.map((p) => ({ x: ((p.x - minX) / w) * size, y: ((p.y - minY) / h) * size }));
}

function translateOrigin(pts: P[]): P[] {
  const c = centroid(pts);
  return pts.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
}

function pathDist(a: P[], b: P[]) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += hypot(a[i]!, b[i]!);
  return d / a.length;
}

function prep(pts: P[]): P[] {
  let p = resample(pts, RESAMPLE_N);
  p = rotateAround(p, -indicative(p));
  p = scaleSquare(p, SIZE);
  return translateOrigin(p);
}

const TEMPLATES = RAW.flatMap((t) => [prep(t.pts), prep([...t.pts].reverse())].map((pts) => ({ d: t.d, pts })));

function distAtBestAngle(pts: P[], tmpl: P[]) {
  let a = -Math.PI / 4;
  let b = Math.PI / 4;
  const thr = Math.PI / 90;
  const phi = 0.5 * (-1 + Math.sqrt(5));
  let x1 = phi * a + (1 - phi) * b;
  let f1 = pathDist(rotateAround(pts, x1), tmpl);
  let x2 = (1 - phi) * a + phi * b;
  let f2 = pathDist(rotateAround(pts, x2), tmpl);
  while (Math.abs(b - a) > thr) {
    if (f1 < f2) {
      b = x2;
      x2 = x1;
      f2 = f1;
      x1 = phi * a + (1 - phi) * b;
      f1 = pathDist(rotateAround(pts, x1), tmpl);
    } else {
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = (1 - phi) * a + phi * b;
      f2 = pathDist(rotateAround(pts, x2), tmpl);
    }
  }
  return Math.min(f1, f2);
}

export function recognizeDigit(stroke: P[]): number | null {
  if (stroke.length < 4) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of stroke) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const w = maxX - minX;
  const h = maxY - minY;
  const len = pathLen(stroke);
  if (h > 28 && w < h * 0.34 && len < h * 1.7) return 1;
  const cand = prep(stroke);
  let best = Infinity;
  let digit = -1;
  for (const t of TEMPLATES) {
    const d = distAtBestAngle(cand, t.pts);
    if (d < best) {
      best = d;
      digit = t.d;
    }
  }
  if (digit < 0 || best > 115) return null;
  return digit;
}

function bounds(pts: P[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY, h: maxY - minY };
}

function scaleMinHeight(pts: P[], minH: number): P[] {
  const b = bounds(pts);
  if (b.h >= minH || b.h < 1) return pts.map((p) => ({ ...p }));
  const s = minH / b.h;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return pts.map((p) => ({ x: cx + (p.x - cx) * s, y: cy + (p.y - cy) * s }));
}

function fitInside(pts: P[], w: number, floorY: number): P[] {
  const b = bounds(pts);
  const m = 12;
  let dx = 0;
  let dy = 0;
  if (b.minX < m) dx = m - b.minX;
  else if (b.maxX > w - m) dx = w - m - b.maxX;
  if (b.minY < m + 36) dy = m + 36 - b.minY;
  else if (b.maxY > floorY - 8) dy = floorY - 8 - b.maxY;
  if (dx === 0 && dy === 0) return pts;
  return pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

function sampleAlong(pts: P[], step: number): P[] {
  if (pts.length === 0) return [];
  const out: P[] = [{ ...pts[0]! }];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    let a = pts[i - 1]!;
    const b = pts[i]!;
    let d = hypot(a, b);
    if (d < 0.001) continue;
    while (acc + d >= step) {
      const t = (step - acc) / d;
      const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      out.push(q);
      d = hypot(q, b);
      a = q;
      acc = 0;
    }
    acc += d;
  }
  const last = pts[pts.length - 1]!;
  if (hypot(out[out.length - 1]!, last) > 1) out.push({ ...last });
  return out;
}

export function emptyDoodle(): DoodleRun {
  return { paint: 0, marks: [], life: null, grace: 0 };
}

export function doodleCanWrite(run: DoodleRun): "ok" | "wait" | "empty" | "full" {
  if (run.life !== null) return "wait";
  if (run.paint < 1) return "empty";
  if (run.marks.length >= DOODLE_SLOTS) return "full";
  return "ok";
}

export function spendDoodlePaint(run: DoodleRun) {
  run.paint = Math.max(0, run.paint - 1);
  run.grace = 0;
}

export function addDoodleMake(run: DoodleRun) {
  run.paint = Math.min(DOODLE_SLOTS, run.paint + 1);
}

export function pushDoodleStroke(
  run: DoodleRun,
  stroke: P[],
  ballR: number,
  worldW: number,
  floorY: number,
) {
  const digit = recognizeDigit(stroke);
  if (digit === null) {
    const c = centroid(stroke);
    run.marks.push({
      kind: "shit",
      digit: -1,
      pts: [],
      lump: { x: c.x, y: c.y, r: ballR * 1.45 },
    });
  } else {
    let pts = scaleMinHeight(stroke, ballR * 6);
    pts = fitInside(pts, worldW, floorY);
    run.marks.push({
      kind: "digit",
      digit,
      pts: sampleAlong(pts, Math.max(6, ballR * 0.45)).map((p) => ({ ...p, on: true })),
      lump: null,
    });
  }
  if (run.marks.length >= DOODLE_SLOTS) {
    run.life = DOODLE_FADE;
    run.grace = 0;
  } else {
    run.grace = DOODLE_GRACE;
  }
}

function digitValue(run: DoodleRun) {
  const s = run.marks
    .filter((m) => m.kind === "digit")
    .map((m) => String(m.digit))
    .join("");
  return s ? Number(s) : 0;
}

function digitsLeft(run: DoodleRun) {
  return run.marks.some((m) => m.kind === "digit" && m.pts.some((p) => p.on));
}

export function stepDoodle(
  run: DoodleRun,
  dt: number,
  ball: { x: number; y: number; r: number },
): { score: number; say: string | null; at: P | null } {
  let score = 0;
  let say: string | null = null;
  let at: P | null = null;
  for (const mark of run.marks) {
    if (mark.kind === "shit" && mark.lump) {
      const d = Math.hypot(ball.x - mark.lump.x, ball.y - mark.lump.y);
      if (d <= ball.r + mark.lump.r * 0.35) {
        at = { x: mark.lump.x, y: mark.lump.y };
        mark.lump = null;
        run.paint = Math.min(DOODLE_SLOTS, run.paint + DOODLE_REFUND);
        say = "收回八成";
      }
    } else {
      for (const p of mark.pts) {
        if (!p.on) continue;
        if (Math.hypot(ball.x - p.x, ball.y - p.y) <= ball.r) p.on = false;
      }
    }
  }
  run.marks = run.marks.filter((m) => (m.kind === "shit" ? m.lump !== null : true));

  const hasDigits = run.marks.some((m) => m.kind === "digit");
  if (hasDigits && !digitsLeft(run)) {
    score = digitValue(run);
    const last = run.marks.find((m) => m.kind === "digit");
    const tail = last?.pts[last.pts.length - 1];
    if (tail) at = { x: tail.x, y: tail.y };
    if (score > 0) say = `+${score}`;
    run.marks = run.marks.filter((m) => m.kind !== "digit");
    if (run.marks.length === 0) {
      run.life = null;
      run.grace = 0;
    }
  }

  if (run.life === null && run.grace > 0) {
    run.grace -= dt;
    if (run.grace <= 0 && run.marks.length > 0) {
      run.life = DOODLE_FADE;
      run.grace = 0;
    }
  }
  if (run.life !== null) {
    run.life -= dt;
    if (run.life <= 0) {
      if (digitsLeft(run)) {
        say = "没吃干净";
        const left = run.marks.find((m) => m.kind === "digit" && m.pts.some((p) => p.on));
        const p = left?.pts.find((pt) => pt.on);
        if (p) at = { x: p.x, y: p.y };
      }
      run.marks = [];
      run.life = null;
      run.grace = 0;
    }
  }
  return { score, say, at };
}
