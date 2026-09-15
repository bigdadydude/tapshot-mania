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

export function createAiController(): AiController {
  installBuiltInBallAiPolicies();

  let on = false;
  let cooldown = 0;
  let idle = 0;
  let lastSide: -1 | 1 | 0 = 0;
  let last: AiDecision | null = null;
  let boardCool = 0;
  let wrapCool = 0;
  let loopFresh = 0;
  let lastWraps = 0;
  let lastLoopX = 0;
  let lastLoopY = 0;
  let lastLoopSide: -1 | 1 | 0 = 0;
  let lastLoopReason = "";

  function reset() {
    cooldown = 0;
    idle = 0;
    lastSide = 0;
    last = null;
    boardCool = 0;
    wrapCool = 0;
    loopFresh = 0;
    lastWraps = 0;
    lastLoopX = 0;
    lastLoopY = 0;
    lastLoopSide = 0;
    lastLoopReason = "";
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
      loopFresh = Math.max(0, loopFresh - world.dt);

      // New target hoop (left/right alternate) — don't sit on the previous cooldown.
      if (world.hoop.side !== lastSide) {
        lastSide = world.hoop.side;
        cooldown = 0;
        idle = 0;
        boardCool = 0;
        wrapCool = 0;
        loopFresh = 0;
        lastWraps = world.wraps;
        lastLoopReason = "";
      }

      if (world.shotMade || world.scored) {
        wrapCool = 0;
        loopFresh = 0;
        lastLoopReason = "";
      }
      // Fruitless ground wrap: same jump vector will cycle (ninja-stuck-loop).
      if (world.wraps > lastWraps) {
        lastWraps = world.wraps;
        if (!world.shotMade && !world.scored && !world.hitRim && !world.hitBoard) {
          wrapCool = Math.max(wrapCool, 1.65);
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
      const wrapTap =
        decision.reason === "wrap-escape" ||
        decision.reason === "wrap-boost" ||
        (decision.reason === "early-jump" && nearBoardX);
      const sameLoop =
        wrapTap &&
        loopFresh > 0 &&
        lastLoopReason !== "" &&
        lastLoopSide === world.hoop.side &&
        Math.hypot(world.ball.x - lastLoopX, world.ball.y - lastLoopY) < 40;
      if (decision.tap) {
        // Long jumpFwd near glass/rim: ZERO extra taps. bank-cut / apex /
        // combo-pressure / wrap-in-pocket / watchdog is the ninja death loop.
        if (locked && pocketExtra) {
          last = { tap: false, reason: "protect-finish", policyId: decision.policyId };
          idle = 0;
          return false;
        }
        // Recording ninja-stuck-loop: wrap-escape + 50ms recatch, ground wrap,
        // far launch, ~1.08s, same under-hoop tap. Same jump vector, 0 scores.
        // wrapCool only blocks *near the board* so a far approach-enter still
        // fires. sameLoop is a short pose-repeat window, not a permanent ban.
        if (
          longJump &&
          wrapTap &&
          (sameLoop || (wrapCool > 0 && nearBoardX))
        ) {
          last = { tap: false, reason: "wrap-loop", policyId: decision.policyId };
          idle = 0;
          return false;
        }
        // Cool only on ninja-class jumpFwd — classic bank-cuts need to chain.
        if (longJump && boardCool > 0 && !recoverTap && nearBoardX) {
          last = { tap: false, reason: "overshoot-cool", policyId: decision.policyId };
          idle = 0;
          return false;
        }
        if (cooldown > 0) return false;
        const fired = fire(decision, wait);
        if (longJump && !recoverTap && nearBoardX) {
          boardCool = 0.55;
        }
        if (wrapTap) {
          lastLoopX = world.ball.x;
          lastLoopY = world.ball.y;
          lastLoopSide = world.hoop.side;
          lastLoopReason = decision.reason;
          loopFresh = 0.35;
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
        const grounded = world.ball.y >= floor - 10 && world.ball.vy > -50;
        const sky = world.ball.y + world.ball.r * 0.15 < world.hoop.y;
        // jumpVy from above the rim is how rubber/glass/classic sail into orbit.
        if (sky && !grounded) {
          idle = 0;
          return false;
        }
        if (locked || (longJump && (boardCool > 0 || wrapCool > 0))) {
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
