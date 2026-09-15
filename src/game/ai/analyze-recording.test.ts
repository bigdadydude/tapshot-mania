import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseRecordingJson, parseRecordingSessions, summarizePlayRecording } from "./analyze-recording.ts";
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

  it("reads a v2 pack as its last session and lists every game", () => {
    const first = rec({ score: 4, combo: 1 });
    const second = rec({ score: 18, combo: 5, ballId: "anti" });
    const pack = { version: 2 as const, recordedAt: first.recordedAt, sessions: [first, second] };
    assert.equal(parseRecordingSessions(pack).length, 2);
    assert.equal(parseRecordingJson(pack).score, 18);
    assert.equal(parseRecordingJson(first).score, 4);
  });

  it("counts antimatter orb samples and hole events", () => {
    const s = summarizePlayRecording(
      rec({
        ballId: "anti",
        samples: [
          {
            t: 0.5,
            f: 30,
            x: 80,
            y: 400,
            vx: 10,
            vy: -20,
            hs: -1,
            hx: 48,
            hy: 280,
            hi: 28,
            ht: 8,
            hm: false,
            bx: 8,
            by: 120,
            bw: 14,
            bh: 200,
            s: 0,
            c: 0,
            am: { id: 1, x: 140, y: 400, r: 16, pct: 12 },
          },
        ],
        events: [
          { t: 0, f: 0, kind: "start" },
          { t: 0.4, f: 24, kind: "anti-spawn", antiId: 1, pct: 12, x: 140, y: 400 },
          { t: 0.8, f: 48, kind: "anti-collect", antiId: 1, pct: 12, charge: 12 },
          { t: 0.9, f: 54, kind: "hole-open", hole: { x: 195, y: 330, r: 36, left: 8 } },
          { t: 8.9, f: 534, kind: "hole-close" },
        ],
      }),
    );
    assert.equal(s.antiSpawns, 1);
    assert.equal(s.antiCollects, 1);
    assert.equal(s.holeOpens, 1);
    assert.equal(s.holeCloses, 1);
    assert.equal(s.antiOrbSamples, 1);
    assert.deepEqual(s.antiIds, [1]);
  });

  it("counts orbs[] when am is missing (pack alias)", () => {
    const s = summarizePlayRecording(
      rec({
        ballId: "anti",
        samples: [
          {
            t: 0.5,
            f: 30,
            x: 80,
            y: 400,
            vx: 10,
            vy: -20,
            hs: -1,
            hx: 48,
            hy: 280,
            hi: 28,
            ht: 8,
            hm: false,
            bx: 8,
            by: 120,
            bw: 14,
            bh: 200,
            s: 0,
            c: 0,
            orbs: [{ id: 7, x: 140, y: 400, r: 16, pct: 18 }],
          },
        ],
        events: [
          { t: 0, f: 0, kind: "start" },
          { t: 0.4, f: 24, kind: "anti-spawn", antiId: 7, pct: 18, x: 140, y: 400 },
        ],
      }),
    );
    assert.equal(s.antiOrbSamples, 1);
    assert.deepEqual(s.antiIds, [7]);
  });
});
