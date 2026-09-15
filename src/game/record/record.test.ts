import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPlayRecorder, emptyMeta, playPackFilename, playRecordingFilename } from "./recorder.ts";
import type { PlayFrameInput, PlayRecording, PlayRecordingPack } from "./types.ts";

function frame(over: Partial<PlayFrameInput> = {}): PlayFrameInput {
  return {
    x: 80,
    y: 400,
    vx: 120,
    vy: -380,
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
    score: 0,
    combo: 0,
    hitRim: false,
    hitBoard: false,
    anti: null,
    antiCharge: 0,
    hole: null,
    ...over,
  };
}

describe("play recorder", () => {
  it("is a no-op when OFF — tick / tap / event allocate nothing", () => {
    const downloaded: PlayRecordingPack[] = [];
    const rec = createPlayRecorder({
      download: (file) => downloaded.push(file),
    });
    assert.equal(rec.enabled(), false);
    rec.tick(frame());
    rec.noteTap("player", { x: 1, y: 2, vx: 3, vy: 4 });
    rec.noteEvent("score", { finish: "swish" });
    rec.beginRun(emptyMeta());
    rec.tick(frame({ x: 200 }));
    assert.equal(rec.live(), false);
    assert.equal(rec.exportLive(), null);
    assert.equal(rec.lastFile(), null);
    assert.equal(downloaded.length, 0);
  });

  it("samples ~30Hz and keeps every tap", () => {
    const rec = createPlayRecorder({ download: () => {} });
    rec.setEnabled(true);
    rec.beginRun(emptyMeta());
    for (let i = 0; i < 60; i++) {
      rec.tick(frame({ x: 80 + i * 4, vx: 120 + i }));
      if (i === 10 || i === 11) {
        rec.noteTap("player", { x: 80 + i * 4, y: 400, vx: 200, vy: -400 });
      }
    }
    const file = rec.exportLive("stop");
    assert.ok(file);
    assert.equal(file.sampleHz, 30);
    assert.equal(file.frames, 60);
    // frame 1 plus every 2nd frame through 60 → 31 samples
    assert.equal(file.samples.length, 31);
    assert.equal(file.taps.length, 2);
    assert.equal(file.taps[0]?.src, "player");
    assert.ok(file.samples.some((s) => s.x === 80));
    assert.ok(file.samples.at(-1)!.x > 80);
    assert.equal(file.events[0]?.kind, "start");
  });

  it("records score + hoop switch and archives on endRun without downloading", () => {
    const downloaded: PlayRecordingPack[] = [];
    const rec = createPlayRecorder({
      download: (file) => downloaded.push(file),
      nowIso: () => "2026-09-14T22:40:00.000Z",
    });
    rec.setEnabled(true);
    rec.beginRun(emptyMeta());
    for (let i = 0; i < 8; i++) rec.tick(frame({ x: 60, hs: -1 }));
    rec.noteEvent("score", { finish: "swish", hs: -1, score: 6, combo: 2, x: 48, y: 280 });
    rec.tick(frame({ x: 320, hs: 1, hx: 340, score: 6, combo: 2 }));
    const file = rec.endRun("over", { score: 6, combo: 2 });
    assert.ok(file);
    assert.equal(downloaded.length, 0);
    assert.equal(file.endReason, "over");
    assert.equal(file.score, 6);
    assert.equal(file.combo, 2);
    const kinds = file.events.map((e) => e.kind);
    assert.deepEqual(kinds, ["start", "score", "hoop"]);
    const before = file.samples.find((s) => s.hs === -1);
    const after = file.samples.find((s) => s.hs === 1);
    assert.ok(before);
    assert.ok(after);
    assert.ok(after.x > before.x);
    assert.equal(rec.sessionCount(), 1);
    assert.equal(rec.downloadLast(), true);
    assert.equal(downloaded.length, 1);
    assert.equal(downloaded[0]?.version, 2);
    assert.equal(downloaded[0]?.sessions.length, 1);
    assert.match(
      playRecordingFilename(file),
      /^tapshot-classic-plain-6-2026-09-14T22-40-00-000Z\.json$/,
    );
    assert.match(
      playPackFilename(downloaded[0]!),
      /^tapshot-pack-1g-classic-plain-2026-09-14T22-40-00-000Z\.json$/,
    );
  });

  it("records rim/bank on rising edge and keeps miss/wrap events", () => {
    const rec = createPlayRecorder({ download: () => {} });
    rec.setEnabled(true);
    rec.beginRun(emptyMeta());
    rec.tick(frame({ hitRim: true, x: 50, y: 280 }));
    rec.tick(frame({ hitRim: true, x: 51, y: 281 }));
    rec.tick(frame({ hitRim: true, hitBoard: true, x: 20, y: 200 }));
    rec.noteEvent("miss", { x: 80, y: 700 });
    rec.noteEvent("wrap", { wrap: "ground" });
    const file = rec.exportLive();
    const kinds = file!.events.map((e) => e.kind);
    assert.deepEqual(kinds, ["start", "rim", "bank", "miss", "wrap"]);
  });

  it("disable after a run leaves no live cost", () => {
    const downloaded: PlayRecordingPack[] = [];
    const rec = createPlayRecorder({ download: (file) => downloaded.push(file) });
    rec.setEnabled(true);
    rec.beginRun(emptyMeta());
    rec.tick(frame());
    rec.noteTap("ai", { x: 10, y: 20, vx: 1, vy: -2 });
    rec.endRun("stop", { score: 0, combo: 0 });
    rec.downloadLast();
    rec.setEnabled(false);
    rec.clearArchived();
    rec.tick(frame({ x: 999 }));
    rec.noteTap("player", { x: 0, y: 0, vx: 0, vy: 0 });
    rec.noteEvent("score");
    rec.beginRun(emptyMeta());
    assert.equal(rec.enabled(), false);
    assert.equal(rec.live(), false);
    assert.equal(downloaded.length, 1);
    assert.equal(downloaded[0]?.sessions[0]?.taps[0]?.src, "ai");
  });

  it("keeps multiple games in one pack while recording stays on", () => {
    const downloaded: PlayRecordingPack[] = [];
    const rec = createPlayRecorder({
      download: (file) => downloaded.push(file),
      nowIso: () => "2026-09-15T00:00:00.000Z",
    });
    rec.setEnabled(true);
    rec.beginRun(emptyMeta({ ballId: "plain" }));
    rec.tick(frame({ x: 10, score: 4 }));
    rec.endRun("over", { score: 4, combo: 1 });
    rec.beginRun(emptyMeta({ ballId: "anti" }));
    rec.tick(frame({ x: 80, score: 12 }));
    rec.endRun("over", { score: 12, combo: 3 });
    assert.equal(downloaded.length, 0);
    assert.equal(rec.sessionCount(), 2);
    const pack = rec.exportPack();
    assert.ok(pack);
    assert.equal(pack.version, 2);
    assert.equal(pack.sessions.length, 2);
    assert.equal(pack.sessions[0]?.ballId, "plain");
    assert.equal(pack.sessions[0]?.score, 4);
    assert.equal(pack.sessions[1]?.ballId, "anti");
    assert.equal(pack.sessions[1]?.score, 12);
    rec.downloadLast();
    rec.setEnabled(false);
    rec.clearArchived();
    assert.equal(downloaded.length, 1);
    assert.equal(downloaded[0]?.sessions.length, 2);
  });

  it("records antimatter orbs, collect, and black-hole geometry", () => {
    const rec = createPlayRecorder({ download: () => {} });
    rec.setEnabled(true);
    rec.beginRun(emptyMeta({ ballId: "anti" }));
    rec.noteEvent("anti-spawn", { antiId: 1, pct: 12, charge: 0, x: 140, y: 400 });
    rec.tick(frame({
      x: 100,
      anti: { id: 1, x: 140, y: 400, r: 16, pct: 12 },
      antiCharge: 0,
    }));
    rec.noteEvent("anti-collect", { antiId: 1, pct: 12, charge: 12, x: 140, y: 400 });
    rec.tick(frame({ x: 110, antiCharge: 12 }));
    rec.noteEvent("hole-open", {
      x: 195,
      y: 330,
      hole: { x: 195, y: 330, r: 36, left: 8 },
      charge: 0,
    });
    rec.tick(frame({
      x: 180,
      hole: { x: 195, y: 330, r: 36, left: 7.5 },
      antiCharge: 0,
    }));
    rec.tick(frame({
      x: 182,
      hole: { x: 195, y: 330, r: 36, left: 7.4 },
      antiCharge: 0,
    }));
    rec.noteEvent("hole-close", { x: 195, y: 330, hole: { x: 195, y: 330, r: 36, left: 0 } });
    const file = rec.exportLive();
    assert.ok(file);
    const kinds = file.events.map((e) => e.kind);
    assert.deepEqual(kinds, ["start", "anti-spawn", "anti-collect", "hole-open", "hole-close"]);
    const withOrb = file.samples.find((s) => s.am);
    assert.ok(withOrb?.am);
    assert.equal(withOrb.am.id, 1);
    assert.equal(withOrb.am.x, 140);
    assert.equal(withOrb.am.pct, 12);
    assert.ok(withOrb.orbs);
    assert.equal(withOrb.orbs[0]?.id, 1);
    const withHole = file.samples.find((s) => s.ho);
    assert.ok(withHole?.ho);
    assert.equal(withHole.ho.x, 195);
    assert.ok(withHole.ho.left > 7);
    const collect = file.events.find((e) => e.kind === "anti-collect");
    assert.equal(collect?.charge, 12);
    assert.equal(collect?.antiId, 1);
  });
});
