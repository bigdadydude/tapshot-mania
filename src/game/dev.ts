import type { GrafKey } from "./scenes";
import type { BallId } from "./balls";

export type DevSceneId = "void" | "street";

export type DevPhys = {
  ball: number;
  floor: number;
  hoop: number;
  jumpUp: number;
  jumpFwd: number;
  air: number;
  roll: number;
  grav: number;
  buoy: number;
  rimFric: number;
  boardFric: number;
};

export const DEFAULT_PHYS: DevPhys = {
  ball: 1,
  floor: 1,
  hoop: 1,
  jumpUp: 1,
  jumpFwd: 1,
  air: 1,
  roll: 1,
  grav: 1,
  buoy: 0,
  rimFric: 1,
  boardFric: 1,
};

export type DevHud = {
  unlocked: boolean;
  on: boolean;
  scene: DevSceneId;
  freeze: boolean;
  holdHeat: boolean;
  timer01: number;
  sear: number;
  burning: boolean;
  moving: boolean;
  moveKind: number;
  ballId: BallId;
  phys: DevPhys;
};

export const DEFAULT_DEV: DevHud = {
  unlocked: false,
  on: false,
  scene: "void",
  freeze: false,
  holdHeat: false,
  timer01: 1,
  sear: 0,
  burning: false,
  moving: false,
  moveKind: 0,
  ballId: "plain",
  phys: { ...DEFAULT_PHYS },
};

export type DevCmd =
  | { t: "unlock" }
  | { t: "enter" }
  | { t: "exit" }
  | { t: "scene"; id: DevSceneId }
  | { t: "score"; n: number }
  | { t: "addScore"; n: number }
  | { t: "combo"; n: number }
  | { t: "timer01"; n: number }
  | { t: "freeze"; on: boolean }
  | { t: "holdHeat"; on: boolean }
  | { t: "armTimer" }
  | { t: "timeUp" }
  | { t: "buzzer" }
  | { t: "fx"; kind: "flash" | "shake" | "burn" | "burst" | "jolt" | "opener" | "bgmOn" | "bgmOff" }
  | { t: "graf"; key: GrafKey | "clear" }
  | { t: "sear"; n: 0 | 1 | 2 | 3 }
  | { t: "burnNet"; on: boolean }
  | { t: "move"; kind: -1 | 0 | 1 | 2 | 3 | 4 }
  | { t: "resetBall" }
  | { t: "skin"; id: BallId }
  | { t: "phys"; k: keyof DevPhys; n: number }
  | { t: "physReset" };

export const DEV_SCENES: { id: DevSceneId; label: string }[] = [
  { id: "void", label: "空空间" },
  { id: "street", label: "街头" },
];

export const DEV_STAGES: { n: number; label: string }[] = [
  { n: 0, label: "普通" },
  { n: 5, label: "白烟" },
  { n: 10, label: "冒烟" },
  { n: 15, label: "点燃" },
  { n: 20, label: "烈火" },
  { n: 30, label: "30" },
  { n: 40, label: "40" },
  { n: 50, label: "50" },
];

export const DEV_GRAF: { key: GrafKey | "clear"; label: string }[] = [
  { key: "start", label: "GAME ON" },
  { key: "score500", label: "500分" },
  { key: "ignite", label: "点燃" },
  { key: "blaze", label: "烈火" },
  { key: "combo50", label: "50连" },
  { key: "clear", label: "清除" },
];

export const DEV_MOVES: { kind: -1 | 0 | 1 | 2 | 3 | 4; label: string }[] = [
  { kind: -1, label: "静止" },
  { kind: 0, label: "上下" },
  { kind: 1, label: "快上慢下" },
  { kind: 2, label: "快下慢上" },
  { kind: 3, label: "前后" },
  { kind: 4, label: "圆周" },
];

export const DEV_FX: { kind: Extract<DevCmd, { t: "fx" }>["kind"]; label: string }[] = [
  { kind: "flash", label: "白闪" },
  { kind: "shake", label: "晃动" },
  { kind: "burn", label: "燃烧闪" },
  { kind: "burst", label: "粒子" },
  { kind: "jolt", label: "篮架震" },
  { kind: "opener", label: "好戏开始" },
  { kind: "bgmOn", label: "BGM开" },
  { kind: "bgmOff", label: "BGM关" },
];

export const DEV_PHYS: { k: keyof DevPhys; label: string; hint: string; min: number }[] = [
  { k: "jumpUp", label: "向上距离", hint: "点击后往上跳多高", min: 50 },
  { k: "jumpFwd", label: "前进距离", hint: "点击后往前冲多远", min: 50 },
  { k: "grav", label: "重力", hint: "往下掉的力度", min: 50 },
  { k: "buoy", label: "浮力", hint: "原先没有，100% 大约抵消重力", min: 0 },
  { k: "air", label: "空中阻力", hint: "飞在空中减速、旋转变慢", min: 50 },
  { k: "roll", label: "地面阻力", hint: "贴地滚动减速", min: 50 },
  { k: "ball", label: "球弹力", hint: "球碰到东西时有多弹", min: 0 },
  { k: "floor", label: "地面弹力", hint: "砸地板回弹", min: 50 },
  { k: "hoop", label: "篮板篮筐", hint: "打板、打铁回弹", min: 50 },
  { k: "rimFric", label: "篮筐摩擦", hint: "打铁时顺着筐沿被蹭掉的速度", min: 0 },
  { k: "boardFric", label: "篮板摩擦", hint: "打板时顺着板面被蹭掉的速度", min: 0 },
];

export function clampPhys(n: number) {
  return Number.isFinite(n) ? Math.max(0.5, Math.min(2, n)) : 1;
}

export function clampPhysKey(k: keyof DevPhys, n: number) {
  if (k === "buoy") return Number.isFinite(n) ? Math.max(0, Math.min(2, n)) : 0;
  if (k === "ball" || k === "rimFric" || k === "boardFric") {
    return Number.isFinite(n) ? Math.max(0, Math.min(2, n)) : k === "ball" ? 1 : 1;
  }
  return clampPhys(n);
}

export function wantDevQuery() {
  if (typeof window === "undefined") return false;
  return /(?:\?|&)dev=1(?:&|$)/.test(window.location.search);
}
