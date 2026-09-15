import { predictCurrent, predictTap } from "./predict.ts";
import { decideShot } from "./registry.ts";
import { comboPaceLimit, installBuiltInBallAiPolicies } from "./policies.ts";
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
  "wrap-boost",
  "wrap-escape",
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

  function reset() {
    cooldown = 0;
    idle = 0;
    lastSide = 0;
    last = null;
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

      // New target hoop (left/right alternate) — don't sit on the previous cooldown.
      if (world.hoop.side !== lastSide) {
        lastSide = world.hoop.side;
        cooldown = 0;
        idle = 0;
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
      if (decision.tap) {
        if (cooldown > 0) return false;
        return fire(decision, wait);
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
        return fire(
          { tap: true, reason: "watchdog", policyId: decision.policyId },
          wait,
        );
      }
      return false;
    },
  };
}
