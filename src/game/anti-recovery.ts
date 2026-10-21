/** Black-hole v2 assists travel and near-rim alignment; baskets use normal physics. */
export type AntiRecovery = {
  mode: "flight" | "return" | "ready";
  grace: number;
  scored: boolean;
  delay: number;
  pull: number;
};

type Body = { x: number; y: number; vx: number; vy: number; r: number };
type Target = { x: number; y: number; inner: number; scoreable?: boolean };

/** A small, local horizontal pull; no upward lift or automatic rim crossing. */
export function assistAntiHoop(ball: Body, hoops: Target[], gravity: number, dt: number) {
  if (ball.vy <= 0) return;
  let target: Target | undefined;
  let weight = 0;
  for (const hoop of hoops) {
    if (hoop.scoreable === false) continue;
    const above = hoop.y - ball.y;
    const x = Math.abs(hoop.x - ball.x) / (hoop.inner * 2.6 + ball.r);
    const y = above / (hoop.inner * 3.2 + ball.r);
    if (above <= 0 || x >= 1 || y >= 1) continue;
    const influence = (1 - x * x) * (1 - y * y);
    if (influence > weight) { target = hoop; weight = influence; }
  }
  if (!target) return;
  const cap = gravity * 0.22;
  const acceleration = Math.max(-cap, Math.min(cap, (target.x - ball.x) * 7 - ball.vx * 1.25));
  ball.vx += acceleration * weight * Math.min(1, ball.vy / 100) * dt;
}
export const createAntiRecovery = (): AntiRecovery => ({
  mode: "return", grace: 0, scored: false, delay: 0, pull: 0,
});

export function launchAntiRecovery(state: AntiRecovery) {
  state.mode = "flight";
  state.grace = 0.38;
  state.scored = false;
  state.delay = 0;
  state.pull = 0;
}

export function scoreAntiRecovery(state: AntiRecovery) {
  state.mode = "return";
  state.scored = true;
  // Let the made ball thread the net before pulling it back.
  state.delay = 0.14;
  state.pull = 0;
}

export function antiRecoveryReturning(state: AntiRecovery) {
  return state.mode !== "flight" && state.delay <= 0;
}

/** Only an already-scored transport or a parked ball can bypass the hoops. */
export function antiRecoveryIgnoresHoops(state: AntiRecovery) {
  return antiRecoveryReturning(state) && (state.scored || state.mode === "ready");
}

/** Updates velocity; the engine integrates position once, with its usual dt. */
export function stepAntiRecovery(
  state: AntiRecovery, ball: Body, center: { x: number; y: number },
  hoops: Target[], floorY: number, gravity: number, dt: number,
) {
  if (state.mode === "ready") {
    ball.vx = (center.x - ball.x) / dt;
    ball.vy = (center.y - ball.y) / dt;
    return;
  }
  state.grace = Math.max(0, state.grace - dt);
  state.delay = Math.max(0, state.delay - dt);
  const safeY = floorY - ball.r * 1.1;
  // Proximity to the floor, not a time-to-floor prediction: a low basket may
  // still lie on the imminent descent. The velocity barrier below prevents impact.
  const floorDanger = ball.vy > 0 && ball.y >= safeY - 1;
  const nearHoop = hoops.some(h =>
    Math.abs(ball.x - h.x) < h.inner * 2.6 + ball.r &&
    Math.abs(ball.y - h.y) < h.inner * 2 + ball.r * 2);
  const belowHoops = hoops.every(h => ball.y > h.y + h.inner + ball.r * 2);
  if (state.mode === "flight" && (floorDanger ||
    (state.grace <= 0 && ball.vy > 0 && !nearHoop && belowHoops))) {
    state.mode = "return";
    state.scored = false;
  }

  if (antiRecoveryReturning(state)) {
    // Critically damped spring: faster after a make, gentler after a miss.
    // Ramp in stiffness so recovery preserves the outgoing tangent initially.
    state.pull = Math.min(1, state.pull + dt / (state.scored ? 0.06 : 0.18));
    const omega = (state.scored ? 20 : 9) * (0.35 + 0.65 * state.pull);
    const decay = Math.exp(-omega * dt);
    const axis = (p: number, v: number, target: number) => {
      const displacement = p - target;
      const next = target + (displacement + (v + omega * displacement) * dt) * decay;
      return (next - p) / dt;
    };
    ball.vx = axis(ball.x, ball.vx, center.x);
    ball.vy = axis(ball.y, ball.vy, center.y);
    if (Math.hypot(ball.x - center.x, ball.y - center.y) < 1.5 &&
      Math.hypot(ball.vx, ball.vy) < 12) {
      state.mode = "ready";
      ball.vx = (center.x - ball.x) / dt;
      ball.vy = (center.y - ball.y) / dt;
    }
  } else {
    if (state.mode === "flight" && !state.scored) assistAntiHoop(ball, hoops, gravity, dt);
    ball.vy += gravity * dt;
    // Barely perceptible attraction during an unprotected descent. Shots and
    // rim/board play keep their normal trajectory inside the protected window.
    if (state.grace <= 0 && !nearHoop && ball.vy > 0 && state.delay <= 0) {
      ball.vx += (center.x - ball.x) * 0.3 * dt;
    }
  }
  // A soft velocity barrier catches even fast downward impacts before the floor.
  if (ball.vy > 0) ball.vy = Math.min(ball.vy, Math.max(0, (safeY - ball.y) * 7));
}
