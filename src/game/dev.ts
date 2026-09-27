import type { GrafKey } from "./scenes";
import type { BallId } from "./balls";
import type { PlayMode } from "./types";
import type { ModifierId } from "./modifiers";
import { MODIFIER_LABELS } from "./modifiers";

export type DevSceneId = "void" | "street" | "prison";

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
  /** Rogue secondary fusion balls (skills only; at most three). */
  fuseBall: BallId | null;
  fuseBalls: BallId[];
  phys: DevPhys;
  playMode: PlayMode;
  /** Forced stage modifier; null = auto roll for rogue. */
  modifierForce: ModifierId | null;
  /** Currently active modifier (from run or force). */
  modifier: ModifierId;
  prisonProjectiles: boolean;
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
  fuseBall: null,
  fuseBalls: [],
  phys: { ...DEFAULT_PHYS },
  playMode: "classic",
  modifierForce: null,
  modifier: "none",
  prisonProjectiles: true,
};

export type DevCmd =
  | { t: "unlock" }
  | { t: "enter" }
  | { t: "exit" }
  | { t: "scene"; id: DevSceneId }
  | { t: "playMode"; mode: PlayMode }
  | { t: "rogueTool"; kind: "gold" | "shop" | "clearSettle" | "clearScore" | "closeShop" }
  | { t: "rogueGold"; n: number }
  | { t: "rogueScore"; n: number }
  | { t: "rogueTarget"; n: number }
  | { t: "rogueGrant"; id: string }
  | { t: "rogueFuse"; id: BallId | null }
  | { t: "modifier"; id: ModifierId | "auto" }
  | { t: "prisonProjectiles"; on: boolean }
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
  | { t: "physGroupReset"; group: "ball" | "scene" }
  | { t: "physReset" }
  | { t: "resetMatch" }
  | { t: "gfx"; key: "ballShade" | "ballShadow" | "particles" | "graffitiFx" | "impact" | "flash" | "buzzerSpot"; on: boolean };

export const DEV_MODIFIERS: { id: ModifierId | "auto"; label: string }[] = [
  { id: "auto", label: "自动抽取" },
  ...MODIFIER_LABELS.map((m) => ({ id: m.id, label: m.name })),
];

export const DEV_PLAY_MODES: { id: PlayMode; label: string }[] = [
  { id: "classic", label: "经典" },
  { id: "minute", label: "1分钟" },
  { id: "rogue", label: "肉鸽" },
];

export const DEV_SCENES: { id: DevSceneId; label: string }[] = [
  { id: "void", label: "空空间" },
  { id: "street", label: "街头" },
  { id: "prison", label: "监狱" },
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

export const DEV_PHYS: { k: keyof DevPhys; label: string; hint: string; min: number; group: "ball" | "scene" }[] = [
  { k: "jumpUp", label: "\u5411\u4e0a\u8ddd\u79bb", hint: "\u70b9\u51fb\u540e\u5f80\u4e0a\u8df3\u591a\u9ad8", min: 50, group: "ball" },
  { k: "jumpFwd", label: "\u524d\u8fdb\u8ddd\u79bb", hint: "\u70b9\u51fb\u540e\u5f80\u524d\u51b2\u591a\u8fdc", min: 50, group: "ball" },
  { k: "ball", label: "\u7403\u5f39\u529b", hint: "\u7403\u78b0\u5230\u4e1c\u897f\u65f6\u6709\u591a\u5f39", min: 0, group: "ball" },
  { k: "grav", label: "\u91cd\u91cf\uff08\u4e0b\u843d\uff09", hint: "\u7403\u4f53\u7684\u4e0b\u843d\u7279\u6027\uff1b\u8d8a\u9ad8\u4e0b\u843d\u8d8a\u5feb", min: 50, group: "ball" },
  { k: "buoy", label: "\u6d6e\u529b", hint: "\u6301\u7eed\u5411\u4e0a\u62b5\u6d88\u91cd\u529b", min: 0, group: "scene" },
  { k: "air", label: "\u7a7a\u4e2d\u963b\u529b", hint: "\u7a7a\u4e2d\u6c34\u5e73\u51cf\u901f\u3001\u65cb\u8f6c\u53d8\u6162", min: 50, group: "scene" },
  { k: "roll", label: "\u5730\u9762\u963b\u529b", hint: "\u8d34\u5730\u6eda\u52a8\u51cf\u901f", min: 50, group: "scene" },
  { k: "floor", label: "\u5730\u9762\u5f39\u529b", hint: "\u7838\u5730\u677f\u56de\u5f39", min: 50, group: "scene" },
  { k: "hoop", label: "\u7bee\u677f\u7bee\u7b50", hint: "\u6253\u677f\u3001\u6253\u94c1\u56de\u5f39", min: 50, group: "scene" },
  { k: "rimFric", label: "\u7bee\u7b50\u6469\u64e6", hint: "\u6253\u94c1\u65f6\u987a\u7740\u7b50\u6cbf\u88ab\u8e6d\u6389\u7684\u901f\u5ea6", min: 0, group: "scene" },
  { k: "boardFric", label: "\u7bee\u677f\u6469\u64e6", hint: "\u6253\u677f\u65f6\u987a\u7740\u677f\u9762\u88ab\u8e6d\u6389\u7684\u901f\u5ea6", min: 0, group: "scene" },
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
