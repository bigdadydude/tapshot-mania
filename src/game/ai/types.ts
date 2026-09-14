import type { EffectiveBall } from "../balls.ts";
import type { Phase } from "../types.ts";

/**
 * Skill flags the AI keys off — same OR-merge as rogue fusion (`effectiveBall`).
 * Register policies against these, not against a growing ball-id switch.
 */
export type BallSkillFlags = {
  heat: boolean;
  frost: boolean;
  champ: boolean;
  anti: boolean;
  chain: boolean;
  ninja: boolean;
  glass: boolean;
  wrap: "ground" | "height";
  rScale: number;
};

export function flagsFromKit(
  kit: Pick<
    EffectiveBall,
    "heat" | "frost" | "champ" | "anti" | "chain" | "ninja" | "glass" | "wrap" | "rScale"
  >,
): BallSkillFlags {
  return {
    heat: kit.heat,
    frost: kit.frost,
    champ: kit.champ,
    anti: kit.anti,
    chain: kit.chain,
    ninja: kit.ninja,
    glass: kit.glass,
    wrap: kit.wrap,
    rScale: kit.rScale,
  };
}

export type AiHoop = {
  x: number;
  y: number;
  inner: number;
  side: -1 | 1;
  tube: number;
  moving: boolean;
};

export type AiWorld = {
  dt: number;
  /** Matches `tapJump` admission (except tapLock, which the controller also checks). */
  canShoot: boolean;
  phase: Phase;
  paused: boolean;
  tapLock: number;
  scored: boolean;
  shotOpen: boolean;
  shotMade: boolean;
  timer: number;
  timerArmed: boolean;
  buzzer: boolean;
  timeUp: boolean;
  combo: number;
  streak: number;
  world: { w: number; h: number; floorY: number };
  ball: { x: number; y: number; vx: number; vy: number; r: number };
  hoop: AiHoop;
  other: (AiHoop & { frostLeft: number }) | null;
  ballHidden: boolean;
  onApproachSide: boolean;
  holeOn: boolean;
  hole: { x: number; y: number; r: number } | null;
  antiMatter: { x: number; y: number; r: number } | null;
  antiCharge: number;
  champMode: boolean;
  glassBase: number;
  kit: BallSkillFlags;
  jumpVx: number;
  jumpVy: number;
  gravity: number;
  air: number;
  buoy: number;
  /** `pMul("ball")` — high-bounce kits skip fallBoost. */
  ballMul: number;
  wrapPad: number;
};

export type AiVote = {
  /** `abstain` defers to a lower-priority policy (usually default). */
  action: "tap" | "hold" | "abstain";
  reason: string;
};

export type FlightGuess = {
  scores: boolean;
  swish: boolean;
  hitFloor: boolean;
  minHoopDist: number;
  collectedAnti: boolean;
  minAntiDist: number;
};

export type AiHelpers = {
  predictCurrent: (world: AiWorld) => FlightGuess;
  predictTap: (world: AiWorld) => FlightGuess;
};

export type BallAiPolicy = {
  /** Stable id for docs / debug (`anti`, `glass`, `default`, …). */
  id: string;
  /** Higher wins. Default is 0. */
  priority: number;
  match: (kit: BallSkillFlags) => boolean;
  vote: (world: AiWorld, helpers: AiHelpers) => AiVote;
};

export type AiDecision = {
  tap: boolean;
  reason: string;
  policyId: string;
};
