import type { AiWorld } from "./types.ts";

/**
 * Shot feel derived from live physics, not ball id.
 *
 * `tapJump` writes `jumpVx` / `jumpVy` every tap. Long jumpFwd, high bounce,
 * and slippery glass (low hoop / boardFric) change whether that reset is a
 * make or a wrap.
 */
export type ShotFeel = {
  /** `|jumpVx| / (w * 0.76)` — classic 0.95, heat/frost 1.0, ninja 1.2. */
  jumpFwd: number;
  /** Implied `jumpUp` from v² = 2gH. */
  jumpUp: number;
  /** Seconds, 2 |jumpVy| / g. */
  hangTime: number;
  /** `pMul("ball")` — rubber 2, glass 0. */
  bounce: number;
  /** ball × hoop restitution scale. */
  hoopRest: number;
  /** `pMul("boardFric")`. */
  boardGrip: number;
  /** `pMul("floor")`. */
  floorMul: number;
  /** `pMul("grav")`. */
  grav: number;
  /** jumpFwd high enough that a tap from the pocket wraps. */
  longJump: boolean;
  /** Bounce that pops off the rim instead of dying. */
  hotBounce: boolean;
  /** Low hoop rest / board grip — ninja glass. */
  slipperyGlass: boolean;
  groundWrap: boolean;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function shotFeel(world: Pick<AiWorld, "world" | "jumpVx" | "jumpVy" | "gravity" | "ballMul" | "kit"> & {
  hoopMul?: number;
  boardFric?: number;
  floorMul?: number;
}): ShotFeel {
  const w = Math.max(1, world.world.w);
  const h = Math.max(1, world.world.h);
  const g = Math.max(40, world.gravity);
  const jumpFwd = Math.abs(world.jumpVx) / (w * 0.76);
  const hangTime = (2 * Math.abs(world.jumpVy)) / g;
  const jumpUp = (world.jumpVy * world.jumpVy) / (2 * g * h * 0.185);
  const bounce = world.ballMul;
  const hoopMul = world.hoopMul ?? 1;
  const boardGrip = world.boardFric ?? 1;
  const floorMul = world.floorMul ?? 1;
  const grav = g / (h * 3.1);
  return {
    jumpFwd,
    jumpUp,
    hangTime,
    bounce,
    hoopRest: bounce * hoopMul,
    boardGrip,
    floorMul,
    grav,
    longJump: jumpFwd > 1.08,
    hotBounce: bounce > 1.2,
    slipperyGlass: boardGrip < 0.85 || hoopMul < 0.88,
    groundWrap: world.kit.wrap === "ground",
  };
}

/**
 * Combo window is 4s. Human ninja 1-min 310: median make gap ~1.05s,
 * ~2 taps in 1.6s before a make, first-tap |dx| ~237. Elite classic
 * 2641 / combo 138 was ~0.64s/make — still ride a live arc, but don't
 * sit a 1.12s let-drop after a miss. Classic 360 was ~1.35s.
 * Heat/frost jumpFwd 1.0: human lava 678 / 28 and frost 1339 / 36 —
 * stretching pace with jumpFwd sat idle (~1.77s).
 */
export function comboPaceLimit(world: Parameters<typeof shotFeel>[0]): number {
  const f = shotFeel(world);
  if (f.longJump) return clamp(1.08, 1.05, 1.22);
  // Glass (bounce 0): human classic 10156 / 117 and 5992 / 88, gap ~1.29s.
  if (f.bounce < 0.15) return clamp(1.24, 1.12, 1.38);
  // Lava / frost (jumpFwd ~1.0): tighter than classic 1.72 — not longer.
  if (f.jumpFwd >= 0.98) return clamp(1.48, 1.38, 1.62);
  let pace = 1.72;
  if (f.slipperyGlass) pace += 0.12;
  if (f.hotBounce) pace -= 0.08;
  return clamp(pace, 1.35, 2.2);
}

/** Rim-pocket half-width. Slightly wide jumpFwd (heat 1.0) holds a bit sooner. */
export function releasePocket(world: AiWorld, feel: ShotFeel): number {
  const extra = feel.longJump ? 0 : Math.max(0, feel.jumpFwd - 0.95) * 10;
  const rim = extra > 0 ? world.ball.r : world.ball.r * 0.35;
  return world.hoop.inner * (1.55 + extra) + rim;
}
