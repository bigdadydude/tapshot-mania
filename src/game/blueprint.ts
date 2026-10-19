import type { World } from "./types";

/**
 * 蓝图场景，阶段 1。
 * 网格和伸缩方块放在独立模块里，不写进静态 ScenePack。
 * 阶段 2 以后的激光、发射器和图纸系统不在这里。
 */

/** 方块边长，按画面宽 390 换算。 */
export const BLUEPRINT_BLOCK_SIZE = 44;
/** 同时存在的凸出方块上限。 */
export const BLUEPRINT_MAX_COUNT = 6;
/** 每多出现一个方块所需的对局秒数。 */
export const BLUEPRINT_RAMP_PACE = 10;
/** 动态方块伸出再缩回一圈的秒数。 */
export const BLUEPRINT_EXTEND_PERIOD = 2.6;
/** 开局就在场上的方块数（前两格固定，第三格起为动态）。 */
export const BLUEPRINT_START_COUNT = 3;
/** 缩到这个比例以下就不再挡球。 */
export const BLUEPRINT_HIT_EXTEND = 0.12;
/** 相邻动态方块的相位差，占一个伸缩周期的比例。 */
export const BLUEPRINT_STAGGER = 0.37;
/** 撞上方块时的分离系数。1.65 表示反弹保留约 0.65 的法向速度。 */
export const BLUEPRINT_BOUNCE = 1.65;
/**
 * 画面底边的地面格子，相对墙地交线处放大的倍数。
 * 第一格高度仍等于墙面格子，消失点因此在交线上方，不压在交线上。
 */
export const BLUEPRINT_FLOOR_SPREAD = 2;

export const BLUEPRINT_BLUE = "#11448f";

type View = Pick<World, "w" | "h" | "floorY" | "ballR" | "hoopInner">;
type Rect = { x: number; y: number; w: number; h: number };
type Cell = Rect & { col: number; row: number };

export type BlueprintClock = { seed: number; elapsed: number; cycle: number };
export type BlueprintBlock = {
  id: string;
  index: number;
  col: number;
  row: number;
  dynamic: boolean;
  extend: number;
  /** 格子满尺寸。中心不随伸缩移动。 */
  cell: Rect;
  /** 当前实体。缩得太小时为 null。 */
  solid: Rect | null;
};

let seed = Math.random() * 1e6;
let elapsed = 0;
let cycle = 0;

export function getBlueprintClock(): BlueprintClock {
  return { seed, elapsed, cycle };
}

export function restoreBlueprintClock(next: BlueprintClock) {
  seed = next.seed;
  elapsed = next.elapsed;
  cycle = next.cycle;
}

/** 换场景或回到标题时重新抽一块图纸。 */
export function resetBlueprint(nextSeed = Math.random() * 1e6) {
  seed = nextSeed;
  elapsed = 0;
  cycle = 0;
}

/** 新一局只清进程，格子布局跟标题上看到的一致。 */
export function resetBlueprintProgress() {
  elapsed = 0;
}

export function stepBlueprint(dt: number, playing: boolean) {
  if (!(dt > 0)) return;
  cycle += dt;
  if (playing) elapsed += dt;
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

function pickSlots(world: View, layoutSeed: number) {
  const all = allowedCells(world);
  const byHash = (a: Cell, b: Cell) => hash01(layoutSeed, a) - hash01(layoutSeed, b) || a.row - b.row || a.col - b.col;
  const jump = all.filter((cell) => cell.y > blueprintJumpClearY(world)).sort(byHash);
  const high = all.filter((cell) => cell.y <= blueprintJumpClearY(world)).sort(byHash);
  const ordered = [...jump, ...high];
  const chosen: Cell[] = [];
  const rowWidth = (row: number) => all.filter((cell) => cell.row === row).length;
  const accept = (cell: Cell, loose: boolean) => {
    if (chosen.some((other) => other.col === cell.col && other.row === cell.row)) return false;
    const rowMates = chosen.filter((other) => other.row === cell.row);
    const cap = rowWidth(cell.row) >= 3 ? 2 : 1;
    if (rowMates.length >= (loose ? 1 : cap)) return false;
    if (!loose && rowMates.some((other) => Math.abs(other.col - cell.col) <= 1)) return false;
    const colMates = chosen.filter((other) => other.col === cell.col);
    if (colMates.length >= 3) return false;
    if (colMates.some((other) => Math.abs(other.row - cell.row) <= 1)) return false;
    return true;
  };
  for (const cell of ordered) {
    if (chosen.length >= BLUEPRINT_MAX_COUNT) break;
    if (accept(cell, false)) chosen.push(cell);
  }
  if (chosen.length < Math.min(BLUEPRINT_START_COUNT, all.length)) {
    for (const cell of ordered) {
      if (chosen.length >= BLUEPRINT_MAX_COUNT) break;
      if (accept(cell, true)) chosen.push(cell);
    }
  }
  return chosen;
}

export function blueprintQuota(playSeconds: number, available: number) {
  const extra = Math.max(0, Math.floor(Math.max(0, playSeconds) / BLUEPRINT_RAMP_PACE));
  return Math.max(0, Math.min(available, BLUEPRINT_MAX_COUNT, BLUEPRINT_START_COUNT + extra));
}

export function blueprintExtend(dynamic: boolean, anim: number, index: number) {
  if (!dynamic) return 1;
  const period = BLUEPRINT_EXTEND_PERIOD;
  let t = (anim + index * period * BLUEPRINT_STAGGER) % period;
  if (t < 0) t += period;
  const phase = t / period;
  return 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
}

export function solidFromCell(cell: Rect, extend: number): Rect | null {
  if (extend < BLUEPRINT_HIT_EXTEND) return null;
  const inset = (1 - extend) * cell.w * 0.5;
  return { x: cell.x + inset, y: cell.y + inset, w: cell.w - inset * 2, h: cell.h - inset * 2 };
}

export function blueprintBlocks(world: View, clock = getBlueprintClock()): BlueprintBlock[] {
  const slots = pickSlots(world, clock.seed);
  const count = blueprintQuota(clock.elapsed, slots.length);
  return slots.slice(0, count).map((cell, index) => {
    const dynamic = index >= 2;
    const extend = blueprintExtend(dynamic, clock.cycle, index);
    const base = { x: cell.x, y: cell.y, w: cell.w, h: cell.h };
    return {
      id: `${cell.col}:${cell.row}`,
      index,
      col: cell.col,
      row: cell.row,
      dynamic,
      extend,
      cell: base,
      solid: solidFromCell(base, extend),
    };
  });
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
    sides.sort((a, b) => a.d - b.d);
    return { t: 0, nx: sides[0]!.nx, ny: sides[0]!.ny, depth: r + sides[0]!.d };
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
  let hit: Sweep | null = null;
  for (const block of blueprintBlocks(world, clock)) {
    if (!block.solid) continue;
    const found = sweepBlueprintCircle(prevX, prevY, dx, dy, ball.r, block.solid);
    if (found && (!hit || found.t < hit.t)) hit = found;
  }
  if (!hit) return false;
  if (blockImpact?.(hit.nx, hit.ny)) return false;
  ball.x = prevX + dx * hit.t + hit.nx * (hit.depth + 0.25);
  ball.y = prevY + dy * hit.t + hit.ny * (hit.depth + 0.25);
  const vn = ball.vx * hit.nx + ball.vy * hit.ny;
  if (vn < 0) {
    ball.vx -= BLUEPRINT_BOUNCE * vn * hit.nx;
    ball.vy -= BLUEPRINT_BOUNCE * vn * hit.ny;
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
        if (horizontal) {
          ctx.moveTo(0, p + 0.5);
          ctx.lineTo(world.w, p + 0.5);
        } else {
          ctx.moveTo(p + 0.5, 0);
          ctx.lineTo(p + 0.5, world.floorY);
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
      const x = grid.ox + i * grid.size + 0.5;
      ctx.moveTo(x, floorY);
      ctx.lineTo(blueprintFloorDepthX(world, x - 0.5, h + 1) + 0.5, h + 1);
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

function drawBlock(ctx: CanvasRenderingContext2D, block: BlueprintBlock) {
  const extend = block.extend;
  if (extend < 0.04) return;
  const cell = block.cell;
  const inset = (1 - extend) * cell.w * 0.5;
  const x = cell.x + inset;
  const y = cell.y + inset;
  const w = Math.max(0, cell.w - inset * 2);
  const h = Math.max(0, cell.h - inset * 2);
  const ry = Math.max(4, h * (0.1 + 0.16 * extend));
  const alpha = 0.34 + 0.48 * extend;
  ctx.save();
  ctx.fillStyle = `rgba(1, 8, 24, ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h + 2 + ry, Math.max(2, w * 0.46), ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawBlueprint(ctx: CanvasRenderingContext2D, world: View) {
  ctx.fillStyle = BLUEPRINT_BLUE;
  ctx.fillRect(0, 0, world.w, world.h);
  strokeGrid(ctx, world);
  drawPerspectiveFloor(ctx, world);
  const blocks = blueprintBlocks(world).slice().sort((a, b) => a.cell.y - b.cell.y || a.cell.x - b.cell.x);
  for (const block of blocks) drawBlock(ctx, block);
}
