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

/** Generic tap timing — used for classic / lava / frost / ninja / unknown future balls. */
export const defaultPolicy: BallAiPolicy = {
  id: "default",
  priority: 0,
  match: () => true,
  vote(world: AiWorld, helpers: AiHelpers): AiVote {
    // Only `scored` (ball still in this make). `shotMade` stays true until the
    // *next* tapJump — holding on it deadlocks after hoop side-switch.
    if (world.scored) return hold("already-scored");
    if (world.ballHidden && !world.onApproachSide) return hold("offscreen");

    const current = helpers.predictCurrent(world);
    if (confidentMake(world, current.scores)) return hold("flight-scores");

    const belowRim = world.ball.y > world.hoop.y + world.ball.r * 0.12;
    const aboveRim = world.ball.y + world.ball.r * 0.2 < world.hoop.y;
    // Tapping resets jump velocity. Doing that above the rim launches into
    // orbit and the shot clock dies — let it fall, then boost below.
    if (aboveRim && !world.onApproachSide && !onFloor(world)) {
      return hold("let-drop");
    }

    const next = helpers.predictTap(world);
    if (next.scores) return tap("predicted-make");

    // Make already counted (`shotMade`) but this ball is still live — start
    // the next possession immediately instead of waiting for a floor settle.
    if (world.shotMade) return tap("next-shot");

    if (clockPanic(world, 1.6)) return tap("shot-clock");

    if (world.ballHidden && world.onApproachSide) return tap("approach-enter");
    if (onFloor(world)) return tap("floor-launch");

    // Mash like a human while still below the basket; stop once above (let-drop).
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
    if (world.scored) return hold("already-scored");
    if (world.shotMade) return abstain("next-shot");
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

/** Glass: don't recorrect a make; prefer a swish tap over a rim make when both exist. */
export const glassPolicy: BallAiPolicy = {
  id: "glass",
  priority: 70,
  match: (kit) => kit.glass,
  vote(world, helpers): AiVote {
    if (world.scored) return hold("already-scored");
    if (world.shotMade) return abstain("next-shot");
    const current = helpers.predictCurrent(world);
    const next = helpers.predictTap(world);
    if (current.scores && current.swish) return hold("protect-swish");
    if (current.scores && !next.swish) return hold("protect-make");
    if (!current.scores && next.scores && next.swish) return tap("seek-swish");
    if (clockPanic(world, 1.35)) return abstain("clock");
    // Landing hurts glass — if a tap scores at all, take it before floor contact.
    if (!current.scores && next.scores && world.ball.vy > 40) return tap("save-from-land");
    return abstain();
  },
};

/** Rubber / height-wrap: shoot on the incoming side; don't wait for a floor settle. */
export const wrapHeightPolicy: BallAiPolicy = {
  id: "wrap-height",
  priority: 60,
  match: (kit) => kit.wrap === "height",
  vote(world, helpers): AiVote {
    if (world.kit.glass) return abstain("glass-owns");
    if (world.scored) return hold("already-scored");
    if (world.shotMade) return abstain("next-shot");
    if (!world.onApproachSide && world.ballHidden) return hold("wait-wrap");
    const next = helpers.predictTap(world);
    if (world.onApproachSide && next.scores) return tap("wrap-window");
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
