import test from "node:test";
import assert from "node:assert/strict";
import { HACKER, hackerRetractChance, hackerPinnedCount, hackerBlockFailure, hackerIntercept, hackerSpaceClear, settleHackerHoops } from "./hacker.ts";
import type { Hoop } from "./types";

const stand = (state: "normal" | "pinned" | "retiring", age = 0) => ({ hacker: { state, pinned: state !== "normal", age, scored: false } }) as Hoop;

test("combo count includes normal and half-retracted stands, without an extra base tick", () => {
  const hoops = [stand("pinned"), stand("retiring"), stand("normal")];
  assert.equal(settleHackerHoops(hoops, hoops[2], () => 0.99), 3);
  assert.equal(hackerPinnedCount(hoops), 2);
  hoops.splice(1, 1); // Fully gone, not merely marked retiring.
  assert.equal(settleHackerHoops(hoops, hoops[0], () => 0.99), 2);
});

test("pin is rolled once per real make, then each pinned stand gets one retirement roll", () => {
  const hoops = [stand("pinned"), stand("normal")];
  const draws = [0.5, 0.9, 0.9];
  assert.equal(settleHackerHoops(hoops, hoops[1], () => draws.shift()!), 2);
  assert.equal(draws.length, 0);
  assert.equal(hoops[1].hacker!.state, "pinned");
  assert.equal(hackerPinnedCount(hoops), 2);
});

test("freshly pinned stand can retire, remains counted, and retirement never rerolls", () => {
  const h = stand("normal");
  let calls = 0;
  assert.equal(settleHackerHoops([h], h, () => { calls++; return 0; }), 1);
  assert.equal(calls, 2);
  assert.equal(h.hacker!.state, "retiring");
  assert.equal(hackerPinnedCount([h]), 1);
  settleHackerHoops([h], h, () => { throw Error("Retiring stand rerolled"); });
});

test("retirement depends on live pinned count and individual age, with a cap", () => {
  assert.equal(hackerRetractChance(1, 0), 0.1);
  assert.equal(hackerRetractChance(4, 0), 0.25);
  assert.equal(hackerRetractChance(4, 20), 0.35);
  assert.equal(hackerRetractChance(4, 10000), HACKER.retractCap);
  const hoops = [stand("pinned", 0), stand("pinned", 20)];
  settleHackerHoops(hoops, hoops[0], () => 0.2);
  assert.equal(hoops[0].hacker!.state, "pinned");
  assert.equal(hoops[1].hacker!.state, "retiring");
});

test("four stands are four ticks, even when all retire in the same settlement", () => {
  const hoops = Array.from({ length: 4 }, () => stand("pinned"));
  assert.equal(settleHackerHoops(hoops, hoops[0], () => 0), 4);
  assert.equal(hackerPinnedCount(hoops), 4);
});

test("failed interception is not retried every frame; a new awakening gets a fresh attempt", () => {
  const target = {};
  assert.equal(hackerIntercept(target, 1, 4, () => 0.2), false);
  assert.equal(hackerIntercept(target, 1, 0, () => { throw Error("rerolled"); }), false);
  assert.equal(hackerIntercept(target, 2, 4, () => 0.8), true);
  for (let i = 1; i <= 4; i++) assert.ok(hackerBlockFailure(i) > hackerBlockFailure(i - 1));
});

test("spawn rejects overlap and insufficient spacing, accepts separate stands", () => {
  const existing = [{ left: 0, right: 120, top: 200, bottom: 330 }];
  assert.equal(hackerSpaceClear({ left: 40, right: 150, top: 300, bottom: 430 }, existing), false);
  assert.equal(hackerSpaceClear({ left: 0, right: 120, top: 340, bottom: 450 }, existing), false);
  assert.equal(hackerSpaceClear({ left: 200, right: 320, top: 200, bottom: 330 }, existing), true);
});
