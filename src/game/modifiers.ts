/** Stage modifiers — shared by rogue stages and (later) story beats. */

import type { Ball, Hoop, World } from "./types";
import { createGhostRings, type GhostRingsMod } from "./modifiers/ghost-rings";
import { createGraveHands } from "./modifiers/grave-hands";
import { createYardLights } from "./modifiers/yard-lights";

export type ModifierId = "none" | "ghost-rings" | "grave-hands" | "yard-lights";

export type ModifierLabel = { id: ModifierId; name: string };

export const MODIFIER_LABELS: ModifierLabel[] = [
  { id: "none", name: "无词条" },
  { id: "ghost-rings", name: "游魂圈" },
  { id: "grave-hands", name: "墓地手" },
  { id: "yard-lights", name: "放风探照" },
];

export function modifierName(id: ModifierId): string {
  return MODIFIER_LABELS.find((m) => m.id === id)?.name ?? id;
}

/** Street pool: clean street + two hazards (prison yard is scene-bound). */
export function rollStageModifier(_stage: number, rng: () => number = Math.random): ModifierId {
  const pool: ModifierId[] = ["none", "ghost-rings", "grave-hands"];
  return pool[Math.floor(rng() * pool.length) % pool.length]!;
}

export type ModifierHost = {
  world: World;
  /** Active primary hoop (mutated in place). */
  getHoop: () => Hoop;
  setHoop: (h: Hoop) => void;
  clearOther: () => void;
  makeGhostHoop: (side: -1 | 1) => Hoop;
  applyHoopScale: (h: Hoop) => void;
  getBall: () => { x: number; y: number; r: number };
  getBallBody: () => Ball;
  notePrev: () => void;
  hoopYRange: () => { minY: number; maxY: number };
  /** Makes this run (for escalating hazards). */
  getMadeCount: () => number;
  /** Bone tap or glass smash. */
  hit: (kind: "bone" | "glass") => void;
  /** Brief floating tag near the ball. */
  tag: (text: string) => void;
  /** Slow roll in from the side opposite the active hoop. */
  rollFromOpposite: () => void;
  /** Draw the active ball kit (same look as in play). */
  paintBall: (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    spin: number,
  ) => void;
  /** Hacker ball awaken ? bolts freeze/fall near the ball. */
  isHackerAwaken?: () => boolean;
  /** Maze ball needs kinetic impulses rather than the standard knockback overwrite. */
  isMaze?: () => boolean;
  /** Active Maze Ball hazard holes; projectiles are consumed by their cores. */
  getMazeHoles?: () => ReadonlyArray<{ x: number; y: number; r: number }>;
};

export type YardLightsHud = {
  /** True while prison uses Yard Time / Lock Down bar art. */
  active: boolean;
  phase: "recess" | "lockdown";
  /**
   * Unused for bar fill — fill follows the street shot clock.
   * Kept for callers; background recess/curfew drive phase swaps only.
   */
  bar01: number;
  barLabel: string;
  /** Center score-area status during lockdown; null during recess. */
  status: string | null;
  statusFlash: boolean;
};

export type StageModifier = {
  id: ModifierId;
  /** Reset / arm for a new stage. */
  begin(host: ModifierHost): void;
  update(dt: number, host: ModifierHost): void;
  /** True → skip board collision for this hoop. */
  skipBoard(h: Hoop): boolean;
  /** True → skip brace collision for this hoop. */
  skipBrace(h: Hoop): boolean;
  /** After a make: return true if the modifier handled next-hoop itself. */
  onScored(host: ModifierHost): boolean;
  /** Hoop may accept rim-plane scores. */
  canScore(h: Hoop): boolean;
  /** Cinematic owns the ball — engine skips integration. */
  holdsBall?(): boolean;
  /** After the ball moves. Return true if it was captured. */
  touchBall?(host: ModifierHost): boolean;
  /** After ball integration / floor collide — for leashes etc. */
  afterPhysics?(dt: number, host: ModifierHost): void;
  /** Player tap / jump while modifier is active. */
  onTap?(host: ModifierHost): void;
  /**
   * Bolt ult vertical strike at world X — knock out anything in that column
   * (e.g. prison searchlights aligned with the dive).
   */
  strikeColumn?(host: ModifierHost, x: number): void;
  /** Multiply jump takeoff height (1 = normal). */
  jumpMul?(): number;
  /** Multiply world gravity while this modifier is active. */
  gravMul?(): number;
  /** True → allow jump taps even when the ball is off-screen. */
  allowHiddenTap?(): boolean;
  /** Optional HUD takeover (prison yard cycle). */
  hud?(): YardLightsHud | null;
  drawWorld?(ctx: CanvasRenderingContext2D, world: World, time: number): void;
  /** Behind ball/hoop (after court). Yard searchlight housings go here. */
  drawWorldBack?(ctx: CanvasRenderingContext2D, world: World, time: number): void;
  /** Full viewport, after the court clip. */
  drawScreen?(ctx: CanvasRenderingContext2D, world: World): void;
  end(): void;
};

const NONE: StageModifier = {
  id: "none",
  begin() {},
  update() {},
  skipBoard() {
    return false;
  },
  skipBrace() {
    return false;
  },
  onScored() {
    return false;
  },
  canScore() {
    return true;
  },
  end() {},
};

export function createModifier(id: ModifierId | string): StageModifier {
  if (id === "ghost-rings") return createGhostRings();
  if (id === "grave-hands") return createGraveHands();
  if (id === "yard-lights") return createYardLights();
  return NONE;
}

export type { GhostRingsMod };
