import { BALLS, type BallId } from "../../game/balls.ts";
import type { PlayMode, RunRecap, RunRecapMapStats } from "../../game/types.ts";
import { SCENES as SCENE_PACKS, type SceneId } from "../../game/scenes.ts";
import { isTimelineEventKind } from "../../game/run-timeline.ts";
import {
  TIMELINE_MAX_EVENTS,
  type EligibilityFlags,
  type LeaderboardMode,
  type TimelineEvent,
} from "./constants.ts";
import { normalizeNickname } from "./nickname.ts";
import { isLeaderboardMode, isRunEligible } from "./eligibility.ts";

export type SubmitRunInput = {
  nickname: string;
  mode: LeaderboardMode;
  score: number;
  recap: RunRecap;
  timeline: TimelineEvent[];
  flags: EligibilityFlags;
};

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function finiteInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.floor(value);
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function asInt(value: unknown, fallback = 0): number {
  const n = finiteInt(value);
  return n === null ? fallback : n;
}

function asNum(value: unknown, fallback = 0): number {
  const n = finiteNumber(value);
  return n === null ? fallback : n;
}

const PLAY_MODES: PlayMode[] = ["classic", "minute", "rogue"];
const SCENES: SceneId[] = SCENE_PACKS.map((scene) => scene.id);
const BALL_IDS: BallId[] = BALLS.map((ball) => ball.id);

export type LeaderboardListQuery = {
  mode: LeaderboardMode;
  sceneId: SceneId;
  ballId: BallId;
};

function isKnownSceneId(value: unknown): value is SceneId {
  return typeof value === "string" && (SCENES as string[]).includes(value);
}

function isKnownBallId(value: unknown): value is BallId {
  return typeof value === "string" && (BALL_IDS as string[]).includes(value);
}

function parseMap(raw: unknown): RunRecapMapStats {
  if (!raw || typeof raw !== "object") return {};
  const src = raw as Record<string, unknown>;
  const map: RunRecapMapStats = {};
  const keys: (keyof RunRecapMapStats)[] = [
    "trafficNearMisses",
    "trafficBurns",
    "trafficAbsorbs",
    "trafficHits",
    "birdStuns",
    "birdAbsorbs",
    "birdIceBreaks",
    "eagleCatches",
    "prisonFrees",
    "searchlightBreaks",
    "blueprintClears",
    "gantryDodges",
  ];
  for (const key of keys) {
    const n = finiteInt(src[key]);
    if (n !== null && n > 0) map[key] = n;
  }
  return map;
}

export function parseRecap(raw: unknown): RunRecap | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  if (!PLAY_MODES.includes(src.playMode as PlayMode)) return null;
  if (typeof src.ballId !== "string" || !src.ballId) return null;
  if (typeof src.ballLabel !== "string" || !src.ballLabel) return null;
  if (!SCENES.includes(src.sceneId as SceneId)) return null;
  if (typeof src.sceneLabel !== "string") return null;
  const score = finiteInt(src.score);
  const gameRev = finiteInt(src.gameRev);
  const duration = finiteNumber(src.durationSeconds);
  if (score === null || gameRev === null || duration === null) return null;
  if (!Number.isFinite(src.peakCombo) || !Number.isFinite(src.peakMake)) return null;
  if (!Number.isFinite(src.makes) || !Number.isFinite(src.misses)) return null;
  if (!Number.isFinite(src.clicks) || !Number.isFinite(src.holds)) return null;
  if (!Number.isFinite(src.skillInputs) || !Number.isFinite(src.clutchMakes)) return null;
  if (!Number.isFinite(src.skillActiveSeconds) || !Number.isFinite(src.skillLockSeconds)) return null;
  return {
    playMode: src.playMode as PlayMode,
    ballId: src.ballId as BallId,
    ballLabel: src.ballLabel,
    sceneId: src.sceneId as SceneId,
    sceneLabel: src.sceneLabel,
    gameRev,
    score,
    peakCombo: asInt(src.peakCombo),
    peakMake: asInt(src.peakMake),
    durationSeconds: asNum(src.durationSeconds),
    makes: asInt(src.makes),
    misses: asInt(src.misses),
    clicks: asInt(src.clicks),
    holds: asInt(src.holds),
    skillInputs: asInt(src.skillInputs),
    skillActiveSeconds: asNum(src.skillActiveSeconds),
    skillLockSeconds: asNum(src.skillLockSeconds),
    clutchMakes: asInt(src.clutchMakes),
    map: parseMap(src.map),
  };
}

function parseTimeline(raw: unknown): TimelineEvent[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length > TIMELINE_MAX_EVENTS) return null;
  const events: TimelineEvent[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const src = item as Record<string, unknown>;
    if (!isTimelineEventKind(src.kind)) return null;
    const t = finiteNumber(src.t);
    if (t === null || t < 0) return null;
    const ev: TimelineEvent = { t, kind: src.kind };
    if (src.kind === "score") {
      const points = finiteNumber(src.points);
      if (points === null) return null;
      ev.points = points;
    }
    events.push(ev);
  }
  return events;
}

function parseFlags(raw: unknown): EligibilityFlags | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  if (
    typeof src.sandbox !== "boolean" ||
    typeof src.balance !== "boolean" ||
    typeof src.scoreLock !== "boolean" ||
    typeof src.comboLock !== "boolean"
  ) {
    return null;
  }
  return {
    sandbox: src.sandbox,
    balance: src.balance,
    scoreLock: src.scoreLock,
    comboLock: src.comboLock,
  };
}

const RUN_ID_MAX = 128;
const RUN_ID_RE = /^[A-Za-z0-9_-]+$/;

export function parseRunId(raw: unknown): ParseResult<string> {
  const id = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as { id?: unknown }).id : raw;
  if (typeof id !== "string") return { ok: false, error: "找不到该成绩" };
  const trimmed = id.trim();
  if (!trimmed || trimmed.length > RUN_ID_MAX || !RUN_ID_RE.test(trimmed)) {
    return { ok: false, error: "找不到该成绩" };
  }
  return { ok: true, value: trimmed };
}

export function parseListMode(raw: unknown): ParseResult<LeaderboardListQuery> {
  if (!raw || typeof raw !== "object") return { ok: false, error: "模式无效" };
  const src = raw as { mode?: unknown; sceneId?: unknown; ballId?: unknown };
  if (typeof src.mode !== "string" || !isLeaderboardMode(src.mode)) return { ok: false, error: "模式无效" };
  if (!isKnownSceneId(src.sceneId)) return { ok: false, error: "场景无效" };
  if (!isKnownBallId(src.ballId)) return { ok: false, error: "球种无效" };
  return { ok: true, value: { mode: src.mode, sceneId: src.sceneId, ballId: src.ballId } };
}

export function parseSubmitPayload(raw: unknown): ParseResult<SubmitRunInput> {
  if (!raw || typeof raw !== "object") return { ok: false, error: "提交失败，请稍后再试" };
  const src = raw as Record<string, unknown>;
  const nick = normalizeNickname(src.nickname);
  if (!nick.ok) return nick;
  if (typeof src.mode !== "string" || !isLeaderboardMode(src.mode)) return { ok: false, error: "模式无效" };
  const mode = src.mode;
  const score = finiteInt(src.score);
  if (score === null) return { ok: false, error: "分数无效" };
  const recap = parseRecap(src.recap);
  if (!recap) return { ok: false, error: "分数无效" };
  const timeline = parseTimeline(src.timeline);
  if (!timeline) return { ok: false, error: "分数无效" };
  const flags = parseFlags(src.flags);
  if (!flags) return { ok: false, error: "本局不能上榜" };
  if (!isRunEligible(flags)) return { ok: false, error: "本局不能上榜" };
  if (score <= 0) return { ok: false, error: "分数无效" };
  if (recap.playMode !== mode) return { ok: false, error: "模式无效" };
  return {
    ok: true,
    value: {
      nickname: nick.nickname,
      mode,
      score,
      recap,
      timeline,
      flags,
    },
  };
}
