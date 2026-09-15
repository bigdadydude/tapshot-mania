/**
 * Isolated auto-play module. Default OFF.
 *
 * Engine hook: `controller.tick(snapshot)` → if true, call existing `tapJump()`.
 * Policies register on skill flags (fusion OR) plus a param-driven `phys`
 * layer (`shotFeel`: jumpFwd / bounce / hang / glass grip). See README.
 */
export { createAiController, AI_TAP_INTERVAL, AI_WATCHDOG } from "./controller.ts";
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
export { installBuiltInBallAiPolicies, comboPaceLimit, shotFeel } from "./policies.ts";
