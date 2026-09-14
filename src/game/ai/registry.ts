import type { AiDecision, AiHelpers, AiWorld, BallAiPolicy, BallSkillFlags } from "./types.ts";

const policies: BallAiPolicy[] = [];

export function registerBallAiPolicy(policy: BallAiPolicy): void {
  const i = policies.findIndex((p) => p.id === policy.id);
  if (i >= 0) policies[i] = policy;
  else policies.push(policy);
}

export function listBallAiPolicies(): readonly BallAiPolicy[] {
  return policies;
}

export function policiesForKit(kit: BallSkillFlags): BallAiPolicy[] {
  return policies
    .filter((p) => p.match(kit))
    .sort((a, b) => b.priority - a.priority);
}

/**
 * First non-`abstain` vote wins (highest priority first).
 * Default policy is priority 0 and always matches, so unknown balls still shoot.
 */
export function decideShot(world: AiWorld, helpers: AiHelpers): AiDecision {
  const matched = policiesForKit(world.kit);
  for (const policy of matched) {
    const vote = policy.vote(world, helpers);
    if (vote.action === "abstain") continue;
    return {
      tap: vote.action === "tap",
      reason: vote.reason,
      policyId: policy.id,
    };
  }
  return { tap: false, reason: "no-policy", policyId: "none" };
}

/** Test helper — not used in production. */
export function resetBallAiPoliciesForTests(): void {
  policies.length = 0;
}
