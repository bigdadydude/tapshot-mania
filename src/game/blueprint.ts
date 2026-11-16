import type { World } from "./types";

/**
 * 蓝图场景，阶段 1。
 * 网格和伸缩方块放在独立模块里，不写进静态 ScenePack。
 * 阶段 2 以后的激光、发射器和图纸系统不在这里。
 */

/**
 * 方块边长，按画面宽 390 换算后再取整。
 * 28 比原先的 44 更密：单格更小，篮筐走廊之间能放下更多列。
 * 取整是为了墙面横竖落在同一像素间距上，屏幕上仍是正方形。
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
export const BLUEPRINT_DEFAULT_FLOOR_SPREAD = 1.8;
export const BLUEPRINT_DEFAULT_FLOOR_DENSITY = 1.4;
let floorRaySpread = BLUEPRINT_DEFAULT_FLOOR_SPREAD;
export function getBlueprintFloorSpread() { return floorRaySpread; }
export function setBlueprintFloorSpread(value: number) {
  floorRaySpread = Number.isFinite(value) ? Math.max(0, Math.min(3, value)) : BLUEPRINT_DEFAULT_FLOOR_SPREAD;
  return floorRaySpread;
}
let floorLineDensity = BLUEPRINT_DEFAULT_FLOOR_DENSITY;
export function getBlueprintFloorDensity() { return floorLineDensity; }
/** Developer-only drawing calibration. Does not change grid collision cells. */
export function setBlueprintFloorDensity(value: number) {
  floorLineDensity = Number.isFinite(value) ? Math.max(0.4, Math.min(2.5, value)) : BLUEPRINT_DEFAULT_FLOOR_DENSITY;
  return floorLineDensity;
}
export function blueprintMajorColumn(index: number) { return ((index - 1) % 4 + 4) % 4 === 0; }
/**
 * 完全凸出时，浅色罩在蓝底上的不透明度。
 * 仍比没凸起的格子亮，但不要洗成发白。
 */
export const BLUEPRINT_MAX_LIGHTNESS = 0.18;

export const BLUEPRINT_BLUE = "#11448f";
/** 可调的生成权重；颜色与奖励只使用快照中的 seed / serial。 */
export const BLUEPRINT_KIND_WEIGHTS = { white: 0.74, green: 0.12, red: 0.08, black: 0.06 } as const;
export const BLUEPRINT_LIT_RGB = "255, 255, 255";
export const BLUEPRINT_RED_RGB = "217, 0, 27";
/** 黑块填色。描边与其它凸块相同，保证在蓝底上能认出来。 */
export const BLUEPRINT_BLACK = "#1A1A1A";
/** 经典 / 肉鸽绿块抽到时钟奖时的加时额度（秒）。一分钟模式不发放此项。 */
export const BLUEPRINT_CLOCK_SECONDS = 1;
export type BlueprintBlockKind = "white" | "green" | "red" | "black";
export type BlueprintRewardEvent = "base" | "combo" | "seconds" | "scoreDouble" | "areaClear" | "turnRed";
export type BlueprintRewards = { base: number; combo: number; seconds: number };
/** 种类按实体进球数解锁；未解锁权重为 0，再按原权重归一化。 */
export const BLUEPRINT_KIND_UNLOCK = { white: 3, green: 9, red: 15, black: 21 } as const;
/** 绿奖按清除当时的实体进球数解锁；外观仍是同一种绿。 */
export const BLUEPRINT_REWARD_UNLOCK = {
  base: 9,
  combo: 9,
  seconds: 9,
  scoreDouble: 9,
  areaClear: 12,
  turnRed: 27,
} as const;
/** 已解锁的绿奖。一分钟不把时钟加时放入池中。 */
export function blueprintRewardPool(allowClock: boolean, actual: number): BlueprintRewardEvent[] {
  const made = finiteGoals(actual);
  const pool: BlueprintRewardEvent[] = [];
  if (made < BLUEPRINT_REWARD_UNLOCK.base) return pool;
  pool.push("base", "combo");
  if (allowClock && made >= BLUEPRINT_REWARD_UNLOCK.seconds) pool.push("seconds");
  if (made >= BLUEPRINT_REWARD_UNLOCK.scoreDouble) pool.push("scoreDouble");
  if (made >= BLUEPRINT_REWARD_UNLOCK.areaClear) pool.push("areaClear");
  if (made >= BLUEPRINT_REWARD_UNLOCK.turnRed) pool.push("turnRed");
  return pool;
}

export function blueprintRewardToast(reward: BlueprintRewardEvent) {
  if (reward === "base") return "永久基础 +2";
  if (reward === "combo") return "每球连击 +1";
  if (reward === "scoreDouble") return "下一次进球得分 ×2";
  if (reward === "areaClear") return "点亮并消除周围方块";
  if (reward === "turnRed") return "相邻方块变为红色";
  if (reward === "seconds") return `永久时钟 +${BLUEPRINT_CLOCK_SECONDS}秒`;
  return "";
}
/** 周围 8 格（含斜线，不含自身）。 */
export const BLUEPRINT_AREA_DELTAS = [
  { dc: -1, dr: -1 }, { dc: 0, dr: -1 }, { dc: 1, dr: -1 },
  { dc: -1, dr: 0 }, { dc: 1, dr: 0 },
  { dc: -1, dr: 1 }, { dc: 0, dr: 1 }, { dc: 1, dr: 1 },
] as const;
export function blueprintAreaNeighbors(col: number, row: number) {
  return BLUEPRINT_AREA_DELTAS.map((delta) => ({ col: col + delta.dc, row: row + delta.dr }));
}
/** 转红奖励：上下左右 4 格，不含斜线、不含自身。 */
export const BLUEPRINT_TURN_RED_DELTAS = [
  { dc: 0, dr: -1 }, { dc: -1, dr: 0 }, { dc: 1, dr: 0 }, { dc: 0, dr: 1 },
] as const;
export function blueprintTurnRedNeighbors(col: number, row: number) {
  return BLUEPRINT_TURN_RED_DELTAS.map((delta) => ({ col: col + delta.dc, row: row + delta.dr }));
}
export function blueprintBlockKind(cell: { kind?: BlueprintBlockKind } | null | undefined): BlueprintBlockKind {
  return cell?.kind ?? "white";
}
export function blueprintKindClearable(kind: BlueprintBlockKind | undefined) {
  return blueprintBlockKind({ kind }) !== "black";
}

export type BlueprintKindWeights = Record<BlueprintBlockKind, number>;

/** 未解锁种类权重视为 0，剩余种类按原权重再归一化。 */
export function blueprintKindWeights(made: number): BlueprintKindWeights {
  const actual = finiteGoals(made);
  const unlocked: BlueprintKindWeights = {
    white: actual >= BLUEPRINT_KIND_UNLOCK.white ? BLUEPRINT_KIND_WEIGHTS.white : 0,
    green: actual >= BLUEPRINT_KIND_UNLOCK.green ? BLUEPRINT_KIND_WEIGHTS.green : 0,
    red: actual >= BLUEPRINT_KIND_UNLOCK.red ? BLUEPRINT_KIND_WEIGHTS.red : 0,
    black: actual >= BLUEPRINT_KIND_UNLOCK.black ? BLUEPRINT_KIND_WEIGHTS.black : 0,
  };
  const total = unlocked.white + unlocked.green + unlocked.red + unlocked.black;
  if (!(total > 0)) return unlocked;
  return {
    white: unlocked.white / total,
    green: unlocked.green / total,
    red: unlocked.red / total,
    black: unlocked.black / total,
  };
}

export function blueprintPickKind(weights: BlueprintKindWeights, roll: number): BlueprintBlockKind {
  const t = Math.min(1, Math.max(0, Number.isFinite(roll) ? roll : 0));
  let acc = 0;
  for (const kind of ["white", "green", "red", "black"] as const) {
    acc += weights[kind];
    if (t < acc) return kind;
  }
  return "white";
}

type View = Pick<World, "w" | "h" | "floorY" | "ballR" | "hoopInner">;
type Rect = { x: number; y: number; w: number; h: number };
type Cell = Rect & { col: number; row: number };

export const BLUEPRINT_SHAPES = ["line", "diag", "z", "l", "s", "u", "v", "c"] as const;
export type BlueprintShape = (typeof BLUEPRINT_SHAPES)[number];
export type BlueprintCellRef = { col: number; row: number; /** 旧快照缺省为 white。 */ kind?: BlueprintBlockKind };
export type BlueprintAim = {
  goals: number;
  ballX: number;
  ballY: number;
  hoopX: number;
  hoopY: number;
};
export type BlueprintBatchPiece = {
  shape: BlueprintShape;
  length: number;
  variant: number;
  anchor: BlueprintCellRef;
  cells: BlueprintCellRef[];
};
export type BlueprintBatch = {
  cells: BlueprintCellRef[];
  duration: number;
  shape: BlueprintShape;
  length: number;
  variant: number;
  mode: "idle" | "path";
  anchor: BlueprintCellRef | null;
  /** 第 3 节抽到的目标格数。形状拼接不得私下裁短。 */
  target: number;
  /** 本批盖下的每一段形状；单格批次只有一段。 */
  pieces: BlueprintBatchPiece[];
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
  /** 本局永久增量；可选仅为兼容旧快照。 */
  rewards?: BlueprintRewards;
  rewardSerial?: number;
  /** 尚未兑现的「下一次实体进球得分 ×2」次数。旧快照缺省为 0。 */
  scoreDoubleCharges?: number;
};

export type BlueprintClearingCell = {
  col: number;
  row: number;
  kind?: BlueprintBlockKind;
  age: number;
  span: number;
  /** 开始缩回时的高度，从这里收到 0。 */
  from: number;
};
export type BlueprintBlock = {
  id: string;
  kind: BlueprintBlockKind;
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
let rewards: BlueprintRewards = { base: 0, combo: 0, seconds: 0 };
let rewardSerial = 0;
let rewardEvents: BlueprintRewardEvent[] = [];
/** 尚未兑现的实体进球得分 ×2 次数。 */
let scoreDoubleCharges = 0;
/** 由引擎按模式设置。默认 true，保持经典/肉鸽与现有模块测试的奖励池。 */
let allowSeconds = true;

export function setBlueprintAllowSeconds(allow: boolean) {
  allowSeconds = Boolean(allow);
}

export function getBlueprintAllowSeconds() {
  return allowSeconds;
}

/** 一分钟模式 HUD / 续钟分母只返回 timerMax，避免被 rewards.seconds 撑大。 */
export function blueprintHudClockBudget(timerMax: number, rewardSeconds: number, minuteMode: boolean) {
  return minuteMode ? timerMax : timerMax + rewardSeconds;
}

/** 一分钟模式即使收到 seconds 也不加时、不弹时钟文案。 */
export function blueprintAppliesClockReward(minuteMode: boolean) {
  return !minuteMode;
}

export function getBlueprintRewards(): BlueprintRewards {
  return { ...rewards };
}

export function getBlueprintScoreDoubleCharges() {
  return scoreDoubleCharges;
}

/** 仅供 toast 消费；恢复快照不会重播历史提示。 */
export function drainBlueprintRewardEvents(): BlueprintRewardEvent[] {
  return rewardEvents.splice(0);
}
/** 是否已按当前进球数落定（含进球前的空场）。 */
let hasBatch = false;
let aim: BlueprintAim | null = null;
let view: View | null = null;

function copyCells(list: readonly BlueprintCellRef[]) {
  return list.map((cell) => ({ col: cell.col, row: cell.row, ...(cell.kind ? { kind: cell.kind } : {}) }));
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
    rewards: { ...rewards },
    rewardSerial,
    scoreDoubleCharges,
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
  rewards = { base: finiteBonus(next.rewards?.base), combo: finiteBonus(next.rewards?.combo), seconds: finiteBonus(next.rewards?.seconds) };
  rewardSerial = finiteBonus(next.rewardSerial);
  scoreDoubleCharges = finiteBonus(next.scoreDoubleCharges);
  rewardEvents = [];
  clearing = (next.clearing ?? []).map((cell) => ({
    col: cell.col,
    row: cell.row,
    ...(cell.kind ? { kind: cell.kind } : {}),
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
  rewards = { base: 0, combo: 0, seconds: 0 };
  rewardSerial = 0;
  scoreDoubleCharges = 0;
  rewardEvents = [];
  clearing = [];
  hasBatch = false;
  aim = null;
}

/** 新一局清对局秒数与凸出；首球前场上保持空。 */
export function resetBlueprintProgress(preserveRewards = false) {
  const carriedRewards = rewards;
  const carriedRewardSerial = rewardSerial;
  const carriedDoubles = scoreDoubleCharges;
  elapsed = 0;
  goals = 0;
  staticCells = [];
  staticAge = 0;
  staticRaise = BLUEPRINT_RAISE;
  dynamic = null;
  lit = new Set();
  pendingBonus = 0;
  rewards = { base: 0, combo: 0, seconds: 0 };
  rewardSerial = 0;
  scoreDoubleCharges = 0;
  rewardEvents = [];
  clearing = [];
  hasBatch = false;
  if (preserveRewards) {
    rewards = carriedRewards;
    rewardSerial = carriedRewardSerial;
    scoreDoubleCharges = carriedDoubles;
  }
}

function finiteGoals(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function finiteBonus(value: number | undefined) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value ?? 0));
}

/** 点亮只保留还在场上、且仍有可清除层的格。纯黑格不保持点亮。 */
function pruneLit() {
  const live = new Set<string>();
  for (const cell of staticCells) if (blueprintKindClearable(cell.kind)) live.add(cellKey(cell));
  if (dynamic) for (const cell of dynamic.cells) if (blueprintKindClearable(cell.kind)) live.add(cellKey(cell));
  for (const key of lit) if (!live.has(key)) lit.delete(key);
}

/** 换批前记下还在场上的动态格里，哪些已经点亮。 */
function dynamicLitKeys() {
  const keep = new Set<string>();
  if (!dynamic) return keep;
  for (const cell of dynamic.cells) {
    const key = cellKey(cell);
    if (lit.has(key)) keep.add(key);
  }
  return keep;
}

/** 新静态一律未点亮。只有换批后仍在的动态格沿用进球前的亮。 */
function keepOnlyDynamicLit(keep: Set<string>) {
  const next = new Set<string>();
  if (dynamic) {
    for (const cell of dynamic.cells) {
      const key = cellKey(cell);
      if (keep.has(key)) next.add(key);
    }
  }
  lit = next;
}

export function blueprintDespawnChance(made: number) {
  const g = finiteGoals(made);
  if (g <= 0) return 0;
  return Math.min(BLUEPRINT_DESPAWN_CAP, BLUEPRINT_DESPAWN_BASE + BLUEPRINT_DESPAWN_PER_GOAL * (g - 1));
}

export function blueprintTranslateCells(list: readonly BlueprintCellRef[], dir: BlueprintDir) {
  const delta = BLUEPRINT_DIR_DELTA[dir]!;
  return list.map((cell) => ({ ...cell, col: cell.col + delta.dc, row: cell.row + delta.dr }));
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

function trySpawnDynamic(goalsNow: number, room: number) {
  if (!view || dynamic || room <= 0 || goalsNow < 3) return;
  const ball = aimBall();
  const hoop = aimHoop();
  const batch = rollBlueprintBatch(view, {
    seed,
    serial: serial + 17,
    goals: goalsNow,
    ball,
    hoop,
    maxCount: room,
    want: room,
    exclude: staticCells,
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
  const carriedLit = dynamicLitKeys();
  const beforeLocks = blueprintLockedLines();
  if (hasBatch && goalsNow !== goals) serial += 1;
  goals = goalsNow;
  staticAge = 0;
  staticRaise = BLUEPRINT_RAISE;
  const softMax = blueprintCountSoftMax(goalsNow);
  if (goalsNow <= 0 || !view || softMax <= 0) {
    staticCells = [];
    dynamic = null;
    hasBatch = true;
    lit = new Set();
    return;
  }
  const ball = aimBall();
  const hoop = aimHoop();
  // softMax 只限制可抽范围，不是密度目标。先均匀抽合计格数，再扣除留下的动态占用。
  const want = Math.min(softMax, BLUEPRINT_MAX_COUNT, blueprintSampleCount(goalsNow, unitAt(seed, serial, 0)));
  if (dynamic) {
    if (unitAt(seed, serial, 9) < blueprintDespawnChance(goalsNow)) dynamic = null;
    else if (dynamic.cells.length > softMax || dynamic.cells.length > BLUEPRINT_MAX_COUNT) {
      // 合计放不下时整组离开，不裁掉其中几格。
      dynamic = null;
    }
  }
  const reserved = dynamic ? dynamic.cells.length : 0;
  // 不补到 softMax：动态多于本次抽样时静态为 0，不强行摘掉整组；消失式不变。
  const staticWant = Math.max(0, want - reserved);
  const batch = rollBlueprintBatch(view, { seed, serial, goals: goalsNow, ball, hoop, maxCount: staticWant, want: staticWant });
  staticCells = batch.cells.slice(0, staticWant);
  if (!dynamic && want > staticCells.length && goalsNow >= 3) {
    if (unitAt(seed, serial, 10) < BLUEPRINT_DYNAMIC_SPAWN) {
      trySpawnDynamic(goalsNow, want - staticCells.length);
    }
  }
  hasBatch = true;
  keepOnlyDynamicLit(carriedLit);
  // 只有黑锁发生变化时才补判：避免换批后把仍点亮的孤立动态格立刻清掉。
  const afterLocks = blueprintLockedLines();
  if (beforeLocks.rows.size !== afterLocks.rows.size || beforeLocks.cols.size !== afterLocks.cols.size
    || [...beforeLocks.rows].some((row) => !afterLocks.rows.has(row))
    || [...beforeLocks.cols].some((col) => !afterLocks.cols.has(col))) {
    recheckFieldLines();
  }
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

export function stepBlueprint(
  dt: number,
  playing: boolean,
  next?: BlueprintAim,
  world?: View,
  opts?: { generationHold?: boolean },
) {
  if (next) aim = next;
  if (world) view = { w: world.w, h: world.h, floorY: world.floorY, ballR: world.ballR, hoopInner: world.hoopInner };
  const goalsNow = aim ? finiteGoals(aim.goals) : goals;
  // 黑洞存在时不换静态、不新生成动态。已在场上的照常伸缩。洞结束后进球数若已变，再按当前数补一批。
  if (!opts?.generationHold && (!hasBatch || goalsNow !== goals)) applyGoalChange(goalsNow);
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

/** 墙面一格的屏幕边长。横竖共用这一个整数，避免分别取整后变成矩形。 */
export function blueprintBlockSize(world: Pick<World, "w">) {
  return Math.max(8, Math.round(BLUEPRINT_BLOCK_SIZE * (world.w / 390)));
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
  const spacing = size / floorLineDensity;
  const denom = lift + spacing * (1 - n);
  if (denom <= 1e-3) return Number.POSITIVE_INFINITY;
  return vp.y + (lift * (lift + spacing)) / denom;
}

/** 交线处横坐标 junctionX 的纵线，在画面高度 y 上的位置。 */
export function blueprintFloorDepthX(world: View, junctionX: number, y: number) {
  const vp = blueprintVanishingPoint(world);
  const lift = world.floorY - vp.y;
  if (lift <= 1e-3) return junctionX;
  // Pivot each ray about its original wall/floor junction, never translate that origin.
  return junctionX + (junctionX - vp.x) * ((y - world.floorY) / lift) * floorRaySpread;
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

/**
 * 倒计时条所占的竖向范围。尺寸和画面上的计时条一致。
 * 格子顶不得高于条的底边，否则条会把方块上半盖住或裁掉。
 */
export function blueprintHudBar(world: { w: number }) {
  const scoreSize = Math.floor(world.w * 0.15);
  const comboSlot = Math.max(34, Math.floor(world.w * 0.09));
  const barW = Math.floor(world.w * 0.64);
  const barH = Math.floor((barW * 367) / 1817);
  const barY = 14 + scoreSize + comboSlot + 2;
  return { scoreSize, comboSlot, barW, barH, barY, bottom: barY + barH };
}

/** 凸块顶边的最低位置：既要离开画面顶部两成，也要整格落在倒计时条下面。 */
export function blueprintPlayfieldTop(world: View) {
  return Math.max(world.h * 0.2, blueprintHudBar(world).bottom);
}

function cellAllowed(world: View, rect: Rect) {
  if (rect.w < 8 || rect.h < 8) return false;
  if (rect.y < blueprintPlayfieldTop(world)) return false;
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
 * 本批可能生成的格数上限（静态 + 动态合计）。
 * 前 3 个实体进球（actual 0–2，含开局）为 0；之后每 3 球 +1，第 30 球起封顶 10。
 * 上限只决定抽样范围，不是后期密度目标；范围内各整数等概率。
 */
export function blueprintCountSoftMax(made: number) {
  const actual = finiteGoals(made);
  if (actual < 3) return 0;
  return Math.min(BLUEPRINT_MAX_COUNT, 1 + Math.floor((actual - 3) / 3));
}

export function blueprintSampleCount(made: number, roll: number) {
  const softMax = blueprintCountSoftMax(made);
  if (softMax <= 0) return 0;
  if (softMax === 1) return 1;
  // 随机输入通常在 [0,1)，仍容忍 1 / 越界值；非有限输入沿用 0 的安全回退。
  const t = Math.min(1, Math.max(0, Number.isFinite(roll) ? roll : 0));
  return Math.min(softMax, 1 + Math.floor(t * softMax));
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
    /** 若给出则不再抽样，直接作为本批目标格数（仍受 maxCount 限制）。 */
    want?: number;
  },
): BlueprintBatch {
  const layoutSeed = Number.isFinite(opts.seed) ? opts.seed : 1;
  const batchSerial = Number.isFinite(opts.serial) ? opts.serial : 0;
  const made = finiteGoals(opts.goals);
  const cap = blueprintQuota(opts.maxCount ?? BLUEPRINT_MAX_COUNT);
  const want = opts.want != null
    ? Math.min(cap, Math.max(0, Math.floor(opts.want)))
    : Math.min(cap, blueprintSampleCount(made, unitAt(layoutSeed, batchSerial, 0)));
  const duration = BLUEPRINT_RAISE;
  const empty = (): BlueprintBatch => ({ cells: [], duration, shape: "line", length: 1, variant: 0, mode: "idle", anchor: null, target: 0, pieces: [] });
  if (want <= 0) return empty();
  const ball = opts.ball && Number.isFinite(opts.ball.x) && Number.isFinite(opts.ball.y) ? opts.ball : null;
  const hoop = opts.hoop && Number.isFinite(opts.hoop.x) && Number.isFinite(opts.hoop.y) ? opts.hoop : null;
  const banned = new Set((opts.exclude ?? []).map(cellKey));
  const legal = blueprintLegalCells(world, ball).filter((cell) => !banned.has(cellKey(cell)));
  const path = ball && hoop ? legal.filter((cell) => blueprintOnShotPath(world, cell, ball, hoop)) : [];
  const wantPath = unitAt(layoutSeed, batchSerial, 4) < 0.5 && path.length > 0;
  const firstPool = wantPath ? path : legal;
  const mode: "idle" | "path" = wantPath ? "path" : "idle";
  const orderPool = (pool: Cell[]) => pool.slice().sort((a, b) => hash01(layoutSeed + batchSerial * 3.1, a) - hash01(layoutSeed + batchSerial * 3.1, b) || a.row - b.row || a.col - b.col);

  const pieces: BlueprintBatchPiece[] = [];
  const placed: BlueprintCellRef[] = [];
  const occupied = new Set<string>();

  const remainingLegal = (pool: Cell[]) => pool.filter((cell) => !occupied.has(cellKey(cell)));

  const placeBest = (shape: BlueprintShape, length: number, variant: number, pool: Cell[], room: number) => {
    const open = remainingLegal(pool);
    const allowed = new Set(open.map((cell) => `${cell.col}:${cell.row}`));
    let best: BlueprintCellRef[] = [];
    let bestAnchor: BlueprintCellRef | null = null;
    for (const cell of orderPool(open)) {
      const stamped = blueprintStamp(shape, length, variant, { col: cell.col, row: cell.row });
      const kept = clipBlueprintCells(stamped, (col, row) => allowed.has(`${col}:${row}`)).slice(0, room);
      if (kept.length > best.length) {
        best = kept;
        bestAnchor = { col: cell.col, row: cell.row };
      }
      if (best.length >= room) break;
    }
    return { cells: best, anchor: bestAnchor };
  };

  const commit = (shape: BlueprintShape, length: number, variant: number, anchor: BlueprintCellRef, cells: BlueprintCellRef[]) => {
    const unique = cells.filter((cell) => {
      const key = cellKey(cell);
      if (occupied.has(key)) return false;
      occupied.add(key);
      return true;
    }).slice(0, want - placed.length);
    if (!unique.length) return;
    pieces.push({ shape, length, variant, anchor, cells: unique.map((cell) => ({ col: cell.col, row: cell.row })) });
    placed.push(...unique);
  };

  if (want === 1) {
    const pick = orderPool(firstPool)[0];
    if (pick) commit("line", 1, 0, { col: pick.col, row: pick.row }, [{ col: pick.col, row: pick.row }]);
  } else {
    let salt = 50;
    let first = true;
    while (placed.length < want) {
      const room = want - placed.length;
      const fillPool = first ? firstPool : legal;
      const open = remainingLegal(fillPool);
      if (!open.length) {
        // 第一段若落在投篮路上且路不够，改用全部合法格把数量补满。
        if (first && fillPool !== legal && remainingLegal(legal).length) {
          first = false;
          continue;
        }
        break;
      }
      if (room === 1 || open.length === 1) {
        const pick = orderPool(open)[0]!;
        commit("line", 1, 0, { col: pick.col, row: pick.row }, [{ col: pick.col, row: pick.row }]);
        first = false;
        continue;
      }
      const shape = BLUEPRINT_SHAPES[Math.min(BLUEPRINT_SHAPES.length - 1, Math.floor(unitAt(layoutSeed, batchSerial, salt++) * BLUEPRINT_SHAPES.length))]!;
      const length = shapeLength(shape, room);
      const variant = Math.min(7, Math.floor(unitAt(layoutSeed, batchSerial, salt++) * 8));
      const hit = placeBest(shape, length, variant, fillPool, room);
      if (hit.cells.length && hit.anchor) {
        commit(shape, length, variant, hit.anchor, hit.cells);
      } else {
        const pick = orderPool(open)[0]!;
        commit("line", 1, 0, { col: pick.col, row: pick.row }, [{ col: pick.col, row: pick.row }]);
      }
      first = false;
    }
  }

  const head = pieces[0];
  const weights = blueprintKindWeights(made);
  const capped = placed.slice(0, Math.min(want, cap)).map((cell, index) => {
    const roll = unitAt(layoutSeed, batchSerial, 20 + index);
    const kind = blueprintPickKind(weights, roll);
    return { ...cell, kind };
  });
  return {
    cells: capped,
    duration,
    shape: head?.shape ?? "line",
    length: head?.length ?? 1,
    variant: head?.variant ?? 0,
    mode,
    anchor: capped.length ? head?.anchor ?? null : null,
    target: want,
    pieces,
  };
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
    kind: ref.kind ?? "white",
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

function allLiveLayers(clock: Pick<BlueprintClock, "staticCells" | "cells" | "dynamic">) {
  return [...(clock.staticCells ?? clock.cells ?? []), ...(clock.dynamic?.cells ?? [])];
}

/** 仍占着这一格的所有层，含黑块。动态缩平过程中高度接近 0 也算在场。 */
export function blueprintFieldCells(clock: Pick<BlueprintClock, "staticCells" | "cells" | "dynamic">) {
  const seen = new Set<string>();
  const cells: BlueprintCellRef[] = [];
  const add = (cell: BlueprintCellRef) => {
    const key = cellKey(cell);
    if (seen.has(key)) return;
    seen.add(key);
    cells.push({ col: cell.col, row: cell.row });
  };
  for (const cell of allLiveLayers(clock)) add(cell);
  return cells;
}

/** 参与横竖连续段的格：有可清除层才算，纯黑格像空挡一样拆开两边。 */
export function blueprintClearableFieldCells(clock: Pick<BlueprintClock, "staticCells" | "cells" | "dynamic">) {
  const seen = new Set<string>();
  const cells: BlueprintCellRef[] = [];
  for (const cell of allLiveLayers(clock)) {
    if (!blueprintKindClearable(cell.kind)) continue;
    const key = cellKey(cell);
    if (seen.has(key)) continue;
    seen.add(key);
    cells.push({ col: cell.col, row: cell.row });
  }
  return cells;
}

/** 仍有至少一块黑的行、列。锁定取并集，呈每块黑所在行 + 所在列的十字锁。 */
export function blueprintLockedLines(clock: Pick<BlueprintClock, "staticCells" | "cells" | "dynamic"> = getBlueprintClock()) {
  const rows = new Set<number>();
  const cols = new Set<number>();
  for (const cell of allLiveLayers(clock)) {
    if (blueprintBlockKind(cell) !== "black") continue;
    rows.add(cell.row);
    cols.add(cell.col);
  }
  return { rows, cols };
}

export function blueprintCellLocked(col: number, row: number, clock?: Pick<BlueprintClock, "staticCells" | "cells" | "dynamic">) {
  const { rows, cols } = blueprintLockedLines(clock ?? getBlueprintClock());
  return rows.has(row) || cols.has(col);
}

/** 清段用的格：排除黑块，也排除被行列锁住的格（锁定格像空挡一样截断）。 */
export function blueprintSegmentFieldCells(clock: Pick<BlueprintClock, "staticCells" | "cells" | "dynamic">) {
  return blueprintClearableFieldCells(clock).filter((cell) => !blueprintCellLocked(cell.col, cell.row, clock));
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

/** 按层丢掉可清除的层；黑块留下。高度接近 0 的可清除层也算被清走。 */
function dropClearableLayers(keys: Set<string>) {
  const keep = (cell: BlueprintCellRef) => !(keys.has(cellKey(cell)) && blueprintKindClearable(cell.kind));
  staticCells = staticCells.filter(keep);
  if (dynamic) {
    const cells = dynamic.cells.filter(keep);
    if (!cells.length) {
      dynamic = null;
    } else if (cells.length !== dynamic.cells.length) {
      const dropped = new Set(dynamic.cells.filter((cell) => !keep(cell)).map(cellKey));
      const pending = dynamic.phase === "cross_out"
        ? blueprintTranslateCells(cells, dynamic.dir)
        : dynamic.pending.filter((cell) => !dropped.has(cellKey(cell)));
      dynamic = { ...dynamic, cells, pending };
    }
  }
  for (const key of keys) {
    if (!layersAtKey(key).some((layer) => blueprintKindClearable(layer.kind))) lit.delete(key);
  }
}

/** 反物质开洞：连黑块一并收走。 */
function dropAllLayers(keys: Set<string>) {
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

function layersAtKey(key: string) {
  return [...staticCells, ...(dynamic?.cells ?? [])].filter((cell) => cellKey(cell) === key);
}

function layersAt(ref: BlueprintCellRef) {
  return layersAtKey(cellKey(ref));
}

function clearableLayersAt(ref: BlueprintCellRef) {
  return layersAt(ref).filter((layer) => blueprintKindClearable(layer.kind));
}

function hasClearableLayer(ref: BlueprintCellRef) {
  return clearableLayersAt(ref).length > 0;
}

function hasBlackLayer(ref: BlueprintCellRef) {
  return layersAt(ref).some((layer) => blueprintBlockKind(layer) === "black");
}

function alreadyRetracting(ref: BlueprintCellRef) {
  return clearing.some((item) => item.col === ref.col && item.row === ref.row);
}

function displayKindAt(ref: BlueprintCellRef): BlueprintBlockKind {
  const clearable = clearableLayersAt(ref);
  if (clearable.length) return blueprintBlockKind(clearable.at(-1));
  const layers = layersAt(ref);
  return layers.length ? blueprintBlockKind(layers.at(-1)) : "white";
}

/** 红十字豁免行列锁。各方向独立延伸，遇空格或实际黑层停止；叠层只清非黑层。 */
export function blueprintRedCrossCells(col: number, row: number) {
  const cross: BlueprintCellRef[] = [{ col, row }];
  // 触发格自身叠黑时只清它的非黑层，不穿过同格黑层向外传播。
  if (hasBlackLayer({ col, row })) return cross;
  for (const { dc, dr } of BLUEPRINT_DIR_DELTA) {
    for (let c = col + dc, r = row + dr; ; c += dc, r += dr) {
      const ref = { col: c, row: r };
      const layers = layersAt(ref);
      if (!layers.length) break;
      if (hasBlackLayer(ref)) {
        if (hasClearableLayer(ref)) cross.push(ref);
        break;
      }
      cross.push(ref);
    }
  }
  return uniqueCells(cross);
}

/**
 * 下一次实体进球的得分 ×2。分身不兑现、不消耗。每次只消耗 1 次、只乘一次，两次双倍是两球各 ×2。
 */
export function applyBlueprintScoreDouble(settled: number, real: boolean) {
  const score = Number.isFinite(settled) ? settled : 0;
  if (!real || scoreDoubleCharges <= 0) return { score, doubled: false, multiplier: 1, charges: scoreDoubleCharges };
  scoreDoubleCharges -= 1;
  return { score: score * 2, doubled: true, multiplier: 2, charges: scoreDoubleCharges };
}

function grantRewardEvent(event: BlueprintRewardEvent) {
  if (event === "base") rewards.base += 2;
  else if (event === "combo") rewards.combo += 1;
  else if (event === "seconds") rewards.seconds += BLUEPRINT_CLOCK_SECONDS;
  else if (event === "scoreDouble") scoreDoubleCharges += 1;
  rewardEvents.push(event);
}

function pickGreenReward(): BlueprintRewardEvent | null {
  const choices = blueprintRewardPool(allowSeconds, goals);
  if (!choices.length) return null;
  return choices[Math.min(choices.length - 1, Math.floor(unitAt(seed, rewardSerial++, 41) * choices.length))]!;
}

/** 每个被移除坐标奖励一次，即使静态/动态同格均为 green；无需先点亮。 */
function rewardClearedGreens(cells: readonly BlueprintCellRef[], applyFieldEffects: boolean) {
  const areaCenters: BlueprintCellRef[] = [];
  const turnRedCenters: BlueprintCellRef[] = [];
  for (const cell of uniqueCells(cells)) {
    if (!layersAt(cell).some((layer) => layer.kind === "green")) continue;
    const event = pickGreenReward();
    if (!event) continue;
    grantRewardEvent(event);
    if (!applyFieldEffects) continue;
    if (event === "areaClear") areaCenters.push({ col: cell.col, row: cell.row });
    if (event === "turnRed") turnRedCenters.push({ col: cell.col, row: cell.row });
  }
  return { areaCenters, turnRedCenters };
}

function applyAreaClear(center: BlueprintCellRef) {
  const clock = getBlueprintClock();
  const toClear: BlueprintCellRef[] = [];
  const reds: BlueprintCellRef[] = [];
  for (const neighbor of blueprintAreaNeighbors(center.col, center.row)) {
    if (alreadyRetracting(neighbor) || !layersAt(neighbor).length) continue;
    const locked = blueprintCellLocked(neighbor.col, neighbor.row, clock);
    if (locked) {
      // 锁定白块只点亮、不缩回；锁定绿/红不清除、不领奖、不引爆；黑块本来就不清。
      if (clearableLayersAt(neighbor).some((layer) => blueprintBlockKind(layer) === "white")) {
        lit.add(cellKey(neighbor));
      }
      continue;
    }
    if (!hasClearableLayer(neighbor)) continue;
    lit.add(cellKey(neighbor));
    if (clearableLayersAt(neighbor).some((layer) => layer.kind === "red")) reds.push(neighbor);
    else toClear.push(neighbor);
  }
  // 先固定这一波的十字路径。只有红爆目标豁免锁，普通范围目标仍走默认锁过滤。
  const redTargets = uniqueCells(reds.flatMap((red) => blueprintRedCrossCells(red.col, red.row)));
  const redCleared = beginLineClear(redTargets, true, false, "redCross");
  for (const cell of toClear) {
    if (hasClearableLayer(cell) && !alreadyRetracting(cell)) lit.add(cellKey(cell));
  }
  return redCleared + beginLineClear(toClear, true, false);
}

/** 把邻格改写成红色。这是改写不是消除，锁定格也转变；新红不立刻引爆。 */
function paintCellRed(ref: BlueprintCellRef) {
  if (alreadyRetracting(ref) || !layersAt(ref).length) return false;
  let keptRed = false;
  let changed = false;
  const paint = (list: BlueprintCellRef[]) => {
    const out: BlueprintCellRef[] = [];
    for (const cell of list) {
      if (cellKey(cell) !== cellKey(ref)) {
        out.push(cell);
        continue;
      }
      if (blueprintBlockKind(cell) !== "red") changed = true;
      if (keptRed) {
        changed = true;
        continue;
      }
      keptRed = true;
      out.push({ ...cell, kind: "red" });
    }
    return out;
  };
  staticCells = paint(staticCells);
  if (dynamic) {
    const cells = paint(dynamic.cells);
    if (!cells.length) dynamic = null;
    else if (cells.length !== dynamic.cells.length || changed) {
      const pending = dynamic.phase === "cross_out"
        ? blueprintTranslateCells(cells, dynamic.dir)
        : dynamic.pending.filter((cell) => cellKey(cell) !== cellKey(ref) || cells.some((kept) => cellKey(kept) === cellKey(cell)));
      dynamic = { ...dynamic, cells, pending };
    }
  }
  return changed || keptRed;
}

function applyTurnRed(center: BlueprintCellRef) {
  const field = blueprintFieldCells(getBlueprintClock());
  if (!field.length) return 0;
  for (const neighbor of blueprintTurnRedNeighbors(center.col, center.row)) {
    paintCellRed(neighbor);
  }
  // 黑被改成红后立刻重算锁，并对已点亮且不再锁定的白块补判清段。
  return recheckFieldLines();
}

/** 测试/结算入口：以该格为中心执行转红奖励。空场不再扫。 */
export function applyBlueprintTurnRed(col: number, row: number) {
  return applyTurnRed({ col, row });
}

function beginLineClear(
  cells: readonly BlueprintCellRef[],
  payPending = true,
  applyFieldEffects = true,
  cause: "normal" | "redCross" = "normal",
) {
  const fresh = uniqueCells(cells).filter((cell) => (
    hasClearableLayer(cell)
    && !alreadyRetracting(cell)
    && (cause === "redCross" || !blueprintCellLocked(cell.col, cell.row))
  ));
  if (!fresh.length) return 0;
  const { areaCenters, turnRedCenters } = rewardClearedGreens(fresh, applyFieldEffects);
  const started = fresh.map((cell) => ({
    col: cell.col,
    row: cell.row,
    kind: displayKindAt(cell),
    age: 0,
    span: BLUEPRINT_CROSS_RAISE,
    from: extendAt(cell),
  }));
  dropClearableLayers(new Set(started.map(cellKey)));
  clearing = clearing.concat(started);
  if (payPending) pendingBonus += started.length;
  let extra = 0;
  for (const center of areaCenters) extra += applyAreaClear(center);
  for (const center of turnRedCenters) extra += applyTurnRed(center);
  return started.length + extra;
}

/**
 * 反物质开黑洞：场上凸块立刻全部消失，静态、动态、正在缩回的都算。
 * 只返回其中仍算已点亮的格数，调用方立刻加进基础分。未亮的也消失，但不给分。
 * 不挂待领。同格只计一次。再调一次时场上已空，返回 0。
 */
export function consumeBlueprintLitForHole() {
  const field = blueprintFieldCells(getBlueprintClock());
  const litCount = field.filter((cell) => lit.has(cellKey(cell))).length;
  // 黑洞清除的未亮 green 同样领奖；正在清除的动画早已领奖，不再计算。
  // 抽到周围消除只记事件，不再对已被清空的场地扫一遍。
  rewardClearedGreens(field, false);
  dropAllLayers(new Set(field.map(cellKey)));
  clearing = [];
  return litCount;
}

/** 落地、点亮或锁解除之后，把当前在场的每一行、每一列再判一次。锁定格不参与清段。 */
function recheckFieldLines() {
  const clock = getBlueprintClock();
  const field = blueprintSegmentFieldCells(clock);
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
 * 锁定行/列普通清段、踩绿仍受锁；实体碰撞红块先触发十字，红爆豁免行列锁。
 * 返回本次开始缩回的格数。
 */
export function touchBlueprintCell(world: View, col: number, row: number) {
  const clock = getBlueprintClock();
  const live = blueprintFieldCells(clock);
  const key = `${col}:${row}`;
  if (!live.some((cell) => cellKey(cell) === key)) return 0;
  const solid = blueprintBlocks(world).some((block) => block.col === col && block.row === row && block.solid);
  if (!solid) return 0;
  const ref = { col, row };
  // 纯黑格只做普通碰撞：不点亮，不进入清段。
  if (!hasClearableLayer(ref)) return 0;
  lit.add(key);
  if (clearableLayersAt(ref).some((cell) => cell.kind === "red")) {
    return beginLineClear(blueprintRedCrossCells(col, row), true, true, "redCross");
  }
  if (blueprintCellLocked(col, row, clock)) return 0;
  const field = blueprintSegmentFieldCells(clock);
  const cleared = uniqueCells([
    ...blueprintRowClears(row, field, lit),
    ...blueprintColClears(col, field, lit),
  ]);
  if (!cleared.length) return 0;
  return beginLineClear(cleared);
}

/** 领走待领分并清零。没有挂分时返回 0。 */
export function claimBlueprintBonus() {
  const bonus = pendingBonus;
  pendingBonus = 0;
  return bonus;
}

/**
 * 只有实体进球才领走清格分。分身 / 幽灵进球返回 0，累计保持原数。
 * 画面不单独提示这笔分，它只加进下一次实体进球的总分和主飘字。
 */
export function claimBlueprintBonusForBasket(real: boolean) {
  if (!real) return 0;
  return claimBlueprintBonus();
}

/**
 * 实体进球的得分路径：领走待领，主飘字用基础分 + 这笔。
 * 分身返回 bonus 0、shown 仍是基础分，pending 不动。
 */
export function settleBlueprintBasket(gain: number, real: boolean) {
  const bonus = claimBlueprintBonusForBasket(real);
  const base = Number.isFinite(gain) ? gain : 0;
  if (!real) return { bonus: 0, shown: base, doubled: false };
  const applied = applyBlueprintScoreDouble(base + bonus, true);
  return { bonus, shown: applied.score, doubled: applied.doubled };
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
  /** 玻璃球复用地面有效法向反弹（含静止阈值）；其它球缺省走原凸块响应。 */
  normalRebound?: (incomingNormalSpeed: number) => number,
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
    const impulse = normalRebound ? -vn + normalRebound(-vn) : -BLUEPRINT_BOUNCE * vn;
    ball.vx += impulse * hit.nx;
    ball.vy += impulse * hit.ny;
  }
  const vnOut = ball.vx * hit.nx + ball.vy * hit.ny;
  const embedded = hit.t === 0 && hit.depth > 0.5;
  const landedOnTop = hit.ny < -0.5;
  const escape = topEscapeSpeed(world);
  // 地面响应不能再被普通凸块的最小弹起/侧滑助推覆盖（玻璃默认地面恢复系数为 0）。
  if (!normalRebound && ((vn < 0 && landedOnTop) || embedded)) {
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
        if (major !== (horizontal ? index % 4 === 0 : blueprintMajorColumn(index))) continue;
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
      if (major !== blueprintMajorColumn(i)) continue;
      const x = Math.round(grid.ox + i * grid.size);
      ctx.moveTo(x + 0.5, floorY);
      ctx.lineTo(blueprintFloorDepthX(world, x, h + 1) + 0.5, h + 1);
    }
    strokeWhite(ctx, major);
  };
  const drawBands = (major: boolean) => {
    ctx.beginPath();
    for (let n = 1; n < 64; n++) {
      if (major !== (n % 4 === 0)) continue;
      const y = blueprintFloorRowY(world, n);
      if (y > h - 1) break;
      if (y <= floorY + 0.5) continue;
      // 和墙面同一套像素对齐。第一格高度因此等于墙面格子，而不是差半个像素。
      const line = Math.round(y) + 0.5;
      ctx.moveTo(0, line);
      ctx.lineTo(w, line);
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

/** 凸块白描边的矩形。落在该格四条网格线上，用来盖住背景网格，不是填色内侧再套一圈。 */
export function blueprintBlockStrokeRect(cell: Rect) {
  const { left, top, right, bottom } = blueprintCellPixels(cell);
  return { x: left + 0.5, y: top + 0.5, w: right - left, h: bottom - top };
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

/**
 * 把一块绘制裁到倒计时条底边以下。整块都在条内则不画。
 * top ≤ 0 时不裁。
 */
export function clipBlueprintPaintBox<T extends BlueprintShadowBox>(box: T, top: number): T | null {
  if (!(top > 0)) return box;
  const y1 = box.y + box.h;
  const y = Math.max(box.y, top);
  const h = y1 - y;
  if (!(h > 0) || !(box.w > 0)) return null;
  return { ...box, y, h };
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

function drawBlock(ctx: CanvasRenderingContext2D, block: BlueprintBlock, others: readonly BlueprintBlock[], hudBottom = 0) {
  const extend = block.extend;
  if (extend < 0.04) return;
  const { fill } = blueprintCellPixels(block.cell);
  const shadow = blueprintShadowBox(block.cell, extend);
  const lowers = others
    .filter((other) => other !== block && other.extend > 0)
    .map((other) => ({ box: blueprintCellCover(other.cell), extend: other.extend }));
  for (const piece of blueprintShadowPieces(shadow, lowers)) {
    const clipped = clipBlueprintPaintBox(piece, hudBottom);
    if (!clipped) continue;
    paintShadow(ctx, shadow, clipped, extend);
  }
  if (block.kind === "black") {
    ctx.fillStyle = BLUEPRINT_BLACK;
    ctx.fillRect(fill.x, fill.y, fill.w, fill.h);
  } else if (block.lit || block.kind !== "white") {
    const rgb = block.kind === "green" ? "76, 230, 133" : block.kind === "red" ? BLUEPRINT_RED_RGB : BLUEPRINT_LIT_RGB;
    ctx.fillStyle = `rgba(${rgb}, ${(block.lit ? 0.55 : 0.35) + 0.4 * Math.min(1, extend)})`;
    ctx.fillRect(fill.x, fill.y, fill.w, fill.h);
  } else {
    ctx.fillStyle = `rgba(236, 244, 255, ${blueprintFillAlpha(extend)})`;
    ctx.fillRect(fill.x, fill.y, fill.w, fill.h);
  }
  // 不透明白描边压在该格四条网格线上，盖住底下的网格；所有已画出的凸块都画，含未点亮白块。
  const stroke = blueprintBlockStrokeRect(block.cell);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  ctx.strokeRect(stroke.x, stroke.y, stroke.w, stroke.h);
}

/** Redraw only solid blocks after the code-world dark wash, preserving their colors. */
export function drawBlueprintCodeBlocks(ctx: CanvasRenderingContext2D, world: View, hudBottom = 0) {
  ctx.save();
  ctx.globalAlpha = 0.48;
  drawBlueprintBlocks(ctx, world, hudBottom);
  ctx.restore();
}

function drawScoreDoubleHint(ctx: CanvasRenderingContext2D, world: View, hudBottom: number) {
  if (scoreDoubleCharges <= 0) return;
  const text = scoreDoubleCharges > 1 ? `进球得分 ×2 ×${scoreDoubleCharges}` : "下一次进球 ×2";
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#ffffff";
  ctx.font = `${Math.max(12, Math.round(world.w * 0.035))}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const y = Math.max(hudBottom + 6, world.h * 0.08);
  ctx.fillText(text, world.w / 2, y);
  ctx.restore();
}

export function drawBlueprint(ctx: CanvasRenderingContext2D, world: View, hudBottom = 0) {
  ctx.fillStyle = BLUEPRINT_BLUE;
  ctx.fillRect(0, 0, world.w, world.h);
  strokeGrid(ctx, world);
  drawPerspectiveFloor(ctx, world);
  drawBlueprintBlocks(ctx, world, hudBottom);
  drawScoreDoubleHint(ctx, world, hudBottom);
}

function drawBlueprintBlocks(ctx: CanvasRenderingContext2D, world: View, hudBottom: number) {
  const clock = getBlueprintClock();
  const blocks = blueprintBlocks(world, clock);
  const covered = new Set((clock.dynamic?.cells ?? []).map((cell) => `${cell.col}:${cell.row}`));
  // 重叠格只按动态组的高度画。静态那一层仍参与碰撞（取较高的），但不把组内几格衬得高低不齐。
  const visible = blocks
    .filter((block) => block.dynamic || !covered.has(`${block.col}:${block.row}`))
    .sort((a, b) => a.cell.y - b.cell.y || a.cell.x - b.cell.x || Number(a.dynamic) - Number(b.dynamic));
  for (const block of visible) drawBlock(ctx, block, visible, hudBottom);
}
