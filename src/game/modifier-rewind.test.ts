import test from "node:test";
import assert from "node:assert/strict";
import { createGhostRings } from "./modifiers/ghost-rings.ts";
import { createGraveHands } from "./modifiers/grave-hands.ts";
import type { ModifierHost } from "./modifiers";
import type { Hoop } from "./types";

test("ghost ring rewind restores lifecycle and preferred spawn side after a basket", () => {
  const mod = createGhostRings(), before = mod.rewindState!();
  const hoop = { side: -1 } as Hoop;
  const host = { getHoop: () => hoop, clearOther: () => {}, world: { w: 390 } } as unknown as ModifierHost;
  mod.onScored!(host);
  assert.notDeepEqual(mod.rewindState!(), before);
  mod.restoreRewindState!(before);
  assert.deepEqual(mod.rewindState!(), before);
  mod.update(0.1, host);
  assert.equal(hoop.active, false);
});
test("grave hand rewind restores grab immunity and particle state without aliasing", () => {
  const mod = createGraveHands();
  const before = mod.rewindState!() as Record<string, unknown>;
  mod.restoreRewindState!({ ...before, act: "grab", t: 0.12, bits: [{ x: 1, y: 2, vx: 0, vy: 0, life: 1, max: 1, s: 2 }] });
  assert.equal(mod.holdsBall!(), true);
  const saved = mod.rewindState!() as { bits: { x: number }[] };
  saved.bits[0]!.x = 999;
  assert.equal((mod.rewindState!() as typeof saved).bits[0]!.x, 1);
  mod.restoreRewindState!(before);
  assert.equal(mod.holdsBall!(), false);
  assert.deepEqual(mod.rewindState!(), before);
});
