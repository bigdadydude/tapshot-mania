/**
 * Falling square rain: bright head + fading trail (same hue, alpha only).
 * Free-fall columns with per-stream random speeds, spread across the court.
 */

export type RainCol = {
  x: number;
  /** Continuous Y of the bright head (world px). */
  y: number;
  /** Fall speed (px / sec), rolled per life. */
  vy: number;
  /** Trail length in cells (including head). */
  len: number;
};

export type SparseRain = {
  cell: number;
  /** cell + gap — vertical pitch between squares. */
  pitch: number;
  cols: RainCol[];
  key: string;
};

let rain: SparseRain | null = null;
let lastStepAt = -1;

/** Gap between consecutive squares in a trail. */
const SQUARE_GAP = 4;

/** Match neon hoop rimHi — near-white green. */
const HEAD_RGB = "224, 255, 232";
/** Trail body — neon rim green, alpha steps only. */
const TRAIL_RGB = "141, 255, 184";

const HEAD_FILL = `rgba(${HEAD_RGB}, 1)`;
const TRAIL_FILLS = [
  `rgba(${TRAIL_RGB}, 0.82)`,
  `rgba(${TRAIL_RGB}, 0.70)`,
  `rgba(${TRAIL_RGB}, 0.58)`,
  `rgba(${TRAIL_RGB}, 0.46)`,
  `rgba(${TRAIL_RGB}, 0.34)`,
  `rgba(${TRAIL_RGB}, 0.24)`,
  `rgba(${TRAIL_RGB}, 0.14)`,
];

function layoutKey(w: number, h: number, cell: number) {
  return `${w | 0}x${h | 0}:${cell | 0}`;
}

function cellSize(worldW: number) {
  return Math.max(10, Math.min(16, Math.round(worldW * 0.03)));
}

function dropPitch(cell: number) {
  return cell + SQUARE_GAP;
}

function rollSpeed() {
  return 70 + Math.random() * 200;
}

function spawnCol(x: number, worldH: number, pitch: number): RainCol {
  const len = 4 + Math.floor(Math.random() * 5);
  return {
    x,
    y: -pitch * (len + Math.random() * (worldH / pitch) * 0.85),
    vy: rollSpeed(),
    len,
  };
}

export function createSparseRain(worldW: number, worldH: number): SparseRain {
  const cell = cellSize(worldW);
  const pitch = dropPitch(cell);
  // Spread streams across the full width — no random skip (that left 0–1 columns).
  const stride = Math.max(cell * 2.6, worldW / 14);
  const cols: RainCol[] = [];
  const start = (stride - cell) * 0.35 + Math.random() * cell * 0.4;
  for (let x = start; x < worldW - cell * 0.5; x += stride) {
    // Light jitter so columns aren't a rigid grid.
    const jx = x + (Math.random() - 0.5) * cell * 0.6;
    cols.push(spawnCol(jx, worldH, pitch));
  }
  // Guarantee at least a few streams on tiny layouts.
  if (cols.length < 3) {
    const n = 5;
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n) * worldW - cell * 0.5;
      cols.push(spawnCol(x, worldH, pitch));
    }
  }
  return { cell, pitch, cols, key: layoutKey(worldW, worldH, cell) };
}

export function ensureSparseRain(worldW: number, worldH: number): SparseRain {
  const w = Math.max(8, worldW);
  const h = Math.max(8, worldH);
  const cell = cellSize(w);
  const key = layoutKey(w, h, cell);
  if (rain && rain.key === key && rain.cols.length >= 3) return rain;
  rain = createSparseRain(w, h);
  lastStepAt = -1;
  return rain;
}

export function stepSparseRain(run: SparseRain, dt: number, worldH: number) {
  const { pitch } = run;
  for (const c of run.cols) {
    c.y += c.vy * dt;
    const trailBot = c.y - (c.len - 1) * pitch;
    if (trailBot > worldH + pitch) {
      const next = spawnCol(c.x, worldH, pitch);
      c.y = next.y;
      c.vy = next.vy;
      c.len = next.len;
    }
  }
}

/** Sharp square rain — free-fall, random speeds, full-court spread. */
export function drawSparseCodeRain(
  ctx: CanvasRenderingContext2D,
  world: { w: number; h: number },
  time: number,
) {
  const run = ensureSparseRain(world.w, world.h);
  if (lastStepAt < 0) lastStepAt = time;
  const dt = Math.min(0.08, Math.max(0, time - lastStepAt));
  lastStepAt = time;
  if (dt > 0) stepSparseRain(run, dt, world.h);

  const { h } = world;
  const { cell, pitch } = run;
  for (const c of run.cols) {
    for (let i = 0; i < c.len; i++) {
      const y = c.y - i * pitch;
      if (y + cell < 0 || y > h) continue;
      ctx.fillStyle =
        i === 0 ? HEAD_FILL : TRAIL_FILLS[Math.min(i - 1, TRAIL_FILLS.length - 1)]!;
      ctx.fillRect(c.x, y, cell, cell);
    }
  }
}

export function clearSparseCodeRain() {
  rain = null;
  lastStepAt = -1;
}
