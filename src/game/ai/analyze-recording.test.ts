import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { summarizePlayRecording } from "./analyze-recording.ts";
import type { PlayRecording } from "../record/types.ts";

function rec(over: Partial<PlayRecording> = {}): PlayRecording {
  return {
    version: 1,
    recordedAt: "2026-09-14T00:00:00.000Z",
    mode: "classic",
    ballId: "ninja",
    world: { w: 390, h: 844, floorY: 760 },
    sampleHz: 30,
    step: 1 / 60,
    duration: 4,
    frames: 240,
    score: 10,
    combo: 3,
    endReason: "over",
    samples: [
      { t: 0.5, f: 30, x: 80, y: 200, vx: 200, vy: -100, hs: 1, hx: 320, hy: 326, hi: 28, ht: 4, hm: false, bx: 330, by: 170, bw: 14, bh: 170, s: 0, c: 0 },
      { t: 1.2, f: 72, x: 300, y: 190, vx: 40, vy: 80, hs: 1, hx: 320, hy: 326, hi: 28, ht: 4, hm: false, bx: 330, by: 170, bw: 14, bh: 170, s: 0, c: 1 },
    ],
    taps: [
      { t: 0.5, f: 30, src: "player", x: 80, y: 500, vx: 300, vy: -400 },
      { t: 1.0, f: 60, src: "player", x: 200, y: 300, vx: 300, vy: -200 },
    ],
    events: [
      { t: 0, f: 0, kind: "start" },
      { t: 1.2, f: 72, kind: "bank", x: 300, y: 190 },
      { t: 1.4, f: 84, kind: "score", finish: "bank", hs: 1, score: 4, combo: 1 },
      { t: 2.0, f: 120, kind: "wrap", wrap: "ground" },
      { t: 3.1, f: 186, kind: "score", finish: "rim", hs: -1, score: 10, combo: 2 },
    ],
    ...over,
  };
}

describe("recording analyzer", () => {
  it("reports finish mix, first-tap dx, wrap→score, and upper-board ratio", () => {
    const s = summarizePlayRecording(rec());
    assert.equal(s.finishes.bank, 1);
    assert.equal(s.finishes.rim, 1);
    assert.ok(Math.abs(s.finishShare.bank - 0.5) < 1e-9);
    assert.equal(s.wraps, 1);
    assert.equal(s.wrapsScoredWithin, 1);
    assert.ok(s.medianMakeGap != null && s.medianMakeGap > 1.5 && s.medianMakeGap < 1.8);
    assert.ok(s.medianFirstTapDx != null && s.medianFirstTapDx > 220);
    assert.equal(s.tapsInWindowBeforeMake[0], 2);
    assert.ok(s.medianBoardYRatio != null && s.medianBoardYRatio > 0.8);
    assert.equal(s.playerTaps, 2);
  });
});
