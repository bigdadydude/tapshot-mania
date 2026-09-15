import { registerBallAiPolicy } from "./registry.ts";
import { comboPaceLimit, releasePocket, shotFeel } from "./feel.ts";
import { demoPriors, NINJA_OPENER } from "./demo-priors.ts";
import type { AiHelpers, AiVote, AiWorld, BallAiPolicy } from "./types.ts";

export { comboPaceLimit, shotFeel } from "./feel.ts";
export { demoPriors, NINJA_OPENER } from "./demo-priors.ts";

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

/** Positive = closing on the court-facing glass. */
function closingOnBoard(world: AiWorld): number {
  const face = boardFaceX(world);
  const toFace = face - world.ball.x;
  if (Math.abs(toFace) < 0.5) return 0;
  return world.ball.vx * Math.sign(toFace);
}

/**
 * Already on a glass/rim-pocket flight. tapJump writes full jumpVx — that's
 * the overshoot past the backboard.
 *
 * Hold signal is the current kinematic path (`willBoard` / scoring bank or
 * swish), or the ball already overlapping the court-facing plane. Closing
 * speed alone is not enough — that froze makeable steep cuts (tap would
 * kiss, hold watched it miss).
 */
function inboundGlass(
  world: AiWorld,
  current: { scores: boolean; bank: boolean; swish: boolean; willBoard: boolean },
): boolean {
  if (onFloor(world) || pastBoard(world) || world.onApproachSide) return false;
  if (world.hitRim && onInnerRim(world)) return false;
  // atHalfBoard is a Y band across the whole court — without an X gate a
  // ninja climb at board height froze as flight-scores / commit-glass.
  const dist = Math.abs(boardFaceX(world) - world.ball.x);
  const inPocket = nearBoard(world) || (atHalfBoard(world) && dist < world.hoop.inner * 3.2);
  if (!inPocket) return false;
  if (current.willBoard) return true;
  if (current.scores && (current.bank || current.swish)) return true;
  const close = closingOnBoard(world);
  if (bounceOpening(world)) return false;
  // Already overlapping the face — a tap writes through the glass.
  if (dist < world.ball.r * 1.25 && close > 8) return true;
  return false;
}

/**
 * In the bank window but NOT kissing — tap only when the jump-reset itself
 * would hit glass. Speculative taps (drifting, next.willBoard false) write
 * full jumpVx and fly past the backboard.
 */
function wantsBankCut(
  world: AiWorld,
  current: { scores: boolean; bank: boolean; swish: boolean; willBoard: boolean },
  next: { scores: boolean; bank: boolean; willBoard: boolean },
): boolean {
  if (onFloor(world) || pastBoard(world) || world.onApproachSide) return false;
  if (world.hitRim || world.rimHits >= 1) return false;
  if (current.scores) return false;
  // Demo 310: ~2 taps then ride. Oral bank-cut is demoted on long jumpFwd / glass.
  if (!demoPriors(world).bankCutTap) return false;
  // Climbing: a tap writes another full jumpVy and sails over the board.
  if (world.ball.vy < -24) return false;
  if (inboundGlass(world, current)) return false;
  if (!inBankBand(world) && !atHalfBoard(world)) return false;
  const dist = Math.abs(boardFaceX(world) - world.ball.x);
  if (dist > world.world.w * 0.38) return false;
  if (!nearBoard(world) && dist > world.hoop.inner * 3.2) return false;
  return next.willBoard || (next.scores && next.bank);
}

/**
 * Hoop + glass neighborhood where a full jumpVx reset sails over the board.
 * Excludes the too-low recatch band (~150px under the rim) so ninja's 2nd tap
 * still fires. Humans (310 / 2641 / 1324) are decisive with few taps here.
 */
function nearFinishPocket(world: AiWorld): boolean {
  if (onFloor(world) || pastBoard(world) || world.onApproachSide) return false;
  const dx = Math.abs(world.ball.x - world.hoop.x);
  if (dx > world.world.w * 0.32) return false;
  if (world.ball.y > world.hoop.y + world.hoop.inner * 1.15) return false;
  if (world.ball.y < world.hoop.y - world.world.h * 0.22) return false;
  return true;
}

/**
 * ZERO taps: current flight already makes, or is clearly inbound to glass/rim.
 * Long jumpFwd prefers a missed cut over an overshoot tap.
 * Classic only freezes a live make here — inbound misses still bank-cut.
 */
function mustHoldFinish(
  world: AiWorld,
  current: { scores: boolean; bank: boolean; swish: boolean; willBoard: boolean },
): boolean {
  if (onFloor(world) || world.shotMade) return false;
  if (pastBoard(world) || world.onApproachSide) return false;
  const pocket = nearFinishPocket(world) || nearBoard(world);
  const inY =
    world.ball.y < world.hoop.y + world.hoop.inner * 1.15 &&
    world.ball.y > world.hoop.y - world.world.h * 0.22;
  if (current.scores && pocket) return true;
  if (current.scores && closeToHoop(world, 0.4) && inY) return true;
  // Classic: do not freeze a miss/rattle. Ninja overshoot is the longJump path.
  if (!longJumpFwd(world)) return false;
  if (!pocket) return false;
  if (current.willBoard || current.bank || current.swish) return true;
  if (world.hitRim || world.hitBoard) return true;
  if (longJumpFwd(world) && flyingAtHoop(world) && !bounceOpening(world)) return true;
  if (longJumpFwd(world) && movingTowardBoard(world) && (nearBoard(world) || inBankBand(world))) {
    return true;
  }
  return false;
}

export function finishPocketLocked(world: AiWorld): boolean {
  return longJumpFwd(world) && nearFinishPocket(world);
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
 * Sep15 gold: 3–4 climb taps ~150ms apart while still rising (tap 2 vy ~-500
 * at |dx| ~147, tap 3 at |dx| ~95, HQ tap 4 at ~118 after a rim). The old
 * too-low-apex window (vy > -250, |dx| 110–133) skipped those taps and
 * classic never chained.
 */
function ninjaClimbTap(world: AiWorld): boolean {
  if (!shotFeel(world).longJump) return false;
  if (onFloor(world)) return false;
  if (world.onApproachSide || pastBoard(world) || !onLaunchSide(world)) return false;
  // Falling: ride into the bank. Speculative make-guesses while still
  // rising used to skip HQ taps 3–4 at |dx| 96 / 118.
  if (world.ball.vy >= -12) return false;
  const dx = Math.abs(world.ball.x - world.hoop.x);
  return (
    dx > world.world.w * NINJA_OPENER.climbMin &&
    dx < world.world.w * NINJA_OPENER.climbMax
  );
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

/** Already falling into the black hole — don't reset jumpVx. */
function headingIntoHole(world: AiWorld): boolean {
  const hole = world.hole;
  if (!hole) return false;
  const dx = hole.x - world.ball.x;
  const dy = hole.y - world.ball.y;
  const dist = Math.hypot(dx, dy) || 1;
  const spd = Math.hypot(world.ball.vx, world.ball.vy);
  const toward = (world.ball.vx * dx + world.ball.vy * dy) / dist;
  return spd > 120 && toward > 80;
}

/**
 * Far orb that a tap would not collect. Human anti 775 / combo 1 broke
 * farming a detour; 1185 / 33 and 996 / 36 kept scoring while gathering.
 */
function antiDetour(world: AiWorld, nextCollects: boolean): boolean {
  const orb = world.antiMatter;
  if (!orb || nextCollects) return false;
  if (world.antiCharge >= 70) return false;
  const hoopDist = Math.hypot(world.ball.x - world.hoop.x, world.ball.y - world.hoop.y);
  const orbDist = Math.hypot(world.ball.x - orb.x, world.ball.y - orb.y);
  return orbDist > hoopDist * 0.85 && orbDist > world.world.w * 0.28;
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
 * Commit 擦板 in the glass pocket.
 * Hold when the current flight already hits glass/rim — tapJump writes full
 * jumpVx and flies past the board. Tap a bank-cut when we're in the window
 * but drifting (would otherwise freeze and miss a makeable kiss).
 */
function bankCommit(world: AiWorld, helpers: AiHelpers): AiVote | null {
  if (onFloor(world) || pastBoard(world)) return null;
  if (!inBankBand(world) && !atHalfBoard(world)) return null;

  const current = helpers.predictCurrent(world);
  const next = helpers.predictTap(world);
  if (mustHoldFinish(world, current)) {
    if (current.scores) return hold("flight-scores");
    return hold("protect-finish");
  }
  if (inboundGlass(world, current)) {
    if (current.scores) return hold("flight-scores");
    return hold(steepIntoBoard(world) ? "bank-steep" : "commit-glass");
  }
  if (world.hitBoard && world.ball.vy > 8) return hold("let-drop");
  if (wantsBankCut(world, current, next)) return tap("bank-cut");
  return null;
}

function floorRecover(world: AiWorld, next: { scores: boolean; bank: boolean; swish: boolean }): AiVote {
  if (clockPanic(world, 1.7) || comboPressure(world)) return tap("floor-launch");
  if (next.scores && next.swish) return tap("floor-launch");
  const close = Math.abs(world.ball.x - world.hoop.x) < world.world.w * 0.4;
  if (
    next.scores &&
    nearBoard(world) &&
    next.bank &&
    !longTravel(world) &&
    demoPriors(world).bankCutTap
  ) {
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
      // HQ gold: after a make, next tap is |dx| ~259, not a full jump from
      // the old hoop (~400) that sails through and wrap-escapes.
      if (
        longJumpFwd(world) &&
        !world.onApproachSide &&
        !world.ballHidden
      ) {
        const chainDx = Math.abs(world.ball.x - world.hoop.x);
        if (chainDx >= world.world.w * NINJA_OPENER.launchMax) {
          if (onFloor(world)) return hold("wait-window");
          return hold("carry-flight");
        }
      }
      return tap("chain-next");
    }
    if (world.scored) return hold("already-scored");

    const current = helpers.predictCurrent(world);
    if (confidentMake(world, current.scores)) return hold("flight-scores");
    if (mustHoldFinish(world, current)) {
      return hold(current.scores ? "flight-scores" : "protect-finish");
    }
    if (longJumpFwd(world) && nearFinishPocket(world)) {
      return hold("protect-finish");
    }
    if (inboundGlass(world, current)) {
      return hold(current.scores ? "flight-scores" : "commit-glass");
    }

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
      if (
        demoPriors(world).huntSwish &&
        save.scores &&
        save.swish &&
        !current.scores &&
        world.ball.vy > 12
      ) {
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
    const demo = demoPriors(world);
    if (mustHoldFinish(world, current) || (longJumpFwd(world) && nearFinishPocket(world))) {
      return hold(current.scores ? "flight-scores" : "protect-finish");
    }
    if (inboundGlass(world, current)) {
      return hold(current.scores ? "flight-scores" : "commit-glass");
    }
    // Oral swish-hunt / bank-cut: ninja 310 is 0 swishes and ~2 taps near finish.
    if (demo.huntSwish && next.scores && next.swish) return tap("predicted-make");
    if (demo.bankCutTap && next.scores && next.bank && nearBoard(world) && inBankBand(world)) {
      return tap("bank-cut");
    }
    if (next.scores && !next.bank && !(longJumpFwd(world) && closeToHoop(world))) {
      return tap("predicted-make");
    }
    if (next.scores && !longTravel(world) && !world.hitBoard && demo.bankCutTap) {
      return tap(scoreTapReason(next));
    }

    // tapJump writes full jumpVx. Ride a descending long-jump arc.
    // Oral apex-boost after launch is demoted (demo: 2 taps then ride).
    if (
      longJumpFwd(world) &&
      flyingAtHoop(world) &&
      !onFloor(world) &&
      !world.onApproachSide &&
      world.ball.vy > 12
    ) {
      return hold("ride-flight");
    }

    if (
      (clockPanic(world, 1.6) || comboPressure(world)) &&
      !(longJumpFwd(world) && closeToHoop(world) && !demoPriors(world).comboPokeNearHoop)
    ) {
      return tap("shot-clock");
    }

    if (world.ballHidden && world.onApproachSide) return tap("approach-enter");
    if (onFloor(world) || (lowBounce(world) && (world.shotMissed || messyContact(world)))) {
      return floorRecover(world, next);
    }

    // Off the glass entirely — wrap. Do not wrap-boost merely *near* the board.
    if (pastBoard(world) && !world.onApproachSide) return tap("wrap-boost");

    const launch = onLaunchSide(world) || world.onApproachSide;
    if (belowRim && launch && !messyContact(world)) {
      if (longJumpFwd(world) && nearFinishPocket(world)) {
        return hold("protect-finish");
      }
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
      // Oral apex-boost: ninja 310 is early-jump + recatch, then ride.
      // Far from the hoop the 2nd tap is still early-jump, not a pocket poke.
      if (!demoPriors(world).extraClimbTaps) {
        if (closeToHoop(world) || nearFinishPocket(world) || underCylinder(world)) {
          return hold("let-drop");
        }
        return tap("early-jump");
      }
      return tap("apex-boost");
    }

    if (world.kit.wrap === "height" && world.onApproachSide) {
      return tap("wrap-approach");
    }

    if (comboPressure(world) && demoPriors(world).comboPokeNearHoop) return tap("pace-boost");
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
      // Human anti: after hole-open, ride gravity when already inbound;
      // otherwise spam taps so hole pull + hoop-aimed jumps thread the rim.
      if (headingIntoHole(world)) return hold("hole-ride");
      return tap("hole-spam");
    }

    if (world.antiMatter) {
      if (clockPanic(world, 1.6) || comboPressure(world)) return abstain("clock-over-pickup");
      const current = helpers.predictCurrent(world);
      const next = helpers.predictTap(world);
      // Collect *while* scoring: a flight that both scores and gathers is the play.
      if (current.scores && current.collectedAnti) return hold("gather-path");
      if (confidentMake(world, current.scores)) return abstain("score-over-pickup");
      // Live combo: don't over-farm a far orb (775 / combo 1).
      if (world.comboCounting && world.streak >= 1 && antiDetour(world, next.collectedAnti)) {
        return abstain("score-over-pickup");
      }
      if (current.collectedAnti) return hold("gather-path");
      if (next.collectedAnti) return tap("gather-tap");
      if (next.minAntiDist + 18 < current.minAntiDist) return tap("gather-closer");
      if (onFloor(world)) return tap("gather-launch");
      return abstain("gather-wait");
    }

    return abstain();
  },
};

/**
 * Glass: restitution 0. HP starts at 20 (cap 50): rim contact −2, bank −1,
 * board-top −3, land −4, swish +4. Human classic 10156 / combo 117 lasted
 * 171s on rim 52 / swish 40 / bank 25 (net ≈ +31 HP) and 1 miss. Prior AI
 * hovered; the first commit pass went 60% rim / 17% swish and shattered
 * around combo 25. Human 5992 / 88 (+ short 394) is the same mix — drop
 * for the finish, skip banks when HP is low.
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
    const pocket =
      Math.abs(world.ball.x - world.hoop.x) < world.hoop.inner * 2.55 + world.ball.r;
    const droppingIn =
      world.ball.vy > 36 &&
      aligned &&
      world.ball.y > world.hoop.y - world.ball.r * 0.6 &&
      world.ball.y < world.hoop.y + world.hoop.inner * 1.35;
    const fallingInPocket =
      pocket &&
      aligned &&
      world.ball.vy > 12 &&
      world.ball.y > world.hoop.y - world.ball.r &&
      world.ball.y < world.hoop.y + world.hoop.inner * 2.05;
    // Rim contact −2. Below this, hunt swishes (+4) instead of slamming iron.
    const fragile = world.glassBase <= 10;

    if (droppingIn && current.scores && current.swish) return hold("protect-swish");
    if (droppingIn && current.scores && next.swish && !current.swish) {
      return tap("seek-swish");
    }
    if (droppingIn && current.scores) return hold("protect-finish");
    // Fragile HP: a live bank still finishes if we don't tap. Slamming
    // jumpVx here is 打铁 −2 (5992 / 88 shatter-avoidance).
    if (fragile && current.scores && current.bank && !current.swish && !onFloor(world)) {
      return hold("glass-settle");
    }

    // jumpVy from above the rim is the hover loop: fall → tap → climb → repeat.
    if (aboveRim(world) && !onFloor(world)) return hold("glass-settle");

    // Swish first (human 40/117, +4 HP). Don't jump over a dropping swish.
    if (next.scores && next.swish && !(droppingIn && current.swish)) {
      return tap("seek-swish");
    }
    if (!fragile && current.willBoard && !onFloor(world) && nearBoard(world)) {
      return hold("commit-glass");
    }
    if (!fragile && wantsBankCut(world, current, next)) {
      return tap("bank-cut");
    }
    // Do NOT commit-make a rim. tapJump writes full jumpVx — that's 打铁 −2
    // and is why the first commit pass shattered at combo 25. Human finishes
    // by dropping (settle) after the approach taps. Rim finishes still
    // happen from a held drop; they just aren't slammed.
    if (comboPressure(world) && !pocket && !aboveRim(world) && !droppingIn) {
      return tap("pace-boost");
    }

    if (pocket && !onFloor(world)) {
      // Aligned drop: hold even on a miss — a full jumpVy from here flies over.
      if (fallingInPocket) return hold("glass-settle");
      if (
        !fragile &&
        nearBoard(world) &&
        inBankBand(world) &&
        inboundGlass(world, current)
      ) {
        return hold("commit-glass");
      }
      // Below the net or off-center: climb / realign. Do not fall to the floor (−4).
      if (world.ball.y > world.hoop.y + world.hoop.inner * 1.6) return tap("glass-launch");
      if (!aligned) return tap("glass-launch");
      return hold("glass-settle");
    }

    if (onFloor(world)) return tap("glass-launch");
    // Human first-tap |dx| ~296, ~3.6 short jumps. Keep climbing until the
    // pocket — closeToHoop (0.32·w ≈ 125) is still a jump short of the rim.
    if (!aboveRim(world)) {
      const floor = world.world.floorY - world.ball.r;
      const nearFloor = world.ball.y >= floor - Math.max(80, world.world.h * 0.14);
      if (nearFloor || world.onApproachSide || !pocket) {
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
    if (mustHoldFinish(world, current)) {
      return hold(current.scores ? "flight-scores" : "protect-finish");
    }
    const rattledEarly = world.hitRim || world.rimHits >= 1;
    if (inboundGlass(world, current) && !rattledEarly) {
      return hold(current.scores ? "flight-scores" : "commit-glass");
    }

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
      return tap("bank-cut");
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
    if (mustHoldFinish(world, current)) {
      return hold(current.scores ? "flight-scores" : "protect-finish");
    }
    if (feel.longJump && nearFinishPocket(world)) {
      return hold("protect-finish");
    }
    if (
      world.hitRim &&
      onInnerRim(world) &&
      !onFloor(world) &&
      (current.scores || world.ball.vy > 18)
    ) {
      return hold("rim-swirl");
    }
    if (inboundGlass(world, current)) {
      return hold(current.scores ? "flight-scores" : "commit-glass");
    }
    if (wantsBankCut(world, current, helpers.predictTap(world))) {
      return tap("bank-cut");
    }

    const under = underCylinder(world);
    const longOrSlip = feel.longJump || feel.slipperyGlass;
    const dx = Math.abs(world.ball.x - world.hoop.x);
    const hangScale = 1 - Math.max(-0.06, Math.min(0.08, (feel.hangTime - 0.7) * 0.25));
    // Human 1-min 310: first tap |dx| median ~237 (p25–p75 ≈ 195–290).
    const far = feel.longJump
      ? dx > world.world.w * 0.5
      : dx > world.world.w * 0.38 * hangScale;
    // Sep15 gold: first tap |dx| ~196–201; chain the other hoop at ~190–260.
    const launchFar = feel.longJump
      ? dx > world.world.w * NINJA_OPENER.launchMin &&
        dx < world.world.w * NINJA_OPENER.launchMax
      : dx > world.world.w * 0.48;
    const crawlingIn = (world.hoop.x - world.ball.x) * world.ball.vx > 12;
    const belowRim = world.ball.y > world.hoop.y + world.ball.r * 0.12;
    const launched =
      flyingAtHoop(world) && Math.abs(world.ball.vx) > Math.abs(world.jumpVx) * 0.55;

    // Long jumpFwd / slippery glass. Sep15 gold: 3–4 climb taps then ride
    // into bank (0 wraps before first make). Wrap is a next shot, not a hover.
    if (longOrSlip) {
      if (!world.onApproachSide && !current.scores && pastBoard(world)) {
        // Climbing just behind the glass can still fall into a bank.
        // Wrapping at jump speed from here is the post-make chain killer.
        if (world.ball.vy > 8) return tap("wrap-escape");
        return hold("let-drop");
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
          // Moving toward the hoop: a wrap-escape tap writes full jumpVx and
          // is the ninja-stuck-loop (under-hoop tap → wrap → far launch → repeat).
          if (flyingAtHoop(world) || movingTowardBoard(world)) return hold("let-drop");
          return tap("wrap-escape");
        }
        if (lowBounce(world)) {
          const spd = Math.hypot(world.ball.vx, world.ball.vy);
          if (spd < 90 && bounceOpening(world)) return hold("exit-space");
          // Parked on the bounce with combo dying: wrap. A live bounce still drops.
          if (
            !current.scores &&
            (world.comboClock > 2.4 || (comboPressure(world) && spd < 78))
          ) {
            return tap("wrap-escape");
          }
          return hold("let-drop");
        }
        // Too-low apex under the cylinder: recatch for height. Tube-up only
        // when actually climbing through the net — holding it from 150px
        // under was the 0-pt tunnel (carry/let-drop ate the 2nd tap).
        if (ninjaClimbTap(world)) return tap("early-jump");
        if (
          world.ball.vy < -12 &&
          world.ball.y > world.hoop.y &&
          world.ball.y < world.hoop.y + world.hoop.inner * 1.8
        ) {
          return hold("tube-up");
        }
        // Falling well below the rim: hold a live attack. Only wrap a
        // parked miss (the 1–13 pt drought) or a combo that's actually
        // about to die (~2.4s of the 4s window). Wrapping at 1.08s on
        // every under-rim fall killed the 259-class streaks.
        if (world.ball.vy > 12 && world.ball.y > world.hoop.y + world.hoop.inner) {
          const spd = Math.hypot(world.ball.vx, world.ball.vy);
          if (
            comboPressure(world) &&
            !current.scores &&
            !flyingAtHoop(world) &&
            (spd < 78 || world.comboClock > 2.4)
          ) {
            return tap("wrap-escape");
          }
          return hold("let-drop");
        }
        const tooLow = world.ball.y > world.hoop.y + world.hoop.inner * 2.2;
        if (tooLow) {
          const spd = Math.hypot(world.ball.vx, world.ball.vy);
          if (
            comboPressure(world) &&
            !current.scores &&
            !flyingAtHoop(world) &&
            (spd < 78 || world.comboClock > 2.4)
          ) {
            return tap("wrap-escape");
          }
          return hold("let-drop");
        }
      }
      // Inside the 195 band after a miss: wrap to the far side, then the
      // demo-band launch. A floor poke from here sails through the cylinder.
      if (
        feel.longJump &&
        onFloor(world) &&
        !world.onApproachSide &&
        !current.scores &&
        dx < world.world.w * 0.5 &&
        !under
      ) {
        const spd = Math.hypot(world.ball.vx, world.ball.vy);
        if (spd < 78) return tap("wrap-escape");
      }
      // After a wrap the ball rolls in from ~0.76w. Wait until |dx| ≲260
      // (human chain band). Do not sit past that — first make never arms.
      if (
        feel.longJump &&
        onFloor(world) &&
        !world.onApproachSide &&
        !world.ballHidden &&
        dx >= world.world.w * NINJA_OPENER.launchMax &&
        crawlingIn
      ) {
        return hold("wait-window");
      }
      if (feel.longJump && onFloor(world) && launchFar) {
        return tap("early-jump");
      }
      if (ninjaClimbTap(world)) return tap("early-jump");
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

    // 1. Bank: half-board or steep cut into the glass — only hold a path
    // that already hits. Steep + closing without willBoard was freeze-and-miss.
    if (nearBoard(world) && inBankBand(world) && !pastBoard(world) && !onFloor(world)) {
      if (current.scores && (current.bank || current.swish)) return hold("flight-scores");
      if (inboundGlass(world, current)) {
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
    // Human lava 1264 / 43 (678 / 28) — don't sit that hold after combo pace.
    if (
      feel.jumpFwd >= 0.98 &&
      !feel.longJump &&
      !onFloor(world) &&
      !world.onApproachSide &&
      belowRim &&
      dx < releasePocket(world, feel) &&
      (flyingAtHoop(world) || under || world.ball.vy > 18)
    ) {
      if (
        comboPressure(world) &&
        !current.scores &&
        world.ball.y > world.hoop.y + world.hoop.inner * 1.8
      ) {
        return tap("pace-boost");
      }
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
        // Frost 1985 / 50 (1339 / 36): don't idle a frozen stand after combo pace.
        if (onFloor(world) && (spd < 90 || comboPressure(world))) return tap("reset-boost");
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
