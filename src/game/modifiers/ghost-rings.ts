/** Ghost rings: ephemeral naked rims — no board, timed despawn. */

import type { Hoop } from "../types";
import type { ModifierHost, StageModifier } from "../modifiers";

type Phase = "wait" | "in" | "hold" | "out";

const IN_DUR = 0.35;
const OUT_DUR = 0.45;
const GAP_LO = 0.55;
const GAP_HI = 1.15;
const LIFE_LO = 2.5;
const LIFE_HI = 4.0;

export type GhostRingsMod = StageModifier & { readonly _ghost: true };

export function createGhostRings(): GhostRingsMod {
  let phase: Phase = "wait";
  let t = 0;
  let life = 3.2;
  let gap = 0.7;
  /** After a make, prefer the opposite side once. */
  let preferSide: -1 | 1 | null = null;

  function pickSide(host: ModifierHost): -1 | 1 {
    if (preferSide != null) {
      const s = preferSide;
      preferSide = null;
      return s;
    }
    // Prefer the side away from the ball so a fresh ring does not spawn on top of it.
    const ball = host.getBall();
    const mid = host.world.w * 0.5;
    if (Math.abs(ball.x - mid) > host.world.w * 0.12) {
      return ball.x < mid ? 1 : -1;
    }
    return Math.random() < 0.5 ? -1 : 1;
  }

  function place(host: ModifierHost) {
    host.clearOther();
    const side = pickSide(host);
    const h = host.makeGhostHoop(side);
    host.applyHoopScale(h);
    h.noBoard = true;
    h.moving = false;
    h.moveAmp = 0;
    h.active = true;
    h.couple = true;
    h.hold = 0;
    h.fxAlpha = 0;
    h.fxScale = 0.72;
    h.scoreable = false;
    // Keep Y clear of the ball so rim tubes do not instantly pinball it.
    const ball = host.getBall();
    const clear = h.inner + ball.r * 2.4;
    if (Math.abs(h.y - ball.y) < clear) {
      const { minY, maxY } = host.hoopYRange();
      const up = ball.y - clear;
      const down = ball.y + clear;
      if (up >= minY + 4) h.y = Math.max(minY, Math.min(up, maxY));
      else if (down <= maxY - 4) h.y = Math.max(minY, Math.min(down, maxY));
      else h.y = minY + (maxY - minY) * 0.35;
      h.baseY = h.y;
    }
    host.setHoop(h);
  }

  function armIn(host: ModifierHost) {
    life = LIFE_LO + Math.random() * (LIFE_HI - LIFE_LO);
    place(host);
    phase = "in";
    t = 0;
  }

  function paint(h: Hoop, alpha: number, scale: number, scoreable: boolean) {
    h.noBoard = true;
    h.moving = false;
    h.fxAlpha = alpha;
    h.fxScale = scale;
    h.scoreable = scoreable;
    h.active = scoreable || alpha > 0.05;
  }

  const mod: GhostRingsMod = {
    id: "ghost-rings",
    _ghost: true,
    begin(host) {
      phase = "wait";
      t = 0;
      gap = 0.15;
      preferSide = null;
      host.clearOther();
      armIn(host);
    },
    update(dt, host) {
      const h = host.getHoop();
      // Always keep board/brace flags off even if something else touches the hoop.
      h.noBoard = true;
      h.moving = false;
      t += dt;
      if (phase === "wait") {
        paint(h, 0, 0.6, false);
        h.active = false;
        // Park far away while waiting so leftover rim/net cannot shove the ball.
        h.x = h.side < 0 ? -host.world.w : host.world.w * 2;
        h.targetX = h.x;
        if (t >= gap) armIn(host);
        return;
      }
      if (phase === "in") {
        const u = Math.min(1, t / IN_DUR);
        const e = 1 - (1 - u) * (1 - u);
        paint(h, e, 0.72 + 0.28 * e, u > 0.55);
        if (u >= 1) {
          phase = "hold";
          t = 0;
          paint(h, 1, 1, true);
        }
        return;
      }
      if (phase === "hold") {
        paint(h, 1, 1, true);
        const holdBudget = Math.max(0.4, life - IN_DUR - OUT_DUR);
        if (t >= holdBudget) {
          phase = "out";
          t = 0;
        }
        return;
      }
      // out — stop scoring early so a shrinking visual is not a full-size invisible rim.
      const u = Math.min(1, t / OUT_DUR);
      const e = u * u;
      paint(h, 1 - e, 1 - 0.45 * e, false);
      if (u >= 1) {
        phase = "wait";
        t = 0;
        gap = GAP_LO + Math.random() * (GAP_HI - GAP_LO);
        paint(h, 0, 0.55, false);
        h.active = false;
      }
    },
    skipBoard() {
      return true;
    },
    skipBrace() {
      return true;
    },
    canScore(h) {
      return h.scoreable === true;
    },
    onScored(host) {
      const h = host.getHoop();
      host.clearOther();
      preferSide = h.side < 0 ? 1 : -1;
      phase = "out";
      t = OUT_DUR * 0.55;
      paint(h, 0.55, 0.85, false);
      gap = 0.35 + Math.random() * 0.25;
      return true;
    },
    end() {
      phase = "wait";
      t = 0;
      preferSide = null;
    },
  };
  return mod;
}
