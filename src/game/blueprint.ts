import type { World } from "./types";

/**
 * 蓝图场景，阶段 1。
 * 网格和伸缩方块放在独立模块里，不写进静态 ScenePack。
 * 阶段 2 以后的激光、发射器和图纸系统不在这里。
 */

/**
 * 方块边长，按画面宽 390 换算。
 * 28 比原先的 44 更密：单格更小，篮筐走廊之间能放下更多列。
 */
export const BLUEPRINT_BLOCK_SIZE = 28;
/** 同时凸出的格子上限。 */
export const BLUEPRINT_MAX_COUNT = 10;
/** 凸出时长下限，秒。进球数为 0 时整段就是 1 秒。 */
export const BLUEPRINT_EXTEND_MIN = 1;
/** 每进一球，时长区间右端增加的秒数。 */
export const BLUEPRINT_EXTEND_PER_GOAL = 0.2;
/** 凸出时长上限，秒。 */
export const BLUEPRINT_EXTEND_CAP = 6;
/** 篮球周围禁生成的半径，按格计。 */
export const BLUEPRINT_BALL_CLEAR = 2;
/** 缩到这个比例以下就不再挡球。 */
export const BLUEPRINT_HIT_EXTEND = 0.12;
/** 撞上方块时的分离系数。1.65 表示反弹保留约 0.65 的法向速度。 */
export const BLUEPRINT_BOUNCE = 1.65;
/**
 * 落在格子顶上时，至少弹起的高度，按球半径计。
 * 只要盖过「一帧重力又把球按回去」的速度，又小于上下两格之间的空隙。
 */
export const BLUEPRINT_BOUNCE_CLEAR = 0.16;
/**
 * 画面底边的地面格子，相对墙地交线处放大的倍数。
 * 第一格高度仍等于墙面格子，消失点因此在交线上方，不压在交线上。
 */
export const BLUEPRINT_FLOOR_SPREAD = 2;
/**
 * 完全凸出时，浅色罩在蓝底上的不透明度。
 * 仍比没凸起的格子亮，但不要洗成发白。
 */
export const BLUEPRINT_MAX_LIGHTNESS = 0.18;

export const BLUEPRINT_BLUE = "#11448f";

type View = Pick<World, "w" | "h" | "floorY" | "ballR" | "hoopInner">;
type Rect = { x: number; y: number; w: number; h: number };
type Cell = Rect & { col: number; row: number };

export const BLUEPRINT_SHAPES = ["line", "diag", "z", "l", "s", "u", "v", "c"] as const;
export type BlueprintShape = (typeof BLUEPRINT_SHAPES)[number];
export type BlueprintCellRef = { col: number; row: number };
export type BlueprintAim = {
  goals: number;
  ballX: number;
  ballY: number;
  hoopX: number;
  hoopY: number;
};
export type BlueprintBatch = {
  cells: BlueprintCellRef[];
  duration: number;
  shape: BlueprintShape;
  length: number;
  variant: number;
  mode: "idle" | "path";
  anchor: BlueprintCellRef | null;
};

export type BlueprintClock = {
  seed: number;
  elapsed: number;
  /** 当前这批已经过的秒数。 */
  cycle: number;
  /** 抽出这一批时长时的进球数。 */
  goals: number;
  /** 这一批伸出再缩回的秒数。 */
  duration: number;
  cells: BlueprintCellRef[];
  /** 每换一批加一，用来抽下一个形状。 */
  serial: number;
};
export type BlueprintBlock = {
  id: string;
  index: number;
  col: number;
  row: number;
  dynamic: boolean;
  extend: number;
  /** 格子满尺寸。中心不随伸缩移动。 */
  cell: Rect;
  /** 当前墙体。缩得太小时为 null，否则与整格重合。 */
  solid: Rect | null;
};

/**
 * 投篮弧线附近，按格边长计。只用来选锚点。
 * 篮球两格禁区会拿掉贴着球的格子，所以这条带宽要比禁区稍松，弧线旁的下一圈仍算必经路。
 */
const PATH_REACH = 2;

let seed = Math.random() * 1e6;
let elapsed = 0;
let cycle = 0;
let goals = 0;
let duration = BLUEPRINT_EXTEND_MIN;
let cells: BlueprintCellRef[] = [];
let serial = 0;
let hasBatch = false;
let aim: BlueprintAim | null = null;
let view: View | null = null;

function copyCells(list: readonly BlueprintCellRef[]) {
  return list.map((cell) => ({ col: cell.col, row: cell.row }));
}

export function getBlueprintClock(): BlueprintClock {
  return { seed, elapsed, cycle, goals, duration, serial, cells: copyCells(cells) };
}

export function restoreBlueprintClock(next: BlueprintClock) {
  seed = next.seed;
  elapsed = next.elapsed;
  cycle = next.cycle;
  goals = finiteGoals(next.goals);
  duration = next.duration > 0 ? next.duration : BLUEPRINT_EXTEND_MIN;
  cells = copyCells(next.cells ?? []);
  serial = Number.isFinite(next.serial) ? next.serial : 0;
  hasBatch = true;
}

/** 换场景或回到标题时重新抽一块图纸。 */
export function resetBlueprint(nextSeed = Math.random() * 1e6) {
  seed = nextSeed;
  elapsed = 0;
  cycle = 0;
  goals = 0;
  duration = BLUEPRINT_EXTEND_MIN;
  cells = [];
  serial = 0;
  hasBatch = false;
  aim = null;
}

/** 新一局只清对局秒数。当前这批格子留着，跟标题上看到的一致。 */
export function resetBlueprintProgress() {
  elapsed = 0;
}

function finiteGoals(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function rollCurrent() {
  if (!view) return;
  const goalsNow = aim ? finiteGoals(aim.goals) : goals;
  const ball = aim && Number.isFinite(aim.ballX) && Number.isFinite(aim.ballY) ? { x: aim.ballX, y: aim.ballY } : null;
  const hoop = aim && Number.isFinite(aim.hoopX) && Number.isFinite(aim.hoopY) ? { x: aim.hoopX, y: aim.hoopY } : null;
  const batch = rollBlueprintBatch(view, { seed, serial, goals: goalsNow, ball, hoop });
  goals = goalsNow;
  duration = batch.duration;
  cells = batch.cells;
  hasBatch = true;
}

export function stepBlueprint(dt: number, playing: boolean, next?: BlueprintAim, world?: View) {
  if (next) aim = next;
  if (world) view = { w: world.w, h: world.h, floorY: world.floorY, ballR: world.ballR, hoopInner: world.hoopInner };
  if (!hasBatch) {
    rollCurrent();
    if (hasBatch) cycle = 0;
  }
  if (!(dt > 0)) return;
  if (playing) elapsed += dt;
  let left = dt;
  for (let guard = 0; guard < 8 && left > 1e-8; guard++) {
    const dur = duration > 1e-6 ? duration : BLUEPRINT_EXTEND_MIN;
    const room = dur - cycle;
    if (room > 1e-8 && left < room) {
      cycle += left;
      return;
    }
    if (!view) {
      cycle = Math.min(dur, cycle + left);
      return;
    }
    left -= Math.max(0, room);
    cycle = 0;
    serial += 1;
    rollCurrent();
  }
}

export function blueprintBlockSize(world: Pick<World, "w">) {
  return BLUEPRINT_BLOCK_SIZE * (world.w / 390);
}

export function blueprintGrid(world: View) {
  const size = Math.max(8, blueprintBlockSize(world));
  const cols = Math.max(1, Math.floor(world.w / size));
  const rows = Math.max(1, Math.floor(world.floorY / size));
  const span = rows * size;
  return {
    size,
    cols,
    rows,
    ox: (world.w - cols * size) / 2,
    oy: span <= world.floorY ? world.floorY - span : 0,
  };
}

/** 地面消失点。在交线上方，横向位置取画面中线。 */
export function blueprintVanishingPoint(world: View) {
  const grid = blueprintGrid(world);
  return { x: world.w * 0.5, y: world.floorY - floorVanishingLift(world.h - world.floorY, grid.size) };
}

function floorVanishingLift(depth: number, size: number) {
  const lift = depth / Math.max(0.35, BLUEPRINT_FLOOR_SPREAD - 1);
  return Math.max(size * 1.25, lift);
}

/** 离墙 n 格的地面横线。n = 0 是墙地交线，不是消失点。 */
export function blueprintFloorRowY(world: View, n: number) {
  const size = blueprintGrid(world).size;
  const vp = blueprintVanishingPoint(world);
  const lift = world.floorY - vp.y;
  const denom = lift + size * (1 - n);
  if (denom <= 1e-3) return Number.POSITIVE_INFINITY;
  return vp.y + (lift * (lift + size)) / denom;
}

/** 交线处横坐标 junctionX 的纵线，在画面高度 y 上的位置。 */
export function blueprintFloorDepthX(world: View, junctionX: number, y: number) {
  const vp = blueprintVanishingPoint(world);
  const lift = world.floorY - vp.y;
  if (lift <= 1e-3) return junctionX;
  return vp.x + (junctionX - vp.x) * ((y - vp.y) / lift);
}

/** 左右篮筐所在的竖向通道，方块不得进入。 */
export function blueprintCorridors(world: View) {
  return ([-1, 1] as const).map((side) => {
    const x = side < 0 ? world.hoopInner + world.w * 0.1 : world.w - world.hoopInner - world.w * 0.1;
    const reach = world.hoopInner + world.ballR * 1.35;
    return { side, x0: x - reach, x1: x + reach };
  });
}

function overlapsCorridor(world: View, rect: Rect) {
  return blueprintCorridors(world).some((c) => rect.x < c.x1 && rect.x + rect.w > c.x0);
}

/** 普通一跳的球底高度。格子顶在这条线下面就能被跳过。 */
export function blueprintJumpClearY(world: View) {
  return world.floorY - world.h * 0.185;
}

function cellAllowed(world: View, rect: Rect) {
  if (rect.w < 8 || rect.h < 8) return false;
  if (rect.y < world.h * 0.2) return false;
  if (rect.y + rect.h > world.floorY - world.ballR * 2.35) return false;
  return !overlapsCorridor(world, rect);
}

function hash01(salt: number, cell: Cell) {
  const n = Math.sin(salt * 12.9898 + cell.col * 78.233 + cell.row * 39.425) * 43758.5453;
  return n - Math.floor(n);
}

function allowedCells(world: View): Cell[] {
  const grid = blueprintGrid(world);
  const cells: Cell[] = [];
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const rect = {
        col,
        row,
        x: grid.ox + col * grid.size,
        y: grid.oy + row * grid.size,
        w: grid.size,
        h: grid.size,
      };
      if (cellAllowed(world, rect)) cells.push(rect);
    }
  }
  return cells;
}

function unitAt(layoutSeed: number, batchSerial: number, channel: number) {
  const n = Math.sin(layoutSeed * 12.9898 + (batchSerial + 1) * 78.233 + (channel + 1) * 39.425) * 43758.5453;
  return n - Math.floor(n);
}

function clampInt(value: number, lo: number, hi: number) {
  const n = Math.floor(Number.isFinite(value) ? value : lo);
  return Math.min(hi, Math.max(lo, n));
}

/** 本批格数不超过同时凸出上限。时间爬坡已删除。 */
export function blueprintQuota(requested: number) {
  if (!Number.isFinite(requested) || requested <= 0) return 0;
  return Math.min(BLUEPRINT_MAX_COUNT, Math.floor(requested));
}

/** 时长区间 `[1, min(6, 1 + 0.2 × 进球数)]`。 */
export function blueprintExtendSpan(made: number) {
  const goalsNow = finiteGoals(made);
  const minTenths = Math.round(BLUEPRINT_EXTEND_MIN * 10);
  const stepTenths = Math.round(BLUEPRINT_EXTEND_PER_GOAL * 10);
  const capTenths = Math.round(BLUEPRINT_EXTEND_CAP * 10);
  const maxTenths = Math.min(capTenths, minTenths + stepTenths * goalsNow);
  return { min: minTenths / 10, max: maxTenths / 10 };
}

/** `roll` 为 0 取下限，为 1 取上限。 */
export function blueprintSampleDuration(made: number, roll: number) {
  const span = blueprintExtendSpan(made);
  if (span.max <= span.min) return span.min;
  const t = Math.min(1, Math.max(0, Number.isFinite(roll) ? roll : 0));
  return span.min + (span.max - span.min) * t;
}

const FIXED_SHAPES: Record<Exclude<BlueprintShape, "line" | "diag">, readonly { c: number; r: number }[]> = {
  z: [
    { c: 0, r: 0 },
    { c: 1, r: 0 },
    { c: 1, r: 1 },
    { c: 2, r: 1 },
  ],
  l: [
    { c: 0, r: 0 },
    { c: 0, r: 1 },
    { c: 0, r: 2 },
    { c: 1, r: 2 },
  ],
  s: [
    { c: 1, r: 0 },
    { c: 2, r: 0 },
    { c: 0, r: 1 },
    { c: 1, r: 1 },
  ],
  u: [
    { c: 0, r: 0 },
    { c: 2, r: 0 },
    { c: 0, r: 1 },
    { c: 2, r: 1 },
    { c: 0, r: 2 },
    { c: 1, r: 2 },
    { c: 2, r: 2 },
  ],
  v: [
    { c: 0, r: 0 },
    { c: 1, r: 1 },
    { c: 2, r: 2 },
    { c: 3, r: 1 },
    { c: 4, r: 0 },
  ],
  c: [
    { c: 0, r: 0 },
    { c: 1, r: 0 },
    { c: 2, r: 0 },
    { c: 0, r: 1 },
    { c: 0, r: 2 },
    { c: 1, r: 2 },
    { c: 2, r: 2 },
  ],
};

/** 形状的原始偏移。直线 1～6 格，斜线 2～4 格，其余为固定图案。 */
export function blueprintShapeOffsets(shape: BlueprintShape, length = 4) {
  if (shape === "line") {
    const n = clampInt(length, 1, 6);
    return Array.from({ length: n }, (_, i) => ({ c: i, r: 0 }));
  }
  if (shape === "diag") {
    const n = clampInt(length, 2, 4);
    return Array.from({ length: n }, (_, i) => ({ c: i, r: i }));
  }
  return FIXED_SHAPES[shape].map((cell) => ({ c: cell.c, r: cell.r }));
}

function transformOffsets(offsets: { c: number; r: number }[], variant: number) {
  const mirror = ((Math.floor(variant) % 8) + 8) % 8 >= 4;
  const rot = ((Math.floor(variant) % 4) + 4) % 4;
  return offsets.map(({ c, r }) => {
    let x = mirror ? -c : c;
    let y = r;
    for (let i = 0; i < rot; i++) {
      const nx = -y;
      const ny = x;
      x = nx;
      y = ny;
    }
    return { c: x, r: y };
  });
}

/** 把形状放到锚点上。锚点是旋转、镜像之后包围盒的左上角。 */
export function blueprintStamp(shape: BlueprintShape, length: number, variant: number, anchor: BlueprintCellRef) {
  const offsets = transformOffsets(blueprintShapeOffsets(shape, length), variant);
  const minC = Math.min(...offsets.map((cell) => cell.c));
  const minR = Math.min(...offsets.map((cell) => cell.r));
  return offsets.map((cell) => ({ col: anchor.col + (cell.c - minC), row: anchor.row + (cell.r - minR) }));
}

/** 裁到合法格，并停在同时凸出上限。 */
export function clipBlueprintCells(stamped: readonly BlueprintCellRef[], allowed: (col: number, row: number) => boolean) {
  const out: BlueprintCellRef[] = [];
  const seen = new Set<string>();
  for (const cell of stamped) {
    const key = `${cell.col}:${cell.row}`;
    if (seen.has(key) || !allowed(cell.col, cell.row)) continue;
    seen.add(key);
    out.push({ col: cell.col, row: cell.row });
    if (out.length >= BLUEPRINT_MAX_COUNT) break;
  }
  return out;
}

export function blueprintNearBall(world: View, cell: Rect, ball: { x: number; y: number }) {
  const size = blueprintGrid(world).size;
  const cx = cell.x + cell.w / 2;
  const cy = cell.y + cell.h / 2;
  return Math.hypot(cx - ball.x, cy - ball.y) <= BLUEPRINT_BALL_CLEAR * size + 1e-6;
}

function shotArc(ball: { x: number; y: number }, hoop: { x: number; y: number }, t: number) {
  const x = ball.x + (hoop.x - ball.x) * t;
  const y = ball.y + (hoop.y - ball.y) * t;
  const chord = Math.hypot(hoop.x - ball.x, hoop.y - ball.y);
  const lift = Math.sin(Math.PI * t) * Math.max(chord * 0.18, 1);
  return { x, y: y - lift };
}

/** 格子中心离球到筐的弧线够近，就算投篮必经路。 */
export function blueprintOnShotPath(world: View, cell: Rect, ball: { x: number; y: number }, hoop: { x: number; y: number }) {
  const size = blueprintGrid(world).size;
  const cx = cell.x + cell.w / 2;
  const cy = cell.y + cell.h / 2;
  let best = Infinity;
  for (let i = 0; i <= 24; i++) {
    const point = shotArc(ball, hoop, i / 24);
    const dist = Math.hypot(cx - point.x, cy - point.y);
    if (dist < best) best = dist;
  }
  return best <= PATH_REACH * size;
}

export function blueprintLegalCells(world: View, ball?: { x: number; y: number } | null) {
  return allowedCells(world).filter((cell) => !ball || !blueprintNearBall(world, cell, ball));
}

function shapeLength(shape: BlueprintShape, requested: number) {
  if (shape === "line") return clampInt(requested, 1, 6);
  if (shape === "diag") return clampInt(requested, 2, 4);
  return blueprintShapeOffsets(shape).length;
}

/** 抽一批凸出。时长跟进球数走，格子是一个形状裁完的结果。 */
export function rollBlueprintBatch(
  world: View,
  opts: {
    seed: number;
    serial: number;
    goals: number;
    ball?: { x: number; y: number } | null;
    hoop?: { x: number; y: number } | null;
  },
): BlueprintBatch {
  const layoutSeed = Number.isFinite(opts.seed) ? opts.seed : 1;
  const batchSerial = Number.isFinite(opts.serial) ? opts.serial : 0;
  const made = finiteGoals(opts.goals);
  const shape = BLUEPRINT_SHAPES[Math.min(BLUEPRINT_SHAPES.length - 1, Math.floor(unitAt(layoutSeed, batchSerial, 1) * BLUEPRINT_SHAPES.length))]!;
  const requested = 1 + Math.min(5, Math.floor(unitAt(layoutSeed, batchSerial, 2) * 6));
  const length = shapeLength(shape, requested);
  const variant = Math.min(7, Math.floor(unitAt(layoutSeed, batchSerial, 3) * 8));
  const duration = blueprintSampleDuration(made, unitAt(layoutSeed, batchSerial, 0));
  const ball = opts.ball && Number.isFinite(opts.ball.x) && Number.isFinite(opts.ball.y) ? opts.ball : null;
  const hoop = opts.hoop && Number.isFinite(opts.hoop.x) && Number.isFinite(opts.hoop.y) ? opts.hoop : null;
  const legal = blueprintLegalCells(world, ball);
  const allowed = new Set(legal.map((cell) => `${cell.col}:${cell.row}`));
  const path = ball && hoop ? legal.filter((cell) => blueprintOnShotPath(world, cell, ball, hoop)) : [];
  const wantPath = unitAt(layoutSeed, batchSerial, 4) < 0.5 && path.length > 0;
  const pool = wantPath ? path : legal;
  const mode: "idle" | "path" = wantPath ? "path" : "idle";
  const ordered = pool.slice().sort((a, b) => hash01(layoutSeed + batchSerial * 3.1, a) - hash01(layoutSeed + batchSerial * 3.1, b) || a.row - b.row || a.col - b.col);
  let placed: BlueprintCellRef[] = [];
  let anchor: BlueprintCellRef | null = null;
  for (const cell of ordered) {
    const stamped = blueprintStamp(shape, length, variant, { col: cell.col, row: cell.row });
    const kept = clipBlueprintCells(stamped, (col, row) => allowed.has(`${col}:${row}`));
    if (kept.length > placed.length) {
      placed = kept;
      anchor = { col: cell.col, row: cell.row };
    }
  }
  const capped = placed.slice(0, blueprintQuota(placed.length));
  return { cells: capped, duration, shape, length, variant, mode, anchor: capped.length ? anchor : null };
}

/** 0 贴平，1 完全凸出。周期结束回到 0，没有一直凸着的墙。 */
export function blueprintExtend(age: number, span = BLUEPRINT_EXTEND_MIN) {
  const period = span > 1e-6 ? span : BLUEPRINT_EXTEND_MIN;
  let t = age % period;
  if (t < 0) t += period;
  const phase = t / period;
  return 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
}

export function solidFromCell(cell: Rect, extend: number): Rect | null {
  if (extend < BLUEPRINT_HIT_EXTEND) return null;
  // 画面上亮的就是整格。碰撞盒若从中心慢慢放大，会在球底下继续往外长，
  // 球每帧都被重新嵌进去。一旦算凸出，整格就是墙。
  return { x: cell.x, y: cell.y, w: cell.w, h: cell.h };
}

export function blueprintBlocks(world: View, clock = getBlueprintClock()): BlueprintBlock[] {
  const grid = blueprintGrid(world);
  const span = clock.duration > 0 ? clock.duration : BLUEPRINT_EXTEND_MIN;
  const extend = blueprintExtend(clock.cycle, span);
  const blocks: BlueprintBlock[] = [];
  for (const ref of clock.cells ?? []) {
    if (blocks.length >= BLUEPRINT_MAX_COUNT) break;
    if (ref.col < 0 || ref.row < 0 || ref.col >= grid.cols || ref.row >= grid.rows) continue;
    const rect = {
      col: ref.col,
      row: ref.row,
      x: grid.ox + ref.col * grid.size,
      y: grid.oy + ref.row * grid.size,
      w: grid.size,
      h: grid.size,
    };
    if (!cellAllowed(world, rect)) continue;
    const base = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
    blocks.push({
      id: `${ref.col}:${ref.row}`,
      index: blocks.length,
      col: ref.col,
      row: ref.row,
      dynamic: true,
      extend,
      cell: base,
      solid: solidFromCell(base, extend),
    });
  }
  return blocks;
}

type Sweep = { t: number; nx: number; ny: number; depth: number };

/** 连续圆-矩形扫掠，避免高速投篮穿透方块。 */
export function sweepBlueprintCircle(x: number, y: number, dx: number, dy: number, r: number, box: Rect): Sweep | null {
  let best: Sweep | null = null;
  const add = (t: number, nx: number, ny: number, depth = 0) => {
    if (t >= 0 && t <= 1 && (!best || t < best.t)) best = { t, nx, ny, depth };
  };
  const qx = Math.max(box.x, Math.min(box.x + box.w, x));
  const qy = Math.max(box.y, Math.min(box.y + box.h, y));
  const dist = Math.hypot(x - qx, y - qy);
  if (dist < r) {
    if (dist > 1e-8) return { t: 0, nx: (x - qx) / dist, ny: (y - qy) / dist, depth: r - dist };
    const sides = [
      { d: x - box.x, nx: -1, ny: 0 },
      { d: box.x + box.w - x, nx: 1, ny: 0 },
      { d: y - box.y, nx: 0, ny: -1 },
      { d: box.y + box.h - y, nx: 0, ny: 1 },
    ];
    // 人还在往上跳时，不要从底边把球推下去，否则起跳会被墙体折返，卡在格子下沿。
    const movingUp = dy < -1;
    const pool = movingUp ? sides.filter((side) => side.ny <= 0) : sides;
    const ranked = (pool.length ? pool : sides).slice().sort((a, b) => a.d - b.d);
    const pick = ranked[0]!;
    return { t: 0, nx: pick.nx, ny: pick.ny, depth: r + pick.d };
  }
  for (const [edge, nx] of [
    [box.x - r, -1],
    [box.x + box.w + r, 1],
  ] as const) {
    if (dx * nx < 0) {
      const t = (edge - x) / dx;
      const py = y + dy * t;
      if (py >= box.y && py <= box.y + box.h) add(t, nx, 0);
    }
  }
  for (const [edge, ny] of [
    [box.y - r, -1],
    [box.y + box.h + r, 1],
  ] as const) {
    if (dy * ny < 0) {
      const t = (edge - y) / dy;
      const px = x + dx * t;
      if (px >= box.x && px <= box.x + box.w) add(t, 0, ny);
    }
  }
  const a = dx * dx + dy * dy;
  if (a > 1e-12) {
    for (const cx of [box.x, box.x + box.w]) {
      for (const cy of [box.y, box.y + box.h]) {
        const ox = x - cx;
        const oy = y - cy;
        const b = 2 * (ox * dx + oy * dy);
        const c = ox * ox + oy * oy - r * r;
        const disc = b * b - 4 * a * c;
        if (disc < 0) continue;
        const t = (-b - Math.sqrt(disc)) / (2 * a);
        const nx = (x + dx * t - cx) / r;
        const ny = (y + dy * t - cy) / r;
        if ((cx === box.x ? nx <= 0 : nx >= 0) && (cy === box.y ? ny <= 0 : ny >= 0) && dx * nx + dy * ny < 0) add(t, nx, ny);
      }
    }
  }
  return best;
}

type MovingBall = { x: number; y: number; vx: number; vy: number; r: number };

function circleHits(x: number, y: number, r: number, box: Rect) {
  const qx = Math.max(box.x, Math.min(box.x + box.w, x));
  const qy = Math.max(box.y, Math.min(box.y + box.h, y));
  return Math.hypot(x - qx, y - qy) < r - 1e-3;
}

/** 顶面反弹至少要盖过一帧重力，否则球会被按在格子上不动。 */
function topEscapeSpeed(world: View) {
  const g = world.h * 3.1;
  const hop = Math.max(8, world.ballR) * BLUEPRINT_BOUNCE_CLEAR;
  return Math.max(g / 60 + 24, Math.sqrt(2 * g * hop));
}

export function collideBlueprint(
  world: View,
  ball: MovingBall,
  prevX: number,
  prevY: number,
  blockImpact?: (nx: number, ny: number) => boolean,
  clock?: BlueprintClock,
) {
  const dx = ball.x - prevX;
  const dy = ball.y - prevY;
  let hit: (Sweep & { box: Rect }) | null = null;
  for (const block of blueprintBlocks(world, clock)) {
    if (!block.solid) continue;
    const found = sweepBlueprintCircle(prevX, prevY, dx, dy, ball.r, block.solid);
    if (found && (!hit || found.t < hit.t)) hit = { ...found, box: block.solid };
  }
  if (!hit) return false;
  if (blockImpact?.(hit.nx, hit.ny)) return false;
  const skin = 0.35;
  const remain = 1 - hit.t;
  let sx = dx * remain;
  let sy = dy * remain;
  const into = sx * hit.nx + sy * hit.ny;
  if (into < 0) {
    sx -= into * hit.nx;
    sy -= into * hit.ny;
  }
  let x = prevX + dx * hit.t + hit.nx * (hit.depth + skin) + sx;
  let y = prevY + dy * hit.t + hit.ny * (hit.depth + skin) + sy;
  // 贴着墙滑的那段如果又扎回去，就只沿法线推出，避免切向位移把球留在格子里。
  if (circleHits(x, y, ball.r, hit.box)) {
    x = prevX + dx * hit.t + hit.nx * (hit.depth + skin);
    y = prevY + dy * hit.t + hit.ny * (hit.depth + skin);
  }
  ball.x = x;
  ball.y = y;
  const vn = ball.vx * hit.nx + ball.vy * hit.ny;
  if (vn < 0) {
    ball.vx -= BLUEPRINT_BOUNCE * vn * hit.nx;
    ball.vy -= BLUEPRINT_BOUNCE * vn * hit.ny;
  }
  const vnOut = ball.vx * hit.nx + ball.vy * hit.ny;
  const embedded = hit.t === 0 && hit.depth > 0.5;
  const landedOnTop = hit.ny < -0.5;
  const escape = topEscapeSpeed(world);
  if ((vn < 0 && landedOnTop) || embedded) {
    if (vnOut < escape) {
      const add = escape - vnOut;
      ball.vx += add * hit.nx;
      ball.vy += add * hit.ny;
    }
    // 格子只有一格宽。反弹已经小到会贴住时，顺手推向更近的侧边，球会滑下去而不是停在顶上。
    if (landedOnTop && vn < 0 && -ball.vy <= escape + 1) {
      const mid = hit.box.x + hit.box.w / 2;
      const dir = Math.abs(ball.vx) > 40 ? Math.sign(ball.vx) : ball.x <= mid ? -1 : 1;
      const slide = Math.max(80, world.ballR * 7);
      if (Math.abs(ball.vx) < slide) ball.vx = (dir || 1) * slide;
    }
  }
  return true;
}

function strokeGrid(ctx: CanvasRenderingContext2D, world: View) {
  const grid = blueprintGrid(world);
  const drawLines = (major: boolean) => {
    ctx.beginPath();
    const visit = (origin: number, limit: number, horizontal: boolean) => {
      for (let i = -2; i < 80; i++) {
        const p = origin + i * grid.size;
        if (p < -1 || p > limit + 1) continue;
        const index = Math.round((p - origin) / grid.size);
        if (major !== (index % 4 === 0)) continue;
        const line = Math.round(p) + 0.5;
        if (horizontal) {
          ctx.moveTo(0, line);
          ctx.lineTo(world.w, line);
        } else {
          ctx.moveTo(line, 0);
          ctx.lineTo(line, world.floorY);
        }
      }
    };
    visit(grid.ox, world.w, false);
    visit(grid.oy, world.floorY, true);
    ctx.stroke();
  };
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.34)";
  drawLines(false);
  ctx.strokeStyle = "rgba(255,255,255,0.72)";
  drawLines(true);
}

function strokeWhite(ctx: CanvasRenderingContext2D, major: boolean) {
  ctx.lineWidth = 1;
  ctx.strokeStyle = major ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.34)";
  ctx.stroke();
}

function drawPerspectiveFloor(ctx: CanvasRenderingContext2D, world: View) {
  const { w, h, floorY } = world;
  const depth = h - floorY;
  if (depth < 4) return;
  const grid = blueprintGrid(world);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, floorY, w, depth + 1);
  ctx.clip();
  const drawDepth = (major: boolean) => {
    ctx.beginPath();
    for (let i = 0; i <= grid.cols; i++) {
      if (major !== (i % 4 === 0)) continue;
      const x = Math.round(grid.ox + i * grid.size);
      ctx.moveTo(x + 0.5, floorY);
      ctx.lineTo(blueprintFloorDepthX(world, x, h + 1) + 0.5, h + 1);
    }
    strokeWhite(ctx, major);
  };
  const drawBands = (major: boolean) => {
    ctx.beginPath();
    for (let n = 1; n < 16; n++) {
      if (major !== (n % 4 === 0)) continue;
      const y = blueprintFloorRowY(world, n);
      if (y > h - 1) break;
      if (y <= floorY + 0.5) continue;
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
    }
    strokeWhite(ctx, major);
  };
  drawDepth(false);
  drawBands(false);
  drawDepth(true);
  drawBands(true);
  ctx.restore();
}

/** 凸出填色的不透明度。完全凸出时等于 BLUEPRINT_MAX_LIGHTNESS。 */
export function blueprintFillAlpha(extend: number) {
  const min = 0.06;
  const t = Math.min(1, Math.max(0, extend));
  return min + (BLUEPRINT_MAX_LIGHTNESS - min) * t;
}

/** 填色贴在四条网格线的内侧，阴影从底边那条线的下一像素向下拉。 */
export function blueprintCellPixels(cell: Rect) {
  const left = Math.round(cell.x);
  const top = Math.round(cell.y);
  const right = Math.round(cell.x + cell.w);
  const bottom = Math.round(cell.y + cell.h);
  return {
    left,
    top,
    right,
    bottom,
    fill: { x: left + 1, y: top + 1, w: Math.max(0, right - left - 1), h: Math.max(0, bottom - top - 1) },
  };
}

export type BlueprintShadowBox = { x: number; y: number; w: number; h: number };
export type BlueprintShadowPiece = BlueprintShadowBox & { keep: number };

/** 直边阴影的长度。越凸越长，和原来的公式一样。 */
export function blueprintShadowCast(cellHeight: number, extend: number) {
  return Math.max(4, Math.round(cellHeight * (0.28 + 1.05 * extend)));
}

/** 贴着底边时的阴影不透明度。远端渐淡到 0。 */
export function blueprintShadowHead(extend: number) {
  return 0.42 + 0.4 * extend;
}

/**
 * 阴影上一点的不透明度。`along` 是离底边的像素距离，`keep` 是下方格子还没吃掉的比例。
 * 没有下方格子时 keep 为 1。
 */
export function blueprintShadowAlpha(extend: number, along: number, cast: number, keep = 1) {
  if (!(cast > 0) || along < 0 || along > cast) return 0;
  const scale = Math.min(1, Math.max(0, keep));
  return blueprintShadowHead(extend) * scale * (1 - along / cast);
}

/** 下方格子还留着的阴影比例。完全凸出时为 0。 */
export function blueprintShadowKeep(lowerExtend: number) {
  return 1 - Math.min(1, Math.max(0, lowerExtend));
}

/** 从底边下一像素开始的直边阴影。 */
export function blueprintShadowBox(cell: Rect, extend: number): BlueprintShadowBox {
  const { left, right, bottom } = blueprintCellPixels(cell);
  return {
    x: left,
    y: bottom + 1,
    w: Math.max(0, right - left + 1),
    h: blueprintShadowCast(cell.h, extend),
  };
}

/** 凸出格在画面上占的整格，含网格线。阴影和它对上的一段会被吃掉。 */
export function blueprintCellCover(cell: Rect): BlueprintShadowBox {
  const { left, top, right, bottom } = blueprintCellPixels(cell);
  return { x: left, y: top, w: Math.max(0, right - left + 1), h: Math.max(0, bottom - top + 1) };
}

function shadowOverlaps(a: BlueprintShadowBox, b: BlueprintShadowBox) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function uniqueSorted(values: number[]) {
  return [...new Set(values)].sort((a, b) => a - b);
}

/**
 * 把一条阴影切成若干块。没有下方凸出格时就是整条、keep 为 1。
 * 落在下方格子上的块，keep 等于 `1 - 下方凸出`；完全凸出则 keep 为 0。
 */
export function blueprintShadowPieces(
  shadow: BlueprintShadowBox,
  lowers: readonly { box: BlueprintShadowBox; extend: number }[],
): BlueprintShadowPiece[] {
  if (!(shadow.w > 0) || !(shadow.h > 0)) return [];
  const hits = lowers.filter((lower) => lower.extend > 0 && shadowOverlaps(shadow, lower.box));
  if (hits.length === 0) return [{ x: shadow.x, y: shadow.y, w: shadow.w, h: shadow.h, keep: 1 }];
  const y0 = shadow.y;
  const y1 = shadow.y + shadow.h;
  const x0 = shadow.x;
  const x1 = shadow.x + shadow.w;
  const ys = [y0, y1];
  for (const hit of hits) {
    const top = Math.max(y0, hit.box.y);
    const bot = Math.min(y1, hit.box.y + hit.box.h);
    if (bot > top) ys.push(top, bot);
  }
  const pieces: BlueprintShadowPiece[] = [];
  for (const [top, bot] of pairs(uniqueSorted(ys))) {
    const midY = (top + bot) / 2;
    const rowHits = hits.filter((hit) => hit.box.y <= midY && midY < hit.box.y + hit.box.h);
    const xs = [x0, x1];
    for (const hit of rowHits) {
      const left = Math.max(x0, hit.box.x);
      const right = Math.min(x1, hit.box.x + hit.box.w);
      if (right > left) xs.push(left, right);
    }
    for (const [left, right] of pairs(uniqueSorted(xs))) {
      const midX = (left + right) / 2;
      let keep = 1;
      for (const hit of rowHits) {
        if (hit.box.x <= midX && midX < hit.box.x + hit.box.w) keep = Math.min(keep, blueprintShadowKeep(hit.extend));
      }
      pieces.push({ x: left, y: top, w: right - left, h: bot - top, keep });
    }
  }
  return pieces;
}

function pairs(cuts: number[]) {
  const spans: [number, number][] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const start = cuts[i]!;
    const end = cuts[i + 1]!;
    if (end > start) spans.push([start, end]);
  }
  return spans;
}

function paintShadow(ctx: CanvasRenderingContext2D, full: BlueprintShadowBox, piece: BlueprintShadowPiece, extend: number) {
  if (piece.keep <= 0 || piece.w <= 0 || piece.h <= 0) return;
  const head = blueprintShadowHead(extend) * piece.keep;
  const grad = ctx.createLinearGradient(0, full.y, 0, full.y + full.h);
  grad.addColorStop(0, `rgba(1, 8, 22, ${head})`);
  grad.addColorStop(1, "rgba(1, 8, 22, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(piece.x, piece.y, piece.w, piece.h);
}

function drawBlock(ctx: CanvasRenderingContext2D, block: BlueprintBlock, others: readonly BlueprintBlock[]) {
  const extend = block.extend;
  if (extend < 0.04) return;
  const { fill } = blueprintCellPixels(block.cell);
  const shadow = blueprintShadowBox(block.cell, extend);
  const lowers = others
    .filter((other) => other !== block && other.extend > 0)
    .map((other) => ({ box: blueprintCellCover(other.cell), extend: other.extend }));
  for (const piece of blueprintShadowPieces(shadow, lowers)) paintShadow(ctx, shadow, piece, extend);
  ctx.fillStyle = `rgba(236, 244, 255, ${blueprintFillAlpha(extend)})`;
  ctx.fillRect(fill.x, fill.y, fill.w, fill.h);
}

export function drawBlueprint(ctx: CanvasRenderingContext2D, world: View) {
  ctx.fillStyle = BLUEPRINT_BLUE;
  ctx.fillRect(0, 0, world.w, world.h);
  strokeGrid(ctx, world);
  drawPerspectiveFloor(ctx, world);
  const blocks = blueprintBlocks(world).slice().sort((a, b) => a.cell.y - b.cell.y || a.cell.x - b.cell.x);
  for (const block of blocks) drawBlock(ctx, block, blocks);
}
