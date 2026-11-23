import assert from "node:assert/strict";
import test from "node:test";
import type { RunRecap } from "../../game/types.ts";
import {
  CLASSIC_ABSURD_INSTANT_SCORE,
  CLASSIC_ABSURD_MIN_DURATION,
  CLASSIC_ABSURD_SCORE_PER_SECOND,
  CLICK_RATE_MIN_DURATION,
  INHUMAN_CLICK_RATE,
  MINUTE_DURATION_MAX,
  MINUTE_DURATION_MIN,
  reviewFlagsFor,
  timelineScoreTotal,
} from "./anticheat.ts";
import { DEFAULT_NICKNAME, LEADERBOARD_LIMIT, type EligibilityFlags, type TimelineEvent } from "./constants.ts";
import { isRunEligible, lastSubmittedFor, shouldOfferSubmit, runEligibilityFlags } from "./eligibility.ts";
import { commitDisplayName, displayNickname, normalizeNickname, parseSavedNickname, visibleCharCount } from "./nickname.ts";
import { parseListMode, parseSubmitPayload } from "./payload.ts";
import { publicRowsFromStored, toPublicRow } from "./public-row.ts";

function recap(partial: Partial<RunRecap> = {}): RunRecap {
  return {
    playMode: "classic",
    ballId: "plain",
    ballLabel: "经典球",
    sceneId: "street",
    sceneLabel: "街头",
    gameRev: 332,
    score: 40,
    peakCombo: 4,
    peakMake: 12,
    durationSeconds: 20,
    makes: 5,
    misses: 2,
    clicks: 12,
    holds: 0,
    skillInputs: 0,
    skillActiveSeconds: 0,
    skillLockSeconds: 0,
    clutchMakes: 0,
    map: {},
    ...partial,
  };
}

function flags(partial: Partial<EligibilityFlags> = {}): EligibilityFlags {
  return { sandbox: false, balance: false, scoreLock: false, comboLock: false, ...partial };
}

function scores(total: number): TimelineEvent[] {
  return [{ t: 1, kind: "make" }, { t: 1, kind: "score", points: total }];
}

test("nickname trims, rejects empty, and caps at 16 visible characters", () => {
  assert.deepEqual(normalizeNickname("  投球王  "), { ok: true, nickname: "投球王" });
  assert.equal(normalizeNickname("").ok, false);
  assert.equal(normalizeNickname("   ").ok, false);
  assert.equal(normalizeNickname(null).ok, false);
  const sixteen = "一二三四五六七八九十123456";
  assert.equal(visibleCharCount(sixteen), 16);
  assert.deepEqual(normalizeNickname(sixteen), { ok: true, nickname: sixteen });
  assert.equal(normalizeNickname(sixteen + "七").ok, false);
  const emoji = "投篮🏀高手";
  assert.ok(visibleCharCount(emoji) <= 16);
  assert.equal(normalizeNickname(emoji).ok, true);
  assert.equal(parseSavedNickname("  老玩家  "), "老玩家");
  assert.equal(parseSavedNickname(""), "");
  assert.equal(parseSavedNickname("x".repeat(20)), "");
});

test("display nickname falls back to 玩家 when unsaved, and uses the saved name when present", () => {
  assert.equal(DEFAULT_NICKNAME, "玩家");
  assert.equal(visibleCharCount(DEFAULT_NICKNAME), 2);
  assert.deepEqual(normalizeNickname("玩家"), { ok: true, nickname: "玩家" });
  assert.equal(displayNickname(""), "玩家");
  assert.equal(displayNickname(undefined), "玩家");
  assert.equal(displayNickname("阿强"), "阿强");
});

test("name commit does not persist the default unless the player actually edited, and clearing does not keep an empty name", () => {
  assert.deepEqual(
    commitDisplayName({ draft: "玩家", saved: "", dirty: false }),
    { action: "none", display: "玩家" },
  );
  assert.deepEqual(
    commitDisplayName({ draft: "玩家", saved: "", dirty: true }),
    { action: "save", saved: "玩家", display: "玩家" },
  );
  assert.deepEqual(
    commitDisplayName({ draft: "  阿强  ", saved: "", dirty: true }),
    { action: "save", saved: "阿强", display: "阿强" },
  );
  assert.deepEqual(
    commitDisplayName({ draft: "   ", saved: "阿强", dirty: true }),
    { action: "save", saved: "", display: "玩家" },
  );
  const tooLong = commitDisplayName({ draft: "一二三四五六七八九十1234567", saved: "阿强", dirty: true });
  assert.equal(tooLong.action, "error");
  if (tooLong.action === "error") {
    assert.equal(tooLong.error, "昵称最多 16 个字");
    assert.equal(tooLong.display, "一二三四五六七八九十1234567");
  }
});

test("submit gate offers only a better eligible classic or minute score", () => {
  const clean = flags();
  assert.equal(shouldOfferSubmit({ mode: "classic", score: 10, lastSubmitted: 0, flags: clean }), true);
  assert.equal(shouldOfferSubmit({ mode: "minute", score: 30, lastSubmitted: 20, flags: clean }), true);
  assert.equal(shouldOfferSubmit({ mode: "classic", score: 20, lastSubmitted: 20, flags: clean }), false);
  assert.equal(shouldOfferSubmit({ mode: "classic", score: 19, lastSubmitted: 20, flags: clean }), false);
  assert.equal(shouldOfferSubmit({ mode: "classic", score: 0, lastSubmitted: 0, flags: clean }), false);
  assert.equal(shouldOfferSubmit({ mode: "classic", score: -1, lastSubmitted: 0, flags: clean }), false);
  assert.equal(shouldOfferSubmit({ mode: "rogue", score: 99, lastSubmitted: 0, flags: clean }), false);
});

test("ineligible sandbox, balance, and lock runs are not offered or accepted", () => {
  const clean = flags();
  assert.equal(isRunEligible(clean), true);
  assert.equal(isRunEligible(runEligibilityFlags({ sandbox: true, balance: false, scoreLock: false, comboLock: false })), false);
  assert.equal(isRunEligible(flags({ balance: true })), false);
  assert.equal(isRunEligible(flags({ scoreLock: true })), false);
  assert.equal(isRunEligible(flags({ comboLock: true })), false);
  assert.equal(
    shouldOfferSubmit({ mode: "classic", score: 50, lastSubmitted: 0, flags: flags({ sandbox: true }) }),
    false,
  );
  const payload = parseSubmitPayload({
    nickname: "测试",
    mode: "classic",
    score: 40,
    recap: recap(),
    timeline: scores(40),
    flags: flags({ sandbox: true }),
  });
  assert.equal(payload.ok, false);
  if (!payload.ok) assert.equal(payload.error, "本局不能上榜");
});

test("public rows expose only nickname, ball label, score, and peak combo", () => {
  const row = toPublicRow(
    { id: "abc", nickname: "阿强", ball_label: "闪电球+时间球", score: 88, peak_combo: 12 },
    3,
  );
  assert.deepEqual(row, {
    id: "abc",
    rank: 3,
    nickname: "阿强",
    ballLabel: "闪电球+时间球",
    score: 88,
    peakCombo: 12,
  });
  assert.equal("timeline" in row, false);
  assert.equal("flags" in row, false);
  assert.equal("reviewFlags" in row, false);
  assert.equal("review_flags" in row, false);
  const listed = publicRowsFromStored([
    { id: "1", nickname: "A", ball_label: "经典球", score: 10, peak_combo: 2 },
    { id: "2", nickname: "B", ball_label: "冰球", score: 9, peak_combo: 5 },
  ]);
  assert.equal(listed[0]?.rank, 1);
  assert.equal(listed[1]?.rank, 2);
  assert.equal(LEADERBOARD_LIMIT, 100);
});

test("anti-cheat flags a score/recap mismatch and unaccounted score events but still describes flags only", () => {
  const mismatch = reviewFlagsFor({
    mode: "classic",
    score: 50,
    recap: recap({ score: 40, makes: 5, durationSeconds: 20, clicks: 10 }),
    timeline: scores(40),
  });
  assert.ok(mismatch.includes("score_mismatch"));
  assert.ok(mismatch.includes("score_events_mismatch"));

  const clean = reviewFlagsFor({
    mode: "classic",
    score: 40,
    recap: recap({ score: 40, makes: 5, durationSeconds: 20, clicks: 10 }),
    timeline: scores(40),
  });
  assert.deepEqual(clean, []);
});

test("anti-cheat flags score without makes, and score events that cannot account for the score", () => {
  const none = reviewFlagsFor({
    mode: "classic",
    score: 12,
    recap: recap({ score: 12, makes: 0, durationSeconds: 20, clicks: 8 }),
    timeline: [{ t: 3, kind: "score", points: 12 }],
  });
  assert.ok(none.includes("score_without_makes"));
  assert.ok(!none.includes("score_events_mismatch"));

  const short = reviewFlagsFor({
    mode: "classic",
    score: 40,
    recap: recap({ score: 40, makes: 5, durationSeconds: 20, clicks: 8 }),
    timeline: scores(15),
  });
  assert.ok(short.includes("score_events_mismatch"));
  assert.equal(timelineScoreTotal(scores(15)), 15);
});

test("minute duration outside 50–75 seconds is flagged; in-range is not", () => {
  assert.equal(MINUTE_DURATION_MIN, 50);
  assert.equal(MINUTE_DURATION_MAX, 75);
  const short = reviewFlagsFor({
    mode: "minute",
    score: 40,
    recap: recap({ playMode: "minute", score: 40, durationSeconds: 49.9, clicks: 20 }),
    timeline: scores(40),
  });
  assert.ok(short.includes("minute_duration"));
  const long = reviewFlagsFor({
    mode: "minute",
    score: 40,
    recap: recap({ playMode: "minute", score: 40, durationSeconds: 75.1, clicks: 20 }),
    timeline: scores(40),
  });
  assert.ok(long.includes("minute_duration"));
  const ok = reviewFlagsFor({
    mode: "minute",
    score: 40,
    recap: recap({ playMode: "minute", score: 40, durationSeconds: 60, clicks: 20 }),
    timeline: scores(40),
  });
  assert.ok(!ok.includes("minute_duration"));
});

test("inhuman click rate flags only after 5s when clicks/duration exceeds 10 per second", () => {
  assert.equal(INHUMAN_CLICK_RATE, 10);
  assert.equal(CLICK_RATE_MIN_DURATION, 5);
  const burst = reviewFlagsFor({
    mode: "classic",
    score: 8,
    recap: recap({ score: 8, makes: 2, durationSeconds: 4.9, clicks: 80 }),
    timeline: scores(8),
  });
  assert.ok(!burst.includes("inhuman_click_rate"));
  const fast = reviewFlagsFor({
    mode: "classic",
    score: 8,
    recap: recap({ score: 8, makes: 2, durationSeconds: 6, clicks: 61 }),
    timeline: scores(8),
  });
  assert.ok(fast.includes("inhuman_click_rate"));
  const human = reviewFlagsFor({
    mode: "classic",
    score: 8,
    recap: recap({ score: 8, makes: 2, durationSeconds: 6, clicks: 60 }),
    timeline: scores(8),
  });
  assert.ok(!human.includes("inhuman_click_rate"));
});

test("classic score-vs-duration flags only absurd extremes, not a normal high combo", () => {
  assert.equal(CLASSIC_ABSURD_SCORE_PER_SECOND, 8000);
  assert.equal(CLASSIC_ABSURD_MIN_DURATION, 1);
  assert.equal(CLASSIC_ABSURD_INSTANT_SCORE, 50_000);
  const normalHigh = reviewFlagsFor({
    mode: "classic",
    score: 20_000,
    recap: recap({ score: 20_000, makes: 80, peakCombo: 200, durationSeconds: 90, clicks: 200 }),
    timeline: scores(20_000),
  });
  assert.ok(!normalHigh.includes("classic_score_rate"));
  const rate = reviewFlagsFor({
    mode: "classic",
    score: 8_001,
    recap: recap({ score: 8_001, makes: 10, durationSeconds: 1, clicks: 10 }),
    timeline: scores(8_001),
  });
  assert.ok(rate.includes("classic_score_rate"));
  const instant = reviewFlagsFor({
    mode: "classic",
    score: 50_000,
    recap: recap({ score: 50_000, makes: 1, durationSeconds: 0.5, clicks: 2 }),
    timeline: scores(50_000),
  });
  assert.ok(instant.includes("classic_score_rate"));
});

test("submit payload rejects malformed or non-finite scores and empty nicknames", () => {
  const good = {
    nickname: "阿强",
    mode: "classic",
    score: 40,
    recap: recap(),
    timeline: scores(40),
    flags: flags(),
  };
  const ok = parseSubmitPayload(good);
  assert.equal(ok.ok, true);

  assert.equal(parseSubmitPayload({ ...good, score: Number.NaN }).ok, false);
  assert.equal(parseSubmitPayload({ ...good, score: Infinity }).ok, false);
  assert.equal(parseSubmitPayload({ ...good, score: 0 }).ok, false);
  assert.equal(parseSubmitPayload({ ...good, nickname: "  " }).ok, false);
  assert.equal(parseSubmitPayload({ ...good, mode: "rogue" }).ok, false);
  assert.equal(parseSubmitPayload({ ...good, recap: recap({ playMode: "minute" }) }).ok, false);
  assert.equal(parseSubmitPayload({ ...good, recap: recap({ score: Number.NaN }) }).ok, false);
  assert.equal(parseListMode({ mode: "classic" }).ok, false);
  assert.equal(parseListMode({ mode: "classic", sceneId: "street", ballId: "plain" }).ok, true);
  assert.equal(parseListMode({ mode: "minute", sceneId: "blueprint", ballId: "time" }).ok, true);
  assert.equal(parseListMode({ mode: "rogue", sceneId: "street", ballId: "plain" }).ok, false);
  assert.equal(parseListMode({ mode: "classic", sceneId: "street" }).ok, false);
  assert.equal(parseListMode({ mode: "classic", ballId: "plain" }).ok, false);
  assert.equal(parseListMode({ mode: "classic", sceneId: "street", ballId: "random" }).ok, false);
  assert.equal(parseListMode({ mode: "classic", sceneId: "rogue", ballId: "plain" }).ok, false);
  assert.equal(parseListMode({ mode: "classic", sceneId: "street", ballId: "anti" }).ok, false);
  const parsed = parseListMode({ mode: "classic", sceneId: "prison", ballId: "frost" });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.deepEqual(parsed.value, { mode: "classic", sceneId: "prison", ballId: "frost" });
  }
});

test("last submitted score is keyed by mode, scene, and ball, not the old mode totals", () => {
  const save = {
    submittedClassic: 80,
    submittedMinute: 55,
    submittedByBoard: {
      "classic:street:plain": 40,
      "classic:prison:plain": 90,
      "minute:street:plain": 12,
    },
  };
  assert.equal(lastSubmittedFor("classic", "street", "plain", save), 40);
  assert.equal(lastSubmittedFor("classic", "prison", "plain", save), 90);
  assert.equal(lastSubmittedFor("minute", "street", "plain", save), 12);
  assert.equal(lastSubmittedFor("classic", "street", "frost", save), 0);
  assert.equal(lastSubmittedFor("classic", "overpass", "plain", { submittedClassic: 80, submittedMinute: 55 }), 0);
  assert.equal(
    shouldOfferSubmit({
      mode: "classic",
      score: 50,
      lastSubmitted: lastSubmittedFor("classic", "street", "frost", save),
      flags: flags(),
    }),
    true,
  );
  assert.equal(
    shouldOfferSubmit({
      mode: "classic",
      score: 50,
      lastSubmitted: lastSubmittedFor("classic", "prison", "plain", save),
      flags: flags(),
    }),
    false,
  );
});

test("finite score mismatch is still a valid payload so the server can flag and accept it", () => {
  const parsed = parseSubmitPayload({
    nickname: "阿强",
    mode: "classic",
    score: 99,
    recap: recap({ score: 40 }),
    timeline: scores(40),
    flags: flags(),
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.value.score, 99);
});
