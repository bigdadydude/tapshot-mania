import assert from "node:assert/strict";
import test from "node:test";
import { ROGUE_CATALOG_BY_ID } from "./rogue-catalog.ts";
import { miniMeStreakPerStack, streakAfterMake } from "./make-streak.ts";

const comboBoost = ROGUE_CATALOG_BY_ID.comboboost?.comboBoostAdd ?? 3;

test("a clutch make increments an active streak by 1", () => {
  const before = 6;
  // registerScore calls this for clutch and non-clutch makes alike.
  assert.equal(
    streakAfterMake({
      streak: before,
      comboCounting: true,
      bunshinGhost: false,
      comboBoost: null,
    }),
    before + 1,
  );
});

test("a clutch make with no live combo starts the streak at 1", () => {
  assert.equal(
    streakAfterMake({
      streak: 0,
      comboCounting: false,
      bunshinGhost: false,
      comboBoost: null,
    }),
    1,
  );
});

test("rogue comboboost steps a clutch make by the catalog amount", () => {
  assert.equal(comboBoost, 3);
  assert.equal(
    streakAfterMake({
      streak: 4,
      comboCounting: true,
      bunshinGhost: false,
      comboBoost,
    }),
    4 + comboBoost,
  );
  assert.equal(
    streakAfterMake({
      streak: 9,
      comboCounting: false,
      bunshinGhost: false,
      comboBoost,
    }),
    comboBoost,
  );
});

test("bunshin ghosts still step by 1 when comboboost is live", () => {
  assert.equal(
    streakAfterMake({
      streak: 4,
      comboCounting: true,
      bunshinGhost: true,
      comboBoost,
    }),
    5,
  );
  assert.equal(
    streakAfterMake({
      streak: 4,
      comboCounting: false,
      bunshinGhost: true,
      comboBoost,
    }),
    1,
  );
});

test("each mini-me stack adds 1 streak on a clutch make", () => {
  let streak = 4;
  const stacks = 3;
  for (let i = 0; i < stacks; i++) streak += miniMeStreakPerStack();
  assert.equal(miniMeStreakPerStack(), 1);
  assert.equal(streak, 7);
});
