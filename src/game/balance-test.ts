import type { BallId } from "./balls";

export type SkillState = "baseline" | "off" | "on";
export type SkillStrength = { score: number; safety: number; tempo: number; cost: number };
export type BalanceConfig = {
  k: number;
  r0Tolerance: number;
  r1Min: number;
  r1Max: number;
  strength: Partial<Record<BallId, SkillStrength>>;
  autoWeights?: AutoWeights;
};

/** Weights for telemetry-derived auto S. Cost is negative when ready. */
export type AutoWeights = {
  score: number;
  safety: number;
  tempo: number;
  burst: number;
  cost: number;
};

export const DEFAULT_AUTO_WEIGHTS: AutoWeights = {
  score: 0.3,
  safety: 0.25,
  tempo: 0.15,
  burst: 0.15,
  cost: -0.15,
};

export type BalanceTrial = {
  id: string;
  sessionId: string;
  ballId: BallId;
  skillState: SkillState;
  score: number;
  maxCombo: number;
  triggers: number;
  skillScore: number;
  makes?: number;
  misses?: number;
  maxMakeGapSeconds?: number;
  effectiveSeconds?: number;
  completed?: boolean;
  endReason?: "time" | "retry";
  clicks?: number;
  holds?: number;
  skillInputs?: number;
  skillActiveSeconds?: number;
  directMakes?: number;
  directScore?: number;
  rescues?: number;
  unattributedScore?: number;
  timestamp: string;
  gameRev: number;
  configKey: string;
};

export type BalanceSession = {
  id: string;
  baseline: BallId;
  ballId: BallId;
  scene: string;
  playMode: string;
  physKey: string;
  createdAt: string;
  gameRev: number;
  configSnapshot?: BalanceConfig;
  trials: BalanceTrial[];
};

export type BalanceStore = { version: 1; config: BalanceConfig; sessions: BalanceSession[] };

export type VerdictLabel = "pass" | "fail" | "retest" | "insufficient" | "incomparable" | "waiting" | "strong" | "weak" | "unreliable";

export type BalanceRow = {
  ballId: BallId;
  state: SkillState | "base";
  count: number;
  rawCount: number;
  effectiveCount: number;
  mean: number;
  median: number;
  high: number;
  maxCombo: number;
  triggers: number;
  skillScore: number;
  ratio: number | null;
  ratioLo: number | null;
  ratioHi: number | null;
  target: number | null;
  deviation: number | null;
  verdict: VerdictLabel | string;
  sampleNote: string;
};

export type SessionProgress = {
  base: number;
  off: number;
  on: number;
  status: "in_progress" | "incomplete" | "complete";
};

export type AutoStrength = {
  ready: boolean;
  scoreGain: number | null;
  scorePerMakeGain: number | null;
  safetyGain: number | null;
  missRateGain: number | null;
  rescueGain: number | null;
  completeRateGain: number | null;
  tempoGain: number | null;
  gapGain: number | null;
  gapDispersionGain: number | null;
  burstGain: number | null;
  comboGain: number | null;
  peakScoreGain: number | null;
  skillScoreShare: number | null;
  costReady: boolean;
  costGain: number | null;
  activeSecondsGain: number | null;
  skillInputGain: number | null;
  clickHoldGain: number | null;
  attributionShare: number | null;
  unreliable: boolean;
  dims: { score: number | null; safety: number | null; tempo: number | null; burst: number | null; cost: number | null };
  autoS: number | null;
  cost: "pending_input_telemetry" | "ready";
};

export type CalibrateResult = {
  k: number;
  residuals: { ballId: BallId; residual: number; predicted: number; observed: number }[];
  rms: number;
  warnNonlinear: boolean;
  excluded: string[];
};

export type ComparableFilter = {
  gameRev: number;
  scene?: string;
  playMode?: string;
};

const KEY = "tq-balance-test-v1";
export const DEFAULT_STRENGTH: SkillStrength = { score: 0, safety: 0, tempo: 0, cost: 0 };
export const DEFAULT_BALANCE_CONFIG: BalanceConfig = {
  k: 0.06,
  r0Tolerance: 0.08,
  r1Min: 0.9,
  r1Max: 1.1,
  strength: {},
  autoWeights: { ...DEFAULT_AUTO_WEIGHTS },
};

const defaults = (): BalanceStore => ({
  version: 1,
  config: structuredClone(DEFAULT_BALANCE_CONFIG),
  sessions: [],
});

export function loadBalanceStore(): BalanceStore {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null") as Partial<BalanceStore> | null;
    if (!raw || raw.version !== 1) return defaults();
    return {
      version: 1,
      config: {
        ...DEFAULT_BALANCE_CONFIG,
        ...raw.config,
        strength: raw.config?.strength || {},
        autoWeights: { ...DEFAULT_AUTO_WEIGHTS, ...(raw.config?.autoWeights || {}) },
      },
      sessions: Array.isArray(raw.sessions) ? raw.sessions.map(normalizeSession) : [],
    };
  } catch {
    return defaults();
  }
}

function normalizeSession(session: BalanceSession): BalanceSession {
  return {
    ...session,
    playMode: session.playMode || "minute",
    trials: (session.trials || []).map((trial) => normalizeTrial(session, trial)),
  };
}

/** Migrate legacy baseline trials that were stored as skillState "on". */
function normalizeTrial(session: BalanceSession, trial: BalanceTrial): BalanceTrial {
  if (trial.ballId === session.baseline && trial.skillState === "on") {
    return { ...trial, skillState: "baseline" };
  }
  return trial;
}

export function saveBalanceStore(store: BalanceStore) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore quota */
  }
}

export function strengthTotal(s: SkillStrength) {
  return s.score + s.safety + s.tempo + s.cost;
}

export function configKey(config: BalanceConfig) {
  return JSON.stringify(config);
}

export function sessionComparable(session: BalanceSession, filter: ComparableFilter) {
  if (session.gameRev !== filter.gameRev) return false;
  if (filter.scene && session.scene !== filter.scene) return false;
  if (filter.playMode && (session.playMode || "minute") !== filter.playMode) return false;
  return true;
}

const mean = (n: number[]) => (n.length ? n.reduce((a, b) => a + b, 0) / n.length : 0);
const median = (n: number[]) => {
  const s = [...n].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length ? (s.length % 2 ? s[m]! : ((s[m - 1] || 0) + (s[m] || 0)) / 2) : 0;
};
const stdev = (n: number[]) => {
  if (n.length < 2) return 0;
  const m = mean(n);
  return Math.sqrt(n.reduce((a, b) => a + (b - m) ** 2, 0) / (n.length - 1));
};
const num = (n: number | null | undefined) => (Number.isFinite(n) ? (n as number) : 0);
const cap = (x: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));

export function trimmedMean(scores: number[]) {
  if (!scores.length) return null;
  if (scores.length < 3) return mean(scores);
  const sorted = [...scores].sort((a, b) => a - b);
  return mean(sorted.slice(1, -1));
}

export function sampleNote(rawCount: number) {
  if (rawCount < 3) return "样本不足";
  if (rawCount < 10) return `去极值 · 原始 ${rawCount} / 有效 ${Math.max(0, rawCount - 2)} · 建议满 10 局再定论`;
  if (rawCount < 20) return `去极值 · 原始 ${rawCount} / 有效 ${rawCount - 2}`;
  return `定稿样本 · 原始 ${rawCount} / 有效 ${rawCount - 2}`;
}

function effectiveCount(raw: number) {
  return raw < 3 ? raw : Math.max(0, raw - 2);
}

function meanCI(values: number[]): { mean: number | null; lo: number | null; hi: number | null } {
  if (!values.length) return { mean: null, lo: null, hi: null };
  const m = trimmedMean(values);
  if (m === null) return { mean: null, lo: null, hi: null };
  if (values.length < 2) return { mean: m, lo: m, hi: m };
  const se = stdev(values) / Math.sqrt(values.length);
  const half = 1.96 * se;
  return { mean: m, lo: m - half, hi: m + half };
}

function ratioCI(numScores: number[], denScores: number[]): { ratio: number | null; lo: number | null; hi: number | null } {
  const numM = meanCI(numScores);
  const denM = meanCI(denScores);
  if (numM.mean === null || denM.mean === null || !denM.mean) return { ratio: null, lo: null, hi: null };
  const r = numM.mean / denM.mean;
  if (numM.lo === null || numM.hi === null || denM.lo === null || denM.hi === null || denM.lo <= 0) {
    return { ratio: r, lo: r, hi: r };
  }
  const candidates = [
    numM.lo / denM.hi,
    numM.lo / denM.lo,
    numM.hi / denM.hi,
    numM.hi / denM.lo,
  ];
  return { ratio: r, lo: Math.min(...candidates), hi: Math.max(...candidates) };
}

function isBaselineTrial(session: BalanceSession, trial: BalanceTrial) {
  return trial.ballId === session.baseline && (trial.skillState === "baseline" || trial.skillState === "on");
}

export function stateTrials(session: BalanceSession, state: "base" | SkillState) {
  if (state === "base" || state === "baseline") {
    return session.trials.filter((t) => isBaselineTrial(session, t) && t.skillState !== "off");
  }
  return session.trials.filter((t) => t.ballId === session.ballId && t.skillState === state);
}

const trialMetric = (trials: BalanceTrial[], get: (trial: BalanceTrial) => number) =>
  trimmedMean(trials.map(get));

export function sessionProgress(session: BalanceSession): SessionProgress {
  const base = stateTrials(session, "base").length;
  const off = stateTrials(session, "off").length;
  const on = stateTrials(session, "on").length;
  return {
    base,
    off,
    on,
    status: base && off && on ? "complete" : base || off || on ? "incomplete" : "in_progress",
  };
}

function intervalVerdict(
  ratio: number | null,
  lo: number | null,
  hi: number | null,
  targetLo: number,
  targetHi: number,
  count: number,
): VerdictLabel {
  if (count < 10 || ratio === null || lo === null || hi === null) return "insufficient";
  if (hi < targetLo || lo > targetHi) return "fail";
  if (lo < targetLo || hi > targetHi) return "retest";
  return "pass";
}

function legacyFeel(ratio: number | null, target: number, tol: number): VerdictLabel {
  if (ratio === null) return "waiting";
  const d = ratio - target;
  if (Math.abs(d) <= tol) return "pass";
  return d > 0 ? "strong" : "weak";
}

export function report(session: BalanceSession, config: BalanceConfig, filter?: ComparableFilter): BalanceRow[] {
  const comparable = !filter || sessionComparable(session, filter);
  const base = stateTrials(session, "base");
  const baseScores = base.map((t) => t.score);
  const B = trimmedMean(baseScores) || 0;

  const make = (state: SkillState | "base", ballId: BallId, trials: BalanceTrial[]): BalanceRow => {
    const scores = trials.map((t) => t.score);
    const rawCount = scores.length;
    const note = !comparable ? "不可比" : sampleNote(rawCount);
    const r = B > 0 ? ratioCI(scores, baseScores) : { ratio: null, lo: null, hi: null };
    const s = strengthTotal(config.strength[ballId] || DEFAULT_STRENGTH);
    const target = state === "off" ? 1 - config.k * s : state === "on" ? 1 : null;
    const dev = r.ratio !== null && target !== null ? r.ratio - target : null;
    let verdict: VerdictLabel | string = state === "base" || state === "baseline" ? "baseline" : "waiting";
    if (!comparable) verdict = "incomparable";
    else if (state === "off" && target !== null) {
      verdict = intervalVerdict(r.ratio, r.lo, r.hi, target - config.r0Tolerance, target + config.r0Tolerance, rawCount);
      if (verdict === "insufficient" && rawCount >= 3) verdict = legacyFeel(r.ratio, target, config.r0Tolerance);
    } else if (state === "on") {
      verdict = intervalVerdict(r.ratio, r.lo, r.hi, config.r1Min, config.r1Max, rawCount);
      if (verdict === "insufficient" && rawCount >= 3) {
        verdict =
          r.ratio === null
            ? "waiting"
            : r.ratio > config.r1Max
              ? "strong"
              : r.ratio < config.r1Min
                ? "weak"
                : "pass";
      }
    }
    return {
      ballId,
      state,
      count: rawCount,
      rawCount,
      effectiveCount: effectiveCount(rawCount),
      mean: mean(scores),
      median: median(scores),
      high: Math.max(0, ...scores),
      maxCombo: Math.max(0, ...trials.map((t) => t.maxCombo)),
      triggers: trials.reduce((a, t) => a + t.triggers, 0),
      skillScore: trials.reduce((a, t) => a + t.skillScore, 0),
      ratio: r.ratio,
      ratioLo: r.lo,
      ratioHi: r.hi,
      target,
      deviation: dev,
      verdict,
      sampleNote: note,
    };
  };

  return [
    make("base", session.baseline, base),
    make("off", session.ballId, stateTrials(session, "off")),
    make("on", session.ballId, stateTrials(session, "on")),
  ];
}

function relDelta(on: number | null, off: number | null) {
  if (on === null || off === null) return null;
  return (on - off) / Math.max(1e-6, Math.abs(off) || 1);
}

export function automaticStrength(session: BalanceSession, config?: BalanceConfig): AutoStrength {
  const empty: AutoStrength = {
    ready: false,
    scoreGain: null,
    scorePerMakeGain: null,
    safetyGain: null,
    missRateGain: null,
    rescueGain: null,
    completeRateGain: null,
    tempoGain: null,
    gapGain: null,
    gapDispersionGain: null,
    burstGain: null,
    comboGain: null,
    peakScoreGain: null,
    skillScoreShare: null,
    costReady: false,
    costGain: null,
    activeSecondsGain: null,
    skillInputGain: null,
    clickHoldGain: null,
    attributionShare: null,
    unreliable: false,
    dims: { score: null, safety: null, tempo: null, burst: null, cost: null },
    autoS: null,
    cost: "pending_input_telemetry",
  };
  const off = stateTrials(session, "off");
  const on = stateTrials(session, "on");
  const base = stateTrials(session, "base");
  if (!off.length || !on.length || !base.length) return empty;

  const b = trialMetric(base, (t) => t.score) || 0;
  const os = trialMetric(off, (t) => t.score) || 0;
  const ns = trialMetric(on, (t) => t.score) || 0;
  const ppm = (t: BalanceTrial) => t.score / Math.max(1, num(t.makes));
  const miss = (t: BalanceTrial) => num(t.misses) / Math.max(1, num(t.makes) + num(t.misses));
  const gap = (t: BalanceTrial) => num(t.maxMakeGapSeconds);
  const complete = (t: BalanceTrial) => (t.completed ? 1 : 0);
  const rescue = (t: BalanceTrial) => num(t.rescues);
  const skillShare = (t: BalanceTrial) => num(t.directScore) / Math.max(1, t.score);
  const active = (t: BalanceTrial) => num(t.skillActiveSeconds);
  const skillIn = (t: BalanceTrial) => num(t.skillInputs);
  const clickHold = (t: BalanceTrial) => num(t.clicks) + num(t.holds);

  const scoreGain = b ? ns / b - os / b : 0;
  const scorePerMakeGain = (trialMetric(on, ppm) || 0) - (trialMetric(off, ppm) || 0);
  const missRateGain = (trialMetric(off, miss) || 0) - (trialMetric(on, miss) || 0);
  const rescueGain = (trialMetric(on, rescue) || 0) - (trialMetric(off, rescue) || 0);
  const completeRateGain = (trialMetric(on, complete) || 0) - (trialMetric(off, complete) || 0);
  const gapOn = trialMetric(on, gap);
  const gapOff = trialMetric(off, gap);
  const gapGain = relDelta(gapOff, gapOn); // lower gap on skill-on is better → positive when off>on
  const gapDispersionGain =
    (stdev(off.map(gap)) - stdev(on.map(gap))) / Math.max(1, stdev(off.map(gap)) || 1);
  const comboGain = relDelta(trialMetric(on, (t) => t.maxCombo), trialMetric(off, (t) => t.maxCombo));
  const peakScoreGain = relDelta(Math.max(0, ...on.map((t) => t.score)), Math.max(0, ...off.map((t) => t.score)));
  const skillScoreShare = mean(on.map(skillShare));
  const attributionShare =
    on.reduce((a, t) => a + num(t.directScore) + num(t.skillScore), 0) /
    Math.max(1, on.reduce((a, t) => a + t.score, 0));
  const unreliable = attributionShare < 0.08 && mean(on.map((t) => t.triggers)) < 1;

  const hasInput = on.some((t) => t.clicks !== undefined || t.skillInputs !== undefined || t.skillActiveSeconds !== undefined);
  const activeSecondsGain = hasInput ? (trialMetric(on, active) || 0) - (trialMetric(off, active) || 0) : null;
  const skillInputGain = hasInput ? (trialMetric(on, skillIn) || 0) - (trialMetric(off, skillIn) || 0) : null;
  const clickHoldGain = hasInput ? (trialMetric(on, clickHold) || 0) - (trialMetric(off, clickHold) || 0) : null;
  const costReady = hasInput && activeSecondsGain !== null && skillInputGain !== null && clickHoldGain !== null;
  // Higher activation / inputs / clicks = higher cost (hurts auto S via negative weight).
  const costGain = costReady
    ? cap(
        (num(activeSecondsGain) / 60) * 0.4 +
          (num(skillInputGain) / 20) * 0.35 +
          (num(clickHoldGain) / 40) * 0.25,
      )
    : null;

  const safetyGain = cap((missRateGain + num(gapGain) + completeRateGain + cap(rescueGain / 5)) / 3);
  const tempoGain = cap((num(gapGain) + gapDispersionGain) / 2);
  const burstGain = cap((num(comboGain) + num(peakScoreGain) + skillScoreShare) / 3);
  const scoreDim = cap(scoreGain * 0.7 + cap(scorePerMakeGain / 10) * 0.3);

  const weights = { ...DEFAULT_AUTO_WEIGHTS, ...(config?.autoWeights || {}) };
  const dims = {
    score: scoreDim,
    safety: safetyGain,
    tempo: tempoGain,
    burst: burstGain,
    cost: costReady ? costGain : null,
  };

  let autoS: number | null = null;
  if (dims.score !== null && dims.safety !== null && dims.tempo !== null && dims.burst !== null) {
    autoS =
      dims.score * weights.score +
      dims.safety * weights.safety +
      dims.tempo * weights.tempo +
      dims.burst * weights.burst;
    if (costReady && dims.cost !== null) autoS += dims.cost * weights.cost;
    autoS = cap(autoS, -3, 3);
  }

  return {
    ready: true,
    scoreGain,
    scorePerMakeGain,
    safetyGain,
    missRateGain,
    rescueGain,
    completeRateGain,
    tempoGain,
    gapGain,
    gapDispersionGain,
    burstGain,
    comboGain,
    peakScoreGain,
    skillScoreShare,
    costReady,
    costGain,
    activeSecondsGain,
    skillInputGain,
    clickHoldGain,
    attributionShare,
    unreliable,
    dims,
    autoS,
    cost: costReady ? "ready" : "pending_input_telemetry",
  };
}

export function calibrateK(rows: BalanceRow[], config: BalanceConfig): number {
  return calibrateKDetailed(rows, config).k;
}

export function calibrateKDetailed(rows: BalanceRow[], config: BalanceConfig): CalibrateResult {
  let xy = 0;
  let xx = 0;
  const residuals: CalibrateResult["residuals"] = [];
  const excluded: string[] = [];
  for (const row of rows) {
    if (row.state !== "off" || row.ratio === null) {
      if (row.state === "off") excluded.push(`${row.ballId}: 缺少 R0`);
      continue;
    }
    if (row.verdict === "incomparable" || row.sampleNote === "不可比") {
      excluded.push(`${row.ballId}: 不可比`);
      continue;
    }
    if (row.rawCount < 3) {
      excluded.push(`${row.ballId}: 样本不足`);
      continue;
    }
    const s = strengthTotal(config.strength[row.ballId] || DEFAULT_STRENGTH);
    if (s <= 0) {
      excluded.push(`${row.ballId}: S≤0`);
      continue;
    }
    xy += s * (1 - row.ratio);
    xx += s * s;
  }
  const k = xx ? Math.max(0, Math.min(1, xy / xx)) : config.k;
  for (const row of rows) {
    if (row.state !== "off" || row.ratio === null) continue;
    const s = strengthTotal(config.strength[row.ballId] || DEFAULT_STRENGTH);
    if (s <= 0) continue;
    const predicted = 1 - k * s;
    residuals.push({ ballId: row.ballId, residual: row.ratio - predicted, predicted, observed: row.ratio });
  }
  const rms = residuals.length ? Math.sqrt(mean(residuals.map((r) => r.residual ** 2))) : 0;
  return { k, residuals, rms, warnNonlinear: rms > config.r0Tolerance * 1.5, excluded };
}

export type HistoricalBalanceSummary = {
  baseline: number | null;
  baselineRuns: number;
  baselineLo: number | null;
  baselineHi: number | null;
  r0: number | null;
  r0Lo: number | null;
  r0Hi: number | null;
  r0Runs: number;
  r1: number | null;
  r1Lo: number | null;
  r1Hi: number | null;
  r1Runs: number;
  targetR0: number;
  feelVerdict: VerdictLabel;
  skillVerdict: VerdictLabel;
  comparable: boolean;
  sampleNote: string;
  incomparableSessions: number;
};

export function historicalSummary(
  store: BalanceStore,
  ballId: BallId,
  filter?: ComparableFilter,
): HistoricalBalanceSummary {
  const allSessions = store.sessions;
  const comparableSessions = filter ? allSessions.filter((s) => sessionComparable(s, filter)) : allSessions;
  const incomparableSessions = filter ? allSessions.length - comparableSessions.length : 0;
  const all = comparableSessions.flatMap((s) => s.trials);
  const base = all
    .filter((t) => t.skillState === "baseline" || (t.ballId === "plain" && t.skillState === "on"))
    .map((t) => t.score);
  const off = all.filter((t) => t.ballId === ballId && t.skillState === "off").map((t) => t.score);
  const on = all.filter((t) => t.ballId === ballId && t.skillState === "on").map((t) => t.score);
  const baseCI = meanCI(base);
  const r0CI = ratioCI(off, base);
  const r1CI = ratioCI(on, base);
  const targetR0 = 1 - store.config.k * strengthTotal(store.config.strength[ballId] || DEFAULT_STRENGTH);
  const feelVerdict = intervalVerdict(
    r0CI.ratio,
    r0CI.lo,
    r0CI.hi,
    targetR0 - store.config.r0Tolerance,
    targetR0 + store.config.r0Tolerance,
    off.length,
  );
  const skillVerdict = intervalVerdict(r1CI.ratio, r1CI.lo, r1CI.hi, store.config.r1Min, store.config.r1Max, on.length);
  const patchedFeel =
    feelVerdict === "insufficient" && off.length >= 3
      ? legacyFeel(r0CI.ratio, targetR0, store.config.r0Tolerance)
      : feelVerdict === "fail"
        ? r0CI.ratio !== null && r0CI.ratio > targetR0
          ? "strong"
          : "weak"
        : feelVerdict;
  const patchedSkill =
    skillVerdict === "insufficient" && on.length >= 3
      ? r1CI.ratio === null
        ? "waiting"
        : r1CI.ratio > store.config.r1Max
          ? "strong"
          : r1CI.ratio < store.config.r1Min
            ? "weak"
            : "pass"
      : skillVerdict === "fail"
        ? r1CI.ratio !== null && r1CI.ratio > store.config.r1Max
          ? "strong"
          : "weak"
        : skillVerdict;

  return {
    baseline: baseCI.mean,
    baselineRuns: base.length,
    baselineLo: baseCI.lo,
    baselineHi: baseCI.hi,
    r0: r0CI.ratio,
    r0Lo: r0CI.lo,
    r0Hi: r0CI.hi,
    r0Runs: off.length,
    r1: r1CI.ratio,
    r1Lo: r1CI.lo,
    r1Hi: r1CI.hi,
    r1Runs: on.length,
    targetR0,
    feelVerdict: patchedFeel,
    skillVerdict: patchedSkill,
    comparable: incomparableSessions === 0 || comparableSessions.length > 0,
    sampleNote: sampleNote(Math.min(base.length || 0, off.length || 0, on.length || Infinity)),
    incomparableSessions,
  };
}

export function csv(store: BalanceStore) {
  const lines = [
    "sessionId,ballId,skillState,score,maxCombo,makes,misses,maxMakeGapSeconds,effectiveSeconds,completed,endReason,clicks,holds,skillInputs,skillActiveSeconds,triggers,skillScore,directMakes,directScore,rescues,unattributedScore,timestamp,gameRev,configKey,scene,playMode",
  ];
  for (const s of store.sessions) {
    for (const t of s.trials) {
      lines.push(
        [
          t.sessionId,
          t.ballId,
          t.skillState,
          t.score,
          t.maxCombo,
          t.makes ?? "",
          t.misses ?? "",
          t.maxMakeGapSeconds ?? "",
          t.effectiveSeconds ?? "",
          t.completed ?? "",
          t.endReason ?? "",
          t.clicks ?? "",
          t.holds ?? "",
          t.skillInputs ?? "",
          t.skillActiveSeconds ?? "",
          t.triggers,
          t.skillScore,
          t.directMakes ?? "",
          t.directScore ?? "",
          t.rescues ?? "",
          t.unattributedScore ?? "",
          t.timestamp,
          t.gameRev,
          JSON.stringify(t.configKey),
          s.scene,
          s.playMode || "minute",
        ]
          .map((v) => `"${String(v).replaceAll('"', '""')}"`)
          .join(","),
      );
    }
  }
  return "\ufeff" + lines.join("\n");
}

/**
 * Supplemental “skill-only efficiency” harness for independently triggerable skills.
 * Results must not mix into normal B / R0 / R1 aggregates.
 */
export type SkillEfficiencyNote = {
  available: boolean;
  message: string;
};

export function skillEfficiencyEntrance(ballId: BallId): SkillEfficiencyNote {
  const independent = new Set<BallId>(["bolt", "time", "frost", "quantum", "anti", "vector", "ninja", "champ"]);
  if (!independent.has(ballId)) {
    return { available: false, message: "该球没有可独立触发的技能入口；请用常规一分钟测试。" };
  }
  return {
    available: true,
    message: "专项仅技能效率测试为补充入口，不替代一分钟测试，也不计入 B / R0 / R1。",
  };
}
