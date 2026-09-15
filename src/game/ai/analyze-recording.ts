/**
 * Offline summary of a hand-play JSON (`src/game/record` schema).
 * Same metrics we mined from the ninja classic 360 demo.
 */
import type { PlayEvent, PlayRecording, PlayRecordingPack, PlaySample, PlayTap } from "../record/types.ts";

export type RecordingSummary = {
  mode: string;
  ballId: string;
  duration: number;
  score: number;
  combo: number;
  taps: number;
  playerTaps: number;
  eventCounts: Record<string, number>;
  finishes: { bank: number; rim: number; swish: number; other: number };
  finishShare: { bank: number; rim: number; swish: number };
  makeGapsSec: number[];
  medianMakeGap: number | null;
  firstTapDxBeforeMake: number[];
  medianFirstTapDx: number | null;
  firstTapDxP25: number | null;
  firstTapDxP75: number | null;
  tapsInWindowBeforeMake: number[];
  medianTapsBeforeMake: number | null;
  wraps: number;
  wrapsScoredWithin: number;
  wrapScoreWindowSec: number;
  boardYRatios: number[];
  medianBoardYRatio: number | null;
  scoreRate: number | null;
  antiSpawns: number;
  antiCollects: number;
  holeOpens: number;
  holeCloses: number;
  antiOrbSamples: number;
  antiIds: number[];
};

const PRE_MAKE = 1.6;
const WRAP_SCORE = 2.5;

function percentile(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const i = Math.min(a.length - 1, Math.max(0, Math.round((a.length - 1) * p)));
  return a[i]!;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid]! : (a[mid - 1]! + a[mid]!) / 2;
}

function sampleAt(samples: PlaySample[], t: number): PlaySample | null {
  if (!samples.length) return null;
  let best = samples[0]!;
  let bestD = Math.abs(best.t - t);
  for (const s of samples) {
    const d = Math.abs(s.t - t);
    if (d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

function boardYRatio(s: PlaySample): number | null {
  if (!(s.bh > 1)) return null;
  const bottom = s.by + s.bh;
  return (bottom - s.y) / s.bh;
}

export function summarizePlayRecording(
  rec: PlayRecording,
  opts: { preMakeSec?: number; wrapScoreSec?: number } = {},
): RecordingSummary {
  const preMake = opts.preMakeSec ?? PRE_MAKE;
  const wrapScoreSec = opts.wrapScoreSec ?? WRAP_SCORE;
  const scores = rec.events.filter((e) => e.kind === "score" && !e.ghost);
  const wraps = rec.events.filter((e) => e.kind === "wrap");
  const banks = rec.events.filter((e) => e.kind === "bank");
  const eventCounts: Record<string, number> = {};
  for (const e of rec.events) eventCounts[e.kind] = (eventCounts[e.kind] ?? 0) + 1;

  const finishes = { bank: 0, rim: 0, swish: 0, other: 0 };
  for (const e of scores) {
    if (e.finish === "bank") finishes.bank += 1;
    else if (e.finish === "rim") finishes.rim += 1;
    else if (e.finish === "swish") finishes.swish += 1;
    else finishes.other += 1;
  }
  const finished = finishes.bank + finishes.rim + finishes.swish;
  const finishShare = {
    bank: finished ? finishes.bank / finished : 0,
    rim: finished ? finishes.rim / finished : 0,
    swish: finished ? finishes.swish / finished : 0,
  };

  const makeTs = scores.map((e) => e.t);
  const makeGapsSec: number[] = [];
  for (let i = 1; i < makeTs.length; i++) makeGapsSec.push(makeTs[i]! - makeTs[i - 1]!);

  const firstTapDxBeforeMake: number[] = [];
  const tapsInWindowBeforeMake: number[] = [];
  for (const sc of scores) {
    const win = rec.taps.filter((t) => t.t <= sc.t && t.t >= sc.t - preMake);
    tapsInWindowBeforeMake.push(win.length);
    const first = win[0];
    if (!first) continue;
    const s = sampleAt(rec.samples, first.t);
    const hx = s?.hx ?? sc.x;
    if (hx == null) continue;
    firstTapDxBeforeMake.push(Math.abs(first.x - hx));
  }

  let wrapsScoredWithin = 0;
  for (const w of wraps) {
    if (scores.some((sc) => sc.t >= w.t && sc.t <= w.t + wrapScoreSec)) {
      wrapsScoredWithin += 1;
    }
  }

  const boardYRatios: number[] = [];
  for (const b of banks) {
    const near = scores.some((sc) => Math.abs(sc.t - b.t) < 0.45);
    if (!near) continue;
    const s = sampleAt(rec.samples, b.t);
    if (!s) continue;
    const r = boardYRatio(s);
    if (r != null && Number.isFinite(r)) boardYRatios.push(r);
  }

  const playerTaps = rec.taps.filter((t) => t.src === "player").length;
  return {
    mode: rec.mode,
    ballId: rec.ballId,
    duration: rec.duration,
    score: rec.score,
    combo: rec.combo,
    taps: rec.taps.length,
    playerTaps,
    eventCounts,
    finishes,
    finishShare,
    makeGapsSec,
    medianMakeGap: median(makeGapsSec),
    firstTapDxBeforeMake,
    medianFirstTapDx: median(firstTapDxBeforeMake),
    firstTapDxP25: percentile(firstTapDxBeforeMake, 0.25),
    firstTapDxP75: percentile(firstTapDxBeforeMake, 0.75),
    tapsInWindowBeforeMake,
    medianTapsBeforeMake: median(tapsInWindowBeforeMake),
    wraps: wraps.length,
    wrapsScoredWithin,
    wrapScoreWindowSec: wrapScoreSec,
    boardYRatios,
    medianBoardYRatio: median(boardYRatios),
    scoreRate: rec.duration > 0 ? rec.score / rec.duration : null,
    antiSpawns: rec.events.filter((e) => e.kind === "anti-spawn").length,
    antiCollects: rec.events.filter((e) => e.kind === "anti-collect").length,
    holeOpens: rec.events.filter((e) => e.kind === "hole-open").length,
    holeCloses: rec.events.filter((e) => e.kind === "hole-close").length,
    antiOrbSamples: rec.samples.filter((s) => s.am).length,
    antiIds: [...new Set(rec.samples.filter((s) => s.am).map((s) => s.am!.id))],
  };
}

export function formatRecordingSummary(s: RecordingSummary): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const lines = [
    `${s.ballId} ${s.mode}  ${s.score} pts / ${s.duration.toFixed(1)}s` +
      (s.scoreRate != null ? `  (${s.scoreRate.toFixed(2)} pts/s)` : "") +
      `  combo ${s.combo}`,
    `taps ${s.taps} (player ${s.playerTaps})`,
    `events ${JSON.stringify(s.eventCounts)}`,
    `finishes bank ${s.finishes.bank} (${pct(s.finishShare.bank)})  rim ${s.finishes.rim} (${pct(s.finishShare.rim)})  swish ${s.finishes.swish} (${pct(s.finishShare.swish)})`,
    `median make gap ${s.medianMakeGap?.toFixed(2) ?? "—"}s`,
    `median first-tap |dx| in ${PRE_MAKE}s before make ${s.medianFirstTapDx?.toFixed(0) ?? "—"}px` +
      (s.firstTapDxP25 != null && s.firstTapDxP75 != null
        ? ` (p25–p75 ${s.firstTapDxP25.toFixed(0)}–${s.firstTapDxP75.toFixed(0)})`
        : ""),
    `median taps in that window ${s.medianTapsBeforeMake ?? "—"}`,
    `wraps ${s.wraps}, scored within ${s.wrapScoreWindowSec}s: ${s.wrapsScoredWithin}`,
    `median board-Y ratio (1=top) near banks ${s.medianBoardYRatio?.toFixed(2) ?? "—"}`,
  ];
  if (s.antiSpawns || s.antiCollects || s.holeOpens || s.antiOrbSamples) {
    lines.push(
      `antimatter spawn ${s.antiSpawns} collect ${s.antiCollects}  hole open ${s.holeOpens} close ${s.holeCloses}  orb samples ${s.antiOrbSamples} ids [${s.antiIds.join(",")}]`,
    );
  }
  return lines.join("\n");
}

function isSession(raw: unknown): raw is PlayRecording {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as PlayRecording;
  return Array.isArray(r.samples) && Array.isArray(r.taps) && Array.isArray(r.events);
}

/** v1 file or last session of a v2 pack. */
export function parseRecordingJson(raw: unknown): PlayRecording {
  const sessions = parseRecordingSessions(raw);
  const last = sessions[sessions.length - 1];
  if (!last) throw new Error("recording has no sessions");
  return last;
}

/** v1 → one session; v2 pack → every session. */
export function parseRecordingSessions(raw: unknown): PlayRecording[] {
  if (!raw || typeof raw !== "object") throw new Error("recording is not an object");
  const r = raw as PlayRecording | PlayRecordingPack;
  if ("sessions" in r && Array.isArray(r.sessions)) {
    if (!r.sessions.every(isSession)) throw new Error("pack session missing samples/taps/events");
    return r.sessions;
  }
  if (!isSession(r)) throw new Error("recording missing samples/taps/events");
  return [r];
}

export type { PlayEvent, PlayRecording, PlayRecordingPack, PlaySample, PlayTap };
