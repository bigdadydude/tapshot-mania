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
          // Don't treat rolling through the last launch x as persistShot —
          // that froze the demo-band floor attack for the rest of classic.
          lastTap = null;
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
      // Off-screen or past the human |dx| band (~195–290). Do NOT tighten
      // this for ninja — 0.62w (~242) wrap-loops the first demo-band jump.
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
      const persistShot =
        !!lastTap &&
        lastTap.side === world.hoop.side &&
        Math.hypot(world.ball.x - lastTap.x, world.ball.y - lastTap.y) < POSE_MATCH &&
        Math.hypot(world.jumpVx - lastTap.jvx, world.jumpVy - lastTap.jvy) < JUMP_VEL_MATCH;
      const airSpam = launched && !grounded && airTaps >= 1;
      // Human 2-tap: floor launch, too-low recatch in the 195–290 band, ride.
      // contactCool must not freeze that 2nd tap after a rim graze.
      const demoRecatch =
        recoverTap &&
        !airSpam &&
        dx > world.world.w * 0.28 &&
        dx < world.world.w * 0.5;
      // Break-glass only: off-screen / identical pose / extra jump-speed tap.
      // Demo-band launch + too-low recatch stay the attack, even after a graze.
      let wrapLoop =
        longJump &&
        (farRestart ||
          (sameShot && (wrapCool > 0 || poseFresh > 0)) ||
          (fruitless && persistShot) ||
          (contactCool > 0 && !grounded && !demoRecatch) ||
          airSpam);
      if (wrapLoop && grounded && !farRestart) sitHold += world.dt;
      else if (!wrapLoop) sitHold = 0;
      // After a wrap, lastTap is cleared. Rolling onto the previous launch
      // x must still be allowed to jump — persistShot/sameShot froze classic.
      if (
        wrapLoop &&
        grounded &&
        !lastTap &&
        !world.onApproachSide &&
        !world.ballHidden &&
        dx > world.world.w * 0.5 &&
        dx <= world.world.w * 0.76
      ) {
        wrapLoop = false;
      }
      const inbound = helpers.predictCurrent(world);
      const nextShot = helpers.predictTap(world);
      const wrapEscapeSpam =
        longJump && fruitlessWraps > 0 && decision.reason === "wrap-escape";
      const closeForBank = dx < world.world.w * 0.28;
      // Break-glass board-kiss: empty wrap-escape, or a close reset after a
      // wrap whose tap would kiss glass. Demo-band / recatch stay the attack.
      const wantBoardTap =
        longJump &&
        !boardTapUsed &&
        !farRestart &&
        !world.hitRim &&
        !world.hitBoard &&
        contactCool <= 0 &&
        !airSpam &&
        !inbound.willBoard &&
        !inbound.scores &&
        nextShot.willBoard &&
        (wrapLoop || wrapEscapeSpam || (fruitlessWraps > 0 && closeForBank && !recoverTap));
      const thaw = grounded && sitHold > 2.4 && !farRestart;
      if (thaw && (wantBoardTap || !persistShot)) wrapLoop = false;
      const forceBank = wantBoardTap;
      if (decision.tap || forceBank) {
        // Long jumpFwd near glass/rim: ZERO extra taps. bank-cut / apex /
        // combo-pressure / wrap-in-pocket / watchdog is the ninja death loop.
        // Exception: one wrap-bank when wrap-escape is the empty cycle.
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
          (wrapLoop || wrapEscapeSpam) &&
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
          wrapEscapeSpam ||
          (longJump && fruitlessContact > 0 && FAR_JUMP.has(decision.reason)) ||
          (longJump && (boardCool > 0 || contactCool > 0))
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
