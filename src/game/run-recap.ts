import type { BallId } from "./balls.ts";
import { SCENE_LABELS, type SceneId } from "./scenes.ts";
import type { PlayMode, RunRecap, RunRecapMapStats } from "./types.ts";

/** Same gate recordBalanceTrial has always used. Do not loosen it. */
export function shouldRecordBalanceTrial(opts: {
  hasSession: boolean;
  devOn: boolean;
  minuteMode: boolean;
  timerArmed: boolean;
  alreadyRecorded: boolean;
}): boolean {
  return Boolean(opts.hasSession && opts.devOn && opts.minuteMode && opts.timerArmed && !opts.alreadyRecorded);
}

export const PLAY_MODE_LABELS: Record<PlayMode, string> = {
  classic: "经典",
  minute: "1分钟",
  rogue: "肉鸽",
};

export type RecapRow = { label: string; value: string };

export type RecapTracker = {
  makes: number;
  misses: number;
  clicks: number;
  holds: number;
  skillInputs: number;
  skillActiveSeconds: number;
  skillLockSeconds: number;
  peakCombo: number;
  peakMake: number;
  clutchMakes: number;
  clockSeconds: number;
  trafficNearMisses: number;
  trafficBurns: number;
  trafficAbsorbs: number;
  birdStuns: number;
  birdAbsorbs: number;
  birdIceBreaks: number;
  prisonFrees: number;
  birdKillsSeen: number;
  birdAbsorbedSeen: number;
  birdIceSeen: number;
};

export function createRecapTracker(): RecapTracker {
  return {
    makes: 0,
    misses: 0,
    clicks: 0,
    holds: 0,
    skillInputs: 0,
    skillActiveSeconds: 0,
    skillLockSeconds: 0,
    peakCombo: 0,
    peakMake: 0,
    clutchMakes: 0,
    clockSeconds: 0,
    trafficNearMisses: 0,
    trafficBurns: 0,
    trafficAbsorbs: 0,
    birdStuns: 0,
    birdAbsorbs: 0,
    birdIceBreaks: 0,
    prisonFrees: 0,
    birdKillsSeen: 0,
    birdAbsorbedSeen: 0,
    birdIceSeen: 0,
  };
}

export function resetRecapTracker(t: RecapTracker) {
  Object.assign(t, createRecapTracker());
}

/** Call when a new BirdState is created so stage resets do not drop run totals. */
export function watchBirds(t: RecapTracker) {
  t.birdKillsSeen = 0;
  t.birdAbsorbedSeen = 0;
  t.birdIceSeen = 0;
}

export function syncBirdRecap(
  t: RecapTracker,
  birds: { kills: number; absorbed: number; iceBreaks: number },
) {
  if (birds.kills > t.birdKillsSeen) t.birdStuns += birds.kills - t.birdKillsSeen;
  if (birds.absorbed > t.birdAbsorbedSeen) t.birdAbsorbs += birds.absorbed - t.birdAbsorbedSeen;
  if (birds.iceBreaks > t.birdIceSeen) t.birdIceBreaks += birds.iceBreaks - t.birdIceSeen;
  t.birdKillsSeen = birds.kills;
  t.birdAbsorbedSeen = birds.absorbed;
  t.birdIceSeen = birds.iceBreaks;
}

export function noteRecapClick(t: RecapTracker, playing: boolean) {
  if (playing) t.clicks += 1;
}

export function noteRecapHold(t: RecapTracker, playing: boolean) {
  if (playing) t.holds += 1;
}

export function noteRecapSkillInput(t: RecapTracker, playing: boolean) {
  if (playing) t.skillInputs += 1;
}

export function noteRecapMiss(t: RecapTracker, shotOpen: boolean, shotMade: boolean) {
  if (shotOpen && !shotMade) t.misses += 1;
}

export function noteRecapClock(t: RecapTracker, drain: number) {
  if (drain > 0) t.clockSeconds += drain;
}

export function noteRecapSkillTime(
  t: RecapTracker,
  drain: number,
  opts: { busy?: boolean; locked?: boolean },
) {
  if (drain <= 0) return;
  if (opts.busy) t.skillActiveSeconds += drain;
  if (opts.locked) t.skillLockSeconds += drain;
}

export function noteRecapCountedMake(t: RecapTracker) {
  t.makes += 1;
}

export function noteRecapAward(
  t: RecapTracker,
  opts: { streak: number; awarded: number; clutch: boolean },
) {
  t.peakCombo = Math.max(t.peakCombo, opts.streak);
  t.peakMake = Math.max(t.peakMake, opts.awarded);
  if (opts.clutch) t.clutchMakes += 1;
}

export function noteRecapMake(
  t: RecapTracker,
  opts: { streak: number; awarded: number; clutch: boolean },
) {
  noteRecapCountedMake(t);
  noteRecapAward(t, opts);
}

export function noteRecapPeakCombo(t: RecapTracker, streak: number) {
  t.peakCombo = Math.max(t.peakCombo, streak);
}

export function noteRecapTrafficNearMiss(t: RecapTracker, awarded: number) {
  if (awarded > 0) t.trafficNearMisses += awarded;
}

export function noteRecapTrafficBurns(t: RecapTracker, count: number) {
  if (count > 0) t.trafficBurns += count;
}

export function noteRecapTrafficAbsorbs(t: RecapTracker, count: number) {
  if (count > 0) t.trafficAbsorbs += count;
}

export function noteRecapPrisonFree(t: RecapTracker) {
  t.prisonFrees += 1;
}

export function sceneLabel(id: SceneId): string {
  return SCENE_LABELS.find((s) => s.id === id)?.name ?? id;
}

export function playModeLabel(mode: PlayMode): string {
  return PLAY_MODE_LABELS[mode];
}

/** Armed match-clock time already accumulated by the existing drain. */
export function formatRecapDuration(seconds: number): string {
  const s = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  if (s < 60) return `${s.toFixed(1)} 秒`;
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  return `${m}:${rem.toFixed(1).padStart(4, "0")}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function snapshotRunRecap(
  t: RecapTracker,
  opts: {
    playMode: PlayMode;
    ballId: BallId;
    ballLabel: string;
    sceneId: SceneId;
    gameRev: number;
    score: number;
  },
): RunRecap {
  const map: RunRecapMapStats = {};
  if (t.trafficNearMisses > 0) map.trafficNearMisses = t.trafficNearMisses;
  if (t.trafficBurns > 0) map.trafficBurns = t.trafficBurns;
  if (t.trafficAbsorbs > 0) map.trafficAbsorbs = t.trafficAbsorbs;
  if (t.birdStuns > 0) map.birdStuns = t.birdStuns;
  if (t.birdAbsorbs > 0) map.birdAbsorbs = t.birdAbsorbs;
  if (t.birdIceBreaks > 0) map.birdIceBreaks = t.birdIceBreaks;
  if (t.prisonFrees > 0) map.prisonFrees = t.prisonFrees;
  return {
    playMode: opts.playMode,
    ballId: opts.ballId,
    ballLabel: opts.ballLabel,
    sceneId: opts.sceneId,
    sceneLabel: sceneLabel(opts.sceneId),
    gameRev: opts.gameRev,
    score: opts.score,
    peakCombo: t.peakCombo,
    peakMake: t.peakMake,
    durationSeconds: round2(t.clockSeconds),
    makes: t.makes,
    misses: t.misses,
    clicks: t.clicks,
    holds: t.holds,
    skillInputs: t.skillInputs,
    skillActiveSeconds: round2(t.skillActiveSeconds),
    skillLockSeconds: round2(t.skillLockSeconds),
    clutchMakes: t.clutchMakes,
    map,
  };
}

export function recapRows(
  recap: RunRecap,
  opts: { hideRogueDuplicates?: boolean } = {},
): RecapRow[] {
  const rows: RecapRow[] = [
    { label: "模式", value: playModeLabel(recap.playMode) },
    { label: "球种", value: recap.ballLabel },
    { label: "地图", value: recap.sceneLabel },
    { label: "版本", value: `r${recap.gameRev}` },
    { label: "分数", value: `${recap.score}` },
  ];
  const hidePeaks = Boolean(opts.hideRogueDuplicates);
  if (!hidePeaks) {
    rows.push(
      { label: "最高连击", value: `×${recap.peakCombo}` },
      { label: "最高单次得分", value: `${recap.peakMake}` },
    );
  }
  rows.push(
    { label: "时长", value: formatRecapDuration(recap.durationSeconds) },
    { label: "进球", value: `${recap.makes}` },
    { label: "不中", value: `${recap.misses}` },
    { label: "点击次数", value: `${recap.clicks}` },
    { label: "长按次数", value: `${recap.holds}` },
    { label: "技能使用", value: `${recap.skillInputs}` },
  );
  if (recap.skillActiveSeconds > 0) {
    rows.push({ label: "技能持续时间", value: `${recap.skillActiveSeconds.toFixed(1)} 秒` });
  }
  if (recap.skillLockSeconds > 0) {
    rows.push({ label: "技能锁定时间", value: `${recap.skillLockSeconds.toFixed(1)} 秒` });
  }
  if (recap.clutchMakes > 0) {
    rows.push({ label: "绝杀球数", value: `${recap.clutchMakes}` });
  }
  const map = recap.map;
  if (map.trafficNearMisses) rows.push({ label: "擦车而过", value: `${map.trafficNearMisses}` });
  if (map.trafficBurns) rows.push({ label: "烧毁车辆", value: `${map.trafficBurns}` });
  if (map.trafficAbsorbs) rows.push({ label: "吸收车辆", value: `${map.trafficAbsorbs}` });
  if (map.birdStuns) rows.push({ label: "击晕飞鸟", value: `${map.birdStuns}` });
  if (map.birdAbsorbs) rows.push({ label: "吸收飞鸟", value: `${map.birdAbsorbs}` });
  if (map.birdIceBreaks) rows.push({ label: "击碎冰鸟", value: `${map.birdIceBreaks}` });
  if (map.prisonFrees) rows.push({ label: "释放次数", value: `${map.prisonFrees}` });
  return rows;
}
