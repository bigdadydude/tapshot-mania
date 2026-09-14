import type { DevHud } from "./dev";
import type { BallId } from "./balls";
import type { RogueHud } from "./rogue";

export type Phase = "title" | "playing" | "settle" | "hub" | "over";

/** Classic = decaying shot clock; minute = fixed 60s; rogue = staged run. */
export type PlayMode = "classic" | "minute" | "rogue";

export const FIRE_WHITE = 5;
export const FIRE_SMOKE = 10;
export const FIRE_IGNITE = 15;
export const FIRE_BLAZE = 20;

export function fireStage(combo: number): 0 | 1 | 2 | 3 | 4 {
  if (combo >= FIRE_BLAZE) return 4;
  if (combo >= FIRE_IGNITE) return 3;
  if (combo >= FIRE_SMOKE) return 2;
  if (combo >= FIRE_WHITE) return 1;
  return 0;
}

export type TrailPt = { x: number; y: number };

/** Ninja ball afterimage clone drawn along delayed path. */
export type NinjaCloneDraw = { x: number; y: number; r: number; alpha: number };

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  hue: number;
  spin: number;
  vr: number;
};

export type NetNode = {
  x: number;
  y: number;
  px: number;
  py: number;
  pinned: boolean;
};

export type Ball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  spin: number;
  omega: number;
  squash: number;
  scored: boolean;
  hitRim: boolean;
  hitBoard: boolean;
};

export type Hoop = {
  side: -1 | 1;
  x: number;
  y: number;
  inner: number;
  tube: number;
  targetX: number;
  moving: boolean;
  moveAmp: number;
  moveT: number;
  moveDir: number;
  moveKind: 0 | 1 | 2 | 3 | 4;
  baseY: number;
  baseX: number;
  active: boolean;
  hold: number;
  couple: boolean;
  sear: 0 | 1 | 2 | 3;
  char: number;
  burning: boolean;
  /** Ice freeze active (1) or not (0). */
  frost: 0 | 1;
  /** Seconds left frozen. */
  frostLeft: number;
  netPulse: number;
  jolt: number;
  joltDir: number;
  net: NetNode[];
};

export type Callout = {
  text: string;
  x: number;
  y: number;
  life: number;
  max: number;
  kind: "score" | "tag" | "combo" | "base";
  capY?: number;
};

export type CloudMode = "dance" | "drift" | "off";

export type Gfx = {
  clouds: CloudMode;
  ballShade: boolean;
  ballShadow: boolean;
  particles: boolean;
  graffitiFx: boolean;
  impact: boolean;
  flash: boolean;
  buzzerSpot: boolean;
};

export const DEFAULT_GFX: Gfx = {
  clouds: "dance",
  ballShade: true,
  ballShadow: true,
  particles: true,
  graffitiFx: true,
  impact: true,
  flash: true,
  buzzerSpot: true,
};

export type PrisonHud = {
  mode: "shackle" | "free";
  /** Combo target for current shackle (d20). */
  target: number;
  /** Bonus from last cleared shackle peak combo × 3; used while free. */
  bonus: number;
  /** Remaining free-state seconds. */
  freeLeft: number;
};

export type HudState = {
  phase: Phase;
  score: number;
  best: number;
  combo: number;
  rank: string;
  muted: boolean;
  hint: boolean;
  paused: boolean;
  master: number;
  music: number;
  sfx: number;
  loadPct: number;
  gfx: Gfx;
  dev: DevHud;
  ballId: BallId;
  playMode: PlayMode;
  prison: PrisonHud | null;
  rogue: RogueHud | null;
  /** Session-only auto-play. Default false; not persisted. */
  autoPlay: boolean;
};

export type World = {
  w: number;
  h: number;
  ox: number;
  oy: number;
  cssW: number;
  cssH: number;
  floorY: number;
  ballR: number;
  hoopInner: number;
  tube: number;
};
