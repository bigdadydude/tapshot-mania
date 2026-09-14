import { registerBallAiPolicy } from "./registry.ts";
import type { AiHelpers, AiVote, AiWorld, BallAiPolicy } from "./types.ts";

function tap(reason: string): AiVote {
  return { action: "tap", reason };
}
function hold(reason: string): AiVote {
  return { action: "hold", reason };
}
function abstain(reason = "defer"): AiVote {
  return { action: "abstain", reason };
}

function onFloor(world: AiWorld): boolean {
  const floor = world.world.floorY - world.ball.r;
  return world.ball.y >= floor - 10 && world.ball.vy > -50;
}

function clockPanic(world: AiWorld, limit: number): boolean {
  if (!world.timerArmed || world.buzzer || world.timeUp) return false;
  return world.timer < limit;
}

function onLaunchSide(world: AiWorld): boolean {
  return world.hoop.side < 0
    ? world.ball.x > world.hoop.x - world.hoop.inner
    : world.ball.x < world.hoop.x + world.hoop.inner;
}

function pastHoop(world: AiWorld): boolean {
  const pad = world.hoop.inner * 1.6;
  return world.hoop.side < 0
    ? world.ball.x < world.hoop.x - pad
    : world.ball.x > world.hoop.x + pad;
}

function nearRim(world: AiWorld): boolean {
  const reach = world.hoop.inner * 3.4 + world.ball.r;
  return Math.hypot(world.ball.x - world.hoop.x, world.ball.y - world.hoop.y) < reach;
}

/**
 * Only freeze when the ball is actually dropping through this hoop.
 * Long-range `predictCurrent.scores` is a common false positive — holding it
 * after a hoop switch (or a miss bounce) looks like "score once then AFK".
 */
function confidentMake(world: AiWorld, scores: boolean): boolean {
  if (!scores || onFloor(world)) return false;
  // `shotMade` means this attempt already counted. Keep playing the next one.
  if (world.shotMade) return false;
  if (!nearRim(world)) return false;
  return world.ball.vy > 12 || world.ball.y + world.ball.r * 0.15 < world.hoop.y;
}

function scoreTapReason(next: { scores: boolean; bank: boolean; swish: boolean }): string {
  if (!next.scores) return "predicted-make";
  if (next.bank && !next.swish) return "predicted-bank";
  return "predicted-make";
}

/** Same jump reset as the last tap — rubber spam after a rim rattle. */
function sameJumpAngle(world: AiWorld): boolean {
  const sp = Math.hypot(world.ball.vx, world.ball.vy);
  const sj = Math.hypot(world.jumpVx, world.jumpVy);
  if (sp < 40 || sj < 40) return false;
  const dot = world.ball.vx * world.jumpVx + world.ball.vy * world.jumpVy;
  return dot / (sp * sj) > 0.84;
}

/** Generic tap timing — used for classic / lava / frost / ninja / unknown future balls. */
export const defaultPolicy: BallAiPolicy = {
  id: "default",
  priority: 0,
  match: () => true,
  vote(world: AiWorld, helpers: AiHelpers): AiVote {
    if (world.ballHidden && !world.onApproachSide) return hold("offscreen");

    // Humans jump toward the next hoop at the make — don't wait to land.
    // Wait until the ball has dropped *below* the new rim so a full jumpVy
    // climbs instead of orbiting from basket height.
    if (world.shotMade) {
      const belowNew = world.ball.y > world.hoop.y + world.ball.r;
      if (!belowNew && !onFloor(world) && !world.onApproachSide) {
        return hold("chain-wait");
      }
      return tap("chain-next");
    }
    if (world.scored) return hold("already-scored");

    const current = helpers.predictCurrent(world);
    if (confidentMake(world, current.scores)) return hold("flight-scores");

    const belowRim = world.ball.y > world.hoop.y + world.ball.r * 0.12;
    const releaseY = world.hoop.y + world.hoop.inner * 2.2;
    const inRelease =
      !onFloor(world) && !world.onApproachSide && world.ball.y < releaseY;
    if (inRelease) {
      if (pastHoop(world) && world.ball.vy > 8) return tap("wrap-boost");
      const save = helpers.predictTap(world);
      if (save.scores && !current.scores) {
        if (world.ball.vy > 12 || save.bank) return tap(scoreTapReason(save));
      }
      return hold("let-drop");
    }

    const next = helpers.predictTap(world);
    if (next.scores) return tap(scoreTapReason(next));

    if (clockPanic(world, 1.6)) return tap("shot-clock");

    if (world.ballHidden && world.onApproachSide) return tap("approach-enter");
    if (onFloor(world)) return tap("floor-launch");

    const launch = onLaunchSide(world) || world.onApproachSide || pastHoop(world);
    if (belowRim && launch) return tap("apex-boost");
    if (pastHoop(world) && !world.onApproachSide) return tap("wrap-boost");

    if (world.kit.wrap === "height" && world.onApproachSide) {
      return tap("wrap-approach");
    }

    return hold("wait-window");
  },
};

/** Antimatter pickups + black-hole steering. Fusion: flag OR from either ball. */
export const antiPolicy: BallAiPolicy = {
  id: "anti",
  priority: 80,
  match: (kit) => kit.anti,
  vote(world, helpers): AiVote {
    if (world.shotMade) return abstain("chain");
    if (world.scored) return hold("already-scored");
    if (world.ballHidden && !world.onApproachSide) return abstain();

    if (world.holeOn) {
      const current = helpers.predictCurrent(world);
      if (current.scores) return hold("hole-flight-scores");
      return tap("hole-steer");
    }

    if (world.antiMatter) {
      if (clockPanic(world, 1.6)) return abstain("clock-over-pickup");
      const current = helpers.predictCurrent(world);
      if (current.collectedAnti) return hold("gather-path");
      const next = helpers.predictTap(world);
      if (next.collectedAnti) return tap("gather-tap");
      if (next.minAntiDist + 18 < current.minAntiDist) return tap("gather-closer");
      if (onFloor(world)) return tap("gather-launch");
      return abstain("gather-wait");
    }

    return abstain();
  },
};

/**
 * Glass: protect a real dropping swish, but COMMIT a finish instead of hovering.
 * Restitution is 0 — extra taps in the sky float forever.
 */
export const glassPolicy: BallAiPolicy = {
  id: "glass",
  priority: 70,
  match: (kit) => kit.glass,
  vote(world, helpers): AiVote {
    if (world.shotMade) return abstain("chain");
    if (world.scored) return hold("already-scored");
    const current = helpers.predictCurrent(world);
    const next = helpers.predictTap(world);
    if (confidentMake(world, current.scores) && current.swish) return hold("protect-swish");
    if (confidentMake(world, current.scores)) return hold("protect-finish");
    if (next.scores && next.swish) return tap("seek-swish");
    // Commit a make (even rim) rather than float looking for a perfect swish.
    if (next.scores) return tap("commit-make");
    if (onFloor(world)) return tap("glass-launch");
    if (clockPanic(world, 1.35) && next.scores) return tap("shot-clock");

    const settleBand = world.ball.y < world.hoop.y + world.hoop.inner * 3.6;
    if (!onFloor(world) && settleBand) {
      if (world.ball.vy > 24 && next.minHoopDist + 12 < current.minHoopDist) {
        return tap("commit-closer");
      }
      return hold("glass-settle");
    }
    return abstain();
  },
};

/**
 * Rubber / height-wrap: stay airborne, but after a rim rattle do NOT spam the
 * same jump angle — wait for spacing or a cleaner (often bank) window.
 */
export const wrapHeightPolicy: BallAiPolicy = {
  id: "wrap-height",
  priority: 60,
  match: (kit) => kit.wrap === "height",
  vote(world, helpers): AiVote {
    if (world.kit.glass) return abstain("glass-owns");
    if (world.shotMade) return abstain("chain");
    if (world.scored) return hold("already-scored");
    if (!world.onApproachSide && world.ballHidden) return hold("wait-wrap");

    const current = helpers.predictCurrent(world);
    if (confidentMake(world, current.scores)) return hold("flight-scores");

    const rattling = world.hitRim && nearRim(world) && Math.abs(world.ball.vy) > 70;
    if (rattling && !clockPanic(world, 1.4)) {
      const next = helpers.predictTap(world);
      if (next.scores && (next.swish || next.bank) && !sameJumpAngle(world)) {
        return tap(scoreTapReason(next));
      }
      return hold("let-rattle");
    }

    const next = helpers.predictTap(world);
    if (world.hitRim && sameJumpAngle(world) && !next.bank && !clockPanic(world, 1.4)) {
      return hold("let-rattle");
    }
    if (next.scores) return tap(scoreTapReason(next));

    if (world.onApproachSide) {
      if (clockPanic(world, 1.5)) return tap("shot-clock");
      const spaced = Math.abs(world.ball.y - world.hoop.y) > world.hoop.inner * 1.8;
      if (world.hitRim && !spaced) return hold("wait-spacing");
      return tap("wrap-approach");
    }

    return abstain();
  },
};

/** Champion moment: keep the banked clock alive (idle timeout ends the run). */
export const champPolicy: BallAiPolicy = {
  id: "champ",
  priority: 40,
  match: (kit) => kit.champ,
  vote(world, helpers): AiVote {
    if (!world.champMode) return abstain();
    if (world.shotMade) return abstain("chain");
    if (world.scored) return hold("already-scored");
    const next = helpers.predictTap(world);
    if (next.scores) return tap("champ-window");
    if (onFloor(world) || clockPanic(world, 2.2)) return tap("champ-keep-alive");
    return abstain();
  },
};

/** Ninja clones follow the body path in-engine — no extra taps needed. Slot for future clone-aware aim. */
export const ninjaPolicy: BallAiPolicy = {
  id: "ninja",
  priority: 30,
  match: (kit) => kit.ninja,
  vote: () => abstain("body-shot"),
};

/** Frost freeze is combo-driven in-engine. Keep shooting via default. */
export const frostPolicy: BallAiPolicy = {
  id: "frost",
  priority: 20,
  match: (kit) => kit.frost,
  vote: () => abstain("combo-driven"),
};

/** Lava heat is combo-driven in-engine. Keep shooting via default. */
export const heatPolicy: BallAiPolicy = {
  id: "heat",
  priority: 15,
  match: (kit) => kit.heat,
  vote: () => abstain("combo-driven"),
};

/** Prison chain (unplayable today) — placeholder so a future release only fills `vote`. */
export const chainPolicy: BallAiPolicy = {
  id: "chain",
  priority: 50,
  match: (kit) => kit.chain,
  vote: () => abstain("unplayable"),
};

const BUILTINS: BallAiPolicy[] = [
  defaultPolicy,
  antiPolicy,
  glassPolicy,
  wrapHeightPolicy,
  champPolicy,
  ninjaPolicy,
  frostPolicy,
  heatPolicy,
  chainPolicy,
];

/** Idempotent — `registerBallAiPolicy` replaces by id. */
export function installBuiltInBallAiPolicies(): void {
  for (const policy of BUILTINS) registerBallAiPolicy(policy);
}

/** Test helper. */
export function resetBuiltInInstallForTests(): void {
  /* policies live in the registry; tests call `resetBallAiPoliciesForTests`. */
}
