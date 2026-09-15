import type { BallId } from "../balls";
import type { PlayMode } from "../types";

export type PlayTapSource = "player" | "ai";

export type PlayEventKind =
  | "start"
  | "score"
  | "miss"
  | "rim"
  | "bank"
  | "wrap"
  | "hoop"
  | "over"
  | "stop"
  | "anti-spawn"
  | "anti-collect"
  | "hole-open"
  | "hole-close";

export type PlayEndReason = "over" | "stop" | "restart";

/** One antimatter pickup. `id` is unique within a session. */
export type PlayAntiOrb = {
  id: number;
  x: number;
  y: number;
  r: number;
  pct: number;
};

/** Black-hole geometry while open. `left` is seconds remaining. */
export type PlayHoleState = {
  x: number;
  y: number;
  r: number;
  left: number;
};

/** Dense trajectory sample. Short keys — see README.md. */
export type PlaySample = {
  /** Seconds from run start (physics clock). */
  t: number;
  /** Physics frame index from run start (60Hz). */
  f: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Active hoop side: -1 left, +1 right. */
  hs: -1 | 1;
  hx: number;
  hy: number;
  /** Rim inner half-width. */
  hi: number;
  /** Rim tube radius. */
  ht: number;
  /** Hoop is on a move pattern. */
  hm: boolean;
  /** Backboard AABB (visX, visY, visW, bh). */
  bx: number;
  by: number;
  bw: number;
  bh: number;
  s: number;
  c: number;
  /** Active antimatter orb (anti ball only). */
  am?: PlayAntiOrb;
  /**
   * Pack alias used by some captures: `orbs: [am]`. Analyzer reads this
   * when `am` is missing. Engine export writes both.
   */
  orbs?: PlayAntiOrb[];
  /** Antimatter charge 0–100 (omitted when 0 and idle). */
  ac?: number;
  /** Black hole while open. */
  ho?: PlayHoleState;
};

export type PlayTap = {
  t: number;
  f: number;
  src: PlayTapSource;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

export type PlayEvent = {
  t: number;
  f: number;
  kind: PlayEventKind;
  x?: number;
  y?: number;
  hs?: -1 | 1;
  finish?: "swish" | "bank" | "rim";
  wrap?: "ground" | "height";
  ghost?: boolean;
  score?: number;
  combo?: number;
  /** Antimatter orb id (spawn / collect). */
  antiId?: number;
  /** Charge added (collect) or charge after. */
  pct?: number;
  charge?: number;
  hole?: PlayHoleState;
};

export type PlayRecordingMeta = {
  mode: PlayMode;
  ballId: BallId;
  world: { w: number; h: number; floorY: number };
};

/**
 * One finished (or live) game. Same shape as the original v1 file.
 * Packs wrap these in `sessions[]`.
 */
export type PlayRecording = {
  version: 1;
  recordedAt: string;
  mode: PlayMode;
  ballId: BallId;
  world: { w: number; h: number; floorY: number };
  sampleHz: number;
  step: number;
  duration: number;
  frames: number;
  score: number;
  combo: number;
  endReason: PlayEndReason;
  samples: PlaySample[];
  taps: PlayTap[];
  events: PlayEvent[];
};

/** Multi-game export. Version 2. */
export type PlayRecordingPack = {
  version: 2;
  recordedAt: string;
  sessions: PlayRecording[];
};

export type PlayFrameInput = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hs: -1 | 1;
  hx: number;
  hy: number;
  hi: number;
  ht: number;
  hm: boolean;
  bx: number;
  by: number;
  bw: number;
  bh: number;
  score: number;
  combo: number;
  hitRim: boolean;
  hitBoard: boolean;
  anti?: PlayAntiOrb | null;
  antiCharge?: number;
  hole?: PlayHoleState | null;
};
