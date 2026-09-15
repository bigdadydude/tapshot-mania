import { predictCurrent, predictTap } from "./predict.ts";
import { decideShot } from "./registry.ts";
import { comboPaceLimit, finishPocketLocked, installBuiltInBallAiPolicies } from "./policies.ts";
import { shotFeel } from "./feel.ts";
import type { AiDecision, AiWorld } from "./types.ts";

const helpers = { predictCurrent, predictTap };

/** Floor between AI taps so we don't jitter every physics step. */
export const AI_TAP_INTERVAL = 0.08;
const CHAIN_INTERVAL = 0.045;
const PANIC_INTERVAL = 0.05;
/** If we can shoot but haven't tapped, mash like a stuck human. */
export const AI_WATCHDOG = 0.12;

const SNAPPY = new Set([
  "chain-next",
  "approach-enter",
  "reset-boost",
  "keep-air",
  "floor-launch",
  "pace-boost",
    "early-jump",
    "far-climb",
    "hole-spam",
    "glass-launch",
    "commit-make",
    "seek-swish",
    "bank-cut",
]);

const LEGIT_WAIT = new Set([
  "already-scored",
  "flight-scores",
  "hole-flight-scores",
  "let-drop",
  "ride-flight",
  "carry-flight",
  "chain-wait",
  "let-rattle",
  "wait-spacing",
  "glass-settle",
  "protect-swish",
  "protect-finish",
  "protect-make",
  "overshoot-cool",
  "wrap-loop",
  "floor-bounce",
  "let-bounce",
  "commit-glass",
  "rim-swirl",
  "pop-away",
  "hole-ride",
  "tube-up",
  "bank-steep",
  "bank-half",
  "exit-space",
  "gather-path",
]);

/** Full-jump reasons that replay the empty wrap cycle after a far launch. */
const FAR_JUMP = new Set([
  "early-jump",
  "wrap-escape",
  "far-climb",
  "approach-enter",
  "glass-launch",
  "floor-launch",
]);

export type AiController = {
  enabled: () => boolean;
  setEnabled: (on: boolean) => void;
  /** Clear timing / last decision. Does not change the enabled flag. */
  reset: () => void;
  /**
   * When disabled this is a no-op and returns false.
   * When enabled, returns whether the engine should call the real `tapJump`.
   */
  tick: (world: AiWorld) => boolean;
  lastDecision: () => AiDecision | null;
};

type LoopPose = {
  x: number;
  y: number;
  side: -1 | 1;
  jvx: number;
  jvy: number;
  dx: number;
};

const POSE_MATCH = 48;
const JUMP_VEL_MATCH = 28;
const LAUNCH_SPACING = 56;

function ballOnFloor(world: AiWorld): boolean {
  const floor = world.world.floorY - world.ball.r;
  return world.ball.y >= floor - 10 && world.ball.vy > -50;
}

export function createAiController(): AiController {
  installBuiltInBallAiPolicies();

  let on = false;
  let cooldown = 0;
  let idle = 0;
  let lastSide: -1 | 1 | 0 = 0;
  let last: AiDecision | null = null;
  let boardCool = 0;
  let wrapCool = 0;
  let contactCool = 0;
  let poseFresh = 0;
  let lastWraps = 0;
  let airTaps = 0;
  let sawContact = false;
  let fruitlessWraps = 0;
  let fruitlessContact = 0;
  let lastLaunchDx = -1;
  let boardTapUsed = false;
  let sitHold = 0;
  let lastTap: LoopPose | null = null;
  let recentTaps: LoopPose[] = [];

  function clearLoop() {
    wrapCool = 0;
    contactCool = 0;
    poseFresh = 0;
    airTaps = 0;
    sawContact = false;
    fruitlessWraps = 0;
    fruitlessContact = 0;
    lastLaunchDx = -1;
    boardTapUsed = false;
    sitHold = 0;
    lastTap = null;
    recentTaps = [];
  }

  function reset() {
    cooldown = 0;
    idle = 0;
    lastSide = 0;
    last = null;
    boardCool = 0;
    lastWraps = 0;
    clearLoop();
  }

  function fire(reason: AiDecision, wait: number) {
    last = reason;
    cooldown = wait;
    idle = 0;
    return true;
  }

  return {
    enabled: () => on,
    setEnabled(next) {
      if (!next && on) reset();
      on = next;
      if (!on) last = null;
    },
    reset,
    lastDecision: () => last,
    tick(world) {
      if (!on) return false;
      cooldown = Math.max(0, cooldown - world.dt);
      boardCool = Math.max(0, boardCool - world.dt);
      wrapCool = Math.max(0, wrapCool - world.dt);
      contactCool = Math.max(0, contactCool - world.dt);
      poseFresh = Math.max(0, poseFresh - world.dt);

      // New target hoop (left/right alternate) — don't sit on the previous cooldown.
      if (world.hoop.side !== lastSide) {
        lastSide = world.hoop.side;
        cooldown = 0;
        idle = 0;
        boardCool = 0;
        lastWraps = world.wraps;
        clearLoop();
      }

      if (world.shotMade || world.scored) {
        clearLoop();
      }
      // Fruitless wrap (shot flags reset on wrap): same jump vector cycles
      // even from the far side (stuck-1: tap (-72,487) → (15,378) → wrap).
      if (world.wraps > lastWraps) {
        lastWraps = world.wraps;
        airTaps = 0;
        contactCool = 0;
        fruitlessContact = 0;
        if (!world.shotMade && !world.scored) {
          wrapCool = Math.max(wrapCool, 1.65);
          fruitlessWraps += 1;
        }
      }

      if (!world.canShoot) {
        idle = 0;
        return false;
      }
      if (world.tapLock > 0) return false;
      if (world.paused || world.phase !== "playing") return false;

      const panic =
        (world.timerArmed && world.timer < 1.2 && !world.buzzer) ||
        (world.comboCounting && world.streak > 0 && world.comboClock > comboPaceLimit(world));

      const decision = decideShot(world, helpers);
      last = decision;
      const snappy = SNAPPY.has(decision.reason);
      const wait = panic ? PANIC_INTERVAL : snappy ? CHAIN_INTERVAL : AI_TAP_INTERVAL;
      const locked = finishPocketLocked(world);
      const longJump = shotFeel(world).longJump;
      // Pocket lock: only floor chain + too-low recatch. wrap-escape stays
      // OUT — tapping wrap in the pocket re-aims jumpVx at the glass.
      const pocketExtra =
        decision.reason !== "chain-next" && decision.reason !== "early-jump";
      const recoverTap =
        decision.reason === "chain-next" || decision.reason === "early-jump";
      const nearBoardX = Math.abs(world.ball.x - world.hoop.x) < world.world.w * 0.36;
      const dx = Math.abs(world.ball.x - world.hoop.x);
      const farRestart =
        world.onApproachSide ||
        world.ballHidden ||
        dx > world.world.w * 0.76;
      const sameShot = recentTaps.some(
        (p) =>
          p.side === world.hoop.side &&
          Math.hypot(world.ball.x - p.x, world.ball.y - p.y) < POSE_MATCH &&
          Math.hypot(world.jumpVx - p.jvx, world.jumpVy - p.jvy) < JUMP_VEL_MATCH,
      );
      const launched =
        Math.abs(world.ball.vx) > Math.abs(world.jumpVx) * 0.55;
      const grounded = ballOnFloor(world);
      if (grounded) airTaps = 0;
      if (world.hitRim || world.hitBoard) {
        if (longJump && !world.scored && !world.shotMade && !sawContact) {
          contactCool = Math.max(contactCool, 0.9);
          fruitlessContact += 1;
        }
        sawContact = true;
      } else {
        sawContact = false;
      }
      const fruitless = fruitlessWraps > 0 || fruitlessContact > 0;
      const sameLaunch =
        lastLaunchDx >= 0 && Math.abs(dx - lastLaunchDx) < LAUNCH_SPACING;
      const persistShot =
        !!lastTap &&
        lastTap.side === world.hoop.side &&
        Math.hypot(world.ball.x - lastTap.x, world.ball.y - lastTap.y) < POSE_MATCH &&
        Math.hypot(world.jumpVx - lastTap.jvx, world.jumpVy - lastTap.jvy) < JUMP_VEL_MATCH;
      // Same pose+jump vector stays a loop after wrap-cool expires (stuck-1/2
      // replayed the identical (vx,vy) chain). Ban the last tap pose, not the
      // whole climb corridor (that froze ninja at 0). Sitting too long thaws
      // one attempt so wrap-bank / a spaced launch can fire.
      let wrapLoop =
        longJump &&
        (farRestart ||
          (sameShot && (wrapCool > 0 || poseFresh > 0)) ||
          (fruitless && persistShot) ||
          (fruitless && sameLaunch) ||
          (contactCool > 0 && (!grounded || sameLaunch || persistShot)) ||
          (launched && !grounded && airTaps >= 1));
      if (wrapLoop && grounded && !farRestart) sitHold += world.dt;
      else if (!wrapLoop) sitHold = 0;
      const inbound = helpers.predictCurrent(world);
      const nextShot = helpers.predictTap(world);
      const airSpam = launched && !grounded && airTaps >= 1;
      const stuck = wrapLoop || fruitlessWraps > 0 || fruitlessContact > 0;
      const lastWasClose = lastLaunchDx >= 0 && lastLaunchDx < world.world.w * 0.4;
      // After a far full-jump wrap, don't replay wrap-escape / demo-band
      // (±328,-671). A launch that started close may still re-attack from mid-court.
      const fruitlessFarJump =
        longJump && fruitless && FAR_JUMP.has(decision.reason) && !lastWasClose;
      // One board-kiss when stuck: inbound glass still holds. Jump-speed
      // recatch is the overshoot death loop — don't wrap-bank that.
      // Parked under the rim: tap once for a rebound chance even if the
      // predictor is unsure — better than empty wrap or sitting forever.
      const closePark =
        grounded &&
        dx < world.world.w * 0.22 &&
        world.ball.y + world.ball.r * 0.15 >= world.hoop.y;
      const wantBoardTap =
        stuck &&
        longJump &&
        !boardTapUsed &&
        fruitlessContact === 0 &&
        !farRestart &&
        !world.hitRim &&
        !world.hitBoard &&
        !airSpam &&
        !inbound.willBoard &&
        !inbound.scores &&
        (nextShot.willBoard || closePark);
      const thaw = grounded && sitHold > 2.4 && !farRestart;
      if (thaw && (wantBoardTap || !sameLaunch)) wrapLoop = false;
      const forceBank = wantBoardTap && stuck;
      if (decision.tap || forceBank) {
        // Long jumpFwd near glass/rim: ZERO extra taps. bank-cut / apex /
        // combo-pressure / wrap-in-pocket / watchdog is the ninja death loop.
        // Exception: one wrap-bank when stuck and the reset would kiss glass.
        if (locked && pocketExtra && !forceBank) {
          last = { tap: false, reason: "protect-finish", policyId: decision.policyId };
          idle = 0;
          return false;
        }
        let toFire = decision;
        if (forceBank) {
          boardTapUsed = true;
          toFire = { tap: true, reason: "wrap-bank", policyId: decision.policyId };
        } else if (
          (wrapLoop || fruitlessFarJump) &&
          decision.reason !== "chain-next"
        ) {
          last = { tap: false, reason: "wrap-loop", policyId: decision.policyId };
          idle = 0;
          return false;
        }
        // Cool only on ninja-class jumpFwd — classic bank-cuts need to chain.
        if (longJump && boardCool > 0 && !recoverTap && nearBoardX && toFire.reason !== "wrap-bank") {
          last = { tap: false, reason: "overshoot-cool", policyId: decision.policyId };
          idle = 0;
          return false;
        }
        if (cooldown > 0) return false;
        const fired = fire(toFire, wait);
        if (longJump && !recoverTap && nearBoardX) {
          boardCool = 0.55;
        }
        if (longJump) {
          recentTaps.push({
            x: world.ball.x,
            y: world.ball.y,
            side: world.hoop.side,
            jvx: world.jumpVx,
            jvy: world.jumpVy,
            dx,
          });
          if (recentTaps.length > 8) recentTaps.shift();
          poseFresh = 0.45;
          lastTap = {
            x: world.ball.x,
            y: world.ball.y,
            side: world.hoop.side,
            jvx: world.jumpVx,
            jvy: world.jumpVy,
            dx,
          };
          if (grounded || !launched) lastLaunchDx = dx;
          sitHold = 0;
          // Only a tap that already has jump speed counts as the recatch.
          // A first tap from rest/crawl (title leftover vx, wrap roll) is the launch.
          airTaps = grounded || !launched ? 0 : airTaps + 1;
        }
        return fired;
      }

      const spd = Math.hypot(world.ball.vx, world.ball.vy);
      const close =
        Math.abs(world.ball.x - world.hoop.x) < world.world.w * 0.36;
      const below = world.ball.y + world.ball.r * 0.15 >= world.hoop.y;
      const sitting = spd < 78 && close && below;
      // Only a parked ball is stale. Combo-clock mash on a live let-drop
      // resets jumpVx and is how ninja/heat wrap instead of finishing.
      const staleDrop = decision.reason === "let-drop" && below && sitting;
      const staleBounce = decision.reason === "floor-bounce" && sitting;
      if (world.scored || (LEGIT_WAIT.has(decision.reason) && !staleDrop && !staleBounce)) {
        idle = 0;
        return false;
      }

      idle += world.dt;
      if (idle >= AI_WATCHDOG && cooldown <= 0) {
        const floor = world.world.floorY - world.ball.r;
        const groundedWatch = world.ball.y >= floor - 10 && world.ball.vy > -50;
        const sky = world.ball.y + world.ball.r * 0.15 < world.hoop.y;
        // jumpVy from above the rim is how rubber/glass/classic sail into orbit.
        if (sky && !groundedWatch) {
          idle = 0;
          return false;
        }
        if (
          locked ||
          wrapLoop ||
          fruitlessFarJump ||
          (longJump && fruitlessWraps > 0 && !lastWasClose) ||
          (longJump && (boardCool > 0 || wrapCool > 0 || contactCool > 0))
        ) {
          idle = 0;
          return false;
        }
        return fire(
          { tap: true, reason: "watchdog", policyId: decision.policyId },
          wait,
        );
      }
      return false;
    },
  };
}
