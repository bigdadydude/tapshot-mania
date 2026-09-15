import { registerBallAiPolicy } from "./registry.ts";
import { comboPaceLimit, releasePocket, shotFeel } from "./feel.ts";
import type { AiHelpers, AiVote, AiWorld, BallAiPolicy } from "./types.ts";

export { comboPaceLimit, shotFeel } from "./feel.ts";

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

/** Keep combo alive — minute mode has no decaying shot clock to force taps. */
function comboPressure(world: AiWorld): boolean {
  if (!world.comboCounting || world.streak < 1) return false;
  return world.comboClock > comboPaceLimit(world);
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

/** Court-facing backboard plane — same visW / gap ratios as `boardGeom`. */
function boardFaceX(world: AiWorld): number {
  const h = world.hoop;
  const gap = Math.max(10, h.inner * 0.48);
  return h.side < 0 ? h.x - h.inner - gap : h.x + h.inner + gap;
}

/** Between the rim and the glass — the only place a bank tap should fire. */
function nearBoard(world: AiWorld): boolean {
  const h = world.hoop;
  const face = boardFaceX(world);
  const rim = h.side < 0 ? h.x - h.inner * 0.22 : h.x + h.inner * 0.22;
  const slop = world.ball.r * 0.6;
  if (h.side < 0) return world.ball.x <= rim && world.ball.x >= face - slop;
  return world.ball.x >= rim && world.ball.x <= face + slop;
}

/** Already beyond the glass — wrap, don't keep flying into the wall. */
function pastBoard(world: AiWorld): boolean {
  const face = boardFaceX(world);
  const visW = Math.max(10, world.world.w * 0.052 * (2 / 3));
  if (world.hoop.side < 0) return world.ball.x < face - visW - world.ball.r;
  return world.ball.x > face + visW + world.ball.r;
}

function inBankBand(world: AiWorld): boolean {
  const top = world.hoop.y - world.world.h * 0.2;
  const bot = world.hoop.y + world.hoop.inner * 1.55;
  return world.ball.y > top && world.ball.y < bot;
}

function aboveRim(world: AiWorld): boolean {
  return world.ball.y + world.ball.r * 0.15 < world.hoop.y;
}

/** Rubber (ballMul) and long jumpFwd kits travel a long way off a bounce. */
function longTravel(world: AiWorld): boolean {
  return world.ballMul > 1.2 || shotFeel(world).longJump;
}

/** High jumpFwd — a tap writes this vx. Rubber's ballMul is not this path. */
function longJumpFwd(world: AiWorld): boolean {
  return shotFeel(world).longJump;
}

function closeToHoop(world: AiWorld, frac = 0.32): boolean {
  return Math.abs(world.ball.x - world.hoop.x) < world.world.w * frac;
}

function underCylinder(world: AiWorld): boolean {
  return Math.abs(world.ball.x - world.hoop.x) < world.hoop.inner * 2.4 + world.ball.r;
}

/** Velocity points at the court-facing glass, not away after a bounce. */
function movingTowardBoard(world: AiWorld): boolean {
  const face = boardFaceX(world);
  return (face - world.ball.x) * world.ball.vx > 12;
}

/** Velocity already carries the long jump toward the hoop — don't reset it. */
function flyingAtHoop(world: AiWorld): boolean {
  const toward = (world.hoop.x - world.ball.x) * world.ball.vx;
  return toward > 24 && Math.abs(world.ball.vx) > 50;
}

/** Parked / dying under the rim — the ninja freeze. */
function stalledNearHoop(world: AiWorld): boolean {
  if (onFloor(world) || world.onApproachSide) return false;
  if (world.ball.y <= world.hoop.y + world.ball.r * 0.2) return false;
  if (!closeToHoop(world)) return false;
  const spd = Math.hypot(world.ball.vx, world.ball.vy);
  const toward = (world.hoop.x - world.ball.x) * world.ball.vx;
  return spd < 90 || toward < 12;
}

function messyContact(world: AiWorld): boolean {
  return (
    world.rimHits >= 2 ||
    (world.hitBoard && world.hitRim) ||
    (world.shotMissed && (world.hitRim || world.hitBoard || world.rimHits >= 1))
  );
}

function lowBounce(world: AiWorld): boolean {
  const floor = world.world.floorY - world.ball.r;
  return world.ball.y >= floor - Math.max(56, world.world.h * 0.1);
}

function bounceOpening(world: AiWorld): boolean {
  const dx = world.hoop.x - world.ball.x;
  return world.ball.vx * dx < -24;
}

/** Court-facing inner rim — toilet-swirl (刷马桶) contact. */
function onInnerRim(world: AiWorld): boolean {
  const h = world.hoop;
  const inner = h.inner * 0.42;
  const nearY = Math.abs(world.ball.y - h.y) < h.inner * 1.25 + world.ball.r;
  if (!nearY) return false;
  if (h.side < 0) {
    return world.ball.x > h.x - inner && world.ball.x < h.x + h.inner * 0.55;
  }
  return world.ball.x < h.x + inner && world.ball.x > h.x - h.inner * 0.55;
}

/**
 * Mid/upper glass — human ninja banks cluster near board-Y ratio ~0.89
 * from the bottom (`(by+bh−y)/bh`). Board top is ~`hoop.y − 0.182·h`.
 */
function atHalfBoard(world: AiWorld): boolean {
  const top = world.hoop.y - world.world.h * 0.178;
  const bot = world.hoop.y - world.hoop.inner * 0.12;
  return world.ball.y > top && world.ball.y < bot;
}

function steepIntoBoard(world: AiWorld): boolean {
  return Math.abs(world.ball.vy) > Math.abs(world.ball.vx) * 0.52 && movingTowardBoard(world);
}

/**
 * Only freeze when the ball is actually dropping through this hoop.
 * Long-range `predictCurrent.scores` is a common false positive — holding it
 * after a hoop switch (or a miss bounce) looks like "score once then AFK".
 */
function confidentMake(world: AiWorld, scores: boolean): boolean {
  if (!scores || onFloor(world) || world.shotMade) return false;
  const aligned = Math.abs(world.ball.x - world.hoop.x) < world.hoop.inner * 0.92;
  if (!aligned) return false;
  // Rim rattles fool the kinematic guess — don't freeze on them.
  if (world.hitRim && !(world.ball.vy > 100 && world.ball.y > world.hoop.y)) return false;
  const through =
    world.ball.vy > 40 &&
    world.ball.y > world.hoop.y - world.ball.r * 0.4 &&
    world.ball.y < world.hoop.y + world.hoop.inner * 1.5;
  const droppingIn =
    world.ball.vy > 20 && world.ball.y + world.ball.r * 0.2 < world.hoop.y;
  return through || droppingIn;
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

/**
 * Commit 擦板 only in the glass pocket. A tap here resets to full jumpVx —
 * that's how long-travel kits bank-spam and fly past the board. Committing
 * means holding the current flight into the glass.
 */
function bankCommit(world: AiWorld, helpers: AiHelpers): AiVote | null {
  if (onFloor(world) || !inBankBand(world)) return null;
  if (!nearBoard(world) || pastBoard(world)) return null;

  const current = helpers.predictCurrent(world);
  if (current.scores && (current.bank || current.swish)) return hold("flight-scores");
  if (world.hitBoard && world.ball.vy > 8) return hold("let-drop");
  if (movingTowardBoard(world) || world.ball.vy > 12) return hold("commit-glass");
  return hold("let-drop");
}

function floorRecover(world: AiWorld, next: { scores: boolean; bank: boolean; swish: boolean }): AiVote {
  if (clockPanic(world, 1.7) || comboPressure(world)) return tap("floor-launch");
  if (next.scores && next.swish) return tap("floor-launch");
  const close = Math.abs(world.ball.x - world.hoop.x) < world.world.w * 0.4;
  if (next.scores && nearBoard(world) && next.bank && !longTravel(world)) {
    return tap("predicted-bank");
  }
  const recover = messyContact(world) || world.shotMissed;
  if (
    recover &&
    close &&
    bounceOpening(world) &&
    !clockPanic(world, 2.1)
  ) {
    return hold("floor-bounce");
  }
  return tap("floor-launch");
}

/** Generic tap timing — used for classic / lava / frost / ninja / unknown future balls. */
export const defaultPolicy: BallAiPolicy = {
  id: "default",
  priority: 0,
  match: () => true,
  vote(world: AiWorld, helpers: AiHelpers): AiVote {
    if (world.ballHidden && !world.onApproachSide) return hold("offscreen");

    // Humans jump toward the next hoop at the make — don't wait to land.
    // Only hold if we're still *above* the new rim (a full jumpVy would orbit).
    if (world.shotMade) {
      if (aboveRim(world) && !onFloor(world) && !world.onApproachSide) {
        return hold("chain-wait");
      }
      return tap("chain-next");
    }
    if (world.scored) return hold("already-scored");

    const current = helpers.predictCurrent(world);
    if (confidentMake(world, current.scores)) return hold("flight-scores");

    const bank = bankCommit(world, helpers);
    if (bank) return bank;

    // Full jumpVy from above the rim is an orbit. Behind/over the glass, wait
    // to fall into the bank window — wrap-boost here is how we fly past it.
    if (aboveRim(world) && !onFloor(world) && !world.onApproachSide) {
      if (pastBoard(world) && world.ball.vy > 8) return tap("wrap-boost");
      return hold("let-drop");
    }

    const belowRim = world.ball.y > world.hoop.y + world.ball.r * 0.12;
    const releaseY = world.hoop.y + world.hoop.inner * 2.2;
    const feel = shotFeel(world);
    const pocket =
      Math.abs(world.ball.x - world.hoop.x) < releasePocket(world, feel);
    const inRelease =
      !onFloor(world) &&
      !world.onApproachSide &&
      pocket &&
      world.ball.y < releaseY;
    if (inRelease) {
      if (pastBoard(world) && world.ball.vy > 8) return tap("wrap-boost");
      const save = helpers.predictTap(world);
      if (save.scores && save.swish && !current.scores && world.ball.vy > 12) {
        return tap("predicted-make");
      }
      if (
        comboPressure(world) &&
        !current.scores &&
        !shotFeel(world).longJump &&
        world.ball.y > world.hoop.y + world.hoop.inner
      ) {
        return tap("pace-boost");
      }
      return hold("let-drop");
    }

    // Live attempt still airborne — boost before a floor settle, which would
    // make the next tap a miss-jump and kill the combo. Skip only when already
    // under the cylinder: a full jumpVx there ruins a dropping finish.
    if (
      world.shotOpen &&
      !world.shotMade &&
      !world.shotMissed &&
      !world.kit.glass &&
      !underCylinder(world) &&
      (onFloor(world) || lowBounce(world))
    ) {
      return tap("keep-air");
    }

    // Missed glass / rim pinball: don't mash — bounce away, then re-attack.
    if (!world.kit.glass && lowBounce(world) && messyContact(world) && !clockPanic(world, 1.7) && !comboPressure(world)) {
      const nextLow = helpers.predictTap(world);
      if (!(nextLow.scores && nextLow.swish) && bounceOpening(world)) {
        return hold("floor-bounce");
      }
    }

    const next = helpers.predictTap(world);
    if (next.scores && next.swish) return tap("predicted-make");
    if (next.scores && next.bank && nearBoard(world) && inBankBand(world)) {
      return hold("commit-glass");
    }
    if (next.scores && !next.bank) return tap("predicted-make");
    if (next.scores && !longTravel(world) && !world.hitBoard) {
      return tap(scoreTapReason(next));
    }

    // tapJump writes full jumpVx. Ride only a *descending* long-jump
    // arc — rising still needs apex-boost or the 1.2 jump tunnels under.
    if (
      longJumpFwd(world) &&
      flyingAtHoop(world) &&
      !onFloor(world) &&
      !world.onApproachSide &&
      world.ball.vy > 12
    ) {
      return hold("ride-flight");
    }

    if (clockPanic(world, 1.6) || comboPressure(world)) return tap("shot-clock");

    if (world.ballHidden && world.onApproachSide) return tap("approach-enter");
    if (onFloor(world) || (lowBounce(world) && (world.shotMissed || messyContact(world)))) {
      return floorRecover(world, next);
    }

    // Off the glass entirely — wrap. Do not wrap-boost merely *near* the board.
    if (pastBoard(world) && !world.onApproachSide) return tap("wrap-boost");

    const launch = onLaunchSide(world) || world.onApproachSide;
    if (belowRim && launch && !messyContact(world)) {
      if (
        longJumpFwd(world) &&
        !world.onApproachSide &&
        underCylinder(world) &&
        !onFloor(world) &&
        (world.ball.y > world.hoop.y + world.hoop.inner * 2.2 ||
          world.ball.vy < -12)
      ) {
        return hold("let-drop");
      }
      if (
        longJumpFwd(world) &&
        !world.onApproachSide &&
        (closeToHoop(world) || flyingAtHoop(world)) &&
        world.ball.vy > 12
      ) {
        return hold("let-drop");
      }
      if (
        underCylinder(world) &&
        !world.onApproachSide &&
        (onFloor(world) || lowBounce(world))
      ) {
        return hold("let-drop");
      }
      return tap("apex-boost");
    }

    if (world.kit.wrap === "height" && world.onApproachSide) {
      return tap("wrap-approach");
    }

    if (comboPressure(world)) return tap("pace-boost");
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
      if (confidentMake(world, current.scores)) return hold("hole-flight-scores");
      return tap("hole-spam");
    }

    if (world.antiMatter) {
      if (clockPanic(world, 1.6) || comboPressure(world)) return abstain("clock-over-pickup");
      const current = helpers.predictCurrent(world);
      if (confidentMake(world, current.scores)) return abstain("score-over-pickup");
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
    const aligned =
      Math.abs(world.ball.x - world.hoop.x) < world.hoop.inner * 0.88;
    const droppingIn =
      world.ball.vy > 48 &&
      aligned &&
      world.ball.y > world.hoop.y - world.ball.r * 0.6 &&
      world.ball.y < world.hoop.y + world.hoop.inner * 1.2;
    if (droppingIn && current.swish && current.scores) return hold("protect-swish");
    if (droppingIn && current.scores) return hold("protect-finish");

    // jumpVy from above the rim is the hover loop: fall → tap → climb → repeat.
    if (aboveRim(world) && !onFloor(world)) return hold("glass-settle");

    const pocket =
      Math.abs(world.ball.x - world.hoop.x) < world.hoop.inner * 2.55 + world.ball.r;
    if (pocket && !onFloor(world)) {
      // Already falling through the pocket — committing means NOT tapping.
      if (world.ball.vy > 22 && world.ball.y < world.hoop.y + world.hoop.inner * 1.15) {
        return hold("glass-settle");
      }
      if (next.scores && next.swish) return tap("seek-swish");
      if (next.scores && world.ball.y > world.hoop.y) return tap("commit-make");
      // Missed below the net — climb; do not fall to the floor.
      if (world.ball.y > world.hoop.y + world.hoop.inner * 1.6) return tap("glass-launch");
      return hold("glass-settle");
    }

    if (onFloor(world)) return tap("glass-launch");
    // Default withholds apex-boost after rim/board mess so ground balls can
    // floor-bounce. Glass cannot land — keep climbing *until* we're close,
    // then fall into the pocket instead of jumping over the glass.
    if (!aboveRim(world)) {
      const floor = world.world.floorY - world.ball.r;
      const nearFloor = world.ball.y >= floor - Math.max(80, world.world.h * 0.14);
      if (next.scores && next.swish) return tap("seek-swish");
      if (next.scores && world.ball.y > world.hoop.y) return tap("commit-make");
      if (nearFloor || world.onApproachSide || !closeToHoop(world)) {
        return tap("glass-launch");
      }
      return hold("glass-settle");
    }
    return hold("glass-settle");
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

    const bank = bankCommit(world, helpers);
    if (bank) return bank;

    // Height-wrap balls stay airborne — tapping above the rim resets jumpVy
    // and they climb off the top of the screen (the rubber orbit).
    if (aboveRim(world) && !onFloor(world)) {
      if (world.ball.vy > 28) {
        const next = helpers.predictTap(world);
        if (next.scores && next.swish && !sameJumpAngle(world)) {
          return tap("predicted-make");
        }
      }
      return hold("let-drop");
    }

    const next = helpers.predictTap(world);
    const cleanWindow = next.scores && next.swish && !sameJumpAngle(world);
    const spaced =
      Math.abs(world.ball.y - world.hoop.y) > world.hoop.inner * 2.1 ||
      Math.abs(world.ball.x - world.hoop.x) > world.hoop.inner * 2.8;
    const rattled = world.hitRim || world.rimHits >= 1;

    // After a rim hit, jumpVx/jumpVy is the same vector — wait for a new
    // height / bank window instead of repeating the miss.
    if (rattled && !clockPanic(world, 1.35)) {
      if (cleanWindow && spaced) return tap(scoreTapReason(next));
      if (nearRim(world) || !spaced) {
        return hold(world.hitRim && nearRim(world) ? "let-rattle" : "wait-spacing");
      }
    }

    if (next.scores && next.swish) return tap("predicted-make");
    if (next.scores && next.bank && nearBoard(world) && inBankBand(world)) {
      return hold("commit-glass");
    }
    if (next.scores && !next.bank && !sameJumpAngle(world)) return tap(scoreTapReason(next));
    if (next.scores && !rattled && !next.bank) return tap(scoreTapReason(next));

    if (world.onApproachSide) {
      if (clockPanic(world, 1.45)) return tap("shot-clock");
      if (rattled && !spaced) return hold("wait-spacing");
      if (world.hitBoard && !spaced) return hold("wait-spacing");
      if (world.ball.vy > 8 && world.ball.y > world.hoop.y + world.ball.r) {
        return tap("wrap-approach");
      }
      if (rattled) return hold("wait-spacing");
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

/**
 * Param-driven tactics (jumpFwd / bounce / hang / glass grip). Matches every
 * kit; abstains when the numbers don't apply. Frost freeze and anti/glass
 * still own their skills below / above.
 */
export const physPolicy: BallAiPolicy = {
  id: "phys",
  priority: 28,
  match: () => true,
  vote(world, helpers): AiVote {
    if (world.kit.glass) return abstain("glass-owns");
    if (world.ballHidden && !world.onApproachSide) return abstain();
    if (world.shotMade) return abstain("chain");
    if (world.scored) return hold("already-scored");

    const feel = shotFeel(world);
    const current = helpers.predictCurrent(world);
    if (confidentMake(world, current.scores)) return hold("flight-scores");

    const under = underCylinder(world);
    const longOrSlip = feel.longJump || feel.slipperyGlass;
    const dx = Math.abs(world.ball.x - world.hoop.x);
    const hangScale = 1 - Math.max(-0.06, Math.min(0.08, (feel.hangTime - 0.7) * 0.25));
    // Human 1-min 310: first tap |dx| median ~237 (p25–p75 ≈ 195–290).
    const far = feel.longJump
      ? dx > world.world.w * 0.5
      : dx > world.world.w * 0.38 * hangScale;
    const launchFar = feel.longJump ? dx > world.world.w * 0.5 : dx > world.world.w * 0.48;
    const recatchFar = feel.longJump ? dx > world.world.w * 0.28 : far;
    const belowRim = world.ball.y > world.hoop.y + world.ball.r * 0.12;
    // 2nd tap is near apex (human ~2 taps). Half-jumpVy recatch was too
    // early: the extra jump then overshot the rim into a wrap. Near-apex
    // from ~dx 110–160 lands in the glass pocket for a bank.
    const climbSlowing =
      world.ball.vy < -12 && world.ball.vy > world.jumpVy * 0.22;
    const launched =
      flyingAtHoop(world) && Math.abs(world.ball.vx) > Math.abs(world.jumpVx) * 0.55;

    // Long jumpFwd / slippery glass. 310 demo: launch from the 195–290 band,
    // 2 taps, bank+rim (no swish), wrap is a next-shot (4/8 scored <2.5s).
    // Late under-rim starts lose. Banks/swirls run after so they cannot
    // freeze the launch.
    if (longOrSlip) {
      if (!world.onApproachSide && !current.scores && pastBoard(world)) {
        const headingOut = world.hoop.side * world.ball.vx > 12;
        if (headingOut) return hold("let-drop");
        return tap("wrap-escape");
      }
      if (!world.onApproachSide && under && !current.scores) {
        if (onFloor(world)) {
          const away = bounceOpening(world);
          if (
            away &&
            Math.abs(world.ball.vx) > 48 &&
            !clockPanic(world, 1.7) &&
            !comboPressure(world)
          ) {
            return hold("exit-space");
          }
          const spd = Math.hypot(world.ball.vx, world.ball.vy);
          if (spd < 78) return tap("wrap-escape");
          if (away) return hold("exit-space");
          return tap("wrap-escape");
        }
        if (lowBounce(world)) {
          const spd = Math.hypot(world.ball.vx, world.ball.vy);
          if (spd < 90 && bounceOpening(world)) return hold("exit-space");
          return hold("let-drop");
        }
        // Rising through the net only — not from 150px below (that was a
        // wrap drought). Too low beside the hoop: don't jump over; wrap
        // or drop. Near-rim descent → swirl/bank.
        const tooLow = world.ball.y > world.hoop.y + world.hoop.inner * 2.2;
        if (tooLow) return hold("let-drop");
        if (world.ball.vy < -12 && world.ball.y > world.hoop.y) {
          return hold("tube-up");
        }
      }
      // Floor launch, then one recatch after vy decays (~2 taps). A single
      // floor tap peaks ~150px under the rim — carry-flight for the whole
      // rise was the 0-pt tunnel. Recatch uses a closer band because the
      // ball has already flown in (human 2nd tap is not still at |dx| 237).
      if (feel.longJump && onFloor(world) && launchFar) {
        return tap("early-jump");
      }
      if (recatchFar && belowRim && climbSlowing && !onFloor(world) && !under) {
        return tap("early-jump");
      }
      if (flyingAtHoop(world) && world.ball.vy > 12 && !onFloor(world)) {
        return hold("ride-flight");
      }
      if (feel.longJump && launched && world.ball.vy < -12 && !onFloor(world)) {
        return hold("carry-flight");
      }
    }

    // 2. Rim toilet swirl — inner rim, let it rattle in.
    if (
      world.hitRim &&
      onInnerRim(world) &&
      !onFloor(world) &&
      (current.scores || world.ball.vy > 18)
    ) {
      return hold("rim-swirl");
    }

    // 1. Bank: half-board or steep cut into the glass.
    if (nearBoard(world) && inBankBand(world) && !pastBoard(world) && !onFloor(world)) {
      if (current.scores && (current.bank || current.swish)) return hold("flight-scores");
      if (steepIntoBoard(world) || (atHalfBoard(world) && movingTowardBoard(world))) {
        return hold(steepIntoBoard(world) ? "bank-steep" : "bank-half");
      }
    }

    // 4. High bounce near rim — let the pop open space.
    if (
      (feel.hotBounce || feel.hoopRest > 1.05) &&
      (nearRim(world) || under) &&
      (onFloor(world) || lowBounce(world)) &&
      bounceOpening(world) &&
      !clockPanic(world, 1.6)
    ) {
      return hold("pop-away");
    }

    if (world.onApproachSide) return abstain("default-shot");

    // 6. Distant climb for a steep (~90°) fall. Long jumpFwd already jumped.
    if (
      far &&
      belowRim &&
      !feel.longJump &&
      !onFloor(world) &&
      !under &&
      world.ball.vy < 28
    ) {
      return tap("far-climb");
    }

    // Slightly long jumpFwd (heat 1.0): last apex in a wider pocket wraps.
    if (
      feel.jumpFwd >= 0.98 &&
      !feel.longJump &&
      !onFloor(world) &&
      !world.onApproachSide &&
      belowRim &&
      dx < releasePocket(world, feel) &&
      (flyingAtHoop(world) || under || world.ball.vy > 18)
    ) {
      return hold("let-drop");
    }

    return abstain("feel-idle");
  },
};

/**
 * Frost: freeze can keep the scored stand as the live hoop. That is a skill
 * flag, not a phys number — chain-next into that cylinder slams glass.
 */
export const frostPolicy: BallAiPolicy = {
  id: "frost",
  priority: 20,
  match: (kit) => kit.frost,
  vote(world, helpers): AiVote {
    if (world.kit.glass) return abstain("glass-owns");
    const frozen = (world.hoop.frostLeft ?? 0) > 0.05;
    const sameStand =
      closeToHoop(world, 0.4) &&
      !world.onApproachSide &&
      (world.shotMade || frozen);
    if (sameStand) {
      if (aboveRim(world) && !onFloor(world)) return hold("chain-wait");
      if (onFloor(world) || lowBounce(world)) {
        const spd = Math.hypot(world.ball.vx, world.ball.vy);
        if (onFloor(world) && spd < 90) return tap("reset-boost");
        return hold("floor-bounce");
      }
      return hold("let-drop");
    }
    if (world.shotMade) return abstain("chain");
    if (world.scored) return hold("already-scored");
    const current = helpers.predictCurrent(world);
    if (confidentMake(world, current.scores)) return abstain("flight");
    return abstain("combo-driven");
  },
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
  physPolicy,
  frostPolicy,
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
