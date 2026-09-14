import { predictCurrent, predictTap } from "./predict.ts";
import { decideShot } from "./registry.ts";
import { installBuiltInBallAiPolicies } from "./policies.ts";
import type { AiDecision, AiWorld } from "./types.ts";

const helpers = { predictCurrent, predictTap };

/** Floor between AI taps so we don't jitter every physics step. */
export const AI_TAP_INTERVAL = 0.14;
const PANIC_INTERVAL = 0.09;

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
  let last: AiDecision | null = null;

  function reset() {
    cooldown = 0;
    last = null;
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
      if (!world.canShoot) return false;
      if (world.tapLock > 0) return false;
      if (world.paused || world.phase !== "playing") return false;

      const decision = decideShot(world, helpers);
      last = decision;
      if (!decision.tap) return false;

      const panic = world.timerArmed && world.timer < 1.2 && !world.buzzer;
      const wait = panic ? PANIC_INTERVAL : AI_TAP_INTERVAL;
      if (cooldown > 0) return false;
      cooldown = wait;
      return true;
    },
  };
}
