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
/** 同时凸出的格子上限（静态 + 动态合计）。 */
export const BLUEPRINT_MAX_COUNT = 10;
/**
 * 一批从贴平升到完全凸出的秒数。
 * 静态升满后保持到下一次进球；动态升满后进入 hold / cross。
 */
export const BLUEPRINT_RAISE = 0.35;
/**
 * 动态挪一步时：缩回 / 再升起各用这么久。
 * 比首升短，整组一起收一起伸，看起来更齐。
 */
export const BLUEPRINT_CROSS_RAISE = 0.2;
/** @deprecated 旧周期下限；现改用 BLUEPRINT_RAISE，保留别名以免外部旧引用断裂。 */
export const BLUEPRINT_EXTEND_MIN = BLUEPRINT_RAISE;
/** 从第 2 球起，每多一球给「复数凸起」加的偏置（叠到约 0.9）。 */
export const BLUEPRINT_MULTI_PER_GOAL = 0.12;
/** 进球时若场上无动态，尝试生成一组的概率。 */
export const BLUEPRINT_DYNAMIC_SPAWN = 0.45;
/** 进球时动态整组消失：起步概率。 */
export const BLUEPRINT_DESPAWN_BASE = 0.15;
/** 每多一球，消失概率增加。 */
export const BLUEPRINT_DESPAWN_PER_GOAL = 0.08;
/** 消失概率上限。 */
export const BLUEPRINT_DESPAWN_CAP = 0.85;
/** 动态 hold 多久后挪一步，秒。 */
export const BLUEPRINT_STEP_MIN = 0.45;
export const BLUEPRINT_STEP_MAX = 0.85;
/** 0 右、1 下、2 左、3 上。 */
export const BLUEPRINT_DIR_DELTA = [
  { dc: 1, dr: 0 },
  { dc: 0, dr: 1 },
  { dc: -1, dr: 0 },
  { dc: 0, dr: -1 },
] as const;
export type BlueprintDir = 0 | 1 | 2 | 3;
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

export type BlueprintDynamicPhase = "raise" | "hold" | "cross_out" | "cross_in";
export type BlueprintDynamic = {
  cells: BlueprintCellRef[];
  /** cross_out 时已选定、尚未落到的下一格；否则为空。 */
  pending: BlueprintCellRef[];
  dir: BlueprintDir;
  phase: BlueprintDynamicPhase;
  age: number;
  stepSpan: number;
  raise: number;
};
export type BlueprintClock = {
  seed: number;
  elapsed: number;
  /** 抽出静态批时的进球数。0 表示尚未进球。 */
  goals: number;
  /** 每换一批静态加一。 */
  serial: number;
  staticCells: BlueprintCellRef[];
  staticAge: number;
  staticRaise: number;
  dynamic: BlueprintDynamic | null;
  /** @deprecated 等同 staticCells，留给旧测试 / rewind。 */
  cells: BlueprintCellRef[];
  /** @deprecated 等同 staticAge。 */
  cycle: number;
  /** @deprecated 等同 staticRaise。 */
  duration: number;
  /** 已点亮的格子，`col:row`。只增不减，格离开场上后丢掉。 */
  lit: string[];
  /** 清排或清列后挂着的加分。下一次进球加进得分再清零。 */
  pendingBonus: number;
  /** 正在缩回、尚未离场的清格。 */
  clearing: BlueprintClearingCell[];
};

export type BlueprintClearingCell = {
  col: number;
  row: number;
  age: number;
  span: number;
  /** 开始缩回时的高度，从这里收到 0。 */
  from: number;
};
export type BlueprintBlock = {
  id: string;
  index: number;
  col: number;
  row: number;
  dynamic: boolean;
  /** 篮球踩亮后为 true。只亮不灭。 */
  lit: boolean;
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
let goals = 0;
let serial = 0;
let staticCells: BlueprintCellRef[] = [];
let staticAge = 0;
let staticRaise = BLUEPRINT_RAISE;
let dynamic: BlueprintDynamic | null = null;
/** 已点亮的 `col:row`。 */
let lit = new Set<string>();
/** 清排 / 清列累计、尚未进球结算的加分。 */
let pendingBonus = 0;
/** 正在播放缩回的清格。 */
let clearing: BlueprintClearingCell[] = [];
/** 是否已按当前进球数落定（含进球前的空场）。 */
let hasBatch = false;
let aim: BlueprintAim | null = null;
let view: View | null = null;

function copyCells(list: readonly BlueprintCellRef[]) {
  return list.map((cell) => ({ col: cell.col, row: cell.row }));
}

function normalizeDynamicPhase(phase: string | undefined): BlueprintDynamicPhase {
  if (phase === "raise" || phase === "hold" || phase === "cross_out" || phase === "cross_in") return phase;
  // 旧存档里的 "cross"：按缩回段处理，避免半套动画。
  if (phase === "cross") return "cross_out";
  return "hold";
}

function copyDynamic(next: BlueprintDynamic & { prev?: BlueprintCellRef[] }): BlueprintDynamic {
  const pending = next.pending?.length
    ? copyCells(next.pending)
    : next.prev?.length && normalizeDynamicPhase(next.phase) === "cross_out"
      ? copyCells(next.cells)
      : [];
  const cells = next.prev?.length && normalizeDynamicPhase(next.phase) === "cross_out" && !next.pending?.length
    ? copyCells(next.prev)
    : copyCells(next.cells);
  return {
    cells,
    pending,
    dir: clampDir(next.dir),
    phase: normalizeDynamicPhase(next.phase),
    age: Number.isFinite(next.age) ? Math.max(0, next.age) : 0,
    stepSpan: next.stepSpan > 0 ? next.stepSpan : BLUEPRINT_STEP_MIN,
    raise: next.raise > 0 ? next.raise : BLUEPRINT_RAISE,
  };
}

function clampDir(value: number): BlueprintDir {
  const n = ((Math.floor(Number.isFinite(value) ? value : 0) % 4) + 4) % 4;
  return n as BlueprintDir;
}

function cellKey(cell: BlueprintCellRef) {
  return `${cell.col}:${cell.row}`;
}

function staticKeySet(list: readonly BlueprintCellRef[] = staticCells) {
  return new Set(list.map(cellKey));
}

export function getBlueprintClock(): BlueprintClock {
  const cells = copyCells(staticCells);
  return {
    seed,
    elapsed,
    goals,
    serial,
    staticCells: cells,
    staticAge,
    staticRaise,
    dynamic: dynamic ? copyDynamic(dynamic) : null,
    cells,
    cycle: staticAge,
    duration: staticRaise,
    lit: [...lit],
    pendingBonus,
    clearing: clearing.map((cell) => ({ ...cell })),
  };
}

export function restoreBlueprintClock(next: BlueprintClock) {
  seed = next.seed;
  elapsed = next.elapsed;
  goals = finiteGoals(next.goals);
  serial = Number.isFinite(next.serial) ? next.serial : 0;
  const fromStatic = next.staticCells ?? next.cells;
  staticCells = goals > 0 ? copyCells(fromStatic ?? []) : [];
  staticAge = Number.isFinite(next.staticAge) ? next.staticAge : Number.isFinite(next.cycle) ? next.cycle : 0;
  staticRaise = next.staticRaise > 0 ? next.staticRaise : next.duration > 0 ? next.duration : BLUEPRINT_RAISE;
  dynamic = next.dynamic ? copyDynamic(next.dynamic) : null;
  lit = new Set((next.lit ?? []).filter((key) => typeof key === "string" && key.includes(":")));
  pendingBonus = finiteBonus(next.pendingBonus);
  clearing = (next.clearing ?? []).map((cell) => ({
    col: cell.col,
    row: cell.row,
    age: Number.isFinite(cell.age) ? Math.max(0, cell.age) : 0,
    span: cell.span > 0 ? cell.span : BLUEPRINT_CROSS_RAISE,
    from: Number.isFinite(cell.from) ? Math.max(0, cell.from) : 1,
  }));
  hasBatch = true;
  pruneLit();
}

/** 换场景或回到标题时清空凸出。 */
export function resetBlueprint(nextSeed = Math.random() * 1e6) {
  seed = nextSeed;
  elapsed = 0;
  goals = 0;
  serial = 0;
  staticCells = [];
  staticAge = 0;
  staticRaise = BLUEPRINT_RAISE;
  dynamic = null;
  lit = new Set();
  pendingBonus = 0;
  clearing = [];
  hasBatch = false;
  aim = null;
}

/** 新一局清对局秒数与凸出；首球前场上保持空。 */
export function resetBlueprintProgress() {
  elapsed = 0;
  goals = 0;
  staticCells = [];
  staticAge = 0;
  staticRaise = BLUEPRINT_RAISE;
  dynamic = null;
  lit = new Set();
  pendingBonus = 0;
  clearing = [];
  hasBatch = false;
}

function finiteGoals(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function finiteBonus(value: number | undefined) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value ?? 0));
}

/** 点亮只保留还在场上的格。挪走或换批后的新格从暗开始。 */
function pruneLit() {
  const live = new Set<string>();
  for (const cell of staticCells) live.add(cellKey(cell));
  if (dynamic) for (const cell of dynamic.cells) live.add(cellKey(cell));
  for (const key of lit) if (!live.has(key)) lit.delete(key);
}

export function blueprintDespawnChance(made: number) {
  const g = finiteGoals(made);
  if (g <= 0) return 0;
  return Math.min(BLUEPRINT_DESPAWN_CAP, BLUEPRINT_DESPAWN_BASE + BLUEPRINT_DESPAWN_PER_GOAL * (g - 1));
}

export function blueprintTranslateCells(list: readonly BlueprintCellRef[], dir: BlueprintDir) {
  const delta = BLUEPRINT_DIR_DELTA[dir]!;
  return list.map((cell) => ({ col: cell.col + delta.dc, row: cell.row + delta.dr }));
}

function aimBall() {
  return aim && Number.isFinite(aim.ballX) && Number.isFinite(aim.ballY) ? { x: aim.ballX, y: aim.ballY } : null;
}
function aimHoop() {
  return aim && Number.isFinite(aim.hoopX) && Number.isFinite(aim.hoopY) ? { x: aim.hoopX, y: aim.hoopY } : null;
}

function cellRectAt(world: View, ref: BlueprintCellRef): Cell {
  const grid = blueprintGrid(world);
  return {
    col: ref.col,
    row: ref.row,
    x: grid.ox + ref.col * grid.size,
    y: grid.oy + ref.row * grid.size,
    w: grid.size,
    h: grid.size,
  };
}

/** 出界、走廊、球旁才挡住整组。静态格可以踩，不因此换向或拆组。 */
function dynamicHardBlocked(world: View, ref: BlueprintCellRef, ball: { x: number; y: number } | null) {
  const grid = blueprintGrid(world);
  if (ref.col < 0 || ref.row < 0 || ref.col >= grid.cols || ref.row >= grid.rows) return true;
  const rect = cellRectAt(world, ref);
  if (!cellAllowed(world, rect)) return true;
  if (ball && blueprintNearBall(world, rect, ball)) return true;
  return false;
}

function groupHardBlocked(world: View, list: readonly BlueprintCellRef[], ball: { x: number; y: number } | null) {
  return list.some((cell) => dynamicHardBlocked(world, cell, ball));
}

function sampleStepSpan(layoutSeed: number, batchSerial: number) {
  const t = unitAt(layoutSeed, batchSerial, 7);
  return BLUEPRINT_STEP_MIN + (BLUEPRINT_STEP_MAX - BLUEPRINT_STEP_MIN) * t;
}

function trySpawnDynamic(goalsNow: number) {
  if (!view || dynamic) return;
  const room = BLUEPRINT_MAX_COUNT - staticCells.length;
  if (room <= 0) return;
  const ball = aimBall();
  const hoop = aimHoop();
  const batch = rollBlueprintBatch(view, {
    seed,
    serial: serial + 17,
    goals: goalsNow,
    ball,
    hoop,
    maxCount: room,
  });
  if (!batch.cells.length) return;
  const cells = batch.cells.slice(0, room);
  if (!cells.length) return;
  dynamic = {
    cells,
    pending: [],
    dir: clampDir(Math.floor(unitAt(seed, serial + 17, 8) * 4)),
    phase: "raise",
    age: 0,
    stepSpan: sampleStepSpan(seed, serial + 17),
    raise: BLUEPRINT_RAISE,
  };
}

function applyGoalChange(goalsNow: number) {
  // 还没收到 world 时先别落批，等下一帧。
  if (goalsNow > 0 && !view) return;
  if (hasBatch && goalsNow !== goals) serial += 1;
  goals = goalsNow;
  staticAge = 0;
  staticRaise = BLUEPRINT_RAISE;
  if (goalsNow <= 0 || !view) {
    staticCells = [];
    dynamic = null;
    hasBatch = true;
    return;
  }
  const ball = aimBall();
  const hoop = aimHoop();
  const batch = rollBlueprintBatch(view, { seed, serial, goals: goalsNow, ball, hoop });
  staticCells = batch.cells.slice(0, BLUEPRINT_MAX_COUNT);
  if (dynamic) {
    if (unitAt(seed, serial, 9) < blueprintDespawnChance(goalsNow)) dynamic = null;
    else if (staticCells.length + dynamic.cells.length > BLUEPRINT_MAX_COUNT) {
      // 合计放不下时整组离开，不裁掉其中几格。
      dynamic = null;
    }
  } else if (unitAt(seed, serial, 10) < BLUEPRINT_DYNAMIC_SPAWN) {
    trySpawnDynamic(goalsNow);
  }
  hasBatch = true;
}

function beginDynamicCross() {
  if (!dynamic || !view) return;
  const ball = aimBall();
  const order: BlueprintDir[] = [0, 1, 2, 3].map((i) => clampDir(dynamic!.dir + i));
  for (const dir of order) {
    const next = blueprintTranslateCells(dynamic.cells, dir);
    if (groupHardBlocked(view, next, ball)) continue;
    // 先整组同步缩回，再落到新格同步升起；全程同一线性进度。
    dynamic = {
      ...dynamic,
      dir,
      pending: next,
      phase: "cross_out",
      age: 0,
      raise: BLUEPRINT_CROSS_RAISE,
    };
    return;
  }
  // 四面都不通：跳过这一步，继续 hold。
  dynamic = { ...dynamic, phase: "hold", age: 0, pending: [] };
}

function stepDynamic(dt: number) {
  if (!dynamic || !(dt > 0)) return;
  let d = dynamic;
  d = { ...d, age: d.age + dt };
  if (d.phase === "raise" || d.phase === "cross_in") {
    if (d.age >= d.raise) d = { ...d, phase: "hold", age: 0, pending: [] };
  } else if (d.phase === "hold") {
    if (d.age >= d.stepSpan) {
      dynamic = d;
      beginDynamicCross();
      return;
    }
  } else if (d.phase === "cross_out") {
    if (d.age >= d.raise) {
      const from = copyCells(d.cells);
      const to = copyCells(d.pending);
      if (!to.length) {
        dynamic = null;
        return;
      }
      dynamic = { ...d, cells: to, pending: [], phase: "cross_in", age: 0 };
      carryDynamicLit(from, to);
      recheckFieldLines();
      return;
    }
  }
  dynamic = d;
}

/** 动态格挪走时，亮跟着这块走。底下还压着的静态保持亮，不算踩灭。 */
function carryDynamicLit(from: readonly BlueprintCellRef[], to: readonly BlueprintCellRef[]) {
  const staying = staticKeySet();
  const n = Math.min(from.length, to.length);
  for (let i = 0; i < n; i++) {
    const src = cellKey(from[i]!);
    const dst = cellKey(to[i]!);
    if (src === dst || !lit.has(src)) continue;
    lit.add(dst);
    if (!staying.has(src)) lit.delete(src);
  }
}

function stepClearing(dt: number) {
  if (!clearing.length || !(dt > 0)) return;
  const stay: BlueprintClearingCell[] = [];
  for (const cell of clearing) {
    const age = cell.age + dt;
    if (age < cell.span) stay.push({ ...cell, age });
  }
  clearing = stay;
}

export function stepBlueprint(dt: number, playing: boolean, next?: BlueprintAim, world?: View) {
  if (next) aim = next;
  if (world) view = { w: world.w, h: world.h, floorY: world.floorY, ballR: world.ballR, hoopInner: world.hoopInner };
  const goalsNow = aim ? finiteGoals(aim.goals) : goals;
  if (!hasBatch || goalsNow !== goals) applyGoalChange(goalsNow);
  pruneLit();
  if (!(dt > 0)) return;
  if (playing) {
    elapsed += dt;
    staticAge += dt;
    stepDynamic(dt);
    stepClearing(dt);
    pruneLit();
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

/** 本批格数不超过同时凸出上限。 */
export function blueprintQuota(requested: number) {
  if (!Number.isFinite(requested) || requested <= 0) return 0;
  return Math.min(BLUEPRINT_MAX_COUNT, Math.floor(requested));
}

/**
 * 本批要凸出几格。
 * 进球前为 0；第 1 球固定 1；之后软上限随进球升高，且 `roll` 越容易落到更大值。
 */
export function blueprintSampleCount(made: number, roll: number) {
  const g = finiteGoals(made);
  if (g <= 0) return 0;
  if (g === 1) return 1;
  const softMax = Math.min(BLUEPRINT_MAX_COUNT, 1 + g);
  const bias = Math.min(0.9, (g - 1) * BLUEPRINT_MULTI_PER_GOAL);
  const p = Math.max(0.28, 1 - bias);
  const t = Math.min(1, Math.max(0, Number.isFinite(roll) ? roll : 0));
  const u = Math.pow(t, p);
  return Math.max(1, Math.min(softMax, 1 + Math.floor(u * softMax)));
}

/** @deprecated 旧时长区间；现一批保持到下一次进球，升起用 BLUEPRINT_RAISE。 */
export function blueprintExtendSpan(_made: number) {
  return { min: BLUEPRINT_RAISE, max: BLUEPRINT_RAISE };
}

/** @deprecated 现固定返回升起时长。 */
export function blueprintSampleDuration(_made: number, _roll: number) {
  return BLUEPRINT_RAISE;
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

/** 抽一批凸出。进球前为空；格数随进球变，升起后保持到下一次进球。 */
export function rollBlueprintBatch(
  world: View,
  opts: {
    seed: number;
    serial: number;
    goals: number;
    ball?: { x: number; y: number } | null;
    hoop?: { x: number; y: number } | null;
    exclude?: readonly BlueprintCellRef[] | null;
    maxCount?: number;
  },
): BlueprintBatch {
  const layoutSeed = Number.isFinite(opts.seed) ? opts.seed : 1;
  const batchSerial = Number.isFinite(opts.serial) ? opts.serial : 0;
  const made = finiteGoals(opts.goals);
  const cap = blueprintQuota(opts.maxCount ?? BLUEPRINT_MAX_COUNT);
  const want = Math.min(cap, blueprintSampleCount(made, unitAt(layoutSeed, batchSerial, 0)));
  const duration = BLUEPRINT_RAISE;
  if (want <= 0) {
    return { cells: [], duration, shape: "line", length: 1, variant: 0, mode: "idle", anchor: null };
  }
  const shape = want === 1
    ? "line"
    : BLUEPRINT_SHAPES[Math.min(BLUEPRINT_SHAPES.length - 1, Math.floor(unitAt(layoutSeed, batchSerial, 1) * BLUEPRINT_SHAPES.length))]!;
  const length = shapeLength(shape, want);
  const variant = want === 1 ? 0 : Math.min(7, Math.floor(unitAt(layoutSeed, batchSerial, 3) * 8));
  const ball = opts.ball && Number.isFinite(opts.ball.x) && Number.isFinite(opts.ball.y) ? opts.ball : null;
  const hoop = opts.hoop && Number.isFinite(opts.hoop.x) && Number.isFinite(opts.hoop.y) ? opts.hoop : null;
  const banned = new Set((opts.exclude ?? []).map(cellKey));
  const legal = blueprintLegalCells(world, ball).filter((cell) => !banned.has(cellKey(cell)));
  const allowed = new Set(legal.map((cell) => `${cell.col}:${cell.row}`));
  const path = ball && hoop ? legal.filter((cell) => blueprintOnShotPath(world, cell, ball, hoop)) : [];
  const wantPath = unitAt(layoutSeed, batchSerial, 4) < 0.5 && path.length > 0;
  const pool = wantPath ? path : legal;
  const mode: "idle" | "path" = wantPath ? "path" : "idle";
  const ordered = pool.slice().sort((a, b) => hash01(layoutSeed + batchSerial * 3.1, a) - hash01(layoutSeed + batchSerial * 3.1, b) || a.row - b.row || a.col - b.col);
  let placed: BlueprintCellRef[] = [];
  let anchor: BlueprintCellRef | null = null;
  if (want === 1) {
    const pick = ordered[0];
    if (pick) {
      placed = [{ col: pick.col, row: pick.row }];
      anchor = { col: pick.col, row: pick.row };
    }
  } else {
    for (const cell of ordered) {
      const stamped = blueprintStamp(shape, length, variant, { col: cell.col, row: cell.row });
      const kept = clipBlueprintCells(stamped, (col, row) => allowed.has(`${col}:${row}`));
      if (kept.length > placed.length) {
        placed = kept;
        anchor = { col: cell.col, row: cell.row };
      }
      if (placed.length >= want) break;
    }
  }
  const capped = placed.slice(0, Math.min(want, cap));
  return { cells: capped, duration, shape, length, variant, mode, anchor: capped.length ? anchor : null };
}

/** 0 贴平，1 完全凸出。升满后保持为 1，直到换批把 age 清零。 */
export function blueprintExtend(age: number, span = BLUEPRINT_RAISE) {
  const raise = span > 1e-6 ? span : BLUEPRINT_RAISE;
  if (!(age > 0)) return 0;
  if (age >= raise) return 1;
  return 0.5 - 0.5 * Math.cos((age / raise) * Math.PI);
}

export function solidFromCell(cell: Rect, extend: number): Rect | null {
  if (extend < BLUEPRINT_HIT_EXTEND) return null;
  // 画面上亮的就是整格。碰撞盒若从中心慢慢放大，会在球底下继续往外长，
  // 球每帧都被重新嵌进去。一旦算凸出，整格就是墙。
  return { x: cell.x, y: cell.y, w: cell.w, h: cell.h };
}

function pushBlock(
  blocks: BlueprintBlock[],
  world: View,
  grid: ReturnType<typeof blueprintGrid>,
  ref: BlueprintCellRef,
  extend: number,
  isDynamic: boolean,
  occupied: Set<string>,
  isLit: boolean,
  force = false,
) {
  if (!force && blocks.length >= BLUEPRINT_MAX_COUNT) return;
  const key = cellKey(ref);
  if (occupied.has(key)) return;
  if (ref.col < 0 || ref.row < 0 || ref.col >= grid.cols || ref.row >= grid.rows) return;
  const rect = {
    col: ref.col,
    row: ref.row,
    x: grid.ox + ref.col * grid.size,
    y: grid.oy + ref.row * grid.size,
    w: grid.size,
    h: grid.size,
  };
  if (!cellAllowed(world, rect)) return;
  const base = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
  occupied.add(key);
  blocks.push({
    id: `${isDynamic ? "d" : "s"}:${key}`,
    index: blocks.length,
    col: ref.col,
    row: ref.row,
    dynamic: isDynamic,
    lit: isLit,
    extend,
    cell: base,
    solid: solidFromCell(base, extend),
  });
}

/** 动态伸缩进度：线性 0→1，整组共用，比余弦更齐整。 */
export function blueprintDynamicProgress(age: number, span = BLUEPRINT_RAISE) {
  const raise = span > 1e-6 ? span : BLUEPRINT_RAISE;
  if (!(age > 0)) return 0;
  if (age >= raise) return 1;
  return age / raise;
}

/**
 * 动态格伸出量。同一 phase 里整组共用同一进度：
 * raise / cross_in 同步升起，cross_out 同步缩回。
 * 与静态同格也不另算，重叠格跟组内其它格一样高。
 */
export function blueprintDynamicCellExtend(
  dyn: BlueprintDynamic,
  _ref: BlueprintCellRef,
  _staticKeys: Set<string>,
) {
  const raise = dyn.raise > 0 ? dyn.raise : BLUEPRINT_RAISE;
  if (dyn.phase === "hold") return 1;
  if (dyn.phase === "raise" || dyn.phase === "cross_in") return blueprintDynamicProgress(dyn.age, raise);
  if (dyn.phase === "cross_out") return Math.max(0, 1 - blueprintDynamicProgress(dyn.age, raise));
  return 0;
}

/** 当前这一帧要画的动态格（cross_out 仍在旧位，cross_in 已在新位）。 */
export function blueprintDynamicDrawCells(dyn: BlueprintDynamic) {
  return dyn.cells;
}

export function blueprintBlocks(world: View, clock = getBlueprintClock()): BlueprintBlock[] {
  const grid = blueprintGrid(world);
  if (finiteGoals(clock.goals) <= 0) return [];
  const staticList = clock.staticCells ?? clock.cells ?? [];
  const staticKeys = staticKeySet(staticList);
  const staticSpan = clock.staticRaise > 0 ? clock.staticRaise : clock.duration > 0 ? clock.duration : BLUEPRINT_RAISE;
  const staticAgeNow = Number.isFinite(clock.staticAge) ? clock.staticAge : clock.cycle;
  const staticExtend = blueprintExtend(staticAgeNow, staticSpan);
  const blocks: BlueprintBlock[] = [];
  const litKeys = new Set(clock.lit ?? []);
  const staticSeen = new Set<string>();
  for (const ref of staticList) {
    pushBlock(blocks, world, grid, ref, staticExtend, false, staticSeen, litKeys.has(cellKey(ref)));
  }
  const dyn = clock.dynamic;
  if (dyn?.cells?.length) {
    const dynamicSeen = new Set<string>();
    for (const ref of blueprintDynamicDrawCells(dyn)) {
      const extend = blueprintDynamicCellExtend(dyn, ref, staticKeys);
      if (extend <= 0) continue;
      pushBlock(blocks, world, grid, ref, extend, true, dynamicSeen, litKeys.has(cellKey(ref)));
    }
  }
  for (const cell of clock.clearing ?? []) {
    const extend = blueprintClearExtend(cell.age, cell.span, cell.from);
    if (extend <= 0) continue;
    pushBlock(blocks, world, grid, cell, extend, false, new Set(), true, true);
  }
  return blocks;
}

/** 清排 / 清列缩回：从开始时的高度线性收到 0，时长与动态组缩回相同。 */
export function blueprintClearExtend(age: number, span = BLUEPRINT_CROSS_RAISE, from = 1) {
  const dur = span > 1e-6 ? span : BLUEPRINT_CROSS_RAISE;
  const start = Math.max(0, Number.isFinite(from) ? from : 1);
  if (!(age > 0)) return start;
  if (age >= dur) return 0;
  return start * (1 - age / dur);
}

/** 仍占着这一排的格。动态缩平过程中高度接近 0 也算在场，避免误清。 */
export function blueprintFieldCells(clock: Pick<BlueprintClock, "staticCells" | "cells" | "dynamic">) {
  const seen = new Set<string>();
  const cells: BlueprintCellRef[] = [];
  const add = (cell: BlueprintCellRef) => {
    const key = cellKey(cell);
    if (seen.has(key)) return;
    seen.add(key);
    cells.push({ col: cell.col, row: cell.row });
  };
  for (const cell of clock.staticCells ?? clock.cells ?? []) add(cell);
  for (const cell of clock.dynamic?.cells ?? []) add(cell);
  return cells;
}

/** 仍凸出到撞得到的格。只用于能不能踩亮，不用于清排或清列。 */
export function blueprintProtrudingCells(blocks: readonly BlueprintBlock[]) {
  const seen = new Set<string>();
  const cells: BlueprintCellRef[] = [];
  for (const block of blocks) {
    if (block.extend < BLUEPRINT_HIT_EXTEND) continue;
    const key = cellKey(block);
    if (seen.has(key)) continue;
    seen.add(key);
    cells.push({ col: block.col, row: block.row });
  }
  return cells;
}

/** 上下左右、序号相差 1。对角线不算。 */
function hasOrthogonalNeighbor(cell: BlueprintCellRef, field: readonly BlueprintCellRef[]) {
  return field.some((other) => {
    if (other.col === cell.col && other.row === cell.row) return false;
    const sameCol = other.col === cell.col && Math.abs(other.row - cell.row) === 1;
    const sameRow = other.row === cell.row && Math.abs(other.col - cell.col) === 1;
    return sameCol || sameRow;
  });
}

/**
 * 同一行或同一列里，序号相差 1 连成一段，空挡拆开。
 * 整段都亮才收这一段。段里只有一格时，四向都没有邻块才单格消；有邻块则留下。
 */
function contiguousClears(
  line: readonly BlueprintCellRef[],
  litKeys: ReadonlySet<string>,
  axis: "col" | "row",
  field: readonly BlueprintCellRef[],
) {
  const ordered = line.slice().sort((a, b) => a[axis] - b[axis]);
  const cleared: BlueprintCellRef[] = [];
  let segment: BlueprintCellRef[] = [];
  const flush = () => {
    const ready = segment.length > 0 && segment.every((cell) => litKeys.has(cellKey(cell)));
    const soloBlocked = segment.length === 1 && hasOrthogonalNeighbor(segment[0]!, field);
    if (ready && !soloBlocked) {
      for (const cell of segment) cleared.push({ col: cell.col, row: cell.row });
    }
    segment = [];
  };
  for (const cell of ordered) {
    const prev = segment[segment.length - 1];
    if (prev && cell[axis] - prev[axis] > 1) flush();
    segment.push(cell);
  }
  flush();
  return cleared;
}

/**
 * 这一排上每一段相邻格子若全部点亮，返回这些段。
 * 段长为 1 时，只有四向都没有邻块才缩回。空挡另一边不跟着清。高度暂时接近 0 的格仍然算在场上。
 */
export function blueprintRowClears(row: number, field: readonly BlueprintCellRef[], litKeys: ReadonlySet<string>) {
  return contiguousClears(field.filter((cell) => cell.row === row), litKeys, "col", field);
}

/**
 * 这一列上每一段相邻格子若全部点亮，返回这些段。
 * 段长为 1 时，只有四向都没有邻块才缩回。空挡另一边不跟着清。高度暂时接近 0 的格仍然算在场上。
 */
export function blueprintColClears(col: number, field: readonly BlueprintCellRef[], litKeys: ReadonlySet<string>) {
  return contiguousClears(field.filter((cell) => cell.col === col), litKeys, "row", field);
}

function uniqueCells(cells: readonly BlueprintCellRef[]) {
  const seen = new Set<string>();
  const out: BlueprintCellRef[] = [];
  for (const cell of cells) {
    const key = cellKey(cell);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ col: cell.col, row: cell.row });
  }
  return out;
}

function extendAt(ref: BlueprintCellRef) {
  const heights: number[] = [];
  if (staticCells.some((cell) => cell.col === ref.col && cell.row === ref.row)) {
    heights.push(blueprintExtend(staticAge, staticRaise));
  }
  if (dynamic?.cells.some((cell) => cell.col === ref.col && cell.row === ref.row)) {
    heights.push(blueprintDynamicCellExtend(dynamic, ref, staticKeySet()));
  }
  if (!heights.length) return 0;
  return Math.max(0, ...heights);
}

/** 清掉的格离开静态/动态名单，改由缩回动画接管。高度接近 0 的格也算被清走。 */
function dropClearedCells(keys: Set<string>) {
  staticCells = staticCells.filter((cell) => !keys.has(cellKey(cell)));
  if (dynamic) {
    const cells = dynamic.cells.filter((cell) => !keys.has(cellKey(cell)));
    if (!cells.length) {
      dynamic = null;
    } else if (cells.length !== dynamic.cells.length) {
      const pending = dynamic.phase === "cross_out"
        ? blueprintTranslateCells(cells, dynamic.dir)
        : dynamic.pending.filter((cell) => !keys.has(cellKey(cell)));
      dynamic = { ...dynamic, cells, pending };
    }
  }
  for (const key of keys) lit.delete(key);
}

function beginLineClear(cells: readonly BlueprintCellRef[]) {
  const fresh = uniqueCells(cells).filter((cell) => !clearing.some((item) => item.col === cell.col && item.row === cell.row));
  if (!fresh.length) return 0;
  const started = fresh.map((cell) => ({
    col: cell.col,
    row: cell.row,
    age: 0,
    span: BLUEPRINT_CROSS_RAISE,
    from: extendAt(cell),
  }));
  dropClearedCells(new Set(started.map(cellKey)));
  clearing = clearing.concat(started);
  pendingBonus += started.length;
  return started.length;
}

/** 落地或点亮之后，把当前在场的每一行、每一列再判一次。未亮的静态格也算在场。 */
function recheckFieldLines() {
  const field = blueprintFieldCells(getBlueprintClock());
  const cleared: BlueprintCellRef[] = [];
  for (const row of new Set(field.map((cell) => cell.row))) cleared.push(...blueprintRowClears(row, field, lit));
  for (const col of new Set(field.map((cell) => cell.col))) cleared.push(...blueprintColClears(col, field, lit));
  const unique = uniqueCells(cleared);
  if (!unique.length) return 0;
  return beginLineClear(unique);
}

/**
 * 篮球踩到已凸出的格就点亮。已亮再踩无事。
 * 四向都没有邻块时，点亮就缩回这一格。有邻块则要所在横段或竖段全部点亮，才整段缩回。
 * 同一格同时属于刚触发的行和列时只缩一次、只计一次。
 * 返回本次开始缩回的格数。
 */
export function touchBlueprintCell(world: View, col: number, row: number) {
  const field = blueprintFieldCells(getBlueprintClock());
  const key = `${col}:${row}`;
  if (!field.some((cell) => cellKey(cell) === key)) return 0;
  const solid = blueprintBlocks(world).some((block) => block.col === col && block.row === row && block.solid);
  if (!solid) return 0;
  lit.add(key);
  const cleared = uniqueCells([
    ...blueprintRowClears(row, field, lit),
    ...blueprintColClears(col, field, lit),
  ]);
  if (!cleared.length) return 0;
  return beginLineClear(cleared);
}

/** 进球时拿走待领分并清零。没有挂分时返回 0。 */
export function claimBlueprintBonus() {
  const bonus = pendingBonus;
  pendingBonus = 0;
  return bonus;
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

function centerDist(block: BlueprintBlock, ball: MovingBall) {
  const cx = block.cell.x + block.cell.w / 2;
  const cy = block.cell.y + block.cell.h / 2;
  return Math.hypot(ball.x - cx, ball.y - cy);
}

/** 同时擦到多格时，点亮球心更靠近的那一格，不把邻格一起点亮。 */
function nearestLitTarget(world: View, ball: MovingBall, hitBlock: BlueprintBlock, clock?: BlueprintClock) {
  let best = hitBlock;
  let bestD = centerDist(hitBlock, ball);
  for (const block of blueprintBlocks(world, clock)) {
    if (!block.solid || !circleHits(ball.x, ball.y, ball.r, block.solid)) continue;
    const dist = centerDist(block, ball);
    if (dist < bestD - 1e-4) {
      best = block;
      bestD = dist;
    }
  }
  return best;
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
  let hitBlock: BlueprintBlock | null = null;
  for (const block of blueprintBlocks(world, clock)) {
    if (!block.solid) continue;
    const found = sweepBlueprintCircle(prevX, prevY, dx, dy, ball.r, block.solid);
    if (found && (!hit || found.t < hit.t)) {
      hit = { ...found, box: block.solid };
      hitBlock = block;
    }
  }
  if (!hit || !hitBlock) return false;
  // 球比格子宽，踩在一格上也会擦到邻格。只点亮球心更靠近的那一格。
  if (!clock) {
    const stepped = nearestLitTarget(world, ball, hitBlock, clock);
    touchBlueprintCell(world, stepped.col, stepped.row);
  }
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
  if (block.lit) {
    ctx.fillStyle = `rgba(255, 186, 46, ${0.55 + 0.4 * Math.min(1, extend)})`;
    ctx.fillRect(fill.x, fill.y, fill.w, fill.h);
    ctx.strokeStyle = "rgba(255, 248, 214, 0.96)";
    ctx.lineWidth = 2;
    ctx.strokeRect(fill.x + 1.5, fill.y + 1.5, Math.max(0, fill.w - 3), Math.max(0, fill.h - 3));
  } else {
    ctx.fillStyle = `rgba(236, 244, 255, ${blueprintFillAlpha(extend)})`;
    ctx.fillRect(fill.x, fill.y, fill.w, fill.h);
  }
}

export function drawBlueprint(ctx: CanvasRenderingContext2D, world: View) {
  ctx.fillStyle = BLUEPRINT_BLUE;
  ctx.fillRect(0, 0, world.w, world.h);
  strokeGrid(ctx, world);
  drawPerspectiveFloor(ctx, world);
  const clock = getBlueprintClock();
  const blocks = blueprintBlocks(world, clock);
  const covered = new Set((clock.dynamic?.cells ?? []).map((cell) => `${cell.col}:${cell.row}`));
  // 重叠格只按动态组的高度画。静态那一层仍参与碰撞（取较高的），但不把组内几格衬得高低不齐。
  const visible = blocks
    .filter((block) => block.dynamic || !covered.has(`${block.col}:${block.row}`))
    .sort((a, b) => a.cell.y - b.cell.y || a.cell.x - b.cell.x || Number(a.dynamic) - Number(b.dynamic));
  for (const block of visible) drawBlock(ctx, block, visible);
  if (clock.pendingBonus > 0) {
    const label = `待领 +${clock.pendingBonus}`;
    ctx.save();
    ctx.font = "700 15px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const width = ctx.measureText(label).width + 22;
    const y = Math.min(world.h * 0.16, 132);
    const x = world.w * 0.5 - width / 2;
    ctx.fillStyle = "rgba(8, 24, 58, 0.78)";
    ctx.fillRect(x, y, width, 26);
    ctx.fillStyle = "#ffd56a";
    ctx.fillText(label, world.w * 0.5, y + 13);
    ctx.restore();
  }
}
