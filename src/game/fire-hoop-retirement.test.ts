import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import type { Hoop } from "./types";
import { beginHoopRetirement, stepHoopRetirement, hoopRetirementDone, HOOP_HOLD } from "./hoop-retirement.ts";

// Exercise the actual post-nextHoop heat branch, not a duplicated implementation.
const engine = readFileSync(new URL("./engine.ts", import.meta.url), "utf8");
const start = engine.indexOf("if (!isFrost() && other && stage >= 2)");
const end = engine.indexOf("\n      }\n    }\n    syncNinjaGhosts();", start);
assert.ok(start >= 0 && end > start, "locate the scoring heat branch");
const applyHeat = new Function("stage", "other", "isFrost", "audio", "gfx",
  `let burnFlash = 0; ${stripTypeScriptTypes(engine.slice(start, end))}; return burnFlash;`,
) as (stage: number, other: Hoop, isFrost: () => boolean, audio: { burn: () => void }, gfx: { flash: boolean }) => number;
assert.match(engine.slice(engine.indexOf("function nextHoop("), engine.indexOf("function igniteStand(")),
  /if \(scored\.couple\) scored\.hold = HOOP_HOLD;/, "engine starts the same ordinary retirement hold");

const stand = (side: -1 | 1) => ({
  side, x: side < 0 ? 80 : 320, targetX: side < 0 ? 80 : 320,
  hold: 0, couple: true, sear: 0, burning: false, char: 0,
}) as Hoop;

test("all heat stages retain ordinary 0.72-second hold and identical slide/removal", () => {
  assert.equal(HOOP_HOLD, 0.72);
  for (const stage of [0, 1, 2, 3, 4]) for (const side of [-1, 1] as const) {
    const normal = stand(side), hot = stand(side);
    beginHoopRetirement(normal);
    beginHoopRetirement(hot);
    applyHeat(stage, hot, () => false, { burn() {} }, { flash: true });
    assert.equal(hot.hold, HOOP_HOLD, `stage=${stage}`);
    for (const dt of [0.3, 0.42, 0.04, 0.2, 0.8]) {
      assert.equal(stepHoopRetirement(hot, 400, dt), stepHoopRetirement(normal, 400, dt));
      assert.equal(hot.x, normal.x);
      assert.equal(hot.couple, normal.couple);
      assert.equal(hoopRetirementDone(hot, 400), hoopRetirementDone(normal, 400));
    }
    assert.equal(hoopRetirementDone(hot, 400), true);
  }
});

test("smoke/ignite/blaze effects remain enabled independently of the hold", () => {
  for (const stage of [0, 1, 2, 3, 4]) for (const flash of [false, true]) {
    const h = stand(1);
    beginHoopRetirement(h);
    let burns = 0;
    const burnFlash = applyHeat(stage, h, () => false, { burn() { burns++; } }, { flash });
    assert.equal(h.sear, stage >= 2 ? stage - 1 : 0);
    assert.equal(h.burning, stage === 4);
    assert.equal(burns, stage === 4 ? 1 : 0);
    assert.equal(burnFlash, stage === 4 && flash ? 0.16 : 0);
    assert.equal(h.hold, HOOP_HOLD);
  }
  // Existing frost exclusion and any independent gameplay hold remain untouched.
  const frozen = stand(1);
  frozen.hold = 3;
  applyHeat(4, frozen, () => true, { burn() { assert.fail("frost must not burn"); } }, { flash: true });
  assert.equal(frozen.hold, 3);
  assert.equal(frozen.burning, false);
  const independentlyHeld = stand(1);
  independentlyHeld.hold = 2;
  applyHeat(4, independentlyHeld, () => false, { burn() {} }, { flash: true });
  assert.equal(independentlyHeld.hold, 2);
});
