import assert from "node:assert/strict";
import test from "node:test";
import { getBall } from "./balls.ts";
import {
  buzzerRejectsTap,
  champClutchAppliesHalfClock,
  isChampClutchWindow,
} from "./champ-clutch.ts";

test("champ buzzer window: later taps are not rejected by champClutchControlled", () => {
  const champClutch = isChampClutchWindow(true, true, 4.2);
  assert.equal(champClutch, true);
  // First tap would set controlled=true; second tap must still be allowed.
  for (const controlled of [false, true]) {
    assert.equal(
      buzzerRejectsTap({
        buzzer: true,
        timeUp: true,
        heroClutch: false,
        champClutch,
      }),
      false,
      `controlled=${controlled} must not affect the gate`,
    );
  }
  // Multiple successful taps in the same window stay allowed.
  assert.equal(
    buzzerRejectsTap({ buzzer: true, timeUp: true, heroClutch: false, champClutch: true }),
    false,
  );
  assert.equal(
    buzzerRejectsTap({ buzzer: true, timeUp: true, heroClutch: false, champClutch: true }),
    false,
  );
});

test("after at least one tap, classic clutch make still applies half-clock", () => {
  assert.equal(
    champClutchAppliesHalfClock({
      clutchMake: true,
      isChamp: true,
      isMinuteMode: false,
      champClutchControlled: true,
    }),
    true,
  );
  // Untouched window: no half-clock.
  assert.equal(
    champClutchAppliesHalfClock({
      clutchMake: true,
      isChamp: true,
      isMinuteMode: false,
      champClutchControlled: false,
    }),
    false,
  );
  // Minute mode never gets half-clock / double rewards path.
  assert.equal(
    champClutchAppliesHalfClock({
      clutchMake: true,
      isChamp: true,
      isMinuteMode: true,
      champClutchControlled: true,
    }),
    false,
  );
});

test("non-champ without HeroMoment cannot tap-jump during buzzer", () => {
  assert.equal(isChampClutchWindow(false, true, 5), false);
  assert.equal(
    buzzerRejectsTap({
      buzzer: true,
      timeUp: true,
      heroClutch: false,
      champClutch: false,
    }),
    true,
  );
  // Window ended: champClutch false when timer is 0.
  assert.equal(isChampClutchWindow(true, true, 0), false);
  assert.equal(
    buzzerRejectsTap({
      buzzer: true,
      timeUp: true,
      heroClutch: false,
      champClutch: isChampClutchWindow(true, true, 0),
    }),
    true,
  );
  // Rogue HeroMoment still unlocks taps for non-champ.
  assert.equal(
    buzzerRejectsTap({
      buzzer: true,
      timeUp: true,
      heroClutch: true,
      champClutch: false,
    }),
    false,
  );
});

test("冠军球 skill 文案去掉操作次数限制，保留 5 秒 / ×2 / 半钟 / 不叠加", () => {
  const skill = getBall("champ").skill;
  assert.equal(skill.includes("仅可操作1次"), false);
  assert.equal(skill.includes("1分钟仅终局绝杀可操作1次"), false);
  assert.match(skill, /5秒/);
  assert.match(skill, /×2|x2/i);
  assert.match(skill, /减半/);
  assert.match(skill, /不叠加/);
});
