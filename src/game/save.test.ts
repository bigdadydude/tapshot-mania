import assert from "node:assert/strict";
import test from "node:test";
import { LEADERBOARD_SAVE_DEFAULTS, leaderboardSaveFieldsFrom } from "../lib/leaderboard/save-fields.ts";
import { displayNickname } from "../lib/leaderboard/nickname.ts";

test("old saves without nickname fields default safely and keep other data untouched", () => {
  const fields = leaderboardSaveFieldsFrom({
    version: 11,
    best: 42,
    bestMinute: 18,
    bestRogue: 7,
    playMode: "minute",
  });
  assert.deepEqual(fields, LEADERBOARD_SAVE_DEFAULTS);
  assert.equal(fields.nickname, "");
  assert.equal(fields.submittedClassic, 0);
  assert.equal(fields.submittedMinute, 0);
  assert.equal(displayNickname(fields.nickname), "玩家");
});

test("keeps a stored nickname and last submitted scores", () => {
  const fields = leaderboardSaveFieldsFrom({
    version: 13,
    best: 42,
    nickname: "  阿强  ",
    submittedClassic: 80,
    submittedMinute: 55,
  });
  assert.equal(fields.nickname, "阿强");
  assert.equal(fields.submittedClassic, 80);
  assert.equal(fields.submittedMinute, 55);
});

test("invalid stored nickname or submitted scores fall back without throwing", () => {
  const fields = leaderboardSaveFieldsFrom({
    nickname: "x".repeat(20),
    submittedClassic: Number.NaN,
    submittedMinute: -3,
  });
  assert.equal(fields.nickname, "");
  assert.equal(fields.submittedClassic, 0);
  assert.equal(fields.submittedMinute, 0);
});
