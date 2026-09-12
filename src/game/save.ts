import { DEFAULT_GFX, type CloudMode, type Gfx, type PlayMode } from "./types";
import { DEFAULT_BALL, parseBall, type BallId } from "./balls";

const KEY = "tq-bounce-v1";
const VERSION = 10;

export type SaveData = {
  version: number;
  best: number;
  bestMinute: number;
  /** Deepest stage reached in a rogue run. */
  bestRogue: number;
  playMode: PlayMode;
  master: number;
  music: number;
  sfx: number;
  lastMaster: number;
  lastMusic: number;
  lastSfx: number;
  gfx: Gfx;
  devUnlocked: boolean;
  ball: BallId;
};

const defaults: SaveData = {
  version: VERSION,
  best: 0,
  bestMinute: 0,
  bestRogue: 0,
  playMode: "classic",
  master: 0.5,
  music: 0.5,
  sfx: 0.5,
  lastMaster: 0.5,
  lastMusic: 0.5,
  lastSfx: 0.5,
  gfx: { ...DEFAULT_GFX },
  devUnlocked: false,
  ball: DEFAULT_BALL,
};

function clamp01(n: number, fallback: number) {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

function parseClouds(v: unknown): CloudMode {
  return v === "off" || v === "drift" || v === "dance" ? v : DEFAULT_GFX.clouds;
}

function parsePlayMode(v: unknown): PlayMode {
  if (v === "minute" || v === "rogue") return v;
  return "classic";
}

function parseGfx(raw: Partial<Gfx> | undefined): Gfx {
  return {
    clouds: parseClouds(raw?.clouds),
    ballShade: raw?.ballShade !== false,
    ballShadow: raw?.ballShadow !== false,
    particles: raw?.particles !== false,
    graffitiFx: raw?.graffitiFx !== false,
    impact: raw?.impact !== false,
    flash: raw?.flash !== false,
    buzzerSpot: raw?.buzzerSpot !== false,
  };
}

function migrate(raw: SaveData & { muted?: boolean; gfx?: Partial<Gfx> }): SaveData {
  const muted = Boolean(raw.muted);
  const ver = Number(raw.version) || 1;
  if (ver < 3) {
    return {
      ...defaults,
      best: Number.isFinite(raw.best) ? Math.max(0, Math.floor(raw.best)) : 0,
      master: muted ? 0 : defaults.master,
      lastMaster: defaults.lastMaster,
    };
  }
  const master = muted ? 0 : clamp01(raw.master, defaults.master);
  const music = clamp01(raw.music, defaults.music);
  const sfx = clamp01(raw.sfx, defaults.sfx);
  return {
    version: VERSION,
    best: Number.isFinite(raw.best) ? Math.max(0, Math.floor(raw.best)) : 0,
    bestMinute: Number.isFinite(raw.bestMinute) ? Math.max(0, Math.floor(raw.bestMinute)) : 0,
    bestRogue: Number.isFinite(raw.bestRogue) ? Math.max(0, Math.floor(raw.bestRogue)) : 0,
    playMode: parsePlayMode(raw.playMode),
    master,
    music,
    sfx,
    lastMaster: clamp01(raw.lastMaster, master > 0 ? master : defaults.lastMaster),
    lastMusic: clamp01(raw.lastMusic, music > 0 ? music : defaults.lastMusic),
    lastSfx: clamp01(raw.lastSfx, sfx > 0 ? sfx : defaults.lastSfx),
    gfx: parseGfx(raw.gfx),
    devUnlocked: Boolean(raw.devUnlocked),
    ball: parseBall(raw.ball),
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaults };
    return migrate(JSON.parse(raw) as SaveData & { muted?: boolean });
  } catch {
    return { ...defaults };
  }
}

export function writeSave(data: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...data, version: VERSION }));
  } catch {
    /* private mode / quota */
  }
}
