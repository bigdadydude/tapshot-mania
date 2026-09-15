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
  comboPaceLimit,
  shotFeel,
  demoPriors,
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
  const jumpVx = -1 * w * 0.76 * 0.95;
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
    comboClock: 0,
    comboCounting: false,
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
    hoopMul: 1,
    boardFric: 1,
    floorMul: 1,
    wrapPad: Math.max(52, w * 0.15),
    wraps: 0,
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
    assert.ok(ids.includes("phys"));
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
    assert.equal(current.willBoard, true);
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
    assert.ok(d.policyId === "default" || d.policyId === "phys");
    assert.equal(d.reason, "flight-scores");
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
        ball: { x: 208, y: 360, vx: 20, vy: 40, r: 16 },
        jumpVx: -80,
        jumpVy: -900,
        kit: flags({ glass: true, wrap: "height" }),
      }),
      helpers,
    );
    assert.equal(under.policyId, "glass");
    assert.equal(under.tap, false);
    assert.equal(under.reason, "glass-settle");

    // Human first-tap |dx| ~296: keep climbing — closeToHoop (~125) is still short.
    const approach = decideShot(
      world({
        hoop,
        ball: { x: hoop.x + 250, y: 500, vx: -40, vy: 20, r: 16 },
        jumpVx: -80,
        jumpVy: -900,
        kit: flags({ glass: true, wrap: "height" }),
      }),
      helpers,
    );
    assert.equal(approach.tap, true);
    assert.ok(approach.reason === "glass-launch" || approach.reason === "commit-make" || approach.reason === "seek-swish");

    // Prior AI settled at closeToHoop (~125px) — still a jump short of the pocket.
    const short = decideShot(
      world({
        hoop,
        ball: { x: hoop.x + 110, y: 480, vx: -30, vy: 20, r: 16 },
        jumpVx: -80,
        jumpVy: -900,
        kit: flags({ glass: true, wrap: "height" }),
      }),
      helpers,
    );
    assert.equal(short.tap, true);
    assert.notEqual(short.reason, "glass-settle");

    // Rim contact −2. Low HP must not slam iron — hunt a swish instead.
    const fragile = decideShot(
      world({
        hoop,
        glassBase: 6,
        ball: { x: hoop.x + 110, y: 420, vx: -40, vy: 30, r: 16 },
        jumpVx: -80,
        jumpVy: -900,
        kit: flags({ glass: true, wrap: "height" }),
      }),
      helpers,
    );
    assert.equal(fragile.policyId, "glass");
    assert.notEqual(fragile.reason, "commit-make");
    assert.notEqual(fragile.reason, "commit-glass");

    // Off-center in the pocket: realign, don't settle a miss into 打铁/落地.
    const missPocket = decideShot(
      world({
        hoop,
        ball: { x: hoop.x + 70, y: hoop.y + 48, vx: 10, vy: 50, r: 16 },
        jumpVx: -80,
        jumpVy: -900,
        kit: flags({ glass: true, wrap: "height" }),
      }),
      helpers,
    );
    assert.equal(missPocket.tap, true);
    assert.ok(
      missPocket.reason === "glass-launch" ||
        missPocket.reason === "seek-swish" ||
        missPocket.reason === "commit-make",
    );
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
        stay.reason === "commit-glass" ||
        stay.reason === "bank-steep" ||
        stay.reason === "bank-half" ||
      stay.reason === "protect-finish",
    );

    const overfly = world({
      hoop,
      jumpVx: w * 0.76,
      ball: { x: hoop.x + hoop.inner * 0.95, y: hoop.y + 8, vx: 120, vy: 80, r: 19.5 },
    });
    const hold = decideShot(overfly, helpers);
    assert.notEqual(hold.reason, "wrap-boost");
    assert.notEqual(hold.reason, "predicted-bank");
    const overflyCur = predictCurrent(overfly);
    const overflyNext = predictTap(overfly);
    if (overflyNext.willBoard && !overflyCur.willBoard) {
      assert.equal(hold.tap, true);
      assert.equal(hold.reason, "bank-cut");
    } else {
      assert.ok(
        hold.reason === "flight-scores" ||
          hold.reason === "let-drop" ||
          hold.reason === "commit-glass" ||
          hold.reason === "protect-finish" ||
          hold.reason === "bank-steep" ||
          hold.reason === "bank-half",
      );
    }

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

  it("taps a bank-cut when drifting past a makeable glass kiss", () => {
    const w = 390;
    const hoop = {
      x: w - 28 - w * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const drift = world({
      hoop,
      jumpVx: w * 0.76,
      // On the glass side of the rim, opening toward court — freeze used to miss the kiss.
      ball: { x: hoop.x + hoop.inner * 1.35, y: hoop.y - 40, vx: -18, vy: 55, r: 19.5 },
    });
    const cur = predictCurrent(drift);
    assert.equal(cur.willBoard, false);
    const d = decideShot(drift, helpers);
    assert.equal(d.tap, true);
    assert.equal(d.reason, "bank-cut");
  });

  it("taps a steep miss when the jump-reset would kiss glass", () => {
    const w = 390;
    const hoop = {
      x: w - 28 - w * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    // Closing on the pocket but the current arc misses the face. Holding
    // commit-glass here was freeze-and-miss; tapJump's full vx kisses.
    const steep = world({
      hoop,
      jumpVx: w * 0.76,
      ball: { x: hoop.x + hoop.inner * 0.4, y: hoop.y + 20, vx: 90, vy: 140, r: 19.5 },
    });
    const cur = predictCurrent(steep);
    const nxt = predictTap(steep);
    assert.equal(cur.willBoard, false);
    assert.equal(nxt.willBoard, true);
    const d = decideShot(steep, helpers);
    assert.equal(d.tap, true);
    assert.equal(d.reason, "bank-cut");
  });

  it("does not speculative-tap a bank window when the reset would miss glass", () => {
    const w = 390;
    const hoop = {
      x: w - 28 - w * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const miss = world({
      hoop,
      jumpVx: w * 0.76,
      ball: { x: hoop.x + hoop.inner * 1.2, y: hoop.y + 40, vx: 8, vy: 160, r: 19.5 },
    });
    const cur = predictCurrent(miss);
    const nxt = predictTap(miss);
    if (!cur.willBoard && !nxt.willBoard) {
      const d = decideShot(miss, helpers);
      assert.notEqual(d.reason, "bank-cut");
    }
  });

  it("does not reset jumpVx on a flight already hitting the glass", () => {
    const w = 390;
    const hoop = {
      x: w - 28 - w * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const inbound = world({
      hoop,
      jumpVx: w * 0.76,
      combo: 8,
      streak: 8,
      comboClock: 1.9,
      comboCounting: true,
      ball: { x: hoop.x + hoop.inner * 0.85, y: hoop.y - 52, vx: 160, vy: 90, r: 19.5 },
    });
    const cur = predictCurrent(inbound);
    assert.equal(cur.willBoard, true);
    const d = decideShot(inbound, helpers);
    assert.equal(d.tap, false);
    assert.notEqual(d.reason, "shot-clock");
    assert.notEqual(d.reason, "apex-boost");
    assert.notEqual(d.reason, "predicted-make");
    assert.notEqual(d.reason, "bank-cut");
    assert.notEqual(d.reason, "wrap-escape");
    assert.notEqual(d.reason, "wrap-boost");

    const ninjaIn = world({
      hoop,
      kit: flags({ ninja: true }),
      jumpVx: w * 0.76 * 1.2,
      hoopMul: 0.8,
      boardFric: 0.7,
      combo: 10,
      streak: 10,
      comboClock: 1.5,
      comboCounting: true,
      ball: { x: hoop.x + hoop.inner * 0.85, y: hoop.y - 52, vx: 180, vy: 90, r: 19.5 },
    });
    const n = decideShot(ninjaIn, helpers);
    assert.equal(n.tap, false);
    assert.notEqual(n.reason, "early-jump");
    assert.notEqual(n.reason, "wrap-escape");
    assert.notEqual(n.reason, "shot-clock");
  });

  it("ninja does not bank-cut a live make approaching the rim", () => {
    const hoop = {
      x: 390 - 28 - 390 * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const goingIn = world({
      hoop,
      kit: flags({ ninja: true }),
      jumpVx: 390 * 0.76 * 1.2,
      hoopMul: 0.8,
      boardFric: 0.7,
      combo: 8,
      streak: 8,
      comboClock: 0.9,
      comboCounting: true,
      ball: { x: hoop.x - 40, y: hoop.y - 50, vx: 160, vy: 90, r: 19.5 },
    });
    const cur = predictCurrent(goingIn);
    assert.equal(cur.scores, true);
    const d = decideShot(goingIn, helpers);
    assert.equal(d.tap, false);
    assert.notEqual(d.reason, "bank-cut");
    assert.notEqual(d.reason, "apex-boost");
    assert.notEqual(d.reason, "shot-clock");
    assert.notEqual(d.reason, "pace-boost");
    assert.notEqual(d.reason, "predicted-make");
  });

  it("ninja prefers a missed cut over a jump-reset near the glass", () => {
    const hoop = {
      x: 390 - 28 - 390 * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const steep = world({
      hoop,
      kit: flags({ ninja: true }),
      jumpVx: 390 * 0.76 * 1.2,
      hoopMul: 0.8,
      boardFric: 0.7,
      ball: { x: hoop.x + hoop.inner * 0.4, y: hoop.y + 20, vx: 90, vy: 140, r: 19.5 },
    });
    const d = decideShot(steep, helpers);
    assert.equal(d.tap, false);
    assert.notEqual(d.reason, "bank-cut");
    assert.notEqual(d.reason, "apex-boost");
  });

  it("demo priors demote oral bank-cut / swish-hunt / extra climb on ninja", () => {
    const ninja = world({
      kit: flags({ ninja: true }),
      jumpVx: 390 * 0.76 * 1.2,
      hoopMul: 0.8,
      boardFric: 0.7,
    });
    const n = demoPriors(ninja);
    assert.equal(n.bankCutTap, false);
    assert.equal(n.huntSwish, false);
    assert.equal(n.extraClimbTaps, false);
    assert.equal(n.comboPokeNearHoop, false);
    assert.equal(n.holdInboundBank, true);
    assert.equal(n.wrapRecovery, true);
    assert.equal(n.popAway, true);
    assert.equal(demoPriors(world({ jumpVx: 390 * 0.76 * 0.95 })).bankCutTap, true);
    assert.equal(demoPriors(world({ kit: flags({ glass: true, wrap: "height" }), ballMul: 0 })).bankCutTap, false);
  });

  it("ninja does not apex-boost a below-rim launch (demo: early-jump then ride)", () => {
    const hoop = {
      x: 390 - 28 - 390 * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const climb = world({
      hoop,
      kit: flags({ ninja: true }),
      jumpVx: 390 * 0.76 * 1.2,
      hoopMul: 0.8,
      boardFric: 0.7,
      shotOpen: true,
      ball: { x: hoop.x - 150, y: hoop.y + 70, vx: 120, vy: -60, r: 19.5 },
    });
    const d = decideShot(climb, helpers);
    assert.notEqual(d.reason, "apex-boost");
    assert.notEqual(d.reason, "bank-cut");
    assert.notEqual(d.reason, "predicted-make");
    assert.notEqual(d.reason, "shot-clock");
  });

  it("does not freeze a ninja climb at half-board height far from the glass", () => {
    const hoop = {
      x: 28 + 390 * 0.1,
      y: 330,
      inner: 28,
      side: -1 as const,
      tube: 4.3,
      moving: false,
    };
    const climb = world({
      hoop,
      kit: flags({ ninja: true }),
      jumpVx: -390 * 0.76 * 1.2,
      hoopMul: 0.8,
      boardFric: 0.7,
      shotOpen: true,
      combo: 2,
      streak: 2,
      comboCounting: true,
      ball: { x: 246, y: 281, vx: -355, vy: -699, r: 19.5 },
    });
    const d = decideShot(climb, helpers);
    assert.notEqual(d.reason, "flight-scores");
    assert.notEqual(d.reason, "commit-glass");
    assert.notEqual(d.reason, "bank-cut");
  });

  it("ninja lets a miss under the rim fall instead of jumping over", () => {
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
      ball: { x: hoop.x - 55, y: hoop.y + 110, vx: 8, vy: 20, r: 19.5 },
    });
    const d = decideShot(close, helpers);
    assert.equal(d.policyId, "phys");
    assert.equal(d.tap, false);
    assert.equal(d.reason, "let-drop");

    const flying = world({
      hoop,
      jumpVx: w * 0.76 * 1.2,
      kit: flags({ ninja: true }),
      ball: { x: hoop.x - 140, y: hoop.y + 40, vx: 220, vy: 80, r: 19.5 },
    });
    const ride = decideShot(flying, helpers);
    assert.notEqual(ride.reason, "apex-boost");
    assert.notEqual(ride.reason, "chase-boost");
    assert.notEqual(ride.reason, "shot-clock");
    assert.ok(ride.reason === "ride-flight" || ride.reason === "let-drop");
  });

  it("ninja wraps a combo-dying parked miss under the rim instead of sitting", () => {
    const w = 390;
    const hoop = {
      x: w - 28 - w * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const dying = world({
      hoop,
      jumpVx: w * 0.76 * 1.2,
      ballMul: 1,
      kit: flags({ ninja: true }),
      combo: 18,
      streak: 18,
      comboClock: 1.4,
      comboCounting: true,
      ball: { x: hoop.x - 55, y: hoop.y + 110, vx: 8, vy: 20, r: 19.5 },
    });
    const d = decideShot(dying, helpers);
    assert.equal(d.policyId, "phys");
    assert.equal(d.tap, true);
    assert.equal(d.reason, "wrap-escape");

    const liveFall = world({
      hoop,
      jumpVx: w * 0.76 * 1.2,
      ballMul: 1,
      kit: flags({ ninja: true }),
      combo: 18,
      streak: 18,
      comboClock: 1.4,
      comboCounting: true,
      ball: { x: hoop.x - 55, y: hoop.y + 110, vx: 120, vy: 80, r: 19.5 },
    });
    const holdLive = decideShot(liveFall, helpers);
    assert.equal(holdLive.tap, false);
    assert.ok(holdLive.reason === "let-drop" || holdLive.reason === "ride-flight");

    const floorY = 844 * 0.765;
    const r = 19.5;
    const liveFloor = world({
      hoop,
      jumpVx: w * 0.76 * 1.2,
      ballMul: 1,
      kit: flags({ ninja: true }),
      combo: 4,
      streak: 4,
      comboClock: 1.1,
      comboCounting: true,
      ball: { x: hoop.x - 55, y: floorY - r, vx: 140, vy: 10, r },
    });
    const holdFloor = decideShot(liveFloor, helpers);
    assert.equal(holdFloor.tap, false);
    assert.equal(holdFloor.reason, "let-drop");
  });

  it("ninja launches from far on the floor (human first-tap |dx| ~237)", () => {
    const hoop = {
      x: 390 - 28 - 390 * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const floorY = 844 * 0.765;
    const r = 19.5;
    const parked = world({
      hoop,
      kit: flags({ ninja: true }),
      jumpVx: 390 * 0.76 * 1.2,
      hoopMul: 0.8,
      boardFric: 0.7,
      ball: { x: hoop.x - 224, y: floorY - r, vx: 8, vy: 10, r },
    });
    const d = decideShot(parked, helpers);
    assert.equal(d.tap, true);
    assert.equal(d.reason, "early-jump");
  });

  it("ninja recatches mid-climb while still far (human 2nd tap)", () => {
    const hoop = {
      x: 390 - 28 - 390 * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const mid = world({
      hoop,
      kit: flags({ ninja: true }),
      jumpVx: 390 * 0.76 * 1.2,
      hoopMul: 0.8,
      boardFric: 0.7,
      shotOpen: true,
      ball: { x: hoop.x - 210, y: hoop.y + 170, vx: 280, vy: -150, r: 19.5 },
    });
    const d = decideShot(mid, helpers);
    assert.equal(d.tap, true);
    assert.equal(d.reason, "early-jump");
  });

  it("ninja does not recatch at full-speed mid-climb (that overshoots into a wrap)", () => {
    const hoop = {
      x: 390 - 28 - 390 * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const jumpVx = 390 * 0.76 * 1.2;
    const early = world({
      hoop,
      kit: flags({ ninja: true }),
      jumpVx,
      hoopMul: 0.8,
      boardFric: 0.7,
      shotOpen: true,
      ball: { x: hoop.x - 210, y: hoop.y + 180, vx: jumpVx, vy: -280, r: 19.5 },
    });
    const d = decideShot(early, helpers);
    assert.equal(d.tap, false);
    assert.equal(d.reason, "carry-flight");
  });

  it("ninja recatches a too-low apex instead of riding under the rim", () => {
    const hoop = {
      x: 390 - 28 - 390 * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const apex = world({
      hoop,
      kit: flags({ ninja: true }),
      jumpVx: 390 * 0.76 * 1.2,
      hoopMul: 0.8,
      boardFric: 0.7,
      shotOpen: true,
      ball: { x: hoop.x - 200, y: hoop.y + 150, vx: 280, vy: -40, r: 19.5 },
    });
    const d = decideShot(apex, helpers);
    assert.equal(d.tap, true);
    assert.equal(d.reason, "early-jump");
  });

  it("ninja recatches after the ball has flown in (2nd tap is closer than 237)", () => {
    const hoop = {
      x: 390 - 28 - 390 * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const mid = world({
      hoop,
      kit: flags({ ninja: true }),
      jumpVx: 390 * 0.76 * 1.2,
      hoopMul: 0.8,
      boardFric: 0.7,
      shotOpen: true,
      ball: { x: hoop.x - 120, y: hoop.y + 150, vx: 280, vy: -150, r: 19.5 },
    });
    const d = decideShot(mid, helpers);
    assert.equal(d.tap, true);
    assert.equal(d.reason, "early-jump");
  });

  it("ninja recatches a too-low apex even under the cylinder", () => {
    const hoop = {
      x: 390 - 28 - 390 * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const under = world({
      hoop,
      kit: flags({ ninja: true }),
      jumpVx: 390 * 0.76 * 1.2,
      hoopMul: 0.8,
      boardFric: 0.7,
      shotOpen: true,
      ball: { x: hoop.x - 70, y: hoop.y + 150, vx: 220, vy: -40, r: 19.5 },
    });
    const d = decideShot(under, helpers);
    assert.equal(d.tap, true);
    assert.equal(d.reason, "early-jump");
  });

  it("ninja does not spam early-jump after the launch is already flying", () => {
    const hoop = {
      x: 390 - 28 - 390 * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const rising = world({
      hoop,
      kit: flags({ ninja: true }),
      jumpVx: 390 * 0.76 * 1.2,
      hoopMul: 0.8,
      boardFric: 0.7,
      shotOpen: true,
      ball: { x: hoop.x - 224, y: hoop.y + 20, vx: 280, vy: 80, r: 19.5 },
    });
    const d = decideShot(rising, helpers);
    assert.equal(d.tap, false);
    assert.ok(d.reason === "ride-flight" || d.reason === "let-drop");
  });

  it("ninja carries a just-launched climb instead of recatching at full jumpVy", () => {
    const hoop = {
      x: 390 - 28 - 390 * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const jumpVx = 390 * 0.76 * 1.2;
    const jumpVy = -Math.sqrt(2 * (844 * 3.1 * 0.9) * 844 * 0.185);
    const launched = world({
      hoop,
      kit: flags({ ninja: true }),
      jumpVx,
      jumpVy,
      hoopMul: 0.8,
      boardFric: 0.7,
      shotOpen: true,
      ball: { x: hoop.x - 237, y: hoop.y + 200, vx: jumpVx, vy: jumpVy, r: 19.5 },
    });
    const d = decideShot(launched, helpers);
    assert.equal(d.tap, false);
    assert.equal(d.reason, "carry-flight");
    assert.notEqual(d.reason, "early-jump");
    assert.notEqual(d.reason, "apex-boost");

    const dying = world({
      hoop,
      kit: flags({ ninja: true }),
      jumpVx,
      jumpVy,
      hoopMul: 0.8,
      boardFric: 0.7,
      shotOpen: true,
      combo: 12,
      streak: 12,
      comboClock: 1.5,
      comboCounting: true,
      ball: { x: hoop.x - 237, y: hoop.y + 200, vx: jumpVx, vy: jumpVy, r: 19.5 },
    });
    const holdClimb = decideShot(dying, helpers);
    assert.equal(holdClimb.reason, "carry-flight");
    assert.equal(holdClimb.tap, false);
  });

  it("ninja early-jumps a rising far shot that is not yet flying at the hoop", () => {
    const hoop = {
      x: 390 - 28 - 390 * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const rising = world({
      hoop,
      kit: flags({ ninja: true }),
      jumpVx: 390 * 0.76 * 1.2,
      hoopMul: 0.8,
      boardFric: 0.7,
      shotOpen: true,
      ball: { x: hoop.x - 224, y: hoop.y + 180, vx: 36, vy: -150, r: 19.5 },
    });
    const d = decideShot(rising, helpers);
    assert.equal(d.tap, true);
    assert.ok(d.reason === "early-jump" || d.reason === "apex-boost");
  });

  it("ninja commits wrap past the glass instead of hovering", () => {
    const hoop = {
      x: 390 - 28 - 390 * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const past = world({
      hoop,
      kit: flags({ ninja: true }),
      jumpVx: 390 * 0.76 * 1.2,
      hoopMul: 0.8,
      boardFric: 0.7,
      ball: { x: 430, y: hoop.y + 40, vx: -90, vy: 40, r: 19.5 },
    });
    const d = decideShot(past, helpers);
    assert.equal(d.tap, true);
    assert.equal(d.reason, "wrap-escape");

    const headingOut = decideShot(
      world({
        hoop,
        kit: flags({ ninja: true }),
        jumpVx: 390 * 0.76 * 1.2,
        hoopMul: 0.8,
        boardFric: 0.7,
        ball: { x: 430, y: hoop.y + 40, vx: 90, vy: 40, r: 19.5 },
      }),
      helpers,
    );
    assert.equal(headingOut.tap, true);
    assert.equal(headingOut.reason, "wrap-escape");
  });

  it("ninja rides a live arc instead of combo-pace poking", () => {
    const hoop = {
      x: 390 - 28 - 390 * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const w = world({
      hoop,
      kit: flags({ ninja: true }),
      jumpVx: 390 * 0.76 * 1.2,
      shotOpen: true,
      combo: 8,
      streak: 8,
      comboClock: 1.7,
      comboCounting: true,
      ball: { x: hoop.x - 160, y: hoop.y + 80, vx: 280, vy: 90, r: 19.5 },
    });
    const d = decideShot(w, helpers);
    assert.equal(d.tap, false);
    assert.ok(d.reason === "ride-flight" || d.reason === "let-drop");
    assert.notEqual(d.reason, "shot-clock");
    assert.notEqual(d.reason, "apex-boost");
  });

  it("ninja taps out of a floor stall under the rim instead of freezing", () => {
    const w = 390;
    const h = 844;
    const floorY = h * 0.765;
    const r = 19.5;
    const hoop = {
      x: w - 28 - w * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const stuck = world({
      hoop,
      jumpVx: w * 0.76 * 1.2,
      kit: flags({ ninja: true }),
      shotOpen: true,
      ball: { x: hoop.x - 40, y: floorY - r, vx: 4, vy: 12, r },
    });
    const d = decideShot(stuck, helpers);
    assert.equal(d.policyId, "phys");
    assert.equal(d.tap, true);
    assert.ok(d.reason === "wrap-escape" || d.reason === "reset-boost");

    const opening = world({
      hoop,
      jumpVx: w * 0.76 * 1.2,
      kit: flags({ ninja: true }),
      shotMissed: true,
      hitRim: true,
      ball: { x: hoop.x - 50, y: floorY - r, vx: -180, vy: 40, r },
    });
    const bounce = decideShot(opening, helpers);
    assert.equal(bounce.tap, false);
    assert.ok(
      bounce.reason === "floor-bounce" ||
        bounce.reason === "pop-away" ||
        bounce.reason === "exit-space",
    );
  });

  it("lets a long-jump bounce exit the cylinder instead of wrap-tapping it", () => {
    const w = 390;
    const h = 844;
    const floorY = h * 0.765;
    const r = 19.5;
    const hoop = {
      x: w - 28 - w * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const exit = world({
      hoop,
      jumpVx: w * 0.76 * 1.2,
      hoopMul: 0.8,
      boardFric: 0.7,
      ball: { x: hoop.x - 40, y: floorY - r, vx: -120, vy: 30, r },
    });
    const d = decideShot(exit, helpers);
    assert.equal(d.tap, false);
    assert.ok(d.reason === "exit-space" || d.reason === "pop-away");
  });

  it("ninja keep-airs a live mid-court shot instead of a wide no-tap zone", () => {
    const h = 844;
    const floorY = h * 0.765;
    const r = 19.5;
    const w = world({
      kit: flags({ ninja: true }),
      jumpVx: 390 * 0.76 * 1.2,
      shotOpen: true,
      shotMade: false,
      shotMissed: false,
      combo: 6,
      streak: 6,
      comboCounting: true,
      ball: { x: 200, y: floorY - r - 20, vx: 80, vy: 120, r },
    });
    const d = decideShot(w, helpers);
    assert.equal(d.tap, true);
    assert.equal(d.reason, "keep-air");
  });

  it("uses jumpFwd, not the ninja flag, for under-rim let-drop", () => {
    const hoop = {
      x: 390 - 28 - 390 * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const w = world({
      hoop,
      jumpVx: 390 * 0.76 * 1.2,
      hoopMul: 0.8,
      boardFric: 0.7,
      kit: flags(),
      ball: { x: hoop.x - 55, y: hoop.y + 110, vx: 8, vy: 20, r: 19.5 },
    });
    assert.equal(shotFeel(w).longJump, true);
    const d = decideShot(w, helpers);
    assert.equal(d.policyId, "phys");
    assert.equal(d.tap, false);
    assert.equal(d.reason, "let-drop");
  });

  it("long jumpFwd uses a tighter human-like combo pace", () => {
    const ninja = world({ jumpVx: 390 * 0.76 * 1.2, hoopMul: 0.8, boardFric: 0.7 });
    const heat = world({ jumpVx: 390 * 0.76 * 1.0 });
    const plain = world({ jumpVx: 390 * 0.76 * 0.95 });
    assert.ok(comboPaceLimit(ninja) < comboPaceLimit(plain));
    assert.ok(comboPaceLimit(heat) < comboPaceLimit(plain));
    assert.ok(comboPaceLimit(heat) <= 1.62);
    assert.ok(comboPaceLimit(heat) >= 1.38);
    assert.ok(comboPaceLimit(ninja) <= 1.22);
    assert.ok(comboPaceLimit(ninja) >= 1.05);

    const glass = world({
      jumpVx: 390 * 0.76 * 0.8,
      ballMul: 0,
      kit: flags({ glass: true, wrap: "height" }),
    });
    assert.ok(comboPaceLimit(glass) < comboPaceLimit(plain));
    assert.ok(comboPaceLimit(glass) <= 1.38);
    assert.ok(comboPaceLimit(glass) >= 1.12);
  });

  it("frost does not chain-next into a freeze that kept the same hoop", () => {
    const hoop = { x: 66, y: 330, inner: 28, side: -1 as const, tube: 4.3, moving: false, frostLeft: 3 };
    const w = world({
      hoop,
      kit: flags({ frost: true }),
      shotMade: true,
      shotOpen: true,
      ball: { x: 80, y: 400, vx: 20, vy: 80, r: 19.5 },
    });
    const d = decideShot(w, helpers);
    assert.equal(d.policyId, "frost");
    assert.equal(d.tap, false);
    assert.ok(d.reason === "let-drop" || d.reason === "chain-wait");
  });

  it("holds an inner-rim swirl instead of resetting jumpVx", () => {
    const hoop = {
      x: 390 - 28 - 390 * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const w = world({
      hoop,
      hitRim: true,
      jumpVx: 390 * 0.76 * 1.2,
      hoopMul: 0.8,
      boardFric: 0.7,
      ball: { x: hoop.x - 8, y: hoop.y + 10, vx: 40, vy: 90, r: 19.5 },
    });
    const d = decideShot(w, helpers);
    assert.equal(d.tap, false);
    assert.ok(
      d.reason === "rim-swirl" ||
        d.reason === "flight-scores" ||
        d.reason === "commit-glass" ||
        d.reason === "protect-finish",
    );
    assert.notEqual(d.reason, "let-drop");
  });

  it("tap-climbs from far away so the drop is steep", () => {
    const hoop = {
      x: 390 - 28 - 390 * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const w = world({
      hoop,
      jumpVx: 390 * 0.76,
      ball: { x: 40, y: 520, vx: 90, vy: -220, r: 19.5 },
    });
    const d = decideShot(w, helpers);
    assert.equal(d.tap, true);
    assert.ok(d.reason === "far-climb" || d.reason === "apex-boost" || d.reason === "early-jump");
  });

  it("rubber bounce does not take the longJump ride-flight path", () => {
    const hoop = {
      x: 390 - 28 - 390 * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const w = world({
      hoop,
      kit: flags({ wrap: "height", rScale: 0.5 }),
      ballMul: 2,
      jumpVx: 390 * 0.76 * 0.8,
      shotOpen: true,
      ball: { x: hoop.x - 160, y: hoop.y + 80, vx: 280, vy: 90, r: 9.75 },
    });
    assert.equal(shotFeel(w).longJump, false);
    assert.equal(shotFeel(w).hotBounce, true);
    const d = decideShot(w, helpers);
    assert.notEqual(d.reason, "ride-flight");
  });

  it("anti spams taps once the black hole is open", () => {
    const d = decideShot(
      world({
        kit: flags({ anti: true }),
        holeOn: true,
        hole: { x: 200, y: 300, r: 80 },
        ball: { x: 180, y: 520, vx: 10, vy: 20, r: 19.5 },
      }),
      helpers,
    );
    assert.equal(d.policyId, "anti");
    assert.equal(d.tap, true);
    assert.equal(d.reason, "hole-spam");
  });

  it("anti rides gravity when already heading into the hole", () => {
    const d = decideShot(
      world({
        kit: flags({ anti: true }),
        holeOn: true,
        hole: { x: 200, y: 300, r: 80 },
        ball: { x: 160, y: 420, vx: 90, vy: -160, r: 19.5 },
      }),
      helpers,
    );
    assert.equal(d.policyId, "anti");
    assert.equal(d.tap, false);
    assert.equal(d.reason, "hole-ride");
  });

  it("anti does not over-farm a far orb during a live combo", () => {
    const hoop = { x: 66, y: 330, inner: 28, side: -1 as const, tube: 4.3, moving: false };
    const d = decideShot(
      world({
        hoop,
        kit: flags({ anti: true }),
        combo: 12,
        streak: 12,
        comboClock: 0.4,
        comboCounting: true,
        antiCharge: 20,
        antiMatter: { x: 340, y: 520, r: 16 },
        ball: { x: 90, y: 480, vx: -40, vy: 30, r: 19.5 },
      }),
      helpers,
    );
    assert.notEqual(d.reason, "gather-tap");
    assert.notEqual(d.reason, "gather-closer");
    assert.notEqual(d.reason, "gather-launch");
    assert.notEqual(d.reason, "gather-path");
    assert.notEqual(d.reason, "gather-wait");
  });

  it("anti does not farm a pickup over a dropping make", () => {
    const hoop = { x: 200, y: 300, inner: 28, side: -1 as const, tube: 4, moving: false };
    const d = decideShot(
      world({
        hoop,
        kit: flags({ anti: true }),
        antiMatter: { x: 80, y: 500, r: 16 },
        ball: { x: 200, y: 240, vx: 0, vy: 220, r: 19.5 },
      }),
      helpers,
    );
    assert.notEqual(d.reason, "gather-tap");
    assert.notEqual(d.reason, "gather-closer");
    assert.ok(d.reason === "flight-scores" || d.reason === "score-over-pickup" || d.tap === false);
  });

  it("heat lets a close flying shot drop instead of apex-wrapping", () => {
    const hoop = {
      x: 390 - 28 - 390 * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const w = world({
      hoop,
      kit: flags({ heat: true }),
      jumpVx: 390 * 0.76,
      ball: { x: hoop.x - 70, y: hoop.y + 50, vx: 240, vy: -40, r: 19.5 },
    });
    const d = decideShot(w, helpers);
    assert.notEqual(d.reason, "apex-boost");
    assert.ok(d.reason === "let-drop" || d.reason === "flight-scores" || d.reason === "commit-glass");
  });

  it("does not keep-air a live shot that is already under the hoop", () => {
    const h = 844;
    const floorY = h * 0.765;
    const r = 19.5;
    const hoop = { x: 66, y: 330, inner: 28, side: -1 as const, tube: 4.3, moving: false };
    const w = world({
      hoop,
      shotOpen: true,
      shotMade: false,
      shotMissed: false,
      combo: 8,
      streak: 8,
      comboCounting: true,
      ball: { x: hoop.x + 20, y: floorY - r - 18, vx: -30, vy: 80, r },
    });
    const d = decideShot(w, helpers);
    assert.notEqual(d.reason, "keep-air");
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

  it("taps to keep combo alive when the streak clock is running out", () => {
    const hoop = { x: 66, y: 330, inner: 28, side: -1 as const, tube: 4.3, moving: false };
    const w = world({
      hoop,
      combo: 5,
      streak: 5,
      comboClock: 1.95,
      comboCounting: true,
      timer: 40,
      timerArmed: true,
      ball: { x: 200, y: 500, vx: 20, vy: 40, r: 19.5 },
    });
    const d = decideShot(w, helpers);
    assert.equal(d.tap, true);
    assert.ok(d.reason === "shot-clock" || d.reason === "pace-boost" || d.reason === "apex-boost");
  });

  it("boosts a live shot before it settles so combo does not break on the next tap", () => {
    const h = 844;
    const floorY = h * 0.765;
    const r = 19.5;
    const w = world({
      shotOpen: true,
      shotMade: false,
      shotMissed: false,
      combo: 6,
      streak: 6,
      comboCounting: true,
      ball: { x: 200, y: floorY - r - 20, vx: 80, vy: 120, r },
    });
    const d = decideShot(w, helpers);
    assert.equal(d.tap, true);
    assert.equal(d.reason, "keep-air");
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
    assert.ok(
      d.reason === "let-rattle" ||
        d.reason === "wait-spacing" ||
        d.reason === "flight-scores" ||
        d.reason === "commit-glass" ||
        d.reason === "protect-finish",
    );

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

  it("watchdog taps a sitting floor-bounce under the rim", () => {
    const ai = createAiController();
    registerBallAiPolicy({
      id: "stuck",
      priority: 99,
      match: () => true,
      vote: () => ({ action: "hold", reason: "floor-bounce" }),
    });
    ai.setEnabled(true);
    const h = 844;
    const floorY = h * 0.765;
    const r = 19.5;
    const stuck = world({
      dt: AI_WATCHDOG,
      hoop: { x: 66, y: 330, inner: 28, side: -1, tube: 4.3, moving: false },
      ball: { x: 80, y: floorY - r, vx: 3, vy: 8, r },
    });
    assert.equal(ai.tick(stuck), true);
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

  it("watchdog does not mash a flying let-drop just because combo pace elapsed", () => {
    const ai = createAiController();
    registerBallAiPolicy({
      id: "stuck",
      priority: 99,
      match: () => true,
      vote: () => ({ action: "hold", reason: "let-drop" }),
    });
    ai.setEnabled(true);
    const flying = world({
      dt: AI_WATCHDOG,
      comboCounting: true,
      streak: 8,
      comboClock: 2.5,
      ball: { x: 180, y: 400, vx: 220, vy: -40, r: 19.5 },
      hoop: { x: 320, y: 330, inner: 28, side: 1, tube: 4.3, moving: false },
    });
    assert.equal(ai.tick(flying), false);
    assert.notEqual(ai.lastDecision()?.reason, "watchdog");
  });

  it("forbids an extra tap near the board on long jumpFwd", () => {
    const ai = createAiController();
    registerBallAiPolicy({
      id: "force-cut",
      priority: 99,
      match: () => true,
      vote: (w) =>
        w.shotMade
          ? { action: "tap", reason: "chain-next" }
          : { action: "tap", reason: "bank-cut" },
    });
    ai.setEnabled(true);
    const hoop = {
      x: 390 - 28 - 390 * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const pocket = world({
      dt: 1 / 60,
      kit: flags({ ninja: true }),
      jumpVx: 390 * 0.76 * 1.2,
      hoop,
      ball: { x: hoop.x - 40, y: hoop.y - 20, vx: 160, vy: 90, r: 19.5 },
    });
    assert.equal(ai.tick(pocket), false);
    assert.equal(ai.lastDecision()?.tap, false);
    assert.ok(
      ai.lastDecision()?.reason === "protect-finish" ||
        ai.lastDecision()?.reason === "flight-scores",
    );

    const chain = world({
      dt: 1 / 60,
      kit: flags({ ninja: true }),
      jumpVx: 390 * 0.76 * 1.2,
      hoop,
      shotMade: true,
      ball: { x: hoop.x - 40, y: hoop.y + 40, vx: 40, vy: 80, r: 19.5 },
    });
    ai.reset();
    assert.equal(ai.tick(chain), true);
    assert.equal(ai.lastDecision()?.reason, "chain-next");
  });

  it("does not wrap-tap in the ninja finish pocket (that re-aims jumpVx at the glass)", () => {
    const ai = createAiController();
    registerBallAiPolicy({
      id: "force-wrap",
      priority: 99,
      match: () => true,
      vote: () => ({ action: "tap", reason: "wrap-escape" }),
    });
    ai.setEnabled(true);
    const hoop = {
      x: 390 - 28 - 390 * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const pocket = world({
      dt: 1 / 60,
      kit: flags({ ninja: true }),
      jumpVx: 390 * 0.76 * 1.2,
      hoop,
      ball: { x: hoop.x - 40, y: hoop.y - 20, vx: 160, vy: 90, r: 19.5 },
    });
    assert.equal(ai.tick(pocket), false);
    assert.equal(ai.lastDecision()?.tap, false);
    assert.equal(ai.lastDecision()?.reason, "protect-finish");
  });

  it("classic can still chain a bank-cut near the board (cool is ninja-only)", () => {
    const ai = createAiController();
    registerBallAiPolicy({
      id: "force-cut-classic",
      priority: 99,
      match: () => true,
      vote: () => ({ action: "tap", reason: "bank-cut" }),
    });
    ai.setEnabled(true);
    const hoop = {
      x: 390 - 28 - 390 * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const pocket = world({
      dt: 0.2,
      kit: flags(),
      jumpVx: 390 * 0.76 * 0.95,
      hoop,
      ball: { x: hoop.x - 40, y: hoop.y - 20, vx: 90, vy: 90, r: 19.5 },
    });
    assert.equal(ai.tick(pocket), true);
    assert.equal(ai.lastDecision()?.reason, "bank-cut");
    assert.equal(ai.tick(pocket), true);
    assert.equal(ai.lastDecision()?.reason, "bank-cut");
    assert.notEqual(ai.lastDecision()?.reason, "overshoot-cool");
  });

  it("breaks a repeating ninja wrap-escape cycle (stuck-loop recording)", () => {
    const ai = createAiController();
    registerBallAiPolicy({
      id: "force-wrap-loop",
      priority: 99,
      match: () => true,
      vote: () => ({ action: "tap", reason: "wrap-escape" }),
    });
    ai.setEnabled(true);
    const hoop = {
      x: 28 + 390 * 0.1,
      y: 330,
      inner: 28,
      side: -1 as const,
      tube: 4.3,
      moving: false,
    };
    const under = world({
      dt: 1 / 60,
      kit: flags({ ninja: true }),
      jumpVx: -(390 * 0.76 * 1.2),
      hoopMul: 0.8,
      boardFric: 0.7,
      hoop,
      combo: 4,
      streak: 4,
      comboClock: 1.1,
      comboCounting: true,
      ball: { x: hoop.x + 58, y: hoop.y + 110, vx: -40, vy: 20, r: 19.5 },
    });
    assert.equal(ai.tick(under), true);
    assert.equal(ai.lastDecision()?.reason, "wrap-escape");
    // Recording: second tap ~50ms later, same pose, same jump vector
    // ≈ (-328, -671) after a few gravity frames.
    const again = world({
      ...under,
      dt: 0.05,
      ball: { x: hoop.x + 55, y: hoop.y + 108, vx: -328, vy: -671, r: 19.5 },
    });
    assert.equal(ai.tick(again), false);
    assert.equal(ai.lastDecision()?.tap, false);
    assert.equal(ai.lastDecision()?.reason, "wrap-loop");

    // Fruitless ground wrap, then the same under-hoop tap.
    const afterWrap = world({
      ...under,
      dt: 0.02,
      wraps: 1,
      ball: { x: hoop.x + 58, y: hoop.y + 110, vx: -40, vy: 20, r: 19.5 },
    });
    assert.equal(ai.tick(afterWrap), false);
    assert.equal(ai.lastDecision()?.reason, "wrap-loop");

    // Cool expired and this is a new attempt at the same parked miss.
    const afterCool = world({
      ...under,
      dt: 1.7,
      wraps: 1,
      ball: { x: hoop.x + 58, y: hoop.y + 110, vx: 8, vy: 12, r: 19.5 },
    });
    assert.equal(ai.tick(afterCool), true);
    assert.equal(ai.lastDecision()?.reason, "wrap-escape");
  });

  it("breaks the right-hoop empty wrap cycle (stuck-1)", () => {
    // tap (-72,487) → (15,378) → wrap at ~(432,379), identical (328,-671).
    const ai = createAiController();
    registerBallAiPolicy({
      id: "force-stuck-1",
      priority: 99,
      match: () => true,
      vote: () => ({ action: "tap", reason: "approach-enter" }),
    });
    ai.setEnabled(true);
    const hoop = {
      x: 390 - 28 - 390 * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const ninja = {
      dt: 1 / 60,
      kit: flags({ ninja: true }),
      jumpVx: 390 * 0.76 * 1.2,
      hoopMul: 0.8,
      boardFric: 0.7,
      hoop,
    };
    const first = world({
      ...ninja,
      onApproachSide: true,
      ballHidden: true,
      ball: { x: -72, y: 487, vx: 44, vy: 0, r: 19.5 },
    });
    assert.equal(ai.tick(first), false);
    assert.equal(ai.lastDecision()?.reason, "wrap-loop");
    const second = world({
      ...ninja,
      dt: 0.05,
      onApproachSide: false,
      ballHidden: false,
      ball: { x: 15, y: 378, vx: 328, vy: -671, r: 19.5 },
    });
    assert.equal(ai.tick(second), false);
    assert.equal(ai.lastDecision()?.reason, "wrap-loop");

    const back = world({
      ...ninja,
      dt: 0.02,
      wraps: 1,
      onApproachSide: true,
      ballHidden: true,
      ball: { x: -72, y: 487, vx: 44, vy: 0, r: 19.5 },
    });
    assert.equal(ai.tick(back), false);
    assert.equal(ai.lastDecision()?.reason, "wrap-loop");
  });

  it("breaks full-jump spam after bank/rim without a score (stuck-2)", () => {
    const ai = createAiController();
    registerBallAiPolicy({
      id: "force-stuck-2",
      priority: 99,
      match: () => true,
      vote: () => ({ action: "tap", reason: "early-jump" }),
    });
    ai.setEnabled(true);
    const hoop = {
      x: 390 - 28 - 390 * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const climb = world({
      dt: 1 / 60,
      kit: flags({ ninja: true }),
      jumpVx: 390 * 0.76 * 1.2,
      hoop,
      ball: { x: hoop.x - 200, y: hoop.y + 80, vx: 40, vy: -20, r: 19.5 },
    });
    assert.equal(ai.tick(climb), true);
    const again = world({
      ...climb,
      dt: 0.05,
      ball: { x: hoop.x - 160, y: hoop.y + 40, vx: 328, vy: -671, r: 19.5 },
    });
    assert.equal(ai.tick(again), false);
    assert.equal(ai.lastDecision()?.reason, "wrap-loop");

    const afterRim = world({
      ...climb,
      dt: 0.2,
      hitRim: true,
      ball: { x: hoop.x - 90, y: hoop.y + 20, vx: 120, vy: 40, r: 19.5 },
    });
    assert.equal(ai.tick(afterRim), false);
    assert.equal(ai.lastDecision()?.reason, "wrap-loop");
  });

  it("still launches from the demo band after a fruitless wrap", () => {
    const ai = createAiController();
    ai.setEnabled(true);
    const hoop = {
      x: 390 - 28 - 390 * 0.1,
      y: 330,
      inner: 28,
      side: 1 as const,
      tube: 4.3,
      moving: false,
    };
    const floorY = 844 * 0.765;
    const r = 19.5;
    const seed = world({
      dt: 1 / 60,
      kit: flags({ ninja: true }),
      jumpVx: 390 * 0.76 * 1.2,
      hoop,
      wraps: 0,
      ball: { x: hoop.x - 50, y: floorY - r, vx: 8, vy: 10, r },
    });
    ai.tick(seed);
    const afterWrap = world({
      dt: 0.2,
      kit: flags({ ninja: true }),
      jumpVx: 390 * 0.76 * 1.2,
      hoop,
      wraps: 1,
      ball: { x: hoop.x - 224, y: floorY - r, vx: 8, vy: 10, r },
    });
    assert.equal(ai.tick(afterWrap), true, ai.lastDecision()?.reason);
    assert.equal(ai.lastDecision()?.reason, "early-jump");
    assert.notEqual(ai.lastDecision()?.reason, "wrap-loop");
  });
});
