import type { BallId } from "../balls";
import type { PlayMode } from "../types";
import type {
  PlayEndReason,
  PlayEvent,
  PlayEventKind,
  PlayFrameInput,
  PlayRecording,
  PlayRecordingMeta,
  PlayRecordingPack,
  PlaySample,
  PlayTap,
  PlayTapSource,
} from "./types";

const STEP = 1 / 60;
/** Every 2 physics frames ≈ 30Hz. Taps/events stay full-fidelity. */
const SAMPLE_EVERY = 2;
const EVENT_DEBOUNCE = 0.05;

export type PlayRecorder = {
  enabled: () => boolean;
  live: () => boolean;
  setEnabled: (on: boolean) => void;
  beginRun: (meta: PlayRecordingMeta) => void;
  endRun: (reason: PlayEndReason, tally?: { score: number; combo: number }) => PlayRecording | null;
  tick: (frame: PlayFrameInput) => void;
  noteTap: (src: PlayTapSource, ball: { x: number; y: number; vx: number; vy: number }) => void;
  noteEvent: (
    kind: PlayEventKind,
    extra?: Omit<PlayEvent, "t" | "f" | "kind">,
  ) => void;
  /** Last archived session (v1), or the live take. */
  lastFile: () => PlayRecording | null;
  /** Whole pack (v2), including a live take if one is open. */
  exportPack: () => PlayRecordingPack | null;
  sessionCount: () => number;
  exportLive: (reason?: PlayEndReason) => PlayRecording | null;
  downloadLast: () => boolean;
  /** Drop archived sessions so the next ON starts a new pack. Keeps last export. */
  clearArchived: () => void;
  reset: () => void;
};

export type PlayRecorderOpts = {
  sampleEvery?: number;
  download?: (file: PlayRecordingPack, filename: string) => void;
  nowIso?: () => string;
};

export function createPlayRecorder(opts: PlayRecorderOpts = {}): PlayRecorder {
  const sampleEvery = Math.max(1, opts.sampleEvery ?? SAMPLE_EVERY);
  const downloadFn = opts.download ?? defaultDownloadPlayJson;
  const nowIso = opts.nowIso ?? (() => new Date().toISOString());

  let on = false;
  let running = false;
  let f = 0;
  let meta: PlayRecordingMeta | null = null;
  let recordedAt = "";
  let packAt = "";
  let samples: PlaySample[] = [];
  let taps: PlayTap[] = [];
  let events: PlayEvent[] = [];
  let sessions: PlayRecording[] = [];
  let lastFile: PlayRecording | null = null;
  let lastPack: PlayRecordingPack | null = null;
  let lastScore = 0;
  let lastCombo = 0;
  let lastHs: -1 | 1 | null = null;
  let prevRim = false;
  let prevBoard = false;
  let prevAntiId: number | null = null;
  let prevHole = false;
  let lastEventAt: Partial<Record<PlayEventKind, number>> = {};

  function tNow() {
    return round3(f * STEP);
  }

  function clearLive() {
    running = false;
    f = 0;
    meta = null;
    recordedAt = "";
    samples = [];
    taps = [];
    events = [];
    lastScore = 0;
    lastCombo = 0;
    lastHs = null;
    prevRim = false;
    prevBoard = false;
    prevAntiId = null;
    prevHole = false;
    lastEventAt = {};
  }

  function clearPack() {
    sessions = [];
    packAt = "";
    lastFile = null;
    lastPack = null;
  }

  function hasLiveData() {
    return samples.length > 0 || taps.length > 0 || events.length > 0;
  }

  function buildSession(reason: PlayEndReason, tally?: { score: number; combo: number }): PlayRecording | null {
    if (!meta || !hasLiveData()) return null;
    const score = tally?.score ?? lastScore;
    const combo = tally?.combo ?? lastCombo;
    return {
      version: 1,
      recordedAt,
      mode: meta.mode,
      ballId: meta.ballId,
      world: meta.world,
      sampleHz: Math.round(1 / STEP / sampleEvery),
      step: STEP,
      duration: tNow(),
      frames: f,
      score,
      combo,
      endReason: reason,
      samples,
      taps,
      events,
    };
  }

  function archive(reason: PlayEndReason, tally?: { score: number; combo: number }): PlayRecording | null {
    const rec = buildSession(reason, tally);
    if (rec) {
      sessions.push(rec);
      lastFile = rec;
    }
    return rec;
  }

  function buildPack(includeLive: boolean, liveReason: PlayEndReason = "stop"): PlayRecordingPack | null {
    const live = includeLive && running ? buildSession(liveReason) : null;
    const list = live ? [...sessions, live] : sessions.slice();
    if (!list.length) return null;
    return {
      version: 2,
      recordedAt: packAt || list[0]!.recordedAt,
      sessions: list,
    };
  }

  function emitDownload(pack: PlayRecordingPack) {
    downloadFn(pack, playPackFilename(pack));
  }

  return {
    enabled: () => on,
    live: () => running,
    setEnabled(next) {
      on = Boolean(next);
      if (!on) {
        running = false;
      }
    },
    beginRun(nextMeta) {
      if (!on) return;
      if (running && hasLiveData()) archive("restart");
      clearLive();
      running = true;
      meta = nextMeta;
      recordedAt = nowIso();
      if (!packAt) packAt = recordedAt;
      f = 0;
      noteStart();
    },
    endRun(reason, tally) {
      if (!on || !running) return lastFile;
      const rec = archive(reason, tally);
      clearLive();
      return rec;
    },
    tick(frame) {
      if (!on || !running) return;
      f += 1;
      lastScore = frame.score;
      lastCombo = frame.combo;
      const hoopChanged = lastHs !== null && frame.hs !== lastHs;
      if (hoopChanged) {
        pushEvent("hoop", { hs: frame.hs, x: frame.hx, y: frame.hy });
      }
      lastHs = frame.hs;
      if (frame.hitRim && !prevRim) {
        pushEvent("rim", { x: r1(frame.x), y: r1(frame.y), hs: frame.hs });
      }
      if (frame.hitBoard && !prevBoard) {
        pushEvent("bank", { x: r1(frame.x), y: r1(frame.y), hs: frame.hs });
      }
      prevRim = frame.hitRim;
      prevBoard = frame.hitBoard;
      const antiId = frame.anti?.id ?? null;
      const holeOn = Boolean(frame.hole);
      const antiChanged = antiId !== prevAntiId;
      const holeChanged = holeOn !== prevHole;
      prevAntiId = antiId;
      prevHole = holeOn;
      if (f === 1 || hoopChanged || antiChanged || holeChanged || f % sampleEvery === 0) {
        samples.push(compactSample(tNow(), f, frame));
      }
    },
    noteTap(src, ball) {
      if (!on || !running) return;
      taps.push({
        t: tNow(),
        f,
        src,
        x: r1(ball.x),
        y: r1(ball.y),
        vx: r1(ball.vx),
        vy: r1(ball.vy),
      });
    },
    noteEvent(kind, extra) {
      if (!on || !running) return;
      pushEvent(kind, extra);
    },
    lastFile: () => (running && hasLiveData() ? buildSession("stop") : lastFile),
    exportPack: () => buildPack(true) ?? lastPack,
    sessionCount: () => sessions.length + (running && hasLiveData() ? 1 : 0),
    exportLive(reason = "stop") {
      if (running && hasLiveData()) return buildSession(reason);
      return lastFile;
    },
    downloadLast() {
      const pack = buildPack(true);
      if (!pack) return false;
      lastPack = pack;
      emitDownload(pack);
      return true;
    },
    clearArchived() {
      sessions = [];
      packAt = "";
    },
    reset() {
      on = false;
      clearLive();
      clearPack();
    },
  };

  function noteStart() {
    events.push({ t: 0, f: 0, kind: "start" });
  }

  function pushEvent(kind: PlayEventKind, extra?: Omit<PlayEvent, "t" | "f" | "kind">) {
    const t = tNow();
    if (kind === "rim" || kind === "bank" || kind === "wrap") {
      const prev = lastEventAt[kind];
      if (prev !== undefined && t - prev < EVENT_DEBOUNCE) return;
    }
    lastEventAt[kind] = t;
    events.push({ t, f, kind, ...extra });
  }
}

function compactSample(t: number, f: number, frame: PlayFrameInput): PlaySample {
  const sample: PlaySample = {
    t,
    f,
    x: r1(frame.x),
    y: r1(frame.y),
    vx: r1(frame.vx),
    vy: r1(frame.vy),
    hs: frame.hs,
    hx: r1(frame.hx),
    hy: r1(frame.hy),
    hi: r1(frame.hi),
    ht: r1(frame.ht),
    hm: frame.hm,
    bx: r1(frame.bx),
    by: r1(frame.by),
    bw: r1(frame.bw),
    bh: r1(frame.bh),
    s: frame.score,
    c: frame.combo,
  };
  if (frame.anti) {
    sample.am = {
      id: frame.anti.id,
      x: r1(frame.anti.x),
      y: r1(frame.anti.y),
      r: r1(frame.anti.r),
      pct: frame.anti.pct,
    };
    sample.orbs = [sample.am];
  }
  const charge = frame.antiCharge ?? 0;
  if (charge > 0 || frame.anti || frame.hole) sample.ac = charge;
  if (frame.hole) {
    sample.ho = {
      x: r1(frame.hole.x),
      y: r1(frame.hole.y),
      r: r1(frame.hole.r),
      left: round3(frame.hole.left),
    };
  }
  return sample;
}

function r1(n: number) {
  return Math.round(n * 10) / 10;
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

export function playRecordingFilename(rec: PlayRecording): string {
  const stamp = rec.recordedAt.replace(/[:.]/g, "-");
  return `tapshot-${rec.mode}-${rec.ballId}-${rec.score}-${stamp}.json`;
}

export function playPackFilename(pack: PlayRecordingPack): string {
  const stamp = pack.recordedAt.replace(/[:.]/g, "-");
  const n = pack.sessions.length;
  const last = pack.sessions[n - 1];
  const tag = last ? `${last.mode}-${last.ballId}` : "pack";
  return `tapshot-pack-${n}g-${tag}-${stamp}.json`;
}

export function defaultDownloadPlayJson(rec: PlayRecordingPack, filename: string) {
  if (typeof document === "undefined") return;
  const blob = new Blob([JSON.stringify(rec, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Kept for tests / docs examples. */
export function emptyMeta(
  over: Partial<{ mode: PlayMode; ballId: BallId; w: number; h: number; floorY: number }> = {},
): PlayRecordingMeta {
  return {
    mode: over.mode ?? "classic",
    ballId: over.ballId ?? "plain",
    world: {
      w: over.w ?? 390,
      h: over.h ?? 844,
      floorY: over.floorY ?? 760,
    },
  };
}
