import { createAudio } from "./audio";
import { primeArt, artProgress } from "./art";
import { canvasDpr } from "./perf";
import {
  buildNet,
  collapseNet,
  netNearHoop,
  netRestBottom,
  netShouldCollide,
  nudgeNet,
  stepNet,
  tugNet,
  RIM_RY,
} from "./net";
import { boardGeom, drawBoot, drawScene } from "./render";
import { loadSave, writeSave } from "./save";
import { getBall, parseBall, type BallId } from "./balls";
import { makeChain, resetChain, stepChain, type Chain } from "./chain";
import { DEFAULT_PHYS, clampPhys, clampPhysKey, wantDevQuery, type DevCmd, type DevPhys, type DevSceneId } from "./dev";
import type { GrafKey } from "./scenes";
import type { Ball, Callout, Gfx, Hoop, HudState, Particle, Phase, TrailPt, World } from "./types";
import { FIRE_BLAZE, FIRE_IGNITE, FIRE_SMOKE, FIRE_WHITE, fireStage } from "./types";

export const GAME_REV = 207;

const STEP = 1 / 60;
const TIMER_START = 15;
const TIMER_MIN = 2.6;
const TIMER_DECAY = 0.972;
const COMBO_STOP = 4;
const GRAF_IN = 1.2;
const COMBO_DROP = 2;
const BLAZE_DROP = 2.5;
const BUZZER_WINDOW = 5;
const HOOP_HOLD = 0.72;
const FIRE_HOLD = 1.35;
const PRISON_DEF_MAX = 50;
const PRISON_BANK_STEP = 0.05;
const PRISON_HIT_COST = 2;
const MOVE_SPD0_LO = 0.048;
const MOVE_SPD0_HI = 0.078;
const MOVE_SPD_CAP_LO = 0.13;
const MOVE_SPD_CAP_HI = 0.2;
const MOVE_SPD_STEP = 0.008;
const STAGE_WHITE = FIRE_WHITE;
const STAGE_SMOKE = FIRE_SMOKE;
const STAGE_IGNITE = FIRE_IGNITE;
const STAGE_BLAZE = FIRE_BLAZE;

export type GameHandle = {
  destroy: () => void;
  start: () => void;
  retry: () => void;
  pause: () => void;
  resume: () => void;
  goTitle: () => void;
  setMix: (next: { master?: number; music?: number; sfx?: number }) => void;
  toggleBus: (bus: "master" | "music" | "sfx") => void;
  setGfx: (next: Partial<Gfx>) => void;
  setBall: (id: BallId) => void;
  dev: (cmd: DevCmd) => void;
  resize: () => void;
};

export function rankFor(score: number): string {
  if (score <= 0) return "空气球";
  if (score < 8) return "热身中";
  if (score < 20) return "手感来了";
  if (score < 40) return "街球场王";
  if (score < 70) return "空心制造机";
  if (score < 110) return "今夜不打烊";
  return "请开始你的表演";
}

export function createGame(
  canvas: HTMLCanvasElement,
  onHud: (hud: HudState) => void,
): GameHandle {
  const rawCtx = canvas.getContext("2d", { alpha: false });
  if (!rawCtx) throw new Error("Canvas 2D unavailable");
  const ctx = rawCtx;
  primeArt();
  const audio = createAudio();
  const save = loadSave();
  const reduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let world: World = layout(390, 844);
  let phase: Phase = "title";
  let booted = artProgress().ready;
  let lastLoadN = booted ? 100 : -1;
  let score = 0;
  let best = save.best;
  let combo = 0;
  let streak = 0;
  let mix = {
    master: save.master,
    music: save.music,
    sfx: save.sfx,
  };
  let mixLast = {
    master: save.lastMaster,
    music: save.lastMusic,
    sfx: save.lastSfx,
  };
  let gfx: Gfx = { ...save.gfx };
  let ballId: BallId = parseBall(save.ball);
  let paused = false;
  let hint = true;
  let devUnlocked = save.devUnlocked || wantDevQuery();
  let devOn = false;
  let devScene: DevSceneId = "void";
  let devFreeze = false;
  let devHoldHeat = false;
  let devPhys: DevPhys = { ...DEFAULT_PHYS };
  audio.setMix(mix);

  let ball = makeBall(world, 1);
  let hoop = makeHoop(world, -1, true);
  let other: Hoop | null = null;
  let particles: Particle[] = [];
  let callouts: Callout[] = [];
  let trail: TrailPt[] = [];
  let ghostX = 0;
  let ghostY = 0;
  let chain: Chain | null = getBall(ballId).chain
    ? makeChain(ball.x, ball.y, ball.r, hoop.side < 0 ? 1 : -1)
    : null;
  let prisonMode: "shackle" | "free" | null = getBall(ballId).chain ? "shackle" : null;
  let prisonDef = PRISON_DEF_MAX;
  let prisonBank = 0;
  let prisonShackleMakes = 0;
  let prisonFreeBonus = 0;

  function isPrison() {
    return getBall(ballId).chain === true;
  }

  function hasChain() {
    return isPrison() && prisonMode === "shackle";
  }

  function chainSide(): -1 | 1 {
    return hoop.side < 0 ? 1 : -1;
  }

  function syncChain() {
    if (!hasChain()) {
      chain = null;
      return;
    }
    if (!chain) chain = makeChain(ball.x, ball.y, ball.r, chainSide());
    else resetChain(chain, ball.x, ball.y, ball.r, chainSide());
  }

  function resetPrisonRun() {
    if (!isPrison()) {
      prisonMode = null;
      prisonDef = PRISON_DEF_MAX;
      prisonBank = 0;
      prisonShackleMakes = 0;
      prisonFreeBonus = 0;
      chain = null;
      return;
    }
    prisonMode = "shackle";
    prisonDef = PRISON_DEF_MAX;
    prisonBank = 0;
    prisonShackleMakes = 0;
    prisonFreeBonus = 0;
    syncChain();
  }

  function enterPrisonShackle() {
    prisonMode = "shackle";
    prisonDef = PRISON_DEF_MAX;
    prisonBank = 0;
    prisonShackleMakes = 0;
    prisonFreeBonus = 0;
    timerArmed = false;
    timeUp = false;
    buzzer = false;
    buzzerTimer = 0;
    streak = 0;
    comboCounting = true;
    comboClock = 0;
    syncChain();
    callouts.push({
      text: "枷锁",
      x: ball.x,
      y: ball.y - ball.r * 2.4,
      life: 0.9,
      max: 0.9,
      kind: "tag",
    });
    emitHud();
  }

  function tryPrisonLiberate() {
    if (!isPrison() || prisonMode !== "shackle") return;
    if (prisonBank <= 0.0001) {
      gameOver();
      return;
    }
    prisonMode = "free";
    prisonFreeBonus = prisonShackleMakes;
    chain = null;
    timer = Math.max(0.05, timerMax * Math.min(1, prisonBank));
    timerArmed = true;
    timeUp = false;
    buzzer = false;
    callouts.push({
      text: "解放",
      x: hoop.x,
      y: hoop.y - 70,
      life: 1,
      max: 1,
      kind: "tag",
    });
    if (prisonFreeBonus > 0) {
      callouts.push({
        text: `枷锁×${prisonFreeBonus}`,
        x: hoop.x,
        y: hoop.y - 108,
        life: 1,
        max: 1,
        kind: "tag",
      });
    }
    emitHud();
  }

  function hurtPrison(n: number, x: number, y: number) {
    if (!isPrison() || prisonMode !== "shackle" || phase !== "playing") return;
    if (prisonDef <= 0) return;
    prisonDef = Math.max(0, prisonDef - n);
    callouts.push({
      text: `铐-${n}`,
      x,
      y,
      life: 0.7,
      max: 0.7,
      kind: "tag",
    });
    emitHud();
    if (prisonDef <= 0) tryPrisonLiberate();
  }

  function pushChainSolid(nx: number, ny: number, nr: number): { x: number; y: number } | null {
    let x = nx;
    let y = ny;
    let hit = false;
    const rims: Hoop[] = [hoop];
    if (other) rims.push(other);
    for (const h of rims) {
      const rad = h.tube * 0.92;
      for (const p of [
        { x: h.x - h.inner, y: h.y },
        { x: h.x + h.inner, y: h.y },
      ]) {
        const dx = x - p.x;
        const dy = y - p.y;
        const dist = Math.hypot(dx, dy) || 0.0001;
        const overlap = nr + rad - dist;
        if (overlap > 0) {
          x += (dx / dist) * (overlap + 0.4);
          y += (dy / dist) * (overlap + 0.4);
          hit = true;
        }
      }
      const g = boardGeom(h, world);
      const left = g.visX;
      const right = g.visX + g.visW;
      const top = g.visY;
      const bottom = g.visY + g.bh;
      const cx = clamp(x, left, right);
      const cy = clamp(y, top, bottom);
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      if (dist < nr && dist > 0.0001) {
        const ox = (dx / dist) * (nr - dist + 0.35);
        const oy = (dy / dist) * (nr - dist + 0.35);
        x += ox;
        y += oy;
        hit = true;
      } else if (dist <= 0.0001 && x > left && x < right && y > top && y < bottom) {
        const dl = x - left;
        const dr = right - x;
        const dt = y - top;
        const db = bottom - y;
        const m = Math.min(dl, dr, dt, db);
        if (m === dl) x = left - nr;
        else if (m === dr) x = right + nr;
        else if (m === dt) y = top - nr;
        else y = bottom + nr;
        hit = true;
      }
    }
    return hit ? { x, y } : null;
  }

  function trailCap() {
    const s = fireStage(heatN());
    if (s >= 4) return 16;
    if (s >= 3) return 12;
    if (s >= 2) return 8;
    if (s >= 1) return 6;
    return 0;
  }

  let hitstop = 0;
  let time = 0;
  let acc = 0;
  let last = performance.now();
  let raf = 0;
  let running = true;
  let prevBallY = 0;
  let prevBallX = 0;
  let tapLock = 0;
  let scoredLock = 0;
  let buzzer = false;
  let buzzerTimer = 0;
  let timeUp = false;
  let timer = TIMER_START;
  let timerMax = TIMER_START;
  let timerArmed = false;
  let madeCount = 0;
  let comboClock = 0;
  let comboCounting = true;
  let opener = 0;
  let bgmOn = false;
  let cloudT = 0;
  let cloudShift = 0;
  let cloudHop = 0;
  let cloudMode: "drift" | "g1" | "g2" | "g3" = "drift";
  let cloudSx = 1;
  let cloudSy = 1;
  let recoverTo = 0;
  let recoverMakes = 0;
  let grafShow: GrafKey | null = null;
  let grafIn: { key: GrafKey; t: number } | null = null;
  let grafPrevCombo = 0;
  let grafScoreGate = 0;
  let moveChance = 0.05;
  let moveHits = 0;
  let overRim = false;
  let burnFlash = 0;
  let camShake = 0;
  let whiteFlash = 0;
  let rimHits = 0;
  let rimHitLock = 0;
  let hitBoardTop = false;
  let wentOffTop = false;
  let fromBelow = false;
  let rimAudioArmed = true;
  let glassLand = false;
  let glassBase = 20;
  let boardHitLock = 0;

  function resetShotFlags() {
    ball.hitRim = false;
    ball.hitBoard = false;
    overRim = false;
    rimHits = 0;
    hitBoardTop = false;
    wentOffTop = false;
    fromBelow = false;
  }

  function emitHud() {
    const timer01 =
      isPrison() && prisonMode === "shackle"
        ? prisonBank
        : timerMax > 0
          ? timer / timerMax
          : 0;
    onHud({
      phase,
      score,
      best,
      combo: comboCounting ? streak : 0,
      rank: rankFor(score),
      muted: mix.master <= 0.001,
      hint: hint && phase === "playing",
      paused,
      master: mix.master,
      music: mix.music,
      sfx: mix.sfx,
      loadPct: booted ? 1 : artProgress().pct,
      gfx: { ...gfx },
      dev: {
        unlocked: devUnlocked,
        on: devOn,
        scene: devScene,
        freeze: devFreeze,
        holdHeat: devHoldHeat,
        timer01,
        sear: hoop.sear,
        burning: hoop.burning || Boolean(other?.burning),
        moving: hoop.moving,
        moveKind: hoop.moveKind,
        ballId,
        phys: { ...devPhys },
      },
      ballId,
      prison: isPrison()
        ? {
            mode: prisonMode ?? "shackle",
            def: prisonDef,
            bank: prisonBank,
            bonus: prisonFreeBonus,
          }
        : null,
    });
  }

  function persist() {
    writeSave({
      version: 8,
      best,
      master: mix.master,
      music: mix.music,
      sfx: mix.sfx,
      lastMaster: mixLast.master,
      lastMusic: mixLast.music,
      lastSfx: mixLast.sfx,
      gfx: { ...gfx },
      devUnlocked,
      ball: ballId,
    });
  }

  function kitPhys(k: keyof DevPhys): number {
    const v = getBall(ballId).phys?.[k];
    if (typeof v === "number") return v;
    return k === "buoy" ? 0 : 1;
  }

  function pMul(k: keyof DevPhys): number {
    return clampPhysKey(k, devOn ? devPhys[k] : kitPhys(k));
  }

  function isGlass() {
    return getBall(ballId).score === "glass";
  }

  function hurtGlass(n: number, x: number, y: number) {
    if (!isGlass() || phase !== "playing") return;
    if (glassBase <= 0) return;
    glassBase = Math.max(0, glassBase - n);
    callouts.push({
      text: `-${n}`,
      x,
      y,
      life: 0.75,
      max: 0.75,
      kind: "base",
    });
    emitHud();
    if (glassBase <= 0) gameOver();
  }

  function applyKitPhys() {
    const next = { ...DEFAULT_PHYS };
    const phys = getBall(ballId).phys;
    if (phys) {
      (Object.keys(phys) as (keyof DevPhys)[]).forEach((k) => {
        const v = phys[k];
        if (typeof v === "number") next[k] = v;
      });
    }
    devPhys = next;
  }

  function gravity() {
    return world.h * 3.1 * pMul("grav");
  }

  function jumpVy() {
    return -Math.sqrt(2 * gravity() * world.h * 0.185 * pMul("jumpUp"));
  }

  function bounceRest(kind: "floorHi" | "floorLo" | "rim" | "board") {
    const ballK = pMul("ball");
    const floorK = pMul("floor");
    const hoopK = pMul("hoop");
    const raw =
      kind === "floorHi"
        ? 0.7 * ballK * floorK
        : kind === "floorLo"
          ? 0.64 * ballK * floorK
          : kind === "rim"
            ? 0.56 * ballK * hoopK
            : 0.76 * ballK * hoopK;
    return Math.max(0, Math.min(0.98, raw));
  }

  function jumpVx() {
    return hoop.side * world.w * 0.76 * pMul("jumpFwd");
  }

  function wrapPad() {
    return Math.max(52, world.w * 0.15);
  }

  function canHeat() {
    return getBall(ballId).heat;
  }

  function heatN() {
    return canHeat() ? combo : 0;
  }

  function applyBall(id: BallId) {
    ballId = parseBall(id);
    glassBase = 20;
    glassLand = false;
    if (!canHeat()) {
      resetTrail();
      hoop.sear = 0;
      hoop.burning = false;
      hoop.char = 0;
      if (other) {
        other.sear = 0;
        other.burning = false;
        other.char = 0;
      }
      whiteFlash = 0;
      burnFlash = 0;
    }
    if (devOn) {
      applyKitPhys();
      ball = makeBall(world, hoop.side < 0 ? 1 : -1);
      prevBallX = ball.x;
      prevBallY = ball.y;
      resetShotFlags();
      resetTrail();
    }
    syncChain();
    if (isPrison()) resetPrisonRun();
    else {
      prisonMode = null;
      prisonFreeBonus = 0;
    }
    persist();
    emitHud();
  }

  function cloudGroove(): "drift" | "g1" | "g2" | "g3" {
    if (gfx.clouds !== "dance") return "drift";
    if (phase !== "playing" || buzzer || !bgmOn) return "drift";
    const n = heatN();
    if (n >= FIRE_BLAZE) return "g3";
    if (n >= FIRE_SMOKE) return "g2";
    return "g1";
  }

  function cloudBeatMoves(i: number, mode: "g1" | "g2" | "g3") {
    if (mode === "g1") return i % 3 !== 2;
    if (mode === "g2") return i % 4 !== 2;
    return true;
  }

  function cloudHopsBefore(i: number, mode: "g1" | "g2" | "g3") {
    if (i <= 0) return 0;
    if (mode === "g1") {
      const c = Math.floor(i / 3);
      const r = i % 3;
      return c * 2 + Math.min(r, 2);
    }
    if (mode === "g2") {
      const c = Math.floor(i / 4);
      const r = i % 4;
      return c * 3 + (r === 3 ? 2 : r);
    }
    return i;
  }

  function cloudHopSteps(mode: "g1" | "g2" | "g3") {
    const beat = 60 / 90;
    const phaseT = Math.max(0, cloudT) / beat;
    const i = Math.floor(phaseT);
    const frac = phaseT - i;
    let steps = cloudHopsBefore(i, mode);
    if (cloudBeatMoves(i, mode)) {
      const u = 1 - Math.max(0, Math.min(1, frac < 0.5 ? frac / 0.5 : 1));
      steps += 1 - u * u * u;
    }
    return steps;
  }

  function stepClouds(dt: number) {
    if (gfx.clouds === "off") {
      cloudSx = 1;
      cloudSy = 1;
      return;
    }
    const w = Math.max(1, world.w);
    const mode = cloudGroove();
    if (mode === "drift") {
      cloudShift += w * 0.018 * dt;
      cloudHop = 0;
      cloudMode = "drift";
      cloudSx = 1;
      cloudSy = 1;
      return;
    }
    const beat = 60 / 90;
    const phaseT = Math.max(0, cloudT) / beat;
    const i = Math.floor(phaseT);
    const frac = phaseT - i;
    const moving = cloudBeatMoves(i, mode) && frac < 0.5;
    if (moving) {
      const s = Math.sin((frac / 0.5) * Math.PI);
      cloudSx = 1 + 0.11 * s;
      cloudSy = 1 - 0.08 * s;
    } else {
      const t = cloudBeatMoves(i, mode) ? (frac - 0.5) * beat : frac * beat + beat * 0.5;
      const damp = Math.exp(-t * 8.5);
      const wob = Math.cos(t * 19);
      cloudSx = 1 + 0.12 * wob * damp;
      cloudSy = 1 - 0.14 * wob * damp;
    }
    const steps = cloudHopSteps(mode);
    const stepPx = w / 16;
    if (cloudMode !== mode) cloudHop = steps;
    else cloudShift += (steps - cloudHop) * stepPx;
    cloudHop = steps;
    cloudMode = mode;
  }

  function ballHidden() {
    return ball.x + ball.r < 0 || ball.x - ball.r > world.w;
  }

  function onApproachSide() {
    return hoop.side > 0 ? ball.x < 0 : ball.x > world.w;
  }

  function predictBuzzerMake() {
    if (ball.scored) return false;
    const floor = world.floorY - ball.r;
    if (ball.y >= floor - 6 && ball.vy > -90) return false;

    const incoming =
      hoop.side > 0 ? ball.x < 0 && ball.vx > 24 : ball.x > world.w && ball.vx < -24;
    if (incoming && ball.y < floor - 18) return true;

    const startDist = Math.hypot(ball.x - hoop.x, ball.y - hoop.y);
    const toward = ball.vx * (hoop.x - ball.x) + ball.vy * (hoop.y - ball.y);
    if (toward <= 0 && !incoming) return false;

    let x = ball.x;
    let y = ball.y;
    let vx = ball.vx;
    let vy = ball.vy;
    const g = gravity();
    const dt = 1 / 90;
    const hx = hoop.x;
    const hy = hoop.y;
    const reach = hoop.inner + ball.r * 2.6;
    const pad = wrapPad();
    let passedRim = false;
    let closed = false;

    for (let i = 0; i < 240; i++) {
      const fallBoost = vy > 20 ? 1.28 : 1;
      const air = pMul("air");
      const buoy = pMul("buoy");
      vy += g * dt * (fallBoost - buoy);
      vx *= 1 - Math.min(0.85, 0.035 * air * dt);
      vy *= 1 - Math.min(0.85, 0.025 * air * dt);
      x += vx * dt;
      y += vy * dt;
      if (x < -pad) x = world.w + pad;
      else if (x > world.w + pad) x = -pad;
      if (y >= floor) break;

      const dist = Math.hypot(x - hx, y - hy);
      if (dist + 8 < startDist) closed = true;
      const inHole = Math.abs(x - hx) < hoop.inner - ball.r * 0.1;
      if (inHole && y + ball.r * 0.18 < hy) passedRim = true;
      if (passedRim && vy > 8 && y >= hy && inHole) return true;
      if (closed && dist < reach && y < hy + hoop.inner * 1.6) return true;
    }
    return false;
  }

  function pushTrail() {
    if (!gfx.particles || heatN() < STAGE_WHITE || ballHidden()) {
      if (heatN() < STAGE_WHITE) resetTrail();
      else {
        ghostX = ball.x;
        ghostY = ball.y;
      }
      return;
    }
    if (!trail.length) {
      ghostX = ball.x;
      ghostY = ball.y;
    }
    ghostX += (ball.x - ghostX) * 0.38;
    ghostY += (ball.y - ghostY) * 0.38;
    const last = trail[trail.length - 1];
    if (last && Math.hypot(last.x - ghostX, last.y - ghostY) < 5.2) return;
    trail.push({ x: ghostX, y: ghostY });
    const cap = trailCap();
    if (trail.length > cap) trail.splice(0, trail.length - cap);
  }

  function resetTrail() {
    trail = [];
    ghostX = ball.x;
    ghostY = ball.y;
  }

  function resize() {
    const parent = canvas.parentElement;
    const cssW = parent?.clientWidth || window.innerWidth;
    const cssH = parent?.clientHeight || window.innerHeight;
    if (cssW < 8 || cssH < 8) return;
    const dpr = canvasDpr();
    const nextW = Math.max(1, Math.floor(cssW * dpr));
    const nextH = Math.max(1, Math.floor(cssH * dpr));
    if (
      canvas.width === nextW &&
      canvas.height === nextH &&
      Math.abs(world.cssW - cssW) < 0.5 &&
      Math.abs(world.cssH - cssH) < 0.5
    ) {
      return;
    }
    canvas.width = nextW;
    canvas.height = nextH;
    const prev = world;
    world = layout(cssW, cssH);
    const sx = prev.w > 1 ? world.w / prev.w : 1;
    const sy = prev.h > 1 ? world.h / prev.h : 1;
    ball.x *= sx;
    ball.y *= sy;
    ball.r = world.ballR;
    scaleHoop(hoop, sx, sy, world);
    if (other) scaleHoop(other, sx, sy, world);
    syncChain();
  }

  function beginPlay() {
    phase = "playing";
    paused = false;
    score = 0;
    combo = 0;
    streak = 0;
    hint = true;
    madeCount = 0;
    timerMax = TIMER_START;
    timer = timerMax;
    timerArmed = false;
    buzzer = false;
    buzzerTimer = 0;
    timeUp = false;
    scoredLock = 0;
    tapLock = 0;
    comboClock = 0;
    comboCounting = true;
    opener = 0;
    bgmOn = false;
    recoverTo = 0;
    recoverMakes = 0;
    moveChance = 0.05;
    moveHits = 0;
    overRim = false;
    burnFlash = 0;
    camShake = 0;
    whiteFlash = 0;
    rimHits = 0;
    rimHitLock = 0;
    hitBoardTop = false;
    wentOffTop = false;
    fromBelow = false;
    hoop = makeHoop(world, -1, true);
    other = null;
    ball = makeBall(world, 1);
    ball.vx = jumpVx() * 0.18;
    ball.vy = jumpVy() * 0.16;
    prevBallX = ball.x;
    prevBallY = ball.y;
    particles = [];
    callouts = [];
    resetTrail();
    resetGraf();
    glassLand = false;
    glassBase = 20;
    boardHitLock = 0;
    resetPrisonRun();
    emitHud();
  }

  function gameOver() {
    if (phase === "over") return;
    phase = "over";
    paused = false;
    buzzer = false;
    buzzerTimer = 0;
    combo = 0;
    streak = 0;
    comboCounting = true;
    opener = 0;
    bgmOn = false;
    recoverTo = 0;
    recoverMakes = 0;
    resetTrail();
    if (score > best && !devOn) {
      best = score;
      persist();
    }
    audio.miss();
    emitHud();
  }

  function dropFrom(heat: number) {
    const stage = fireStage(heat);
    recoverTo =
      stage >= 4 ? STAGE_BLAZE : stage === 3 ? STAGE_IGNITE : stage === 2 ? STAGE_SMOKE : stage === 1 ? STAGE_WHITE : 0;
    recoverMakes = 0;
  }

  function dropComboStage() {
    if (combo <= 0) return;
    dropFrom(combo);
    const stage = fireStage(combo);
    combo = stage >= 4 ? STAGE_IGNITE : stage === 3 ? STAGE_SMOKE : stage === 2 ? STAGE_WHITE : 0;
    resetTrail();
    if (combo <= 0) comboCounting = true;
    noteGraf();
    emitHud();
  }

  function tapJump() {
    if (!booted) return;
    if (phase === "title") {
      audio.unlock();
      beginPlay();
    }
    if (phase !== "playing") return;
    if (paused) return;
    if (buzzer || timeUp) return;
    if (tapLock > 0) return;
    if (ballHidden() && !onApproachSide()) return;
    hint = false;
    ball.vy = jumpVy();
    ball.vx = jumpVx();
    ball.omega = ball.vx / Math.max(8, ball.r);
    ball.squash = 1.08;
    ball.scored = false;
    resetShotFlags();
    glassLand = true;
    tapLock = 0.03;
    audio.whoosh(0.5);
    emitHud();
  }

  function onDown(e: PointerEvent) {
    if (e.button !== undefined && e.button !== 0) return;
    audio.unlock();
    if (phase === "over") return;
    e.preventDefault();
    tapJump();
  }

  function onKey(e: KeyboardEvent) {
    if (e.code === "Escape") {
      e.preventDefault();
      if (phase === "playing") {
        if (paused) resumePlay();
        else pausePlay();
      }
      return;
    }
    if (e.code !== "Space" && e.code !== "ArrowUp") return;
    e.preventDefault();
    audio.unlock();
    tapJump();
  }

  function pausePlay() {
    if (phase !== "playing" || paused) return;
    paused = true;
    emitHud();
  }

  function resumePlay() {
    if (!paused) return;
    paused = false;
    last = performance.now();
    acc = 0;
    emitHud();
  }

  function goTitle() {
    phase = "title";
    paused = false;
    score = 0;
    combo = 0;
    streak = 0;
    hint = true;
    madeCount = 0;
    timerMax = TIMER_START;
    timer = timerMax;
    timerArmed = false;
    buzzer = false;
    buzzerTimer = 0;
    timeUp = false;
    opener = 0;
    bgmOn = false;
    recoverTo = 0;
    recoverMakes = 0;
    other = null;
    hoop = makeHoop(world, -1, true);
    ball = makeBall(world, 1);
    particles = [];
    callouts = [];
    resetTrail();
    audio.stopBgm();
    bgmOn = false;
    resetGraf();
    leaveSandbox();
    resetPrisonRun();
    emitHud();
  }

  function leaveSandbox() {
    devOn = false;
    devScene = "void";
    devFreeze = false;
    devHoldHeat = false;
    devPhys = { ...DEFAULT_PHYS };
  }

  function enterSandbox() {
    if (!booted) return;
    devUnlocked = true;
    persist();
    devOn = true;
    if (!devScene) devScene = "void";
    beginPlay();
    hint = false;
    timerArmed = false;
    timer = timerMax;
    devFreeze = true;
    devHoldHeat = true;
    madeCount = 1;
    applyKitPhys();
    emitHud();
  }

  function applyMoveKind(kind: -1 | 0 | 1 | 2 | 3 | 4) {
    if (kind < 0) {
      hoop.moving = false;
      hoop.moveKind = 0;
      hoop.y = hoop.baseY || hoop.y;
      hoop.x = hoop.baseX || hoop.x;
      hoop.targetX = hoop.x;
      return;
    }
    hoop.moving = true;
    hoop.moveKind = kind === 1 || kind === 2 || kind === 3 || kind === 4 ? kind : 0;
    hoop.baseY = hoop.y;
    hoop.baseX = hoop.x;
    hoop.moveDir = 1;
    hoop.moveAmp = (MOVE_SPD0_LO + MOVE_SPD0_HI) * 0.5;
    hoop.moveT = 0;
  }

  function applyDev(cmd: DevCmd) {
    switch (cmd.t) {
      case "unlock":
        devUnlocked = true;
        persist();
        emitHud();
        return;
      case "enter":
        enterSandbox();
        return;
      case "exit":
        audio.unlock();
        goTitle();
        return;
      case "scene":
        if (!devOn) enterSandbox();
        devScene = cmd.id;
        if (cmd.id !== "void") resetGraf();
        emitHud();
        return;
      case "score":
        score = Math.max(0, Math.floor(cmd.n));
        emitHud();
        return;
      case "addScore":
        score = Math.max(0, score + cmd.n);
        emitHud();
        return;
      case "combo": {
        const n = Math.max(0, Math.floor(cmd.n));
        combo = n;
        streak = n;
        comboClock = 0;
        comboCounting = true;
        recoverTo = 0;
        recoverMakes = 0;
        if (n <= 0) resetTrail();
        emitHud();
        return;
      }
      case "timer01": {
        const n = Math.max(0, Math.min(1, cmd.n));
        timer = timerMax * n;
        timeUp = false;
        buzzer = false;
        emitHud();
        return;
      }
      case "freeze":
        devFreeze = cmd.on;
        emitHud();
        return;
      case "holdHeat":
        devHoldHeat = cmd.on;
        emitHud();
        return;
      case "armTimer":
        timerArmed = true;
        timeUp = false;
        buzzer = false;
        if (timer <= 0) timer = timerMax;
        emitHud();
        return;
      case "timeUp":
        timer = 0;
        timeUp = true;
        timerArmed = true;
        emitHud();
        return;
      case "buzzer":
        timer = 0;
        timeUp = true;
        timerArmed = true;
        buzzer = true;
        buzzerTimer = BUZZER_WINDOW;
        audio.buzzer();
        emitHud();
        return;
      case "fx":
        if (cmd.kind === "flash") whiteFlash = 0.14;
        else if (cmd.kind === "shake") camShake = 0.16;
        else if (cmd.kind === "burn") burnFlash = 0.16;
        else if (cmd.kind === "burst") burst(ball.x, ball.y, 22, 80);
        else if (cmd.kind === "jolt") {
          hoop.jolt = 1;
          hoop.joltDir = -1;
        } else if (cmd.kind === "opener") {
          opener = 1.6;
          emitHud();
        } else if (cmd.kind === "bgmOn") {
          audio.playBgm();
          bgmOn = true;
        } else if (cmd.kind === "bgmOff") {
          audio.stopBgm();
          bgmOn = false;
        }
        return;
      case "graf":
        if (cmd.key === "clear") resetGraf();
        else {
          if (devScene === "void") devScene = "street";
          pushGraf(cmd.key);
        }
        emitHud();
        return;
      case "sear":
        hoop.sear = cmd.n;
        if (other) other.sear = cmd.n;
        emitHud();
        return;
      case "burnNet":
        hoop.burning = cmd.on;
        hoop.char = cmd.on ? 0.5 : 0;
        if (other) {
          other.burning = cmd.on;
          other.char = cmd.on ? 0.5 : 0;
        }
        emitHud();
        return;
      case "move":
        applyMoveKind(cmd.kind);
        emitHud();
        return;
      case "resetBall":
        ball = makeBall(world, hoop.side < 0 ? 1 : -1);
        prevBallX = ball.x;
        prevBallY = ball.y;
        resetShotFlags();
        resetTrail();
        syncChain();
        emitHud();
        return;
      case "skin":
        applyBall(cmd.id);
        return;
      case "phys":
        devPhys = { ...devPhys, [cmd.k]: clampPhysKey(cmd.k, cmd.n) };
        emitHud();
        return;
      case "physReset":
        devPhys = { ...DEFAULT_PHYS };
        emitHud();
        return;
    }
  }

  function resetGraf() {
    grafShow = null;
    grafIn = null;
    grafPrevCombo = 0;
    grafScoreGate = 0;
  }

  function pushGraf(key: GrafKey) {
    if (!gfx.graffitiFx) {
      grafShow = key;
      grafIn = null;
      return;
    }
    grafIn = { key, t: 0 };
  }

  function noteGraf() {
    const gate = Math.floor(score / 500);
    if (gate > grafScoreGate) {
      grafScoreGate = gate;
      if (gate > 0) pushGraf("score500");
    }
    const prev = grafPrevCombo;
    if (canHeat()) {
      if (combo >= 20 && prev < 20) pushGraf("ignite");
      if (combo >= 40 && prev < 40) pushGraf("blaze");
      if (combo >= 50 && prev < 50) pushGraf("combo50");
    }
    grafPrevCombo = combo;
  }

  function stepGraf(dt: number) {
    if (!grafIn) return;
    grafIn.t += dt;
    if (grafIn.t >= GRAF_IN) {
      grafShow = grafIn.key;
      grafIn = null;
    }
  }

  function physics(dt: number) {
    stepGraf(dt);
    if (camShake > 0) camShake = Math.max(0, camShake - dt);
    else camShake = 0;
    if (whiteFlash > 0) whiteFlash = Math.max(0, whiteFlash - dt);
    else whiteFlash = 0;
    if (opener > 0) opener = Math.max(0, opener - dt);
    if (hitstop > 0) {
      hitstop -= dt;
      return;
    }
    if (tapLock > 0) tapLock -= dt;
    if (scoredLock > 0) scoredLock -= dt;
    if (rimHitLock > 0) rimHitLock -= dt;
    if (boardHitLock > 0) boardHitLock -= dt;
    if (burnFlash > 0) burnFlash = Math.max(0, burnFlash - dt);

    if (phase === "playing" && timerArmed && !buzzer && !timeUp && !devFreeze && !(isPrison() && prisonMode === "shackle")) {
      timer -= dt;
      if (timer <= 0) {
        timer = 0;
        timeUp = true;
        if (predictBuzzerMake()) {
          buzzer = true;
          buzzerTimer = BUZZER_WINDOW;
          audio.buzzer();
        }
      }
    } else if (buzzer && phase === "playing") {
      buzzerTimer -= dt;
      const settled =
        ball.y + ball.r >= world.floorY - 2 && Math.abs(ball.vy) < 90 && Math.abs(ball.vx) < 70;
      if (buzzerTimer <= 0 || settled) {
        if (!ball.scored) gameOver();
      }
    } else if (timeUp && !buzzer && phase === "playing") {
      if (predictBuzzerMake()) {
        buzzer = true;
        buzzerTimer = BUZZER_WINDOW;
        audio.buzzer();
      } else {
        const settled =
          ball.y + ball.r >= world.floorY - 2 && Math.abs(ball.vy) < 90 && Math.abs(ball.vx) < 70;
        if (settled && !ball.scored) gameOver();
      }
    }

    if (phase === "playing" && (streak > 0 || combo > 0) && !buzzer && !devHoldHeat) {
      comboClock += dt;
      if (fireStage(heatN()) >= 4 && comboClock >= BLAZE_DROP) {
        dropFrom(combo);
        combo = STAGE_IGNITE;
        resetTrail();
        noteGraf();
        emitHud();
      }
      if (comboCounting) {
        if (comboClock >= COMBO_STOP) {
          comboCounting = false;
          streak = 0;
          recoverMakes = 0;
          comboClock = 0;
          if (isPrison() && prisonMode === "free" && phase === "playing") {
            enterPrisonShackle();
          } else {
            emitHud();
          }
        }
      } else if (combo > 0 && comboClock >= COMBO_DROP) {
        comboClock = 0;
        dropComboStage();
      }
    }

    stepHoop(hoop, dt);
    if (other) {
      if (other.jolt > 0) other.jolt = Math.max(0, other.jolt - dt / 0.28);
      if (other.hold > 0) {
        other.hold -= dt;
        if (other.hold <= 0) {
          other.hold = 0;
          other.couple = false;
          other.jolt = 0;
          other.targetX = other.side < 0 ? -world.w * 0.42 : world.w * 1.42;
        }
      }
      const ox = other.x;
      other.x += (other.targetX - other.x) * (1 - Math.exp(-7.5 * dt));
      nudgeNet(other, other.x - ox, 0);
      const gone = other.side < 0 ? other.x < -world.w * 0.28 : other.x > world.w * 1.28;
      if (gone) other = null;
    }

    prevBallX = ball.x;
    prevBallY = ball.y;
    const live = phase === "playing" || phase === "over" || phase === "title";
    if (live) {
      const gScale = buzzer ? 0.42 : 1;
      const fallBoost = ball.vy > 20 ? 1.28 : 1;
      const buoy = pMul("buoy");
      ball.vy += gravity() * dt * (gScale * fallBoost - buoy);
      const air = pMul("air");
      const roll = pMul("roll");
      const onFloor = ball.y + ball.r >= world.floorY - 0.5 && ball.vy >= 0;
      if (onFloor) {
        ball.vx *= 1 - Math.min(0.85, 0.28 * roll * dt);
        ball.omega = ball.vx / Math.max(8, ball.r);
      } else {
        ball.vx *= 1 - Math.min(0.85, 0.035 * air * dt);
        ball.omega *= 1 - Math.min(0.85, 0.28 * air * dt);
      }
      ball.vy *= 1 - Math.min(0.85, 0.025 * air * dt);
      ball.omega = clamp(ball.omega, -16, 16);
      const move = buzzer ? 0.6 : 1;
      ball.x += ball.vx * dt * move;
      ball.y += ball.vy * dt * move;
      if (ball.y + ball.r < 0) wentOffTop = true;
      wrapX();
      pushTrail();
      ball.spin += ball.omega * dt;
      ball.squash += (1 - ball.squash) * (1 - Math.exp(-12 * dt));
      if (phase !== "title" && !ballHidden()) {
        if (scoredLock <= 0) {
          collideRim(hoop);
          if (other) collideRim(other);
        }
        collideBoard(hoop);
        if (other) collideBoard(other);
      }
      if (phase === "playing") checkScore();
      collideFloor();
      if (chain && hasChain()) {
        stepChain(
          chain,
          ball,
          chainSide(),
          world.floorY,
          gravity(),
          dt,
          phase === "title" ? undefined : pushChainSolid,
        );
      }
    }

    if (Math.hypot(ball.x - hoop.x, ball.y - hoop.y) > world.w * 0.55) {
      ball.hitRim = false;
      ball.hitBoard = false;
    }
    const rimClear = hoop.inner + ball.r * 2.8;
    const farHoop = Math.hypot(ball.x - hoop.x, ball.y - hoop.y) > rimClear;
    const farOther = !other || Math.hypot(ball.x - other.x, ball.y - other.y) > rimClear;
    if (farHoop && farOther) rimAudioArmed = true;

    const nearHoop = netNearHoop(hoop, ball);
    stepNet(hoop, ball, prevBallX, prevBallY, world, dt, time, nearHoop && netShouldCollide(hoop, ball));
    if (other) {
      const nearOther = netNearHoop(other, ball);
      stepNet(
        other,
        ball,
        prevBallX,
        prevBallY,
        world,
        dt,
        time,
        nearOther && other.couple && netShouldCollide(other, ball),
      );
      if (other.burning) {
        other.char = Math.min(1, other.char + dt / 1.05);
        emberBurst(other, dt);
        collapseNet(other);
      }
    }
    stepParticles(dt);
    for (let i = 0; i < callouts.length; ) {
      callouts[i]!.life -= dt;
      if (callouts[i]!.life <= 0) {
        callouts[i] = callouts[callouts.length - 1]!;
        callouts.pop();
      } else i += 1;
    }
  }

  function boardTravel() {
    return hoopYLimits(world);
  }

  function rollMoveSpeed() {
    const lo = Math.min(MOVE_SPD_CAP_LO, MOVE_SPD0_LO + moveHits * MOVE_SPD_STEP);
    const hi = Math.min(MOVE_SPD_CAP_HI, MOVE_SPD0_HI + moveHits * MOVE_SPD_STEP);
    return world.h * (lo + Math.random() * Math.max(0.004, hi - lo));
  }

  function stepHoop(h: Hoop, dt: number) {
    if (h.jolt > 0) h.jolt = Math.max(0, h.jolt - dt / 0.28);
    const ox = h.x;
    const oy = h.y;
    if (h.moving && h.active) {
      const inward = h.side < 0 ? 1 : -1;
      const sliding = inward > 0 ? h.x < h.baseX - 10 : h.x > h.baseX + 10;
      if (sliding) {
        h.x += (h.baseX - h.x) * (1 - Math.exp(-11 * dt));
      } else {
        const { minY, maxY } = boardTravel();
        const base = h.moveAmp > 0 ? h.moveAmp : world.h * MOVE_SPD0_LO;
        h.moveT += dt;
        if (h.moveKind === 3) {
          const amp = Math.min(20, world.w * 0.038);
          const omega = Math.max(0.5, Math.min(1.05, base / 160));
          const wantX = h.baseX + inward * (0.5 + 0.5 * Math.sin(h.moveT * omega)) * amp;
          h.x += (wantX - h.x) * (1 - Math.exp(-7 * dt));
          h.y += (h.baseY - h.y) * (1 - Math.exp(-8 * dt));
          h.targetX = wantX;
        } else if (h.moveKind === 4) {
          const rx = Math.min(16, world.w * 0.032);
          const ry = Math.min(24, world.h * 0.042);
          const cy = Math.max(minY + ry + 2, Math.min(maxY - ry - 2, h.baseY));
          const omega = Math.max(0.48, Math.min(0.95, base / 170));
          const ang = h.moveT * omega;
          const cx = h.baseX + inward * rx * 0.35;
          const wantX = cx + Math.cos(ang) * rx;
          const wantY = cy + Math.sin(ang) * ry;
          h.x += (wantX - h.x) * (1 - Math.exp(-8 * dt));
          h.y += (wantY - h.y) * (1 - Math.exp(-8 * dt));
          h.targetX = wantX;
        } else {
          h.x += (h.baseX - h.x) * (1 - Math.exp(-11 * dt));
          const down = h.moveDir > 0;
          let spd = base;
          if (h.moveKind === 1) spd = down ? base * 0.42 : base * 2.15;
          else if (h.moveKind === 2) spd = down ? base * 2.15 : base * 0.42;
          h.y += h.moveDir * spd * dt;
          if (h.y <= minY) {
            h.y = minY;
            h.moveDir = 1;
          } else if (h.y >= maxY) {
            h.y = maxY;
            h.moveDir = -1;
          }
        }
      }
    } else {
      h.x += (h.targetX - h.x) * (1 - Math.exp(-11 * dt));
      h.y += (h.baseY - h.y) * (1 - Math.exp(-8 * dt));
    }
    nudgeNet(h, h.x - ox, h.y - oy);
  }

  function collideRim(h: Hoop) {
    const rad = h.tube * 0.92;
    const pts = [
      { x: h.x - h.inner, y: h.y },
      { x: h.x + h.inner, y: h.y },
    ];
    let nx = 0;
    let ny = 0;
    let pen = 0;
    for (const p of pts) {
      const dx = ball.x - p.x;
      const dy = ball.y - p.y;
      const dist = Math.hypot(dx, dy) || 0.0001;
      const overlap = ball.r + rad - dist;
      if (overlap > pen) {
        pen = overlap;
        nx = dx / dist;
        ny = dy / dist;
      }
    }
    if (pen <= 0) return;
    ball.x += nx * (pen + 0.7);
    ball.y += ny * (pen + 0.7);
    const vn = ball.vx * nx + ball.vy * ny;
    if (vn >= 0) {
      if (Math.hypot(ball.vx, ball.vy) < 55) {
        ball.vx += nx * 70;
        ball.vy += ny * 40;
      }
      return;
    }
    const rest = bounceRest("rim");
    ball.vx -= (1 + rest) * vn * nx;
    ball.vy -= (1 + rest) * vn * ny;
    const tx = -ny;
    const ty = nx;
    const vt = ball.vx * tx + ball.vy * ty;
    const grip = Math.min(0.92, 0.08 * pMul("rimFric"));
    ball.vx -= grip * vt * tx;
    ball.vy -= grip * vt * ty;
    ball.omega += (-vt / Math.max(8, ball.r)) * 0.14 * pMul("rimFric");
    ball.omega = clamp(ball.omega, -9, 9);
    ball.hitRim = true;
    h.jolt = 1;
    h.joltDir = ball.vy < 0 ? -1 : 1;
    const throughHole = Math.abs(ball.x - h.x) < h.inner * 0.55 && ball.vy > 28;
    if (h.active && rimHitLock <= 0) {
      rimHits += 1;
      rimHitLock = 0.08;
      if (!ball.scored && !throughHole) {
        hurtGlass(2, ball.x, ball.y);
        hurtPrison(PRISON_HIT_COST, ball.x, ball.y);
      }
    }
    const impact = -vn;
    if (rimAudioArmed && !ball.scored && !throughHole && impact > 160) {
      audio.rim(Math.min(1, (impact - 120) / 520));
      rimAudioArmed = false;
    }
  }

  function collideBoard(h: Hoop) {
    const g = boardGeom(h, world);
    const left = g.visX;
    const right = g.visX + g.visW;
    const top = g.visY;
    const bottom = g.visY + g.bh;
    const cx = clamp(ball.x, left, right);
    const cy = clamp(ball.y, top, bottom);
    let dx = ball.x - cx;
    let dy = ball.y - cy;
    const inside = dx === 0 && dy === 0;
    let nx: number;
    let ny: number;
    if (inside) {
      const toL = ball.x - left;
      const toR = right - ball.x;
      const toT = ball.y - top;
      const toB = bottom - ball.y;
      const m = Math.min(toL, toR, toT, toB);
      if (m === toL) {
        nx = -1;
        ny = 0;
        ball.x = left - ball.r;
      } else if (m === toR) {
        nx = 1;
        ny = 0;
        ball.x = right + ball.r;
      } else if (m === toT) {
        nx = 0;
        ny = -1;
        ball.y = top - ball.r;
      } else {
        nx = 0;
        ny = 1;
        ball.y = bottom + ball.r;
      }
    } else {
      const dist = Math.hypot(dx, dy);
      if (dist >= ball.r) return;
      nx = dx / dist;
      ny = dy / dist;
      const overlap = ball.r - dist;
      ball.x += nx * overlap;
      ball.y += ny * overlap;
    }
    const vn = ball.vx * nx + ball.vy * ny;
    if (vn >= 0) return;
    const rest = bounceRest("board");
    ball.vx -= (1 + rest) * vn * nx;
    ball.vy -= (1 + rest) * vn * ny;
    const tx = -ny;
    const ty = nx;
    const vt = ball.vx * tx + ball.vy * ty;
    const grip = Math.min(0.92, 0.1 * pMul("boardFric"));
    ball.vx -= grip * vt * tx;
    ball.vy -= grip * vt * ty;
    ball.omega += (-vt / Math.max(8, ball.r)) * 0.2 * pMul("boardFric");
    ball.omega = clamp(ball.omega, -9, 9);
    ball.hitBoard = true;
    if (h.active && ny < -0.55) hitBoardTop = true;
    const impact = -vn;
    if (impact > 90) audio.board(Math.min(1, (impact - 60) / 520));
    if (h.active && boardHitLock <= 0 && !ball.scored) {
      boardHitLock = 0.08;
      hurtGlass(2, ball.x, ball.y);
      hurtPrison(PRISON_HIT_COST, ball.x, ball.y - ball.r);
    }
  }

  function wrapX() {
    const r = ball.r;
    const pad = wrapPad();
    const pastPad = ball.x < -r - pad || ball.x > world.w + r + pad;
    const stuckOff =
      ballHidden() &&
      ball.y + r >= world.floorY - 1 &&
      Math.abs(ball.vx) < 14 &&
      ball.vy >= 0;
    if (!pastPad && !stuckOff) return;
    if (getBall(ballId).wrap === "height") {
      ball.x = ball.x < world.w * 0.5 ? world.w + r + pad : -r - pad;
      ball.scored = false;
      resetShotFlags();
      resetTrail();
      prevBallX = ball.x;
      prevBallY = ball.y;
      syncChain();
      return;
    }
    ball.y = world.floorY - r;
    ball.vy = 0;
    ball.squash = 1;
    ball.scored = false;
    resetShotFlags();
    const roll = 44;
    if (hoop.side > 0) {
      ball.x = -r - pad;
      ball.vx = roll;
    } else {
      ball.x = world.w + r + pad;
      ball.vx = -roll;
    }
    ball.omega = ball.vx / Math.max(8, r);
    resetTrail();
    prevBallX = ball.x;
    prevBallY = ball.y;
    syncChain();
  }

  function collideFloor() {
    if (ball.y + ball.r < world.floorY) return;
    const incoming = ball.vy;
    ball.y = world.floorY - ball.r;
    if (incoming > 40) {
      const rest = bounceRest(incoming > 140 ? "floorHi" : "floorLo");
      const rebound = incoming * rest;
      if (rebound > 40) {
        if (phase !== "title") audio.bounce(Math.min(1, incoming / 900));
        ball.vy = -rebound;
        ball.vx *= 1 - Math.min(0.2, 0.03 * pMul("roll"));
        ball.squash = incoming > 220 ? 0.92 : incoming > 130 ? 0.95 : 0.97;
      } else {
        ball.vy = 0;
        if (phase !== "title" && incoming > 120) {
          audio.bounce(Math.min(1, incoming / 900));
        }
      }
      if (isGlass() && glassLand && phase === "playing") {
        hurtGlass(20, ball.x, ball.y - ball.r * 2.2);
      }
    } else if (incoming > 0) {
      ball.vy = 0;
    }
    if (Math.abs(ball.vx) < 2.2) ball.vx = 0;
    ball.omega = ball.vx / Math.max(8, ball.r);
    ball.scored = false;
    resetShotFlags();
  }

  function checkScore() {
    if (phase !== "playing") return;
    const inHole = Math.abs(ball.x - hoop.x) < hoop.inner - ball.r * 0.1;
    if (inHole && prevBallY > hoop.y && ball.y <= hoop.y && ball.vy < 0) fromBelow = true;
    if (inHole && ball.y + ball.r * 0.18 < hoop.y) overRim = true;
    if (!inHole && Math.abs(ball.x - hoop.x) > hoop.inner + ball.r * 0.35) overRim = false;
    if (ball.scored) return;
    const goingDown = ball.vy > 8;
    const below = ball.y >= hoop.y;
    if (overRim && goingDown && below && inHole) registerScore();
  }

  function registerScore() {
    ball.scored = true;
    scoredLock = 0.22;
    ball.vy += 70;
    const swish = !ball.hitRim && !ball.hitBoard;
    const bank = ball.hitBoard;
    const toilet = rimHits >= 3;
    const lucky = hitBoardTop;
    const depth = wentOffTop && swish;
    const needle = fromBelow;
    const prevStage = fireStage(heatN());
    const shackled = isPrison() && prisonMode === "shackle";
    const freed = isPrison() && prisonMode === "free";

    if (!shackled) {
      if (comboCounting) streak += 1;
      else streak = 1;
      comboCounting = true;
      comboClock = 0;
      combo = Math.max(combo, streak);
    } else {
      streak = 0;
      comboCounting = true;
      comboClock = 0;
    }

    madeCount += 1;
    if (madeCount === 1) {
      audio.playBgm();
      bgmOn = true;
      opener = 1.6;
      pushGraf("start");
    }

    if (shackled) {
      prisonShackleMakes += 1;
      prisonBank = Math.min(1, prisonBank + PRISON_BANK_STEP);
      noteGraf();
      audio.swish();
      audio.score(swish, 0);
      tugNet(hoop);
      nextHoop();
      emitHud();
      if (prisonBank >= 1 - 1e-6) tryPrisonLiberate();
      return;
    }

    let gain = isGlass() ? glassBase + streak : streak;
    if (depth) gain += 30;
    else if (needle) gain += 20;
    else if (lucky) gain += 10;
    else if (swish) gain += 3;
    if (swish && prevStage >= 1 && prevStage < 4) {
      const next =
        prevStage === 1 ? STAGE_SMOKE : prevStage === 2 ? STAGE_IGNITE : STAGE_BLAZE;
      if (combo < next) combo = next;
    }
    if (recoverTo > 0) {
      if (combo >= recoverTo) {
        recoverTo = 0;
        recoverMakes = 0;
      } else {
        recoverMakes += 1;
        if (recoverMakes >= 5) {
          combo = recoverTo;
          recoverTo = 0;
          recoverMakes = 0;
        }
      }
    }
    const extra = prevStage >= 4 ? 3 : prevStage === 3 ? 2 : prevStage >= 2 ? 1 : 0;
    gain += extra * streak;
    if (freed) gain += prisonFreeBonus;
    const clutch = buzzer || timeUp;
    const tag = clutch
      ? "绝杀"
      : depth
        ? "深水炸弹"
        : needle
          ? "穿针引线"
          : lucky
            ? "幸运弹球"
            : toilet
              ? "刷马桶"
              : swish
                ? "空心球"
                : bank
                  ? "擦板球"
                  : "";
    if (clutch) {
      gain += 5;
      buzzer = false;
      buzzerTimer = 0;
      timeUp = false;
    }
    score += gain;
    noteGraf();
    if (score > best && !devOn) {
      best = score;
      persist();
    }
    if (!timerArmed) timerArmed = true;
    audio.swish();
    audio.score(swish, heatN());
    if (!reduced) {
      const blaze = heatN() >= STAGE_BLAZE;
      const hot = heatN() >= STAGE_IGNITE;
      if (gfx.impact) hitstop = swish ? 0.04 : 0.024;
      if (gfx.flash && hot) {
        camShake = swish || blaze ? 0.16 : 0.12;
        whiteFlash = swish || blaze ? 0.14 : 0.1;
      } else if (gfx.impact && prevStage >= 2 && !hot) {
        camShake = swish ? 0.16 : 0.12;
      }
    }
    tugNet(hoop);
    const boardTop = boardGeom(hoop, world).visY;
    callouts.push({
      text: `+${gain}`,
      x: hoop.x,
      y: hoop.y - hoop.inner * RIM_RY - 14,
      capY: boardTop + 8,
      life: 0.9,
      max: 0.9,
      kind: "score",
    });
    if (freed && prisonFreeBonus > 0) {
      callouts.push({
        text: `铐+${prisonFreeBonus}`,
        x: hoop.x,
        y: hoop.y - hoop.inner * RIM_RY + 18,
        capY: boardTop + 8,
        life: 0.85,
        max: 0.85,
        kind: "tag",
      });
    }
    if (isGlass() && streak >= 2) {
      glassBase += 2;
      callouts.push({
        text: "+2",
        x: hoop.x,
        y: hoop.y - hoop.inner * RIM_RY + 18,
        capY: boardTop + 8,
        life: 0.85,
        max: 0.85,
        kind: "base",
      });
    }
    if (tag) {
      callouts.push({
        text: tag,
        x: hoop.x,
        y: hoop.y - 70,
        life: 0.95,
        max: 0.95,
        kind: "tag",
      });
    }
    timerMax = Math.max(TIMER_MIN, timerMax * TIMER_DECAY);
    timer = timerMax;
    if (freed) prisonBank = 1;
    const stage = fireStage(heatN());
    nextHoop();
    if (other && stage >= 2) {
      const sear = (stage === 2 ? 1 : stage === 3 ? 2 : 3) as 1 | 2 | 3;
      if (sear > other.sear) other.sear = sear;
      other.hold = Math.max(
        other.hold,
        stage >= 4 ? FIRE_HOLD : stage >= 3 ? 1.05 : 0.88,
      );
      if (stage >= 4) {
        other.burning = true;
        audio.burn();
        if (gfx.flash) burnFlash = 0.16;
      }
    }
    emitHud();
  }

  function nextHoop() {
    const prev = hoop;
    prev.active = false;
    prev.moving = false;
    prev.jolt = 0;
    prev.hold = HOOP_HOLD;
    prev.couple = true;
    prev.targetX = prev.x;
    other = prev;
    const side: -1 | 1 = prev.side < 0 ? 1 : -1;
    hoop = makeHoop(world, side, false, madeCount);
    hoop.x = side < 0 ? -90 : world.w + 90;
    hoop.net = buildNet(hoop);
    if (madeCount >= 50 && Math.random() < moveChance) {
      hoop.moving = true;
      hoop.moveDir = Math.random() < 0.5 ? 1 : -1;
      const pool: Array<0 | 1 | 2 | 3 | 4> = [0, 3, 4];
      if (score >= 1000) {
        pool.push(1, 2);
      }
      hoop.moveKind = pool[Math.floor(Math.random() * pool.length)]!;
      hoop.moveAmp = rollMoveSpeed();
      hoop.moveT = Math.random() * Math.PI * 2;
      moveHits += 1;
      moveChance = Math.min(0.45, moveChance + 0.02);
    }
    ball.hitRim = false;
    ball.hitBoard = false;
    overRim = false;
  }

  function burst(x: number, y: number, n: number, speed: number) {
    if (!gfx.particles) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 40,
        life: 0.3 + Math.random() * 0.4,
        max: 0.7,
        size: 2 + Math.random() * 4,
        hue: 20 + Math.random() * 40,
        spin: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 8,
      });
    }
    if (particles.length > 140) particles.splice(0, particles.length - 140);
  }

  function igniteStand(h: Hoop) {
    if (!gfx.particles) return;
    for (let i = 0; i < 28; i++) {
      const ash = Math.random() < 0.3;
      particles.push({
        x: h.x + (Math.random() - 0.5) * h.inner * 2.8,
        y: h.y - 30 + Math.random() * 70,
        vx: (Math.random() - 0.5) * 70,
        vy: -40 - Math.random() * 120,
        life: 0.45 + Math.random() * 0.55,
        max: 1,
        size: ash ? 2 + Math.random() * 3 : 3 + Math.random() * 6,
        hue: ash ? 3 + Math.random() * 6 : 14 + Math.random() * 22,
        spin: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 10,
      });
    }
  }

  function emberBurst(h: Hoop, dt: number) {
    if (!gfx.particles) return;
    const released = h.char * 6;
    const front = Math.min(5, Math.max(0, 6 - released));
    const r0 = Math.floor(front);
    if (Math.random() > 0.55 + dt * 2) return;
    const count = 1 + (Math.random() < 0.45 ? 1 : 0);
    for (let k = 0; k < count; k++) {
      const rr = Math.max(0, Math.min(5, r0 + (Math.random() < 0.35 ? 1 : 0)));
      const n = h.net[rr * 9 + Math.floor(Math.random() * 9)];
      if (!n) continue;
      particles.push({
        x: n.x + (Math.random() - 0.5) * 4,
        y: n.y + (Math.random() - 0.5) * 3,
        vx: (Math.random() - 0.5) * 10,
        vy: 6 + Math.random() * 22,
        life: 0.28 + Math.random() * 0.32,
        max: 0.7,
        size: 1.6 + Math.random() * 2.4,
        hue: 2 + Math.random() * 3,
        spin: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 4,
      });
    }
    if (particles.length > 180) particles.splice(0, particles.length - 180);
  }

  function spawnFireBits(dt: number) {
    if (!gfx.particles) return;
    if (Math.random() > 0.38 + dt) return;
    const blaze = combo >= STAGE_BLAZE;
    if (particles.length > 90) return;
    particles.push({
      x: ball.x + (Math.random() - 0.5) * ball.r * 1.4,
      y: ball.y + (Math.random() - 0.5) * ball.r * 1.4,
      vx: (Math.random() - 0.5) * 55 + ball.vx * 0.15,
      vy: -30 - Math.random() * 70 + ball.vy * 0.1,
      life: 0.14 + Math.random() * 0.18,
      max: 0.36,
      size: 1.5 + Math.random() * 2.2,
      hue: blaze ? 14 + Math.random() * 16 : 22 + Math.random() * 18,
      spin: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 10,
    });
  }

  function smokePuff(h: Hoop) {
    if (!gfx.particles) return;
    for (let i = 0; i < 10; i++) {
      particles.push({
        x: h.x + (Math.random() - 0.5) * h.inner * 2.2,
        y: h.y - 10 + Math.random() * 36,
        vx: (Math.random() - 0.5) * 28,
        vy: -12 - Math.random() * 40,
        life: 0.4 + Math.random() * 0.4,
        max: 0.8,
        size: 2 + Math.random() * 3.5,
        hue: 4 + Math.random() * 8,
        spin: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 6,
      });
    }
  }

  function stepParticles(dt: number) {
    let w = 0;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]!;
      p.vy += gravity() * (p.hue < 8 || p.hue >= 80 ? 0.04 : 0.3) * dt;
      if (p.hue < 8) {
        p.vx *= Math.exp(-5.5 * dt);
        p.vy *= Math.exp(-2.2 * dt);
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.spin += p.vr * dt;
      p.life -= dt;
      if (p.life > 0) particles[w++] = p;
    }
    particles.length = w;
  }

  function frame(now: number) {
    if (!running) return;
    try {
      const raw = (now - last) / 1000;
      last = now;
      const tick = Math.min(raw, 0.1);
      if (bgmOn) cloudT += tick;
      stepClouds(tick);
      if (!paused) {
        const dt = Math.min(raw, 0.1);
        time += dt;
        acc += dt;
        const MAX_STEPS = 3;
        let steps = 0;
        while (acc >= STEP && steps < MAX_STEPS) {
          physics(STEP);
          acc -= STEP;
          steps++;
        }
        if (acc > STEP * MAX_STEPS) acc = 0;
        if (heatN() >= STAGE_IGNITE && phase === "playing") spawnFireBits(tick);
      }

      if (world.cssW >= 8 && world.cssH >= 8 && canvas.width > 0 && canvas.height > 0) {
        const dpr = canvas.width / world.cssW;
        if (Number.isFinite(dpr) && dpr > 0) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.fillStyle = devOn && devScene === "void" ? "#d9d4cb" : "#1b2430";
          ctx.fillRect(0, 0, world.cssW, world.cssH);
          if (!booted) {
            const boot = artProgress();
            if (boot.ready) {
              booted = true;
              emitHud();
            } else {
              const n = Math.floor(boot.pct * 100);
              if (n !== lastLoadN) {
                lastLoadN = n;
                emitHud();
              }
              drawBoot(ctx, world.cssW, world.cssH, boot.pct);
            }
          }
          if (booted) {
          ctx.save();
          ctx.translate(world.ox, world.oy);
          ctx.beginPath();
          ctx.rect(0, 0, world.w, world.h);
          ctx.clip();
          const timer01 =
            isPrison() && prisonMode === "shackle"
              ? prisonBank
              : phase === "over"
                ? 1
                : timerMax > 0
                  ? timer / timerMax
                  : 0;
          const k = Number.isFinite(camShake) ? Math.min(1, Math.max(0, camShake) / 0.16) : 0;
          const amp = k > 0.002 ? 4.6 * k * k : 0;
          drawScene(
            ctx,
            world,
            hoop,
            other,
            ball,
            particles,
            callouts,
            heatN(),
            score,
            timer01,
            buzzer,
            time,
            Math.sin(time * 68) * amp,
            Math.cos(time * 91) * amp * 0.72,
            true,
            burnFlash,
            trail,
            whiteFlash,
            comboCounting && streak >= 2 && !(isPrison() && prisonMode === "shackle") ? streak : 0,
            opener > 0 && streak < 2 ? "好戏开始" : "",
            cloudShift,
            cloudSx,
            cloudSy,
            {
              show: grafShow,
              incoming: grafIn
                ? { key: grafIn.key, p: Math.max(0, Math.min(1, grafIn.t / GRAF_IN)) }
                : null,
            },
            gfx,
            devOn && devScene === "void" ? "void" : "street",
            ballId,
            isGlass() ? glassBase : -1,
            chain && hasChain() ? chain : null,
            isPrison()
              ? {
                  mode: prisonMode ?? "shackle",
                  def: prisonDef,
                  bank: prisonBank,
                  bonus: prisonFreeBonus,
                }
              : null,
          );
          ctx.restore();
          }
        }
      }
    } catch (err) {
      console.error("[tq] frame", err);
    }
    raf = requestAnimationFrame(frame);
  }

  function onVis() {
    if (document.visibilityState === "visible") {
      audio.unlock();
      last = performance.now();
      acc = 0;
    }
  }

  resize();
  emitHud();
  raf = requestAnimationFrame(frame);
  requestAnimationFrame(() => {
    if (running) resize();
  });

  canvas.addEventListener("pointerdown", onDown, { passive: false });
  window.addEventListener("keydown", onKey);
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", onVis);

  const handle: GameHandle = {
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
      if ((window as unknown as { __tq?: unknown }).__tq) {
        delete (window as unknown as { __tq?: unknown }).__tq;
      }
    },
    start() {
      if (!booted) return;
      audio.unlock();
      beginPlay();
    },
    retry() {
      audio.unlock();
      beginPlay();
    },
    pause() {
      pausePlay();
    },
    resume() {
      audio.unlock();
      resumePlay();
    },
    goTitle() {
      audio.unlock();
      goTitle();
    },
    setMix(next) {
      if (next.master != null) {
        mix.master = Math.max(0, Math.min(1, next.master));
        if (mix.master > 0.001) mixLast.master = mix.master;
      }
      if (next.music != null) {
        mix.music = Math.max(0, Math.min(1, next.music));
        if (mix.music > 0.001) mixLast.music = mix.music;
      }
      if (next.sfx != null) {
        mix.sfx = Math.max(0, Math.min(1, next.sfx));
        if (mix.sfx > 0.001) mixLast.sfx = mix.sfx;
      }
      audio.setMix(mix);
      persist();
      emitHud();
    },
    toggleBus(bus) {
      if (mix[bus] > 0.001) {
        mixLast[bus] = mix[bus];
        mix[bus] = 0;
      } else {
        mix[bus] = mixLast[bus] > 0.001 ? mixLast[bus] : 0.5;
      }
      audio.setMix(mix);
      persist();
      emitHud();
    },
    setGfx(next) {
      gfx = { ...gfx, ...next };
      if (next.clouds === "off" || next.clouds === "drift" || next.clouds === "dance") {
        gfx.clouds = next.clouds;
      }
      if (!gfx.particles) {
        particles = [];
        resetTrail();
      }
      if (!gfx.graffitiFx && grafIn) {
        grafShow = grafIn.key;
        grafIn = null;
      }
      if (!gfx.flash) {
        whiteFlash = 0;
        burnFlash = 0;
        camShake = 0;
      }
      if (!gfx.impact && !gfx.flash) camShake = 0;
      persist();
      emitHud();
    },
    setBall(id) {
      applyBall(id);
    },
    dev(cmd) {
      applyDev(cmd);
    },
    resize,
  };

  (window as unknown as { __tq: unknown }).__tq = {
    snapshot() {
      return {
        phase,
        score,
        combo,
        timer,
        timerMax,
        timerArmed,
        buzzer,
        madeCount,
        hoopInner: hoop.inner,
        ballR: ball.r,
        hold: other?.hold ?? 0,
        otherX: other?.x ?? null,
        burning: other?.burning ?? false,
        char: other?.char ?? 0,
        overRim,
        rimHits,
        hitBoardTop,
        wentOffTop,
        fromBelow,
        fireCombo: STAGE_IGNITE,
        stage: fireStage(heatN()),
        sear: other?.sear ?? 0,
        burnFlash,
        ball: { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy, r: ball.r, scored: ball.scored, omega: ball.omega },
        hoop: { x: hoop.x, y: hoop.y, side: hoop.side, inner: hoop.inner, moving: hoop.moving, moveKind: hoop.moveKind, moveDir: hoop.moveDir },
        netBottom: hoop.net.reduce((m, n) => Math.max(m, n.y), hoop.y),
        netMinY: hoop.net.reduce((m, n) => Math.min(m, n.y), hoop.y),
        netFreeMinY: hoop.net.reduce((m, n) => (n.pinned ? m : Math.min(m, n.y)), hoop.y + 400),
        netHang: hoop.net.reduce((m, n) => Math.max(m, n.y), hoop.y) - hoop.y,
        netRestBottom: netRestBottom(hoop),
        netCollide: netShouldCollide(hoop, ball),
        netPulse: hoop.netPulse,
        netWeave: "diamond",
        netRow0x: hoop.net.slice(0, 9).map((n) => Math.round(n.x)),
        netRow1x: hoop.net.slice(9, 18).map((n) => Math.round(n.x)),
        otherPulse: other?.netPulse ?? 0,
        otherNetBottom: other ? other.net.reduce((m, n) => Math.max(m, n.y), other.y) : null,
        otherNetMin: other ? other.net.reduce((m, n) => Math.min(m, n.y), other.y) : null,
        world: { w: world.w, h: world.h, floorY: world.floorY },
      };
    },
    tap: () => tapJump(),
    setCombo(n: number) {
      combo = Math.max(0, Math.floor(n));
      streak = combo;
      comboClock = 0;
      comboCounting = true;
      emitHud();
    },
    place(x: number, y: number, vx: number, vy: number) {
      ball.x = x;
      ball.y = y;
      ball.vx = vx;
      ball.vy = vy;
      prevBallX = x;
      prevBallY = y;
      ball.scored = false;
      resetShotFlags();
      resetTrail();
    },
  };

  return handle;
}

function layout(cssW: number, cssH: number): World {
  const target = 9 / 16;
  let w = cssW;
  let h = cssH;
  if (cssW / cssH > target) {
    h = cssH;
    w = h * target;
  }
  const ballR = Math.max(17, Math.min(w, h) * 0.05);
  return {
    w,
    h,
    ox: (cssW - w) / 2,
    oy: (cssH - h) / 2,
    cssW,
    cssH,
    floorY: h * 0.765,
    ballR,
    hoopInner: Math.max(22, ballR * 1.42),
    tube: Math.max(4, ballR * 0.22),
  };
}

function makeBall(world: World, side: -1 | 1): Ball {
  const x = side < 0 ? world.w * 0.22 : world.w * 0.78;
  return {
    x,
    y: world.floorY - world.ballR,
    vx: 0,
    vy: 0,
    r: world.ballR,
    spin: 0.3,
    omega: 0,
    squash: 1,
    scored: false,
    hitRim: false,
    hitBoard: false,
  };
}

function hoopYLimits(world: World) {
  const topLen = world.h * 0.182;
  const pad = Math.max(8, world.h * 0.012);
  const minY = topLen + pad;
  const maxY = world.floorY - world.ballR * 6;
  return { minY, maxY: Math.max(minY + 8, maxY) };
}

function makeHoop(world: World, side: -1 | 1, first: boolean, made = 0): Hoop {
  const inner = world.hoopInner;
  const x = side < 0 ? inner + world.w * 0.1 : world.w - inner - world.w * 0.1;
  const { minY: lo, maxY: hi } = hoopYLimits(world);
  const t = Math.min(1, made / 36);
  const minY = world.h * 0.3 + (lo - world.h * 0.3) * t;
  const maxY = world.floorY * 0.58 + (hi - world.floorY * 0.58) * t;
  const y = first ? (minY + maxY) * 0.52 : minY + Math.random() * Math.max(8, maxY - minY);
  const hoop: Hoop = {
    side,
    x,
    y,
    inner,
    tube: world.tube,
    targetX: x,
    moving: false,
    moveAmp: 0,
    moveT: 0,
    moveDir: 1,
    moveKind: 0,
    baseY: y,
    baseX: x,
    active: true,
    hold: 0,
    couple: true,
    sear: 0,
    char: 0,
    burning: false,
    netPulse: 0,
    jolt: 0,
    joltDir: 1,
    net: [],
  };
  hoop.net = buildNet(hoop);
  return hoop;
}

function scaleHoop(h: Hoop, sx: number, sy: number, world: World) {
  h.x *= sx;
  h.y *= sy;
  h.baseY *= sy;
  h.baseX *= sx;
  h.targetX *= sx;
  h.inner = world.hoopInner;
  h.tube = world.tube;
  for (const n of h.net) {
    n.x *= sx;
    n.y *= sy;
    n.px *= sx;
    n.py *= sy;
  }
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
