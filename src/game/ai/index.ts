/**
 * Isolated auto-play module. Default OFF.
 *
 * Engine hook: `controller.tick(snapshot)` → if true, call existing `tapJump()`.
 * Policies register on skill flags (fusion OR), not a ball-id if-else swamp.
 *
 * See `src/game/ai/README.md` for adding a ball policy and wiring a future menu.
 */
export { createAiController, AI_TAP_INTERVAL } from "./controller.ts";
export type { AiController } from "./controller.ts";
export { flagsFromKit } from "./types.ts";
export type {
  AiWorld,
  AiDecision,
  BallAiPolicy,
  BallSkillFlags,
  AiVote,
  AiHelpers,
} from "./types.ts";
export { registerBallAiPolicy, listBallAiPolicies, policiesForKit } from "./registry.ts";
export { installBuiltInBallAiPolicies } from "./policies.ts";
