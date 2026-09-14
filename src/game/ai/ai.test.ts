import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { flagsFromKit, type AiWorld, type BallSkillFlags } from "./types.ts";
import {
  decideShot,
  listBallAiPolicies,
  policiesForKit,
  registerBallAiPolicy,
  resetBallAiPoliciesForTests,
} from "./registry.ts";
import {
  installBuiltInBallAiPolicies,
  resetBuiltInInstallForTests,
} from "./policies.ts";
import { createAiController, AI_TAP_INTERVAL, AI_WATCHDOG } from "./controller.ts";
import { predictCurrent, predictTap } from "./predict.ts";
import { effectiveBall } from "../balls.ts";

const helpers = { predictCurrent, predictTap };

function flags(over: Partial<BallSkillFlags> = {}): BallSkillFlags {
  return {
    heat: false,
    frost: false,
    champ: false,
    anti: false,
    chain: false,
    ninja: false,
    glass: false,
    wrap: "ground",
    rScale: 1,
    ...over,
  };
}

function world(over: Partial<AiWorld> = {}): AiWorld {
  const w = 390;
  const h = 844;
  const floorY = h * 0.765;
  const r = 19.5;
  const hoopX = 28 + w * 0.1;
  const hoopY = 326;
  const jumpVx = -1 * w * 0.76;
  const jumpVy = -Math.sqrt(2 * (h * 3.1) * h * 0.185);
  const base: AiWorld = {
    dt: 1 / 60,
    canShoot: true,
    phase: "playing",
    paused: false,
    tapLock: 0,
    scored: false,
    shotOpen: false,
    shotMade: false,
    timer: 12,
    timerArmed: true,
    buzzer: false,
    timeUp: false,
    combo: 0,
    streak: 0,
    world: { w, h, floorY },
    ball: { x: w * 0.78, y: floorY - r, vx: 0, vy: 0, r },
    hoop: { x: hoopX, y: hoopY, inner: 28, side: -1, tube: 4.3, moving: false },
    other: null,
    ballHidden: false,
    onApproachSide: false,
    holeOn: false,
    hole: null,
    antiMatter: null,
    antiCharge: 0,
    champMode: false,
    glassBase: 20,
    kit: flags(),
    jumpVx,
    jumpVy,
    gravity: h * 3.1,
    air: 1,
    buoy: 0,
    ballMul: 1,
    wrapPad: Math.max(52, w * 0.15),
  };
  return {
    ...base,
    ...over,
    world: { ...base.world, ...(over.world ?? {}) },
    ball: { ...base.ball, ...(over.ball ?? {}) },
    hoop: { ...base.hoop, ...(over.hoop ?? {}) },
    kit: { ...base.kit, ...(over.kit ?? {}) },
  };
}

describe("ball AI registry", () => {
  beforeEach(() => {
    resetBallAiPoliciesForTests();
    resetBuiltInInstallForTests();
    installBuiltInBallAiPolicies();
  });

  it("registers built-ins once and always includes default", () => {
    const ids = listBallAiPolicies().map((p) => p.id);
    assert.ok(ids.includes("default"));
    assert.ok(ids.includes("anti"));
    assert.ok(ids.includes("glass"));
    assert.ok(ids.includes("ninja"));
    installBuiltInBallAiPolicies();
    assert.equal(listBallAiPolicies().filter((p) => p.id === "default").length, 1);
  });

  it("matches fusion flags, not primary ball id", () => {
    const fused = flagsFromKit(effectiveBall("plain", "anti"));
    assert.equal(fused.anti, true);
    assert.equal(fused.heat, false);
    const ids = policiesForKit(fused).map((p) => p.id);
    assert.ok(ids.includes("anti"));
    assert.ok(ids.includes("default"));
  });

  it("lets a higher-priority policy tap before default", () => {
    registerBallAiPolicy({
      id: "force",
      priority: 99,
      match: () => true,
      vote: () => ({ action: "tap", reason: "test" }),
    });
    const d = decideShot(world(), helpers);
    assert.equal(d.policyId, "force");
    assert.equal(d.tap, true);
  });

  it("default boosts from a settled floor toward the hoop", () => {
    const w = world({
      kit: flags(),
      ball: { x: 300, y: 844 * 0.765 - 19.5, vx: -30, vy: 0, r: 19.5 },
    });
    const d = decideShot(w, helpers);
    assert.equal(d.policyId, "default");
    assert.equal(d.tap, true);
    assert.ok(d.reason === "apex-boost" || d.reason === "predicted-make");
  });

  it("default holds when the current flight already scores", () => {
    const hoop = { x: 200, y: 300, inner: 28, side: -1 as const, tube: 4, moving: false };
    const w = world({
      hoop,
      ball: { x: 200, y: 240, vx: 0, vy: 220, r: 19.5 },
      kit: flags(),
    });
    const current = predictCurrent(w);
    assert.equal(current.scores, true);
    const d = decideShot(w, helpers);
    assert.equal(d.tap, false);
    assert.equal(d.policyId, "default");
  });

  it("default holds the resolving make but keeps shooting after hoop switch", () => {
    const resolving = world({ scored: true, shotMade: true });
    const hold = decideShot(resolving, helpers);
    assert.equal(hold.tap, false);
    assert.equal(hold.reason, "already-scored");

    // Post-make wrap: hoop flipped to the right, ball incoming from the left.
    // shotMade is still true until the next tapJump — must not deadlock.
    const w = 390;
    const h = 844;
    const r = 19.5;
    const incoming = world({
      scored: false,
      shotMade: true,
      shotOpen: true,
      ballHidden: true,
      onApproachSide: true,
      jumpVx: w * 0.76,
      jumpVy: -Math.sqrt(2 * (h * 3.1) * h * 0.185),
      hoop: {
        x: w - 28 - w * 0.1,
        y: 365,
        inner: 28,
        side: 1,
        tube: 4.3,
        moving: false,
      },
      ball: { x: -r - 40, y: h * 0.765 - r, vx: 44, vy: 0, r },
    });
    const d = decideShot(incoming, helpers);
    assert.equal(d.tap, true);
    assert.notEqual(d.reason, "already-scored");
  });

  it("glass protects a swish instead of re-tapping", () => {
    const hoop = { x: 200, y: 300, inner: 32, side: -1 as const, tube: 4, moving: false };
    const w = world({
      hoop,
      ball: { x: 200, y: 240, vx: 0, vy: 220, r: 16 },
      kit: flags({ glass: true, wrap: "height" }),
    });
    const d = decideShot(w, helpers);
    assert.equal(d.tap, false);
    assert.ok(d.policyId === "glass" || d.policyId === "default");
  });

  it("anti votes tap to collect a pickup the current path misses", () => {
    const w = world({
      kit: flags({ anti: true }),
      ball: { x: 80, y: 500, vx: 0, vy: 0, r: 19.5 },
      antiMatter: { x: 80, y: 280, r: 16 },
      jumpVx: 0,
      jumpVy: -900,
    });
    const d = decideShot(w, helpers);
    assert.equal(d.policyId, "anti");
    assert.equal(d.tap, true);
  });
});

describe("AI controller", () => {
  beforeEach(() => {
    resetBallAiPoliciesForTests();
    resetBuiltInInstallForTests();
  });

  it("does nothing when disabled and clears state on disable", () => {
    const ai = createAiController();
    const floor = world();
    // Force a tap vote so a bug would fire while OFF.
    registerBallAiPolicy({
      id: "force",
      priority: 99,
      match: () => true,
      vote: () => ({ action: "tap", reason: "test" }),
    });
    assert.equal(ai.enabled(), false);
    assert.equal(ai.tick(floor), false);
    assert.equal(ai.lastDecision(), null);

    ai.setEnabled(true);
    assert.equal(ai.tick(floor), true);
    assert.ok(ai.lastDecision());

    ai.setEnabled(false);
    assert.equal(ai.enabled(), false);
    assert.equal(ai.lastDecision(), null);
    assert.equal(ai.tick(floor), false);
  });

  it("respects tap cooldown and reset()", () => {
    const ai = createAiController();
    registerBallAiPolicy({
      id: "force",
      priority: 99,
      match: () => true,
      vote: () => ({ action: "tap", reason: "test" }),
    });
    ai.setEnabled(true);
    const w = world({ dt: 1 / 60 });
    assert.equal(ai.tick(w), true);
    assert.equal(ai.tick(w), false);
    ai.reset();
    assert.equal(ai.tick(w), true);
    assert.ok(AI_TAP_INTERVAL > 0.05);
  });

  it("clears cooldown when the hoop switches sides so the next shot can start", () => {
    const ai = createAiController();
    registerBallAiPolicy({
      id: "force",
      priority: 99,
      match: () => true,
      vote: () => ({ action: "tap", reason: "test" }),
    });
    ai.setEnabled(true);
    const left = world({ dt: 1 / 60, hoop: { ...world().hoop, side: -1 } });
    assert.equal(ai.tick(left), true);
    assert.equal(ai.tick(left), false);
    const right = world({
      dt: 1 / 60,
      scored: false,
      shotMade: true,
      hoop: { x: 320, y: 326, inner: 28, side: 1, tube: 4.3, moving: false },
      jumpVx: 390 * 0.76,
    });
    assert.equal(ai.tick(right), true);
  });

  it("watchdog taps if a policy holds too long while the ball is playable", () => {
    const ai = createAiController();
    registerBallAiPolicy({
      id: "stuck",
      priority: 99,
      match: () => true,
      vote: () => ({ action: "hold", reason: "wait-window" }),
    });
    ai.setEnabled(true);
    const w = world({ dt: AI_WATCHDOG / 2 });
    assert.equal(ai.tick(w), false);
    assert.equal(ai.tick(w), true);
    assert.equal(ai.lastDecision()?.reason, "watchdog");
  });
});
