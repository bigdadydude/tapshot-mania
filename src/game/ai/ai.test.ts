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
    shotMissed: false,
    hitRim: false,
    hitBoard: false,
    rimHits: 0,
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
    assert.ok(
      d.reason === "floor-launch" ||
        d.reason === "apex-boost" ||
        d.reason === "predicted-make",
    );
  });

  it("predicts a backboard bank when a direct thread would miss", () => {
    const w = 390;
    const hoop = {
      x: w - 28 - w * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const flight = world({
      hoop,
      jumpVx: w * 0.76,
      // Between rim and backboard, dropping into the glass — a bank, not a swish.
      ball: { x: hoop.x + hoop.inner * 0.85, y: hoop.y - 52, vx: 160, vy: 90, r: 19.5 },
    });
    const current = predictCurrent(flight);
    assert.equal(current.scores, true);
    assert.equal(current.bank, true);
    assert.equal(current.swish, false);
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

  it("chains the next hoop mid-air at the instant of a make", () => {
    const resolving = world({ scored: true, shotMade: true });
    const chain = decideShot(resolving, helpers);
    assert.equal(chain.tap, true);
    assert.equal(chain.reason, "chain-next");

    // At the rim plane of the new hoop, falling through — jump now, don't wait to land.
    const atMake = world({
      scored: true,
      shotMade: true,
      hoop: { x: 320, y: 330, inner: 28, side: 1, tube: 4.3, moving: false },
      ball: { x: 80, y: 330, vx: 40, vy: 180, r: 19.5 },
    });
    const now = decideShot(atMake, helpers);
    assert.equal(now.tap, true);
    assert.equal(now.reason, "chain-next");

    const tooHigh = world({
      scored: true,
      shotMade: true,
      hoop: { x: 320, y: 330, inner: 28, side: 1, tube: 4.3, moving: false },
      ball: { x: 80, y: 200, vx: 40, vy: 200, r: 19.5 },
    });
    const wait = decideShot(tooHigh, helpers);
    assert.equal(wait.tap, false);
    assert.equal(wait.reason, "chain-wait");

    // Post-make wrap: hoop flipped to the right, ball incoming from the left.
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
    assert.equal(d.reason, "chain-next");
  });

  it("does not freeze on a leftover make prediction after the hoop already counted", () => {
    const hoop = { x: 200, y: 300, inner: 28, side: -1 as const, tube: 4, moving: false };
    const w = world({
      hoop,
      scored: false,
      shotMade: true,
      shotOpen: true,
      world: { w: 390, h: 844, floorY: 844 * 0.765 },
      ball: { x: 280, y: 480, vx: -40, vy: 80, r: 19.5 },
    });
    const d = decideShot(w, helpers);
    assert.equal(d.tap, true);
    assert.notEqual(d.reason, "flight-scores");
    assert.notEqual(d.reason, "already-scored");
  });

  it("lets the ball drop once it is above the rim instead of orbiting", () => {
    const hoop = { x: 200, y: 300, inner: 28, side: -1 as const, tube: 4, moving: false };
    const w = world({
      hoop,
      ball: { x: 200, y: 80, vx: 40, vy: -400, r: 19.5 },
    });
    const d = decideShot(w, helpers);
    assert.equal(d.tap, false);
    assert.equal(d.reason, "let-drop");
  });

  it("releases in the band below the rim instead of sailing past", () => {
    const hoop = { x: 200, y: 300, inner: 28, side: -1 as const, tube: 4, moving: false };
    const w = world({
      hoop,
      ball: { x: 210, y: 348, vx: -80, vy: -200, r: 19.5 },
    });
    const d = decideShot(w, helpers);
    assert.equal(d.tap, false);
    assert.equal(d.reason, "let-drop");
  });

  it("keeps boosting a rising far shot instead of trusting a long-range make guess", () => {
    const w = world({
      hoop: { x: 323, y: 330, inner: 28, side: 1, tube: 4.3, moving: false },
      jumpVx: 390 * 0.76,
      ball: { x: 29, y: 434, vx: 280, vy: -705, r: 19.5 },
    });
    const d = decideShot(w, helpers);
    assert.equal(d.tap, true);
    assert.notEqual(d.reason, "flight-scores");
    assert.notEqual(d.reason, "wait-window");
  });

  it("glass protects a dropping swish but commits when a tap would score", () => {
    const hoop = { x: 200, y: 300, inner: 32, side: -1 as const, tube: 4, moving: false };
    const protect = decideShot(
      world({
        hoop,
        ball: { x: 200, y: 240, vx: 0, vy: 220, r: 16 },
        kit: flags({ glass: true, wrap: "height" }),
      }),
      helpers,
    );
    assert.equal(protect.tap, false);
    assert.ok(protect.policyId === "glass" || protect.policyId === "default");

    const commit = decideShot(
      world({
        hoop,
        ball: { x: 80, y: 844 * 0.765 - 16, vx: 0, vy: 0, r: 16 },
        jumpVx: -80,
        jumpVy: -900,
        kit: flags({ glass: true, wrap: "height" }),
      }),
      helpers,
    );
    assert.ok(commit.tap);
    assert.ok(
      commit.reason === "commit-make" ||
        commit.reason === "seek-swish" ||
        commit.reason === "glass-launch" ||
        commit.reason === "floor-launch" ||
        commit.reason === "predicted-make" ||
        commit.reason === "apex-boost",
    );

    const hover = decideShot(
      world({
        hoop,
        ball: { x: 140, y: 80, vx: 40, vy: -280, r: 16 },
        kit: flags({ glass: true, wrap: "height" }),
      }),
      helpers,
    );
    assert.equal(hover.policyId, "glass");
    assert.equal(hover.tap, false);
    assert.equal(hover.reason, "glass-settle");

    // Below the rim and far from the pocket — climb, don't hover.
    const climb = decideShot(
      world({
        hoop,
        ball: { x: 300, y: 520, vx: -40, vy: 10, r: 16 },
        kit: flags({ glass: true, wrap: "height" }),
      }),
      helpers,
    );
    assert.equal(climb.tap, true);
    assert.notEqual(climb.reason, "glass-settle");

    // Close under the rim but not yet on the floor — don't jump over the glass.
    const under = decideShot(
      world({
        hoop,
        ball: { x: 310, y: 380, vx: 90, vy: 40, r: 16 },
        jumpVx: -80,
        jumpVy: -900,
        kit: flags({ glass: true, wrap: "height" }),
      }),
      helpers,
    );
    assert.equal(under.policyId, "glass");
    assert.equal(under.tap, false);
    assert.equal(under.reason, "glass-settle");
  });

  it("commits a bank in the glass pocket and does not wrap-boost past the board", () => {
    const w = 390;
    const hoop = {
      x: w - 28 - w * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    // Already dropping into the glass — hold, don't tap past it.
    const onGlass = world({
      hoop,
      jumpVx: w * 0.76,
      ball: { x: hoop.x + hoop.inner * 0.85, y: hoop.y - 52, vx: 160, vy: 90, r: 19.5 },
    });
    const stay = decideShot(onGlass, helpers);
    assert.equal(stay.tap, false);
    assert.ok(
      stay.reason === "flight-scores" ||
        stay.reason === "let-drop" ||
        stay.reason === "commit-glass",
    );

    const overfly = world({
      hoop,
      jumpVx: w * 0.76,
      ball: { x: hoop.x + hoop.inner * 0.95, y: hoop.y + 8, vx: 120, vy: 80, r: 19.5 },
    });
    const hold = decideShot(overfly, helpers);
    assert.notEqual(hold.reason, "wrap-boost");
    assert.notEqual(hold.reason, "predicted-bank");
    assert.ok(
      hold.reason === "flight-scores" ||
        hold.reason === "let-drop" ||
        hold.reason === "commit-glass",
    );

    // Over the rim / glass, still on court — fall into the bank window.
    const skyPast = world({
      hoop,
      jumpVx: w * 0.76,
      ball: { x: hoop.x + hoop.inner * 1.15, y: hoop.y - 80, vx: 140, vy: -40, r: 19.5 },
    });
    const drop = decideShot(skyPast, helpers);
    assert.equal(drop.tap, false);
    assert.notEqual(drop.reason, "wrap-boost");
    assert.notEqual(drop.reason, "apex-boost");
  });

  it("ninja chases instead of freezing under the rim", () => {
    const w = 390;
    const hoop = {
      x: w - 28 - w * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const close = world({
      hoop,
      jumpVx: w * 0.76 * 1.2,
      ballMul: 1,
      kit: flags({ ninja: true }),
      ball: { x: hoop.x - 70, y: hoop.y + 90, vx: 40, vy: 80, r: 19.5 },
    });
    const d = decideShot(close, helpers);
    assert.equal(d.policyId, "ninja");
    assert.equal(d.tap, true);
    assert.ok(d.reason === "chase-boost" || d.reason === "wrap-boost" || d.reason === "apex-boost");
    assert.notEqual(d.reason, "let-drop");
    assert.notEqual(d.reason, "wait-window");
  });

  it("lets a messy miss bounce on the floor to open spacing instead of mashing", () => {
    const h = 844;
    const floorY = h * 0.765;
    const r = 19.5;
    const hoop = { x: 66, y: 330, inner: 28, side: -1 as const, tube: 4.3, moving: false };
    const w = world({
      hoop,
      shotMissed: true,
      hitRim: true,
      hitBoard: true,
      rimHits: 3,
      ball: { x: 90, y: floorY - r, vx: 160, vy: 30, r },
    });
    const d = decideShot(w, helpers);
    assert.equal(d.tap, false);
    assert.equal(d.reason, "floor-bounce");
  });

  it("does not bank-spam from mid-court just because a board bounce might score", () => {
    const w = 390;
    const hoop = {
      x: w - 28 - w * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const mid = world({
      hoop,
      jumpVx: w * 0.76 * 1.2,
      ballMul: 1,
      kit: flags({ ninja: true }),
      ball: { x: w * 0.45, y: 480, vx: 200, vy: -80, r: 19.5 },
    });
    const d = decideShot(mid, helpers);
    assert.notEqual(d.reason, "predicted-bank");
  });

  it("rubber holds a rim rattle instead of repeating the same jump angle", () => {
    const hoop = { x: 66, y: 330, inner: 28, side: -1 as const, tube: 4.3, moving: false };
    const w = world({
      hoop,
      hitRim: true,
      rimHits: 2,
      kit: flags({ wrap: "height", rScale: 0.5 }),
      ballMul: 2,
      jumpVx: -296,
      jumpVy: -900,
      ball: { x: 70, y: 360, vx: -280, vy: 220, r: 9.75 },
    });
    const d = decideShot(w, helpers);
    assert.equal(d.tap, false);
    assert.ok(d.reason === "let-rattle" || d.reason === "wait-spacing" || d.reason === "flight-scores");

    const sky = world({
      hoop,
      kit: flags({ wrap: "height", rScale: 0.5 }),
      ballMul: 2,
      onApproachSide: true,
      ballHidden: true,
      jumpVx: -296,
      jumpVy: -900,
      ball: { x: -40, y: -400, vx: 220, vy: -100, r: 9.75 },
    });
    const drop = decideShot(sky, helpers);
    assert.equal(drop.tap, false);
    assert.equal(drop.reason, "let-drop");
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

  it("watchdog does not mash jumpVy from above the rim", () => {
    const ai = createAiController();
    registerBallAiPolicy({
      id: "stuck",
      priority: 99,
      match: () => true,
      vote: () => ({ action: "hold", reason: "wait-window" }),
    });
    ai.setEnabled(true);
    const sky = world({
      dt: AI_WATCHDOG,
      ball: { x: 200, y: 40, vx: 20, vy: -80, r: 19.5 },
      hoop: { x: 200, y: 300, inner: 28, side: -1, tube: 4, moving: false },
    });
    assert.equal(ai.tick(sky), false);
    assert.notEqual(ai.lastDecision()?.reason, "watchdog");
  });
});
