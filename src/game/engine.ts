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
import { boardGeom, braceColliders, drawBoot, drawScene } from "./render";
import { loadSave, writeSave } from "./save";
import { ballRadius, effectiveBall, getBall, parseBall, type BallId } from "./balls";
import { makeChain, resetChain, stepChain, type Chain } from "./chain";
import { DEFAULT_PHYS, clampPhys, clampPhysKey, wantDevQuery, type DevCmd, type DevPhys, type DevSceneId } from "./dev";
import type { GrafKey } from "./scenes";
import type { Ball, Callout, Gfx, Hoop, HudState, Particle, Phase, PlayMode, TrailPt, World } from "./types";
import { FIRE_BLAZE, FIRE_IGNITE, FIRE_SMOKE, FIRE_WHITE, fireStage } from "./types";
import {
  advanceRogueStage,
  applyRogueMakeMods,
  catalogOf,
  createRogueRun,
  hasChaosBase,
  hasHeroMoment,
  miniMeStacks,
  openRogueShop,
  openDevRogueShop,
  ROGUE_CAMPAIGN_STAGES,
  rogueBallRMul,
  rogueBlackholeSec,
  rogueComboWindowBonus,
  rogueDecayBase,
  rogueHoopInnerMul,
  rogueMoveChanceDelta,
  roguePhysMul,
  rogueStartStreak,
  ornamentStacks,
  settleStagePayout,
  toRogueHud,
  tryBuyOffer,
  clearRogueLoadout,
  devGrantRogue,
  devRevokeRogue,
  type RogueRun,
} from "./rogue";
import { createAiController, flagsFromKit } from "./ai";

export const GAME_REV = 294;

const STEP = 1 / 60;
const TIMER_START = 15;
const TIMER_MINUTE = 60;
const TIMER_MIN = 2.6;
const TIMER_DECAY = 0.972;
const GRAF_IN = 1.2;
const COMBO_STOP = 4;
const COMBO_DROP = 2;
const BUZZER_WINDOW = 5;
const HOOP_HOLD = 0.72;
const FIRE_HOLD = 1.35;
const FROST_DUR_FIRST = 4;
const FROST_DUR_REFRESH = 3;
const FROST_CHANCE_BASE = 0.1;
const FROST_CHANCE_PER_STREAK = 0.01;
/** Champ: bank this fraction of leftover timer per make. */
const CHAMP_BANK_RATE = 0.2;
const CHAMP_SCORE_MULT = 2;
/** After a make in champion moment, this long without another → clutch then over. */
const CHAMP_IDLE = 5;
/** Anti ball: chance to spawn antimatter pickup after a make. */
const ANTI_SPAWN_CHANCE = 0.55;
const ANTI_HOLE_DUR_MIN = 10;
const ANTI_HOLE_DUR_MAX = 20;
/** Antimatter field linger (sec) × this = seconds shaved off hole duration. */
const ANTI_LINGER_PENALTY = 0.75;
const GLASS_BASE_START = 20;
const GLASS_BASE_MAX = 50;
const GLASS_RIM_HURT = 2;
const GLASS_BANK_HURT = 1;
const GLASS_BOARD_TOP_HURT = 3;
const GLASS_LAND_HURT = 4;
const GLASS_SWISH_HEAL = 4;
/** Ignore soft scrapes / stuck contacts (glass restitution is 0). */
const GLASS_IMPACT_MIN = 95;
const FROST_BONUS_PER_HIT = 2;
const PRISON_FREE_PER_COMBO = 3;
const PRISON_FREE_EXTEND = 10;
const NINJA_DELAYS = [0.11, 0.22, 0.33] as const;
const NINJA_CLONE_AT = [10, 26, 40] as const;
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
  setPlayMode: (mode: PlayMode) => void;
  buyRogue: (uid: string) => void;
  /** Dev catalog: grant / revoke one stack. */
  grantRogue: (id: string) => void;
  revokeRogue: (id: string) => void;
  /** Clear all owned items / ornaments (shop 重置). */
  resetRogueLoadout: () => void;
  /** Dev: close catalog shop without advancing stage. */
  closeRogueShop: () => void;
  rogueContinue: () => void;
  rogueConfirmSettle: () => void;
  rogueEndless: () => void;
  rogueEndRun: () => void;
  /** Dev settle: return to sandbox play without exiting developer mode. */
  devBackFromSettle: () => void;
  /** Session-only auto-play (demo / AFK). Default off; not persisted. */
  setAutoPlay: (on: boolean) => void;
  /** Activate inventory item / usable ornament from pause. */
  useRogue: (id: string) => void;
  /** Answer连击保护 prompt. */
  answerStreakSave: (use: boolean) => void;
  /** Answer热火饮料续用 prompt. */
  answerFlameReuse: (use: boolean) => void;
  /** Rogue open-run fuse: secondary ball or null = 不融合. */
  setRogueFuse: (id: BallId | null) => void;
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
  let bestMinute = save.bestMinute ?? 0;
  let bestRogue = save.bestRogue ?? 0;
  let playMode: PlayMode =
    save.playMode === "minute" || save.playMode === "rogue" ? save.playMode : "classic";
  let rogueRun: RogueRun | null = null;
  /** Active for current rogue stage only (from rest "缓时"). */
  let rogueStageDecay: number | null = null;
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

  let ball = makeBall(world, 1, ballRadius(world.ballR, ballId));
  let hoop = makeHoop(world, -1, true);
  let other: Hoop | null = null;
  let particles: Particle[] = [];
  let callouts: Callout[] = [];
  let trail: TrailPt[] = [];
  let ghostX = 0;
  let ghostY = 0;
  let chain: Chain | null = effectiveBall(ballId, null).chain
    ? makeChain(ball.x, ball.y, ball.r, hoop.side < 0 ? 1 : -1)
    : null;
  let prisonMode: "shackle" | "free" | null = effectiveBall(ballId, null).chain
    ? "shackle"
    : null;
  let prisonTarget = 1;
  let prisonBonus = 0;
  let prisonFreeLeft = 0;
  /** Peak combo during current shackle; becomes 铐奖 base. */
  let prisonShackleBest = 0;
  /** Free-time +10s may fire once per free period. */
  let prisonFreeExtendUsed = false;
  type PathSample = { x: number; y: number; t: number };
  type NinjaGhost = {
    delay: number;
    scoredLock: number;
    x: number;
    y: number;
    prevY: number;
  };
  /** Rim snapshots so clones can score after nextHoop moves the live basket. */
  type NinjaGate = {
    x: number;
    y: number;
    inner: number;
    life: number;
    hit: boolean[];
  };
  type MiniGhost = {
    delay: number;
    x: number;
    y: number;
  };
  const autoPlay = createAiController();
  let pathHist: PathSample[] = [];
  let pathClock = 0;
  let ninjaGhosts: NinjaGhost[] = [];
  let ninjaGates: NinjaGate[] = [];
  let miniGhosts: MiniGhost[] = [];

  function activeBallR() {
    let r = world.ballR * kit().rScale;
    if (isRogueMode() && rogueRun) {
      const mul = rogueBallRMul(rogueRun);
      // 叠在球种半径上：经典→弹力球大小；弹力球再缩一半
      if (mul < 1) r *= mul;
    }
    return r;
  }

  function applyRogueHoopScale(h: Hoop) {
    if (!isRogueMode() || !rogueRun) return;
    const mul = rogueHoopInnerMul(rogueRun);
    if (mul <= 1) return;
    h.inner = world.hoopInner * mul;
    h.net = buildNet(h);
  }

  function remakeBall(side: -1 | 1) {
    ball = makeBall(world, side, activeBallR());
  }

  function holeCenter() {
    return { x: world.w * 0.5, y: world.h * 0.42 };
  }

  function fuseId(): BallId | null {
    if (!isRogueMode() || !rogueRun) return null;
    return rogueRun.fuseBall;
  }

  function kit() {
    return effectiveBall(ballId, fuseId());
  }

  function isPrison() {
    return kit().chain;
  }

  function isNinja() {
    return kit().ninja;
  }

  function bunshinActive() {
    return Boolean(
      isRogueMode() &&
        rogueRun &&
        rogueRun.buffBunshinLeft > 0 &&
        rogueRun.buffBunshinClones > 0,
    );
  }

  function miniMeActive() {
    return Boolean(isRogueMode() && rogueRun && miniMeStacks(rogueRun) > 0 && phase === "playing");
  }

  function miniMeCloneCount() {
    if (!miniMeActive() || !rogueRun) return 0;
    return Math.min(5, Math.max(1, miniMeStacks(rogueRun)));
  }

  function ninjaCloneCount() {
    if (bunshinActive() && rogueRun) {
      return Math.min(5, Math.max(1, rogueRun.buffBunshinClones));
    }
    if (!isNinja() || phase !== "playing") return 0;
    if (streak >= NINJA_CLONE_AT[2]) return 3;
    if (streak >= NINJA_CLONE_AT[1]) return 2;
    if (streak >= NINJA_CLONE_AT[0]) return 1;
    return 0;
  }

  function resetNinjaPath() {
    pathHist = [];
    pathClock = 0;
    ninjaGhosts = [];
    ninjaGates = [];
    miniGhosts = [];
  }

  function syncNinjaGhosts() {
    const n = ninjaCloneCount();
    while (ninjaGhosts.length < n) {
      const i = ninjaGhosts.length;
      ninjaGhosts.push({
        delay: NINJA_DELAYS[i] ?? 0.11 * (i + 1),
        scoredLock: 0,
        x: ball.x,
        y: ball.y,
        prevY: ball.y,
      });
    }
    if (ninjaGhosts.length > n) ninjaGhosts.length = n;
  }

  function syncMiniGhosts() {
    const n = miniMeCloneCount();
    while (miniGhosts.length < n) {
      const i = miniGhosts.length;
      miniGhosts.push({
        delay: 0.16 + i * 0.11,
        x: ball.x,
        y: ball.y,
      });
    }
    if (miniGhosts.length > n) miniGhosts.length = n;
  }

  function pushNinjaPath(dt: number) {
    if (!isNinja() && !bunshinActive() && !miniMeActive()) return;
    pathClock += dt;
    pathHist.push({ x: ball.x, y: ball.y, t: pathClock });
    const keep = pathClock - 1.05;
    while (pathHist.length > 2 && pathHist[0]!.t < keep) pathHist.shift();
  }

  function sampleNinjaPath(delay: number): { x: number; y: number } | null {
    if (pathHist.length < 2) return null;
    const target = pathClock - delay;
    const first = pathHist[0]!;
    if (target <= first.t) return { x: first.x, y: first.y };
    for (let i = 1; i < pathHist.length; i++) {
      const a = pathHist[i - 1]!;
      const b = pathHist[i]!;
      if (target <= b.t) {
        const u = (target - a.t) / Math.max(1e-6, b.t - a.t);
        return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
      }
    }
    const last = pathHist[pathHist.length - 1]!;
    return { x: last.x, y: last.y };
  }

  function ninjaClonesDraw() {
    const body = ninjaGhosts.map((g, i) => ({
      x: g.x,
      y: g.y,
      r: ball.r,
      alpha: 0.42 - i * 0.08,
    }));
    // 小小我：本体半径的一半（弹力球/儿童装已缩小后，再取其一半）
    const miniR = ball.r * 0.5;
    const mini = miniGhosts.map((g, i) => ({
      x: g.x,
      y: g.y,
      r: miniR,
      alpha: 0.4 - i * 0.06,
    }));
    return [...body, ...mini];
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

  function rollJudgment() {
    return 1 + Math.floor(Math.random() * 20);
  }

  function prisonHud() {
    if (!isPrison()) return null;
    return {
      mode: (prisonMode ?? "shackle") as "shackle" | "free",
      target: prisonTarget,
      bonus: prisonBonus,
      freeLeft: prisonFreeLeft,
    };
  }

  function resetPrisonRun() {
    if (!isPrison()) {
      prisonMode = null;
      prisonTarget = 1;
      prisonBonus = 0;
      prisonFreeLeft = 0;
      prisonFreeExtendUsed = false;
      prisonShackleBest = 0;
      chain = null;
      return;
    }
    prisonMode = "shackle";
    prisonTarget = rollJudgment();
    prisonBonus = 0;
    prisonFreeLeft = 0;
    prisonFreeExtendUsed = false;
    prisonShackleBest = 0;
    syncChain();
  }

  function resetPrisonCombo() {
    streak = 0;
    combo = 0;
    comboCounting = true;
    comboClock = 0;
    recoverTo = 0;
    recoverMakes = 0;
    shotOpen = false;
    shotMade = false;
    shotMissed = false;
    shotAirborne = false;
    resetTrail();
  }

  function markShotMissed() {
    if (shotOpen && !shotMade) shotMissed = true;
  }

  /** Break active streak (timeout or finished miss jump). Heat may keep decaying. */
  function breakComboStreak() {
    if (streak <= 0 && !comboCounting && combo <= 0) return;
    if (
      isRogueMode() &&
      rogueRun &&
      !rogueRun.pendingStreakSave &&
      streak >= 3 &&
      rogueRun.streakSaveCharges > 0
    ) {
      rogueRun.pendingStreakSave = true;
      paused = true;
      emitHud();
      return;
    }
    if (isRogueMode() && rogueRun?.streakSave) {
      rogueRun.streakSave = false;
      comboClock = 0;
      callouts.push({
        text: "连击保住",
        x: ball.x,
        y: ball.y - ball.r * 2.4,
        life: 0.9,
        max: 0.9,
        kind: "tag",
      });
      emitHud();
      return;
    }
    streak = 0;
    comboCounting = false;
    comboClock = 0;
    recoverMakes = 0;
    if (isNinja()) resetNinjaPath();
    if (holeOn && holeLeft <= 0) closeAntiHole();
    if (isPrison() && prisonMode === "free" && phase === "playing") {
      enterPrisonShackle("combo");
    } else {
      emitHud();
    }
  }

  function resolveStreakSavePrompt(use: boolean) {
    if (!isRogueMode() || !rogueRun || !rogueRun.pendingStreakSave) return;
    rogueRun.pendingStreakSave = false;
    if (use && rogueRun.streakSaveCharges > 0) {
      rogueRun.streakSaveCharges -= 1;
      rogueRun.items.streakSave = rogueRun.streakSaveCharges;
      comboClock = 0;
      callouts.push({
        text: "连击保住",
        x: ball.x,
        y: ball.y - ball.r * 2.4,
        life: 0.9,
        max: 0.9,
        kind: "tag",
      });
      paused = false;
      last = performance.now();
      acc = 0;
      emitHud();
      return;
    }
    streak = 0;
    comboCounting = false;
    comboClock = 0;
    recoverMakes = 0;
    if (isNinja()) resetNinjaPath();
    if (holeOn && holeLeft <= 0) closeAntiHole();
    if (isPrison() && prisonMode === "free" && phase === "playing") {
      enterPrisonShackle("combo");
    }
    paused = false;
    last = performance.now();
    acc = 0;
    emitHud();
  }

  /** Break streak only when opening a new shot after a settled miss — not mid-air / wrap. */
  function breakComboOnMissJump() {
    if (!shotMissed) return;
    shotMissed = false;
    breakComboStreak();
  }

  function refillPrisonTimer() {
    timer = timerMax;
    timeUp = false;
    buzzer = false;
    buzzerTimer = 0;
  }

  function enterPrisonFree(achieved: number) {
    prisonMode = "free";
    const peak = Math.max(1, achieved);
    // 铐奖 = 上一段枷锁最高连击 × 3；自由时长仍为连击 × 3 秒
    prisonBonus = peak * 3;
    prisonFreeLeft = peak * PRISON_FREE_PER_COMBO;
    prisonFreeExtendUsed = false;
    prisonShackleBest = 0;
    chain = null;
    resetPrisonCombo();
    refillPrisonTimer();
    callouts.push({
      text: "释放",
      x: hoop.x,
      y: hoop.y - 70,
      life: 1,
      max: 1,
      kind: "tag",
    });
    callouts.push({
      text: `${prisonFreeLeft.toFixed(0)}秒`,
      x: hoop.x,
      y: hoop.y - 108,
      life: 1,
      max: 1,
      kind: "tag",
    });
    emitHud();
  }

  function enterPrisonShackle(reason: "combo" | "time" | "start") {
    prisonMode = "shackle";
    prisonBonus = 0;
    prisonFreeLeft = 0;
    prisonFreeExtendUsed = false;
    prisonShackleBest = 0;
    prisonTarget = rollJudgment();
    resetPrisonCombo();
    refillPrisonTimer();
    syncChain();
    callouts.push({
      text: reason === "start" ? "审判" : "再入狱",
      x: ball.x,
      y: ball.y - ball.r * 2.6,
      life: 0.95,
      max: 0.95,
      kind: "tag",
    });
    callouts.push({
      text: `目标×${prisonTarget}`,
      x: ball.x,
      y: ball.y - ball.r * 3.6,
      life: 1.05,
      max: 1.05,
      kind: "tag",
    });
    emitHud();
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
    const s = fireStage(fxCombo());
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
  /** True after a jump until the next *new* shot opens. Mid-air re-taps keep this. */
  let shotOpen = false;
  /** True if this open shot scored (body). Survives wrap/floor clearing ball.scored. */
  let shotMade = false;
  /** Previous attempt finished without a make (floor settle) — next new jump breaks streak. */
  let shotMissed = false;
  /** Left the floor during this attempt — avoids marking miss on takeoff overlap. */
  let shotAirborne = false;
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
  let glassBase = GLASS_BASE_START;
  let frostBonus = 0;
  let champBank = 0;
  let champMode = false;
  /** Seconds left to score again in champ mode; <0 = not armed. */
  let champIdleLeft = -1;
  /** Idle timeout opened the final clutch window — make or miss ends the run. */
  let champFinishing = false;
  /** Anti ball: antimatter charge 0–100, pickups, timed black hole. */
  let antiCharge = 0;
  let antiMatter: { x: number; y: number; r: number; pct: number; age: number } | null =
    null;
  /** Sum of antimatter field linger this charge cycle (cuts hole duration). */
  let antiLingerAcc = 0;
  let holeOn = false;
  let holeX = 0;
  let holeY = 0;
  let holeR = 36;
  let holeLeft = 0;
  let holeScoreAcc = 0;
  /** Seconds the hole has been alive (for per-second scoring). */
  let holeLived = 0;
  let holeTick = 0;
  let otherOverRim = false;
  let boardHitLock = 0;
  /** Glass: one rim / board penalty per shot (ball restitution 0 rattles otherwise). */
  let glassRimHurtShot = false;
  let glassBoardHurtShot = false;

  function resetShotFlags() {
    ball.hitRim = false;
    ball.hitBoard = false;
    overRim = false;
    rimHits = 0;
    hitBoardTop = false;
    wentOffTop = false;
    fromBelow = false;
    glassRimHurtShot = false;
    glassBoardHurtShot = false;
  }

  function isMinuteMode() {
    return playMode === "minute";
  }

  function isRogueMode() {
    return playMode === "rogue";
  }

  function timerBudget() {
    if (isMinuteMode()) return TIMER_MINUTE;
    let base = TIMER_START;
    if (isRogueMode() && rogueRun && rogueRun.nextBonusClock > 0) {
      base += rogueRun.nextBonusClock;
    }
    return base;
  }

  function modeBest() {
    if (isRogueMode()) return bestRogue;
    if (isMinuteMode()) return bestMinute;
    return best;
  }

  function noteBest() {
    if (devOn) return;
    if (isRogueMode() && rogueRun) {
      const depth = rogueRun.stage;
      if (depth > bestRogue) {
        bestRogue = depth;
        persist();
      }
      return;
    }
    if (isMinuteMode()) {
      if (score > bestMinute) {
        bestMinute = score;
        persist();
      }
      return;
    }
    if (score > best) {
      best = score;
      persist();
    }
  }

  function activeDecay() {
    if (isRogueMode() && rogueRun) {
      return rogueDecayBase(rogueRun, rogueStageDecay);
    }
    return TIMER_DECAY;
  }

  function refillShotClock() {
    // Minute mode keeps a fixed 60s clock — no per-make shrink/refill.
    if (isMinuteMode() || champMode) return;
    const decay = activeDecay();
    timerMax = Math.max(TIMER_MIN, timerMax * decay);
    timer = timerMax;
  }

  function rogueTotalScore() {
    if (!rogueRun) return score;
    // Settle/hub already folded stageScore into runScore.
    if (phase === "settle" || phase === "hub" || phase === "over") {
      if (rogueRun.endless) return rogueRun.runScore + rogueRun.stageScore;
      // After a stage payout, runScore holds the banked total; avoid double-count
      // while settle UI still shows stageScore.
      if (rogueRun.lastBreakdown) return rogueRun.runScore;
      return rogueRun.runScore + rogueRun.stageScore;
    }
    return rogueRun.runScore + rogueRun.stageScore;
  }

  function emitHud() {
    const timer01 = timerMax > 0 ? timer / timerMax : 0;
    const displayScore =
      isRogueMode() && rogueRun && phase === "over" ? rogueTotalScore() : score;
    onHud({
      phase,
      score: displayScore,
      best: modeBest(),
      combo: comboCounting ? streak : 0,
      rank: rankFor(displayScore),
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
        fuseBall: fuseId(),
        phys: { ...devPhys },
        playMode,
      },
      ballId,
      playMode,
      prison: prisonHud(),
      rogue: toRogueHud(isRogueMode() ? rogueRun : null),
      autoPlay: autoPlay.enabled(),
    });
  }

  function persist() {
    writeSave({
      version: 10,
      best,
      bestMinute,
      bestRogue,
      playMode,
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
    let v = clampPhysKey(k, devOn ? devPhys[k] : kitPhys(k));
    if (!devOn && isRogueMode() && rogueRun) {
      if (k === "rimFric") v = clampPhysKey(k, v * roguePhysMul(rogueRun, "rimFric"));
      if (k === "ball") v = clampPhysKey(k, v * roguePhysMul(rogueRun, "ball"));
      if (k === "jumpFwd") v = clampPhysKey(k, v * roguePhysMul(rogueRun, "jumpFwd"));
      if (k === "jumpUp") v = clampPhysKey(k, v * roguePhysMul(rogueRun, "jumpUp"));
      if (k === "grav") v = clampPhysKey(k, v * roguePhysMul(rogueRun, "grav"));
    }
    if (!devOn && isPrison() && prisonMode) {
      if (prisonMode === "free") {
        // Free: rim/board grip 120% of classic.
        if (k === "rimFric" || k === "boardFric") v = clampPhysKey(k, v * 1.2);
      } else {
        // Shackle: mild kit nudge; iron tip swing does most of the feel.
        const m: Partial<Record<keyof DevPhys, number>> = {
          grav: 1.06,
          jumpUp: 0.94,
          jumpFwd: 0.92,
          ball: 0.92,
          air: 1.1,
          roll: 1.12,
          rimFric: 1.05,
          boardFric: 1.04,
        };
        const f = m[k];
        if (typeof f === "number") v = clampPhysKey(k, v * f);
      }
    }
    return v;
  }

  function isGlass() {
    return kit().glass;
  }

  function hurtGlass(n: number, x: number, y: number) {
    if (!isGlass() || phase !== "playing") return;
    if (glassBase <= 0) return;
    if (isRogueMode() && rogueRun && rogueRun.glassSafe > 0) {
      rogueRun.glassSafe -= 1;
      callouts.push({
        text: "安全包装",
        x,
        y: y - 40,
        life: 0.9,
        max: 0.9,
        kind: "tag",
      });
      emitHud();
      return;
    }
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
    if (glassBase <= 0) failRogueOrOver();
  }

  function healGlass(n: number, x: number, y: number) {
    if (!isGlass() || phase !== "playing") return;
    const before = glassBase;
    glassBase = Math.min(GLASS_BASE_MAX, glassBase + n);
    const got = glassBase - before;
    if (got <= 0) return;
    callouts.push({
      text: `+${got}`,
      x,
      y,
      life: 0.85,
      max: 0.85,
      kind: "base",
    });
  }

  function rollAntiHoleDur(lingerSec: number) {
    const shaved = lingerSec * ANTI_LINGER_PENALTY;
    return Math.max(ANTI_HOLE_DUR_MIN, ANTI_HOLE_DUR_MAX - shaved);
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
    // Floor must stay < ~0.88 or fallBoost (1.28g down) pumps energy each bounce.
    const cap = kind === "floorHi" || kind === "floorLo" ? 0.84 : 0.95;
    return Math.max(0, Math.min(cap, raw));
  }

  function jumpVx() {
    return hoop.side * world.w * 0.76 * pMul("jumpFwd");
  }

  function wrapPad() {
    return Math.max(52, world.w * 0.15);
  }

  function canHeat() {
    return kit().heat;
  }

  function isFrost() {
    return kit().frost;
  }

  function isChamp() {
    return kit().champ;
  }

  function isAnti() {
    return kit().anti;
  }

  function resetAntiRun() {
    antiCharge = 0;
    antiMatter = null;
    antiLingerAcc = 0;
    holeOn = false;
    holeLeft = 0;
    holeScoreAcc = 0;
    holeLived = 0;
    holeTick = 0;
    const c = holeCenter();
    holeX = c.x;
    holeY = c.y;
    holeR = Math.max(28, world.w * 0.09);
  }

  function closeAntiHole() {
    holeOn = false;
    holeLeft = 0;
    holeScoreAcc = 0;
    holeLived = 0;
    holeTick = 0;
    antiMatter = null;
    antiLingerAcc = 0;
    // Refill countdown bar when the hole ends (classic shot clock only).
    if (phase === "playing" && !isMinuteMode()) {
      timer = timerMax;
      if (!timerArmed) timerArmed = true;
    }
    emitHud();
  }

  function openAntiHole(dur?: number) {
    const resolved =
      typeof dur === "number" && dur > 0 ? dur : rollAntiHoleDur(antiLingerAcc);
    antiLingerAcc = 0;
    const c = holeCenter();
    holeX = c.x;
    holeY = c.y;
    holeR = Math.max(28, world.w * 0.09);
    holeOn = true;
    holeLeft = resolved;
    holeScoreAcc = 0;
    holeLived = 0;
    holeTick = 0;
    antiCharge = 0;
    antiMatter = null;
    // Refill countdown bar when the hole opens (classic shot clock only).
    if (phase === "playing" && !isMinuteMode() && !isRogueMode()) {
      timer = timerMax;
      if (!timerArmed) timerArmed = true;
    }
    callouts.push({
      text: `黑洞 ${Math.round(resolved)}s`,
      x: holeX,
      y: holeY - holeR * 1.6,
      life: 1,
      max: 1,
      kind: "tag",
    });
    emitHud();
  }

  function stepAntiHole(dt: number) {
    if (!holeOn) return;
    if (isAnti()) {
      holeLived += dt;
      holeScoreAcc += dt;
      while (holeScoreAcc >= 1) {
        holeScoreAcc -= 1;
        holeTick += 1;
        const gain = holeTick * 3;
        score += gain;
        noteBest();
        callouts.push({
          text: `+${gain}`,
          x: holeX + (Math.random() - 0.5) * holeR,
          y: holeY - holeR * 1.1,
          life: 0.55,
          max: 0.55,
          kind: "tag",
        });
        emitHud();
      }
    }
    if (holeLeft > 0) {
      holeLeft = Math.max(0, holeLeft - dt);
    }
    if (holeLeft <= 0) {
      closeAntiHole();
    }
  }

  function useRogueGear(id: string) {
    if (!isRogueMode() || !rogueRun || phase !== "playing") return;
    if (id === "pointexchanger") {
      if (rogueRun.pointExchangeCharges <= 0 || rogueRun.pointExchangeLeft > 0) return;
      rogueRun.pointExchangeCharges -= 1;
      rogueRun.items.pointexchanger = rogueRun.pointExchangeCharges;
      rogueRun.pointExchangeLeft = 5;
      callouts.push({
        text: "汇率转换",
        x: world.w * 0.5,
        y: world.h * 0.28,
        life: 1,
        max: 1,
        kind: "tag",
      });
      paused = false;
      last = performance.now();
      acc = 0;
      emitHud();
      return;
    }
    if (id === "streakSave") {
      callouts.push({
        text: "断连且连击≥3时询问",
        x: world.w * 0.5,
        y: world.h * 0.28,
        life: 1.1,
        max: 1.1,
        kind: "tag",
      });
      emitHud();
      return;
    }
    if (id === "comboboost") {
      const n = rogueRun.items.comboboost ?? 0;
      if (n <= 0) return;
      rogueRun.items.comboboost = n - 1;
      const sec = catalogOf("comboboost")?.comboBoostSec ?? 5;
      rogueRun.buffComboLeft = Math.max(rogueRun.buffComboLeft, sec);
      callouts.push({
        text: "连击兴奋剂",
        x: world.w * 0.5,
        y: world.h * 0.28,
        life: 1,
        max: 1,
        kind: "tag",
      });
      paused = false;
      last = performance.now();
      acc = 0;
      emitHud();
      return;
    }
    if (id === "ineedpower") {
      const n = rogueRun.items.ineedpower ?? 0;
      if (n <= 0) return;
      rogueRun.items.ineedpower = n - 1;
      const sec = catalogOf("ineedpower")?.powerBoostSec ?? 4;
      rogueRun.buffPowerLeft = Math.max(rogueRun.buffPowerLeft, sec);
      callouts.push({
        text: "大力丸",
        x: world.w * 0.5,
        y: world.h * 0.28,
        life: 1,
        max: 1,
        kind: "tag",
      });
      paused = false;
      last = performance.now();
      acc = 0;
      emitHud();
      return;
    }
    if (id === "Bunshin") {
      const n = rogueRun.items.Bunshin ?? 0;
      if (n <= 0) return;
      rogueRun.items.Bunshin = n - 1;
      const meta = catalogOf("Bunshin");
      const sec = meta?.bunshinSec ?? 10;
      const add = meta?.bunshinClones ?? 1;
      const cap = meta?.stackCap ?? 5;
      rogueRun.buffBunshinClones = Math.min(cap, rogueRun.buffBunshinClones + add);
      rogueRun.buffBunshinLeft = Math.max(rogueRun.buffBunshinLeft, sec);
      if (pathHist.length === 0) {
        pathClock = 0;
        pathHist.push({ x: ball.x, y: ball.y, t: 0 });
      }
      syncNinjaGhosts();
      callouts.push({
        text: `分身×${rogueRun.buffBunshinClones}`,
        x: world.w * 0.5,
        y: world.h * 0.28,
        life: 1,
        max: 1,
        kind: "tag",
      });
      paused = false;
      last = performance.now();
      acc = 0;
      emitHud();
      return;
    }
    if (id === "flameON") {
      const n = rogueRun.items.flameON ?? 0;
      if (n <= 0) return;
      rogueRun.items.flameON = n - 1;
      const sec = catalogOf("flameON")?.flameSec ?? 10;
      rogueRun.buffFlameLeft = Math.max(rogueRun.buffFlameLeft, sec);
      combo = Math.max(combo, STAGE_BLAZE);
      callouts.push({
        text: "烈焰",
        x: world.w * 0.5,
        y: world.h * 0.28,
        life: 1,
        max: 1,
        kind: "tag",
      });
      paused = false;
      last = performance.now();
      acc = 0;
      emitHud();
    }
  }

  function resolveFlameReusePrompt(use: boolean) {
    if (!isRogueMode() || !rogueRun || !rogueRun.pendingFlameReuse) return;
    rogueRun.pendingFlameReuse = false;
    if (use && (rogueRun.items.flameON ?? 0) > 0) {
      rogueRun.items.flameON = (rogueRun.items.flameON ?? 0) - 1;
      const sec = catalogOf("flameON")?.flameSec ?? 10;
      rogueRun.buffFlameLeft = sec;
      combo = Math.max(combo, STAGE_BLAZE);
      callouts.push({
        text: "烈焰续杯",
        x: world.w * 0.5,
        y: world.h * 0.28,
        life: 1,
        max: 1,
        kind: "tag",
      });
    }
    paused = false;
    last = performance.now();
    acc = 0;
    emitHud();
  }

  function tickRogueBuffs(dt: number) {
    if (!isRogueMode() || !rogueRun || phase !== "playing" || paused) return;
    let dirty = false;
    if (rogueRun.buffComboLeft > 0) {
      rogueRun.buffComboLeft = Math.max(0, rogueRun.buffComboLeft - dt);
      dirty = true;
    }
    if (rogueRun.buffPowerLeft > 0) {
      rogueRun.buffPowerLeft = Math.max(0, rogueRun.buffPowerLeft - dt);
      dirty = true;
    }
    if (rogueRun.buffBunshinLeft > 0) {
      rogueRun.buffBunshinLeft = Math.max(0, rogueRun.buffBunshinLeft - dt);
      if (rogueRun.buffBunshinLeft <= 0) {
        rogueRun.buffBunshinClones = 0;
      }
      dirty = true;
    }
    if (rogueRun.buffFlameLeft > 0) {
      combo = Math.max(combo, STAGE_BLAZE);
      rogueRun.buffFlameLeft = Math.max(0, rogueRun.buffFlameLeft - dt);
      dirty = true;
      if (rogueRun.buffFlameLeft <= 0 && (rogueRun.items.flameON ?? 0) > 0) {
        rogueRun.pendingFlameReuse = true;
        paused = true;
        emitHud();
        return;
      }
    }
    const dickN = ornamentStacks(rogueRun, "WhatsThat");
    if (dickN > 0 && gfx.clouds !== "off") {
      rogueRun.whatsThatAcc += dt;
      const every = 14;
      if (rogueRun.whatsThatAcc >= every) {
        rogueRun.whatsThatAcc -= every;
        const per = catalogOf("WhatsThat")?.dickCloudScore ?? 20;
        const gain = per * dickN;
        score += gain;
        rogueRun.stageScore = score;
        rogueRun.peakMake = Math.max(rogueRun.peakMake, gain);
        callouts.push({
          text: "迪克云",
          x: world.w * 0.5,
          y: world.h * 0.22,
          life: 1.1,
          max: 1.1,
          kind: "tag",
        });
        callouts.push({
          text: `+${gain}`,
          x: world.w * 0.5,
          y: world.h * 0.28,
          life: 0.9,
          max: 0.9,
          kind: "score",
        });
        dirty = true;
      }
    }
    if (dirty) emitHud();
  }

  function spawnAntiMatter() {
    if (!isAnti() || holeOn || antiMatter) return;
    const padX = world.w * 0.2;
    const yLo = Math.max(world.h * 0.2, world.ballR * 3);
    const yHi = world.floorY - world.ballR * 2.5;
    if (yHi <= yLo + 20) return;
    let x = 0;
    let y = 0;
    let ok = false;
    for (let i = 0; i < 12; i++) {
      x = padX + Math.random() * (world.w - padX * 2);
      y = yLo + Math.random() * (yHi - yLo);
      const nearHoop = Math.hypot(x - hoop.x, y - hoop.y) < hoop.inner * 2.8;
      const nearOther =
        other && Math.hypot(x - other.x, y - other.y) < other.inner * 2.8;
      // Keep out of the four corner pockets.
      const corner =
        (x < world.w * 0.28 && y < world.h * 0.32) ||
        (x > world.w * 0.72 && y < world.h * 0.32) ||
        (x < world.w * 0.28 && y > world.floorY - world.h * 0.18) ||
        (x > world.w * 0.72 && y > world.floorY - world.h * 0.18);
      if (!nearHoop && !nearOther && !corner) {
        ok = true;
        break;
      }
    }
    if (!ok) return;
    const pct = 1 + Math.floor(Math.random() * 15);
    antiMatter = {
      x,
      y,
      r: Math.max(14, world.ballR * 0.7),
      pct,
      age: 0,
    };
  }

  function tryCollectAntiMatter() {
    if (!isAnti() || !antiMatter || holeOn || ball.scored) return;
    const d = Math.hypot(ball.x - antiMatter.x, ball.y - antiMatter.y);
    if (d > ball.r + antiMatter.r) return;
    const got = antiMatter.pct;
    antiLingerAcc += antiMatter.age;
    antiMatter = null;
    antiCharge = Math.min(100, antiCharge + got);
    callouts.push({
      text: `+${got}%`,
      x: ball.x,
      y: ball.y - ball.r * 2.2,
      life: 0.75,
      max: 0.75,
      kind: "tag",
    });
    if (antiCharge >= 100) openAntiHole();
    else emitHud();
  }

  function enterChampionMoment() {
    if (!isChamp() || champMode || champBank <= 0.05) return false;
    const bank = champBank;
    champBank = 0;
    champMode = true;
    champIdleLeft = -1;
    champFinishing = false;
    timeUp = false;
    buzzer = false;
    buzzerTimer = 0;
    timerMax = Math.max(bank, 0.5);
    timer = timerMax;
    timerArmed = true;
    emitHud();
    return true;
  }

  function enterClutchFromChampIdle() {
    champIdleLeft = -1;
    champFinishing = true;
    timer = 0;
    timeUp = true;
    buzzer = true;
    buzzerTimer = BUZZER_WINDOW;
    audio.buzzer();
  }

  function frostChance() {
    return Math.min(1, FROST_CHANCE_BASE + streak * FROST_CHANCE_PER_STREAK);
  }

  function sideFrosted(side: -1 | 1) {
    if (hoop.frostLeft > 0 && hoop.side === side) return true;
    if (other && other.frostLeft > 0 && other.side === side) return true;
    return false;
  }

  function applyFrostToHoop(h: Hoop, refreshing = false) {
    h.frost = 1;
    // First freeze: 4s; any re-freeze refreshes to 3s.
    h.frostLeft = refreshing ? FROST_DUR_REFRESH : FROST_DUR_FIRST;
    h.hold = Math.max(h.hold, h.frostLeft);
    h.couple = true;
    h.moving = false;
    h.targetX = h.x;
    h.active = true;
  }

  function clearFrost(h: Hoop, asOther: boolean) {
    h.frostLeft = 0;
    h.frost = 0;
    if (asOther) {
      h.hold = 0;
      h.couple = false;
      h.active = false;
      h.targetX = h.side < 0 ? -world.w * 0.42 : world.w * 1.42;
    }
  }

  function tickFrost(h: Hoop, dt: number, asOther: boolean) {
    if (h.frostLeft <= 0 || h.frost <= 0) return;
    h.frostLeft -= dt;
    if (h.frostLeft > 0) {
      if (asOther) h.hold = Math.max(h.hold, 0.05);
      return;
    }
    clearFrost(h, asOther);
  }

  function heatN() {
    return canHeat() ? combo : 0;
  }

  /** Combo value that drives trail / stage FX (fire or frost). */
  function fxCombo() {
    if (canHeat() || isFrost()) return combo;
    return 0;
  }

  function applyBall(id: BallId) {
    const next = parseBall(id);
    // Champ is not allowed in 1-minute — fall back to classic when picking it.
    if (next === "champ" && playMode === "minute") {
      playMode = "classic";
    }
    ballId = next;
    if (rogueRun && rogueRun.fuseBall === ballId) {
      rogueRun.fuseBall = null;
    }
    glassBase = GLASS_BASE_START;
    glassLand = false;
    resetNinjaPath();
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
    if (!isFrost()) {
      frostBonus = 0;
      hoop.frost = 0;
      hoop.frostLeft = 0;
      if (other) {
        other.frost = 0;
        other.frostLeft = 0;
      }
      if (!canHeat()) resetTrail();
    }
    if (!isChamp()) {
      champBank = 0;
      champMode = false;
      champIdleLeft = -1;
      champFinishing = false;
    }
    if (!isAnti()) {
      antiCharge = 0;
      antiMatter = null;
      antiLingerAcc = 0;
      holeOn = false;
      holeLeft = 0;
      holeScoreAcc = 0;
      holeLived = 0;
      holeTick = 0;
    } else {
      resetAntiRun();
    }
    if (devOn) {
      applyKitPhys();
      remakeBall(hoop.side < 0 ? 1 : -1);
      prevBallX = ball.x;
      prevBallY = ball.y;
      resetShotFlags();
      resetTrail();
    }
    syncChain();
    if (isPrison()) {
      resetPrisonRun();
      if (phase === "playing" || phase === "title") {
        callouts.push({
          text: "审判",
          x: world.w * 0.5,
          y: world.h * 0.28,
          life: 1,
          max: 1,
          kind: "tag",
        });
        callouts.push({
          text: `目标×${prisonTarget}`,
          x: world.w * 0.5,
          y: world.h * 0.34,
          life: 1.1,
          max: 1.1,
          kind: "tag",
        });
      }
    } else {
      prisonMode = null;
      prisonBonus = 0;
      prisonFreeLeft = 0;
      prisonFreeExtendUsed = false;
      prisonShackleBest = 0;
    }
    autoPlay.reset();
    persist();
    emitHud();
  }

  /** Rogue open-run / dev: OR secondary ball skills onto primary look/feel. */
  function applyRogueFuse(id: BallId | null) {
    if (!isRogueMode()) return;
    if (!rogueRun) rogueRun = createRogueRun();
    const next = id && parseBall(id) !== ballId ? parseBall(id) : null;
    rogueRun.fuseBall = next;
    rogueRun.fusePicked = true;
    refreshFuseSkills();
    if (phase === "playing" && paused) {
      paused = false;
      last = performance.now();
      acc = 0;
      hint = true;
    }
    emitHud();
  }

  function refreshFuseSkills() {
    if (!canHeat() && !isFrost()) {
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
    if (!isFrost()) {
      frostBonus = 0;
      hoop.frost = 0;
      hoop.frostLeft = 0;
      if (other) {
        other.frost = 0;
        other.frostLeft = 0;
      }
    }
    if (!isChamp()) {
      champBank = 0;
      champMode = false;
      champIdleLeft = -1;
      champFinishing = false;
    }
    if (!isAnti()) {
      antiCharge = 0;
      antiMatter = null;
      antiLingerAcc = 0;
      holeOn = false;
      holeLeft = 0;
      holeScoreAcc = 0;
      holeLived = 0;
      holeTick = 0;
    } else if (!holeOn && !antiMatter && antiCharge <= 0) {
      resetAntiRun();
    }
    if (!isNinja() && !bunshinActive()) resetNinjaPath();
    if (isPrison()) {
      if (prisonMode == null) resetPrisonRun();
      else syncChain();
    } else {
      prisonMode = null;
      prisonBonus = 0;
      prisonFreeLeft = 0;
      prisonFreeExtendUsed = false;
      prisonShackleBest = 0;
      chain = null;
    }
    if (isGlass() && glassBase <= 0) glassBase = GLASS_BASE_START;
    ball.r = activeBallR();
    if (ball.y + ball.r > world.floorY) ball.y = world.floorY - ball.r;
    syncChain();
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

  function snapshotAiWorld(dt: number) {
    const heroClutch =
      isRogueMode() && rogueRun && hasHeroMoment(rogueRun) && (buzzer || timeUp);
    const hidden = ballHidden();
    const approach = onApproachSide();
    return {
      dt,
      canShoot:
        phase === "playing" &&
        !paused &&
        !((buzzer || timeUp) && !heroClutch) &&
        !(hidden && !approach),
      phase,
      paused,
      tapLock,
      scored: ball.scored,
      shotOpen,
      shotMade,
      timer,
      timerArmed,
      buzzer,
      timeUp,
      combo,
      streak,
      world: { w: world.w, h: world.h, floorY: world.floorY },
      ball: { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy, r: ball.r },
      hoop: {
        x: hoop.x,
        y: hoop.y,
        inner: hoop.inner,
        side: hoop.side,
        tube: hoop.tube,
        moving: hoop.moving,
      },
      other: other
        ? {
            x: other.x,
            y: other.y,
            inner: other.inner,
            side: other.side,
            tube: other.tube,
            moving: other.moving,
            frostLeft: other.frostLeft,
          }
        : null,
      ballHidden: hidden,
      onApproachSide: approach,
      holeOn,
      hole: holeOn ? { x: holeX, y: holeY, r: holeR } : null,
      antiMatter: antiMatter
        ? { x: antiMatter.x, y: antiMatter.y, r: antiMatter.r }
        : null,
      antiCharge,
      champMode,
      glassBase,
      kit: flagsFromKit(kit()),
      jumpVx: jumpVx(),
      jumpVy: jumpVy(),
      gravity: gravity(),
      air: pMul("air"),
      buoy: pMul("buoy"),
      ballMul: pMul("ball"),
      wrapPad: wrapPad(),
    };
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
    if (!gfx.particles || fxCombo() < STAGE_WHITE || ballHidden()) {
      if (fxCombo() < STAGE_WHITE) resetTrail();
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
    ball.r = activeBallR();
    if (ball.y + ball.r > world.floorY) ball.y = world.floorY - ball.r;
    if (holeOn) {
      const c = holeCenter();
      holeX = c.x;
      holeY = c.y;
      holeR = Math.max(28, world.w * 0.09);
    }
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
    if (isRogueMode()) {
      rogueRun = createRogueRun();
      rogueStageDecay = null;
      if (devOn) {
        rogueRun.endless = true;
        // Sandbox skips open-run fuse UI; use 融合球 chips instead.
        rogueRun.fusePicked = true;
      }
    } else {
      rogueRun = null;
      rogueStageDecay = null;
    }
    timerMax = timerBudget();
    timer = timerMax;
    if (isRogueMode() && rogueRun) {
      // Consume stage-start bonuses after budgeting.
      rogueRun.nextBonusClock = 0;
    }
    timerArmed = false;
    buzzer = false;
    buzzerTimer = 0;
    timeUp = false;
    scoredLock = 0;
    tapLock = 0;
    comboClock = 0;
    comboCounting = true;
    shotOpen = false;
    shotMade = false;
    shotMissed = false;
    shotAirborne = false;
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
    applyRogueHoopScale(hoop);
    other = null;
    remakeBall(1);
    ball.vx = jumpVx() * 0.18;
    ball.vy = jumpVy() * 0.16;
    prevBallX = ball.x;
    prevBallY = ball.y;
    particles = [];
    callouts = [];
    resetTrail();
    resetGraf();
    glassLand = false;
    glassBase = GLASS_BASE_START;
    frostBonus = 0;
    champBank = 0;
    champMode = false;
    champIdleLeft = -1;
    champFinishing = false;
    resetAntiRun();
    otherOverRim = false;
    boardHitLock = 0;
    resetPrisonRun();
    resetNinjaPath();
    autoPlay.reset();
    if (isPrison()) {
      callouts.push({
        text: "审判",
        x: world.w * 0.5,
        y: world.h * 0.28,
        life: 1.1,
        max: 1.1,
        kind: "tag",
      });
      callouts.push({
        text: `目标×${prisonTarget}`,
        x: world.w * 0.5,
        y: world.h * 0.34,
        life: 1.2,
        max: 1.2,
        kind: "tag",
      });
    }
    // Formal rogue: wait for one-shot fuse pick before play.
    if (isRogueMode() && rogueRun && !rogueRun.fusePicked && !devOn) {
      paused = true;
      hint = false;
    }
    emitHud();
  }

  function gameOver(opts?: { quiet?: boolean }) {
    if (phase === "over") return;
    phase = "over";
    paused = false;
    buzzer = false;
    buzzerTimer = 0;
    champIdleLeft = -1;
    champFinishing = false;
    if (isAnti()) {
      holeOn = false;
      holeLeft = 0;
      holeScoreAcc = 0;
      holeLived = 0;
      holeTick = 0;
      antiMatter = null;
    }
    combo = 0;
    streak = 0;
    comboCounting = true;
    shotOpen = false;
    shotMade = false;
    shotMissed = false;
    shotAirborne = false;
    opener = 0;
    bgmOn = false;
    recoverTo = 0;
    recoverMakes = 0;
    resetTrail();
    resetNinjaPath();
    if (isRogueMode() && rogueRun) {
      noteBest();
    } else if (score > 0) {
      noteBest();
    }
    if (!opts?.quiet) audio.miss();
    emitHud();
  }

  function tryRogueMoneyProtect(): boolean {
    if (!isRogueMode() || !rogueRun || !rogueRun.moneyProtect) return false;
    if (rogueRun.endless) return false;
    if (rogueRun.stageScore >= rogueRun.target) return false;
    const need = rogueRun.target - rogueRun.stageScore;
    const convert = Math.min(need, rogueRun.gold);
    if (convert <= 0) return false;
    rogueRun.gold -= convert;
    rogueRun.stageScore += convert;
    score = rogueRun.stageScore;
    rogueRun.moneyProtect = false;
    rogueRun.items.moneyprotecter = 0;
    callouts.push({
      text: `护身 +${convert}`,
      x: world.w * 0.5,
      y: world.h * 0.28,
      life: 1.2,
      max: 1.2,
      kind: "tag",
    });
    if (rogueRun.stageScore >= rogueRun.target) {
      enterRogueSettle();
      return true;
    }
    emitHud();
    return false;
  }

  function tryRogueRevive(): boolean {
    if (!isRogueMode() || !rogueRun || rogueRun.revives <= 0) return false;
    rogueRun.revives -= 1;
    timer = timerMax;
    timeUp = false;
    buzzer = false;
    buzzerTimer = 0;
    callouts.push({
      text: "重生",
      x: world.w * 0.5,
      y: world.h * 0.3,
      life: 1.1,
      max: 1.1,
      kind: "tag",
    });
    emitHud();
    return true;
  }

  function failRogueOrOver() {
    if (isRogueMode()) {
      if (tryRogueRevive()) return;
      if (tryRogueMoneyProtect()) return;
    }
    gameOver();
  }

  function enterRogueSettle() {
    if (!rogueRun) return;
    settleStagePayout(rogueRun);
    phase = "settle";
    paused = false;
    timerArmed = false;
    buzzer = false;
    buzzerTimer = 0;
    timeUp = false;
    champMode = false;
    champBank = 0;
    champIdleLeft = -1;
    champFinishing = false;
    noteBest();
    emitHud();
  }

  function confirmRogueSettle() {
    if (!isRogueMode() || !rogueRun || phase !== "settle") return;
    // Campaign clear (stage 5): stay on settle for End / Endless UI.
    if (rogueRun.stage >= ROGUE_CAMPAIGN_STAGES) return;
    if (devOn) openDevRogueShop(rogueRun);
    else openRogueShop(rogueRun, ballId);
    phase = "hub";
    emitHud();
  }

  function startRogueEndless() {
    if (!isRogueMode() || !rogueRun) return;
    if (phase !== "settle") return;
    if (rogueRun.stage < ROGUE_CAMPAIGN_STAGES) return;
    // settleStagePayout already folded last stage into runScore — carry that total.
    const carried = rogueRun.runScore;
    rogueRun.endless = true;
    rogueRun.runScore = 0;
    rogueRun.stageScore = carried;
    rogueRun.specialMakes = 0;
    rogueRun.lastGoldGain = 0;
    rogueRun.lastBreakdown = null;
    rogueRun.shop = [];
    // Keep peakStreak / peakStreakAll for run summary; stage peak resets with court.
    rogueRun.peakStreak = 0;
    phase = "playing";
    paused = false;
    last = performance.now();
    acc = 0;
    startRogueStageCourt();
    score = carried;
    rogueRun.stageScore = carried;
    emitHud();
  }

  function endRogueFromSettle() {
    if (!isRogueMode() || !rogueRun) return;
    if (phase !== "settle" && phase !== "hub" && phase !== "playing") return;
    gameOver({ quiet: true });
  }

  /** Dev settle / clear UI: stay in sandbox instead of dumping to title. */
  function returnDevFromSettle() {
    if (!devOn || !isRogueMode() || !rogueRun) return;
    if (phase !== "settle" && phase !== "over") return;
    phase = "playing";
    paused = false;
    rogueRun.endless = true;
    last = performance.now();
    acc = 0;
    hint = false;
    timerArmed = false;
    timer = timerMax;
    buzzer = false;
    buzzerTimer = 0;
    timeUp = false;
    champMode = false;
    champIdleLeft = -1;
    champFinishing = false;
    if (isGlass() && glassBase <= 0) glassBase = GLASS_BASE_START;
    glassLand = false;
    remakeBall(hoop.side < 0 ? 1 : -1);
    prevBallX = ball.x;
    prevBallY = ball.y;
    resetShotFlags();
    callouts.push({
      text: "返回沙盒",
      x: world.w * 0.5,
      y: world.h * 0.28,
      life: 0.9,
      max: 0.9,
      kind: "tag",
    });
    emitHud();
  }

  function resetRogueOwnedLoadout() {
    if (!isRogueMode() || !rogueRun) return;
    clearRogueLoadout(rogueRun);
    ball.r = activeBallR();
    if (hoop) applyRogueHoopScale(hoop);
    if (other) applyRogueHoopScale(other);
    // Hoop scale may need rebuild when ornaments removed.
    hoop.inner = world.hoopInner;
    hoop.net = buildNet(hoop);
    applyRogueHoopScale(hoop);
    if (other) {
      other.inner = world.hoopInner;
      other.net = buildNet(other);
      applyRogueHoopScale(other);
    }
    resetNinjaPath();
    callouts.push({
      text: "装备已重置",
      x: world.w * 0.5,
      y: world.h * 0.28,
      life: 0.9,
      max: 0.9,
      kind: "tag",
    });
    emitHud();
  }

  function startRogueStageCourt() {
    madeCount = 0;
    score = 0;
    combo = 0;
    streak = 0;
    hint = true;
    rogueStageDecay = rogueRun?.nextDecay ?? null;
    if (rogueRun) rogueRun.nextDecay = null;
    const bonus = rogueRun?.nextBonusClock ?? 0;
    if (rogueRun) {
      rogueRun.nextBonusClock = 0;
      if (rogueRun.items.warmup) rogueRun.items.warmup = 0;
      rogueRun.rollGoldAcc = 0;
    }
    timerMax = TIMER_START + bonus;
    timer = timerMax;
    timerArmed = false;
    buzzer = false;
    buzzerTimer = 0;
    timeUp = false;
    scoredLock = 0;
    tapLock = 0;
    comboClock = 0;
    comboCounting = true;
    shotOpen = false;
    shotMade = false;
    shotMissed = false;
    shotAirborne = false;
    opener = 0;
    overRim = false;
    rimHits = 0;
    rimHitLock = 0;
    hitBoardTop = false;
    wentOffTop = false;
    fromBelow = false;
    hoop = makeHoop(world, -1, true);
    applyRogueHoopScale(hoop);
    other = null;
    remakeBall(1);
    ball.vx = jumpVx() * 0.18;
    ball.vy = jumpVy() * 0.16;
    prevBallX = ball.x;
    prevBallY = ball.y;
    particles = [];
    callouts = [];
    resetTrail();
    resetAntiRun();
    otherOverRim = false;
    boardHitLock = 0;
    frostBonus = 0;
    champBank = 0;
    champMode = false;
    champIdleLeft = -1;
    champFinishing = false;
    glassBase = GLASS_BASE_START;
    resetPrisonRun();
    resetNinjaPath();

    if (rogueRun) {
      const startS = ballId === "plain" ? rogueStartStreak(rogueRun) : 0;
      if (startS > 0) {
        streak = startS;
        combo = startS;
        comboCounting = true;
      }
      rogueRun.pendingStreakSave = false;
      rogueRun.buffComboLeft = 0;
      rogueRun.buffPowerLeft = 0;
      rogueRun.buffBunshinLeft = 0;
      rogueRun.buffBunshinClones = 0;
      rogueRun.buffFlameLeft = 0;
      rogueRun.pendingFlameReuse = false;
      rogueRun.whatsThatAcc = 0;
      // 黑洞饰品：每关开局自动开启（时长 = 4s × 层数）
      const holeSec = rogueBlackholeSec(rogueRun);
      if (holeSec > 0) openAntiHole(holeSec);
    }
  }

  function continueRogueFromHub() {
    if (!isRogueMode() || !rogueRun || phase !== "hub") return;
    advanceRogueStage(rogueRun);
    phase = "playing";
    paused = false;
    startRogueStageCourt();
    if (rogueRun) {
      rogueRun.stageScore = 0;
      score = 0;
    }
    emitHud();
  }

  function buyRogueOffer(uid: string) {
    if (!isRogueMode() || !rogueRun || phase !== "hub") return;
    const res = tryBuyOffer(rogueRun, uid);
    if (!res.ok) return;
    emitHud();
  }

  function grantRogueGear(id: string) {
    if (!isRogueMode() || !rogueRun) return;
    const res = devGrantRogue(rogueRun, id);
    if (!res.ok) return;
    ball.r = activeBallR();
    if (hoop) applyRogueHoopScale(hoop);
    if (other) applyRogueHoopScale(other);
    if (id === "miniMe" && phase === "playing") {
      if (pathHist.length === 0) {
        pathClock = 0;
        pathHist.push({ x: ball.x, y: ball.y, t: 0 });
      }
      syncMiniGhosts();
    }
    if (id === "funsize") {
      ball.r = activeBallR();
    }
    emitHud();
  }

  function closeDevRogueShop() {
    if (!isRogueMode() || !rogueRun || phase !== "hub") return;
    phase = "playing";
    paused = false;
    last = performance.now();
    acc = 0;
    if (miniMeActive()) {
      if (pathHist.length === 0) {
        pathClock = 0;
        pathHist.push({ x: ball.x, y: ball.y, t: 0 });
      }
      syncMiniGhosts();
    }
    emitHud();
  }

  function revokeRogueGear(id: string) {
    if (!isRogueMode() || !rogueRun) return;
    const res = devRevokeRogue(rogueRun, id);
    if (!res.ok) return;
    ball.r = activeBallR();
    if (hoop) applyRogueHoopScale(hoop);
    if (other) applyRogueHoopScale(other);
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
    const heroClutch =
      isRogueMode() && rogueRun && hasHeroMoment(rogueRun) && (buzzer || timeUp);
    if ((buzzer || timeUp) && !heroClutch) return;
    if (tapLock > 0) return;
    if (ballHidden() && !onApproachSide()) return;
    // Mid-air re-tap on an unfinished attempt: boost only — do not break combo.
    if (shotOpen && !shotMade && !shotMissed) {
      hint = false;
      if (holeOn) {
        const dx = hoop.x - ball.x;
        const dy = hoop.y - ball.y;
        const d = Math.hypot(dx, dy) || 1;
        const speed = Math.hypot(jumpVx(), Math.abs(jumpVy()));
        ball.vx = (dx / d) * speed;
        ball.vy = (dy / d) * speed;
      } else {
        ball.vy = jumpVy();
        ball.vx = jumpVx();
      }
      ball.omega = (ball.vx / Math.max(8, ball.r)) * 1.35 + (holeOn ? 10 : 0);
      ball.squash = 1.08;
      ball.scored = false;
      resetShotFlags();
      glassLand = true;
      tapLock = 0.03;
      audio.whoosh(0.5);
      emitHud();
      return;
    }
    breakComboOnMissJump();
    hint = false;
    if (holeOn) {
      const dx = hoop.x - ball.x;
      const dy = hoop.y - ball.y;
      const d = Math.hypot(dx, dy) || 1;
      const speed = Math.hypot(jumpVx(), Math.abs(jumpVy()));
      ball.vx = (dx / d) * speed;
      ball.vy = (dy / d) * speed;
    } else {
      ball.vy = jumpVy();
      ball.vx = jumpVx();
    }
    ball.omega = (ball.vx / Math.max(8, ball.r)) * 1.35 + (holeOn ? 10 : 0);
    ball.squash = 1.08;
    ball.scored = false;
    resetShotFlags();
    shotOpen = true;
    shotMade = false;
    shotMissed = false;
    shotAirborne = false;
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
    if (
      isRogueMode() &&
      rogueRun &&
      !devOn &&
      (!rogueRun.fusePicked ||
        rogueRun.pendingStreakSave ||
        rogueRun.pendingFlameReuse)
    ) {
      return;
    }
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
    rogueRun = null;
    rogueStageDecay = null;
    timerMax = timerBudget();
    timer = timerMax;
    timerArmed = false;
    buzzer = false;
    buzzerTimer = 0;
    timeUp = false;
    opener = 0;
    bgmOn = false;
    recoverTo = 0;
    recoverMakes = 0;
    shotOpen = false;
    shotMade = false;
    shotMissed = false;
    shotAirborne = false;
    other = null;
    hoop = makeHoop(world, -1, true);
    applyRogueHoopScale(hoop);
    resetAntiRun();
    remakeBall(1);
    particles = [];
    callouts = [];
    resetTrail();
    audio.stopBgm();
    bgmOn = false;
    resetGraf();
    leaveSandbox();
    resetPrisonRun();
    resetNinjaPath();
    autoPlay.reset();
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
      case "playMode": {
        if (cmd.mode !== "classic" && cmd.mode !== "minute" && cmd.mode !== "rogue") return;
        if (cmd.mode === "minute" && ballId === "champ") return;
        playMode = cmd.mode;
        persist();
        if (!devOn) enterSandbox();
        else {
          beginPlay();
          hint = false;
          timerArmed = false;
          timer = timerMax;
          devFreeze = true;
          devHoldHeat = true;
          madeCount = 1;
          applyKitPhys();
        }
        if (playMode === "rogue" && rogueRun) {
          rogueRun.gold = Math.max(rogueRun.gold, 99);
          rogueRun.peakGold = Math.max(rogueRun.peakGold, rogueRun.gold);
          if (devOn) rogueRun.endless = true;
        }
        emitHud();
        return;
      }
      case "rogueTool": {
        if (!devOn) enterSandbox();
        playMode = "rogue";
        persist();
        if (!rogueRun) {
          rogueRun = createRogueRun();
        }
        if (devOn) rogueRun.endless = true;
        if (cmd.kind === "gold") {
          rogueRun.gold += 50;
          rogueRun.peakGold = Math.max(rogueRun.peakGold, rogueRun.gold);
          callouts.push({
            text: "+50金",
            x: world.w * 0.5,
            y: world.h * 0.28,
            life: 0.9,
            max: 0.9,
            kind: "tag",
          });
          emitHud();
          return;
        }
        if (cmd.kind === "clearScore") {
          score = 0;
          rogueRun.stageScore = 0;
          rogueRun.runScore = 0;
          callouts.push({
            text: "分数清零",
            x: world.w * 0.5,
            y: world.h * 0.28,
            life: 0.9,
            max: 0.9,
            kind: "tag",
          });
          emitHud();
          return;
        }
        if (cmd.kind === "shop") {
          openDevRogueShop(rogueRun);
          phase = "hub";
          paused = false;
          emitHud();
          return;
        }
        if (cmd.kind === "closeShop") {
          if (phase === "hub") {
            phase = "playing";
            paused = false;
            last = performance.now();
            acc = 0;
            if (miniMeActive()) {
              if (pathHist.length === 0) {
                pathClock = 0;
                pathHist.push({ x: ball.x, y: ball.y, t: 0 });
              }
              syncMiniGhosts();
            }
          }
          emitHud();
          return;
        }
        if (cmd.kind === "clearSettle") {
          rogueRun.stage = ROGUE_CAMPAIGN_STAGES;
          rogueRun.target = 200;
          rogueRun.stageScore = Math.max(rogueRun.stageScore, 200);
          rogueRun.peakStreak = Math.max(rogueRun.peakStreak, 5);
          rogueRun.peakStreakAll = Math.max(rogueRun.peakStreakAll, 5);
          rogueRun.peakMake = Math.max(rogueRun.peakMake, 12);
          rogueRun.runScore = Math.max(rogueRun.runScore, 800);
          rogueRun.gold = Math.max(rogueRun.gold, 40);
          rogueRun.peakGold = Math.max(rogueRun.peakGold, rogueRun.gold);
          rogueRun.stagesCleared = Math.max(rogueRun.stagesCleared, 4);
          rogueRun.endless = false;
          enterRogueSettle();
          return;
        }
        return;
      }
      case "rogueFuse": {
        if (!devOn) enterSandbox();
        playMode = "rogue";
        persist();
        if (!rogueRun) {
          rogueRun = createRogueRun();
          if (devOn) {
            rogueRun.endless = true;
            rogueRun.fusePicked = true;
          }
        }
        applyRogueFuse(cmd.id);
        callouts.push({
          text: cmd.id ? `融合·${getBall(cmd.id).name}` : "清除融合",
          x: world.w * 0.5,
          y: world.h * 0.28,
          life: 0.9,
          max: 0.9,
          kind: "tag",
        });
        return;
      }
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
        remakeBall(hoop.side < 0 ? 1 : -1);
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

    if (phase === "playing" && timerArmed && !buzzer && !timeUp && !devFreeze) {
      let drain = dt;
      if (holeOn) {
        // Far from hole → timer drains slower; at center → normal speed.
        const dist = Math.hypot(ball.x - holeX, ball.y - holeY);
        const maxD = Math.max(120, world.w * 0.55);
        const t = Math.max(0, Math.min(1, dist / maxD));
        drain = dt * (1 - t * 0.78);
      }
      timer -= drain;
      if (timer <= 0) {
        timer = 0;
        if (isChamp() && !champMode && enterChampionMoment()) {
          // Champion bank consumed as a fresh countdown.
        } else if (isRogueMode() && tryRogueRevive()) {
          // Revived — keep playing this stage.
        } else if (isRogueMode() && tryRogueMoneyProtect()) {
          // Converted gold → score / settle.
        } else {
          timeUp = true;
          champIdleLeft = -1;
          // 肉鸽非无限关：倒计时耗尽一律进入绝杀窗，进球达目标即可过关
          const forceClutch = isRogueMode() && rogueRun && !rogueRun.endless;
          if (forceClutch || predictBuzzerMake()) {
            buzzer = true;
            buzzerTimer =
              isRogueMode() && rogueRun && hasHeroMoment(rogueRun)
                ? BUZZER_WINDOW * 2
                : BUZZER_WINDOW;
            audio.buzzer();
          }
        }
      }
    } else if (buzzer && phase === "playing") {
      buzzerTimer -= dt;
      const settled =
        ball.y + ball.r >= world.floorY - 2 && Math.abs(ball.vy) < 90 && Math.abs(ball.vx) < 70;
      if (buzzerTimer <= 0 || settled) {
        if (
          isRogueMode() &&
          rogueRun &&
          !rogueRun.endless &&
          rogueRun.stageScore >= rogueRun.target
        ) {
          enterRogueSettle();
        } else if (!ball.scored) {
          failRogueOrOver();
        }
      }
    } else if (timeUp && !buzzer && phase === "playing") {
      if (isRogueMode() && rogueRun && !rogueRun.endless) {
        buzzer = true;
        buzzerTimer = hasHeroMoment(rogueRun) ? BUZZER_WINDOW * 2 : BUZZER_WINDOW;
        audio.buzzer();
      } else if (predictBuzzerMake()) {
        buzzer = true;
        buzzerTimer =
          isRogueMode() && rogueRun && hasHeroMoment(rogueRun)
            ? BUZZER_WINDOW * 2
            : BUZZER_WINDOW;
        audio.buzzer();
      } else {
        const settled =
          ball.y + ball.r >= world.floorY - 2 && Math.abs(ball.vy) < 90 && Math.abs(ball.vx) < 70;
        if (settled && !ball.scored) {
          failRogueOrOver();
        }
      }
    }

    if (
      phase === "playing" &&
      champMode &&
      champIdleLeft >= 0 &&
      !buzzer &&
      !timeUp &&
      !devFreeze
    ) {
      champIdleLeft -= dt;
      if (champIdleLeft <= 0) enterClutchFromChampIdle();
    }

    if (phase === "playing" && isPrison() && prisonMode === "free" && !buzzer && !devFreeze) {
      prisonFreeLeft -= dt;
      if (prisonFreeLeft <= 0) {
        if (!prisonFreeExtendUsed && comboCounting && streak > 0) {
          prisonFreeExtendUsed = true;
          prisonFreeLeft += PRISON_FREE_EXTEND;
          callouts.push({
            text: `+${PRISON_FREE_EXTEND}秒`,
            x: ball.x,
            y: ball.y - ball.r * 2.5,
            life: 0.85,
            max: 0.85,
            kind: "tag",
          });
          emitHud();
        } else {
          enterPrisonShackle("time");
        }
      }
    }

    // Active streak: must score again within COMBO_STOP seconds.
    if (phase === "playing" && comboCounting && streak > 0 && !buzzer && !devHoldHeat) {
      comboClock += dt;
      const window =
        COMBO_STOP + (isRogueMode() && rogueRun ? rogueComboWindowBonus(rogueRun) : 0);
      if (comboClock >= window) breakComboStreak();
    } else if (phase === "playing" && !comboCounting && combo > 0 && !buzzer && !devHoldHeat) {
      // Heat decays only after streak is broken.
      comboClock += dt;
      if (comboClock >= COMBO_DROP) {
        comboClock = 0;
        dropComboStage();
      }
    }

    stepHoop(hoop, dt);
    tickFrost(hoop, dt, false);
    if (other) {
      if (other.jolt > 0) other.jolt = Math.max(0, other.jolt - dt / 0.28);
      tickFrost(other, dt, true);
      if (other.hold > 0 && other.frostLeft <= 0) {
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
      if (gone) {
        other = null;
        otherOverRim = false;
      }
    }

    prevBallX = ball.x;
    prevBallY = ball.y;
    const live =
      phase === "playing" || phase === "over" || phase === "title" || phase === "hub" || phase === "settle";
    if (live) {
      const gScale = buzzer ? 0.42 : 1;
      // High-bounce kits skip fallBoost — otherwise each landing gains height.
      const fallBoost = (() => {
        if (pMul("ball") > 1.15) return 1;
        if (holeOn) return 1;
        return ball.vy > 20 ? 1.28 : 1;
      })();
      const buoy = pMul("buoy");
      if (holeOn) {
        const dx = holeX - ball.x;
        const dy = holeY - ball.y;
        const d = Math.max(40, Math.hypot(dx, dy));
        const g = gravity() * gScale * 0.72;
        // Pull toward the hole (softened so orbit doesn't slingshot).
        ball.vx += (dx / d) * g * dt;
        ball.vy += (dy / d) * g * dt;
        // Mild clockwise orbit; fades with distance so far-away balls aren't whipped.
        const rx = ball.x - holeX;
        const ry = ball.y - holeY;
        const rd = Math.max(40, Math.hypot(rx, ry));
        const near = Math.min(1, (world.w * 0.28) / rd);
        const orbit = g * 0.18 * near;
        ball.vx += (ry / rd) * orbit * dt;
        ball.vy += (-rx / rd) * orbit * dt;
        // Keep a strong clockwise spin so rim hits always get a tangential kick.
        ball.omega += 22 * dt;
        if (ball.omega < 8) ball.omega += 18 * dt;
        // Near the rim plane with almost no vertical speed → nudge down through the hoop.
        if (
          phase === "playing" &&
          !ball.scored &&
          Math.abs(ball.y - hoop.y) < hoop.inner * 0.45 &&
          Math.abs(ball.vy) < 70 &&
          Math.abs(ball.x - hoop.x) < hoop.inner * 2.6
        ) {
          ball.vy += 200 * dt;
        }
      } else {
        ball.vy += gravity() * dt * (gScale * fallBoost - buoy);
      }
      const air = pMul("air");
      const roll = pMul("roll");
      const onFloor = ball.y + ball.r >= world.floorY - 0.5 && ball.vy >= 0;
      if (!onFloor && ball.y + ball.r < world.floorY - 2) shotAirborne = true;
      if (onFloor) {
        ball.vx *= 1 - Math.min(0.85, 0.28 * roll * dt);
        ball.omega = ball.vx / Math.max(8, ball.r);
        if (isRogueMode() && rogueRun && phase === "playing") {
          const jn = ornamentStacks(rogueRun, "jiahao");
          if (jn > 0) {
            // 接触地面累计 0.5s → +1 金 ×层数（不要求滚动）
            rogueRun.rollGoldAcc += dt;
            while (rogueRun.rollGoldAcc >= 0.5) {
              rogueRun.rollGoldAcc -= 0.5;
              rogueRun.gold += jn;
              rogueRun.peakGold = Math.max(rogueRun.peakGold, rogueRun.gold);
            }
          }
        }
      } else {
        if (rogueRun) rogueRun.rollGoldAcc = 0;
        ball.vx *= 1 - Math.min(0.85, 0.035 * air * dt);
        // Preserve spin longer in black-hole mode so rim deflection stays reliable.
        const spinDrag = holeOn ? 0.06 : 0.28;
        ball.omega *= 1 - Math.min(0.85, spinDrag * air * dt);
      }
      ball.vy *= 1 - Math.min(0.85, 0.025 * air * dt);
      ball.omega = clamp(ball.omega, -22, 22);
      const move = buzzer ? 0.6 : 1;
      ball.x += ball.vx * dt * move;
      ball.y += ball.vy * dt * move;
      if (ball.y + ball.r < 0) wentOffTop = true;
      wrapX();
      pushNinjaPath(dt);
      stepNinjaGhosts(dt);
      pushTrail();
      ball.spin += ball.omega * dt;
      ball.squash += (1 - ball.squash) * (1 - Math.exp(-12 * dt));
      // Score before rim/board so a clean thread isn't eaten by rim bounce.
      if (phase === "playing") checkScore();
      if (phase !== "title" && !ballHidden()) {
        if (scoredLock <= 0) {
          collideRim(hoop);
          if (other) collideRim(other);
        }
        collideBoard(hoop);
        collideBrace(hoop);
        if (other) {
          collideBoard(other);
          collideBrace(other);
        }
      }
      if (phase === "playing") {
        if (isAnti()) tryCollectAntiMatter();
        if (holeOn) stepAntiHole(dt);
        if (antiMatter && !holeOn && isAnti()) antiMatter.age += dt;
        tickRogueBuffs(dt);
      }
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
          1.35,
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

    // Isolated auto-play: no-op when OFF. Taps the real shot path only.
    if (autoPlay.enabled() && autoPlay.tick(snapshotAiWorld(dt))) {
      tapJump();
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
    const tx = -ny;
    const ty = nx;
    const r = Math.max(8, ball.r);
    // Couple spin ↔ tangential velocity (rolling contact). Spinning balls deflect off the rim.
    const applySpinDeflect = () => {
      const vt = ball.vx * tx + ball.vy * ty;
      const slip = vt - ball.omega * r;
      const baseK = holeOn ? 0.42 : 0.22;
      const k = Math.min(0.72, baseK * pMul("rimFric"));
      ball.vx -= k * slip * tx;
      ball.vy -= k * slip * ty;
      ball.omega += (k * slip) / r;
      // Extra kick from residual spin so flat pinball contacts still glance away.
      const spinKick = clamp(ball.omega * r * (holeOn ? 0.28 : 0.12), -160, 160);
      ball.vx += spinKick * tx;
      ball.vy += spinKick * ty;
      ball.omega = clamp(ball.omega, -22, 22);
    };
    if (vn >= 0) {
      if (Math.hypot(ball.vx, ball.vy) < 55) {
        ball.vx += nx * 70;
        ball.vy += ny * 40;
      }
      applySpinDeflect();
      if (holeOn && !ball.scored && Math.abs(ball.y - h.y) < ball.r * 1.35 && Math.abs(ball.vy) < 100) {
        ball.vy += 150;
        ball.vx *= 0.7;
      }
      return;
    }
    const rest = bounceRest("rim");
    ball.vx -= (1 + rest) * vn * nx;
    ball.vy -= (1 + rest) * vn * ny;
    applySpinDeflect();
    ball.hitRim = true;
    h.jolt = 1;
    h.joltDir = ball.vy < 0 ? -1 : 1;
    // Black-hole mode: break horizontal rim pinball by kicking off the rim plane.
    if (holeOn && !ball.scored) {
      const level = Math.abs(ball.y - h.y) < ball.r * 1.35;
      const flat = Math.abs(ball.vy) < 100;
      if (level && flat) {
        ball.vy += 175;
        ball.vx *= 0.65;
      } else {
        const toward = Math.sign(h.y - ball.y) || 1;
        ball.vy += toward * 95;
      }
    }
    const throughHole = Math.abs(ball.x - h.x) < h.inner * 0.55 && ball.vy > 28;
    const impact = -vn;
    if (h.active && rimHitLock <= 0) {
      rimHits += 1;
      rimHitLock = 0.08;
      if (
        !ball.scored &&
        !throughHole &&
        !glassRimHurtShot &&
        impact >= GLASS_IMPACT_MIN
      ) {
        glassRimHurtShot = true;
        hurtGlass(GLASS_RIM_HURT, ball.x, ball.y);
      }
    }
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
    const topHit = h.active && ny < -0.55;
    if (topHit) hitBoardTop = true;
    const impact = -vn;
    if (impact > 90) audio.board(Math.min(1, (impact - 60) / 520));
    if (h.active && boardHitLock <= 0 && !ball.scored) {
      boardHitLock = 0.08;
      if (!glassBoardHurtShot && impact >= GLASS_IMPACT_MIN) {
        glassBoardHurtShot = true;
        hurtGlass(
          topHit ? GLASS_BOARD_TOP_HURT : GLASS_BANK_HURT,
          ball.x,
          ball.y,
        );
      }
    }
  }

  /** Collide with hoop support brace — swept so small/fast balls cannot tunnel. */
  function collideBrace(h: Hoop) {
    const segs = braceColliders(h, world);
    const hitR = ball.r;
    const ax = prevBallX;
    const ay = prevBallY;
    const bx = ball.x;
    const by = ball.y;
    for (const s of segs) {
      const need = hitR + s.halfW;
      // Closest points between travel segment and brace segment
      const hit = closestSegSeg(ax, ay, bx, by, s.x0, s.y0, s.x1, s.y1);
      if (hit.dist >= need) {
        // Also catch rest-overlap at end position (stationary / slow)
        const end = closestPointOnSeg(bx, by, s.x0, s.y0, s.x1, s.y1);
        if (end.dist >= need) continue;
        resolveBraceHit(end.x, end.y, s.x1 - s.x0, s.y1 - s.y0, need, end.dist);
        continue;
      }
      resolveBraceHit(hit.px, hit.py, s.x1 - s.x0, s.y1 - s.y0, need, hit.dist);
    }
  }

  function closestPointOnSeg(
    px: number,
    py: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy || 0.0001;
    let t = ((px - x0) * dx + (py - y0) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const x = x0 + dx * t;
    const y = y0 + dy * t;
    return { x, y, dist: Math.hypot(px - x, py - y) };
  }

  /** Closest points between segments A→B (ball path) and C→D (brace). */
  function closestSegSeg(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number,
    dx: number,
    dy: number,
  ) {
    const d1x = bx - ax;
    const d1y = by - ay;
    const d2x = dx - cx;
    const d2y = dy - cy;
    const rx = ax - cx;
    const ry = ay - cy;
    const a = d1x * d1x + d1y * d1y;
    const e = d2x * d2x + d2y * d2y;
    const f = d2x * rx + d2y * ry;
    const eps = 1e-8;
    let s = 0;
    let t = 0;
    if (a <= eps && e <= eps) {
      // both points
    } else if (a <= eps) {
      t = Math.max(0, Math.min(1, f / e));
    } else {
      const c = d1x * rx + d1y * ry;
      if (e <= eps) {
        s = Math.max(0, Math.min(1, -c / a));
      } else {
        const b = d1x * d2x + d1y * d2y;
        const denom = a * e - b * b;
        s = Math.abs(denom) > eps ? Math.max(0, Math.min(1, (b * f - c * e) / denom)) : 0;
        t = (b * s + f) / e;
        if (t < 0) {
          t = 0;
          s = Math.max(0, Math.min(1, -c / a));
        } else if (t > 1) {
          t = 1;
          s = Math.max(0, Math.min(1, (b - c) / a));
        }
      }
    }
    const qx = ax + d1x * s;
    const qy = ay + d1y * s;
    const px = cx + d2x * t;
    const py = cy + d2y * t;
    return { dist: Math.hypot(qx - px, qy - py), qx, qy, px, py };
  }

  function resolveBraceHit(
    px: number,
    py: number,
    segDx: number,
    segDy: number,
    need: number,
    dist: number,
  ) {
    let ox = ball.x - px;
    let oy = ball.y - py;
    let d = Math.hypot(ox, oy);
    if (d < 0.0001) {
      const len = Math.hypot(segDx, segDy) || 1;
      ox = -segDy / len;
      oy = segDx / len;
      d = 0.0001;
    }
    const nx = ox / d;
    const ny = oy / d;
    const overlap = need - Math.min(dist, d);
    ball.x += nx * (overlap + 0.35);
    ball.y += ny * (overlap + 0.35);
    const vn = ball.vx * nx + ball.vy * ny;
    if (vn >= 0) return;
    const rest = bounceRest("board");
    ball.vx -= (1 + rest) * vn * nx;
    ball.vy -= (1 + rest) * vn * ny;
    const tx = -ny;
    const ty = nx;
    const vt = ball.vx * tx + ball.vy * ty;
    const grip = Math.min(0.92, 0.12 * pMul("boardFric"));
    ball.vx -= grip * vt * tx;
    ball.vy -= grip * vt * ty;
    ball.hitBoard = true;
    if (-vn > 90) audio.board(Math.min(1, (-vn - 60) / 520));
  }

  function wrapX() {
    const r = ball.r;
    const pad = wrapPad();
    const exitLeft = ball.x < -r - pad;
    const exitRight = ball.x > world.w + r + pad;
    const stuckOff =
      ballHidden() &&
      ball.y + r >= world.floorY - 1 &&
      Math.abs(ball.vx) < 14 &&
      ball.vy >= 0;
    if (!exitLeft && !exitRight && !stuckOff) return;
    // Wrap is not a miss: clear airborne so the post-wrap floor contact does not markShotMissed.
    shotAirborne = false;
    if (getBall(ballId).wrap === "height") {
      // Spawn on the approach side of the active hoop (same rule as classic wrap).
      // hoop.side > 0 → basket on right → enter from left; else enter from right.
      const spd = Math.max(44, Math.abs(ball.vx));
      if (hoop.side > 0) {
        ball.x = -r - pad * 0.5;
        ball.vx = spd;
      } else {
        ball.x = world.w + r + pad * 0.5;
        ball.vx = -spd;
      }
      ball.omega = ball.vx / Math.max(8, r);
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
        hurtGlass(GLASS_LAND_HURT, ball.x, ball.y - ball.r * 2.2);
        glassLand = false;
      }
    } else if (incoming > 0) {
      ball.vy = 0;
    }
    if (Math.abs(ball.vx) < 2.2) ball.vx = 0;
    ball.omega = ball.vx / Math.max(8, ball.r);
    if (scoredLock <= 0) {
      ball.scored = false;
      resetShotFlags();
    }
    if (incoming <= 40 && shotAirborne) {
      markShotMissed();
      shotAirborne = false;
    }
  }

  function checkScore() {
    if (phase !== "playing") return;
    if (ball.scored) return;
    const goingDown = ball.vy > 8;
    const goingUp = ball.vy < -8;
    const bothWays = holeOn;

    // 小球穿框/贴支撑轴：用轨迹与篮筐平面求交，避免单帧隧穿漏判
    const scoreSlack = Math.max(0, (world.ballR - ball.r) * 0.45);
    if (tryRimPlaneScore(hoop, bothWays, scoreSlack)) return;
    if (other && (other.frostLeft > 0 || other.active)) {
      tryRimPlaneScore(other, bothWays, scoreSlack);
    }
  }

  /** Downward (or black-hole upward) crossing of the rim plane inside the opening. */
  function tryRimPlaneScore(
    h: Hoop,
    bothWays: boolean,
    slack: number,
  ): boolean {
    const holePad = -ball.r * 0.1 + slack;
    const openR = h.inner + holePad;
    const stickyR = h.inner + ball.r * 0.35 + slack;

    const inHoleNow = Math.abs(ball.x - h.x) < openR;
    const isOther = other != null && h === other;

    if (isOther) {
      if (inHoleNow && (ball.y + ball.r * 0.18 < h.y || prevBallY + ball.r * 0.18 < h.y)) {
        otherOverRim = true;
      }
      if (!inHoleNow && Math.abs(ball.x - h.x) > stickyR) otherOverRim = false;
    } else {
      if (inHoleNow && prevBallY > h.y && ball.y <= h.y && ball.vy < 0) fromBelow = true;
      if (inHoleNow && (ball.y + ball.r * 0.18 < h.y || prevBallY + ball.r * 0.18 < h.y)) {
        overRim = true;
      }
      if (!inHoleNow && Math.abs(ball.x - h.x) > stickyR) overRim = false;
    }

    // Continuous segment vs rim plane (catches tunneling / brace-adjacent paths)
    const y0 = prevBallY;
    const y1 = ball.y;
    const crossedDown = y0 < h.y && y1 >= h.y && ball.vy > 4;
    const crossedUp = y0 > h.y && y1 <= h.y && ball.vy < -4;
    if (crossedDown || (bothWays && crossedUp)) {
      const dy = y1 - y0;
      const t = Math.abs(dy) < 1e-6 ? 1 : (h.y - y0) / dy;
      const xAt = prevBallX + (ball.x - prevBallX) * Math.max(0, Math.min(1, t));
      // 略放宽：贴支撑轴/筐沿擦过也算进筐
      if (Math.abs(xAt - h.x) < h.inner + slack + ball.r * 0.12) {
        if (crossedUp) fromBelow = true;
        if (isOther) otherOverRim = true;
        else overRim = true;
        registerScore({ at: h });
        return true;
      }
    }

    const goingDown = ball.vy > 8;
    const goingUp = ball.vy < -8;
    const below = ball.y >= h.y;
    if (isOther) {
      if (otherOverRim && goingDown && below && inHoleNow) {
        registerScore({ at: h });
        return true;
      }
      if (
        bothWays &&
        inHoleNow &&
        goingUp &&
        ball.y <= h.y &&
        (prevBallY > h.y || ball.y - ball.r * 0.18 > h.y)
      ) {
        fromBelow = true;
        registerScore({ at: h });
        return true;
      }
    } else {
      if (overRim && goingDown && below && inHoleNow) {
        registerScore({ at: h });
        return true;
      }
      if (
        bothWays &&
        inHoleNow &&
        goingUp &&
        ball.y <= h.y &&
        (fromBelow || (prevBallY > h.y && ball.y <= h.y))
      ) {
        fromBelow = true;
        registerScore({ at: h });
        return true;
      }
    }
    return false;
  }

  function checkGhostScore(g: NinjaGhost, gi: number) {
    if (phase !== "playing" || g.scoredLock > 0) return;
    // Rim gates left by the real ball (survive nextHoop).
    for (const gate of ninjaGates) {
      if (gate.hit[gi]) continue;
      const inHole = Math.abs(g.x - gate.x) < gate.inner - ball.r * 0.05;
      if (!inHole) continue;
      // Crossed the rim plane downward through the hole.
      if (g.prevY < gate.y && g.y >= gate.y) {
        gate.hit[gi] = true;
        g.scoredLock = 0.5;
        registerScore({
          ghost: true,
          at: { x: gate.x, y: gate.y, inner: gate.inner },
        });
        return;
      }
    }
  }

  function stepNinjaGhosts(dt: number) {
    if (!isNinja() && !bunshinActive()) {
      ninjaGhosts = [];
      ninjaGates = [];
      if (!miniMeActive() && pathHist.length) {
        pathHist = [];
        pathClock = 0;
      }
    } else {
      for (let i = ninjaGates.length - 1; i >= 0; i--) {
        const gate = ninjaGates[i]!;
        gate.life -= dt;
        if (gate.life <= 0) ninjaGates.splice(i, 1);
      }
      syncNinjaGhosts();
      for (let gi = 0; gi < ninjaGhosts.length; gi++) {
        const g = ninjaGhosts[gi]!;
        if (g.scoredLock > 0) g.scoredLock = Math.max(0, g.scoredLock - dt);
        const p = sampleNinjaPath(g.delay);
        if (!p) continue;
        g.prevY = g.y;
        g.x = p.x;
        g.y = p.y;
        if (phase === "playing") checkGhostScore(g, gi);
      }
    }
    stepMiniGhosts();
  }

  function stepMiniGhosts() {
    if (!miniMeActive()) {
      if (miniGhosts.length) miniGhosts = [];
      return;
    }
    if (pathHist.length === 0) {
      pathClock = 0;
      pathHist.push({ x: ball.x, y: ball.y, t: 0 });
    }
    syncMiniGhosts();
    for (const g of miniGhosts) {
      const p = sampleNinjaPath(g.delay);
      if (!p) continue;
      g.x = p.x;
      g.y = p.y;
    }
  }

  function registerScore(opts?: {
    ghost?: boolean;
    at?: { x: number; y: number; inner: number } | Hoop;
  }) {
    const ghost = opts?.ghost === true;
    const scoredHoop = opts?.at ?? hoop;
    if (!ghost) {
      ball.scored = true;
      scoredLock = 0.22;
      // Keep threading in the direction of the make (upward anti makes were getting yanked back).
      ball.vy += (ball.vy < 0 ? -1 : 1) * 70;
      if (isNinja() || bunshinActive()) {
        const gateAt = "inner" in scoredHoop ? scoredHoop : hoop;
        const slots = Math.max(3, ninjaCloneCount());
        ninjaGates.push({
          x: gateAt.x,
          y: gateAt.y,
          inner: gateAt.inner,
          life: 1.6,
          hit: Array.from({ length: slots }, () => false),
        });
      }
      // Score on secondary hoop → promote it so nextHoop freezes the right stand.
      if (other && scoredHoop === other) {
        const swap = hoop;
        hoop = other;
        other = swap;
        overRim = otherOverRim;
        otherOverRim = false;
      }
    }
    let swish = ghost ? true : !ball.hitRim && !ball.hitBoard;
    if (
      !ghost &&
      isRogueMode() &&
      rogueRun &&
      !swish &&
      miniMeStacks(rogueRun) > 0 &&
      Math.random() < 0.22 * miniMeStacks(rogueRun)
    ) {
      swish = true;
    }
    const bank = ghost ? false : ball.hitBoard;
    const toilet = ghost ? false : rimHits >= 3;
    const lucky = ghost ? false : hitBoardTop;
    const depth = ghost ? false : wentOffTop && swish;
    const needle = ghost ? false : fromBelow;
    const prevStage = fireStage(heatN());
    const shackled = isPrison() && prisonMode === "shackle";
    const freed = isPrison() && prisonMode === "free";

    const bunshinGhost = ghost && bunshinActive() && !isNinja();
    const ninjaGhost = ghost && isNinja();

    if (comboCounting) {
      const boost =
        bunshinGhost
          ? 1
          : isRogueMode() && rogueRun && rogueRun.buffComboLeft > 0
            ? (catalogOf("comboboost")?.comboBoostAdd ?? 3)
            : 1;
      streak += boost;
    } else {
      streak = bunshinGhost
        ? 1
        : isRogueMode() && rogueRun && rogueRun.buffComboLeft > 0
          ? (catalogOf("comboboost")?.comboBoostAdd ?? 3)
          : 1;
    }
    comboCounting = true;
    comboClock = 0;
    if (!ghost) {
      shotMade = true;
      shotMissed = false;
      shotAirborne = false;
    }
    combo = Math.max(combo, streak);

    madeCount += 1;
    if (madeCount === 1) {
      audio.playBgm();
      bgmOn = true;
      opener = 1.6;
      pushGraf("start");
    }

    if (!ghost && isAnti() && !holeOn) {
      if (!antiMatter && Math.random() < ANTI_SPAWN_CHANCE) spawnAntiMatter();
    }

    if (shackled) {
      noteGraf();
      if (!timerArmed) timerArmed = true;
      audio.swish();
      audio.score(swish, 0);
      tugNet(hoop);
      refillShotClock();
      prisonShackleBest = Math.max(prisonShackleBest, streak);
      if (!ghost) nextHoop();
      emitHud();
      if (streak >= prisonTarget) enterPrisonFree(Math.max(prisonShackleBest, streak));
      return;
    }

    let frostGain = 0;
    const scoredFrost =
      !ghost && isFrost() && "frost" in scoredHoop ? (scoredHoop as Hoop) : null;
    const wasFrozen = Boolean(
      scoredFrost && scoredFrost.frostLeft > 0 && scoredFrost.frost > 0,
    );
    if (wasFrozen) {
      frostGain = FROST_BONUS_PER_HIT;
      frostBonus += frostGain;
    }

    // 基础分 + 连击得分；混乱药丸只改基础分，连击分与后续加成照常
    const streakPart = streak;
    let basePart = isGlass() ? glassBase : 0;
    if (isRogueMode() && rogueRun && hasChaosBase(rogueRun) && !bunshinGhost && !ninjaGhost) {
      basePart = Math.floor(Math.random() * 26) - 10;
    }
    let gain = bunshinGhost ? 1 : ninjaGhost ? 0 : basePart + streakPart;
    if (!bunshinGhost && !ninjaGhost) {
      if (isFrost()) gain += frostBonus;
      if (depth) gain += 30;
      else if (needle) gain += 20;
      else if (lucky) gain += 10;
      else if (swish) gain += 3;
    }
    if (swish && prevStage >= 2 && prevStage < 4) {
      const next = prevStage === 2 ? STAGE_IGNITE : STAGE_BLAZE;
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
    // Heat bonus = flat extra combo points (+1 冒烟 / +2 起火 / +3 烈焰).
    const extra = prevStage >= 4 ? 3 : prevStage === 3 ? 2 : prevStage >= 2 ? 1 : 0;
    if (!bunshinGhost && !ninjaGhost) gain += extra;
    if (freed && !bunshinGhost && !ninjaGhost) gain += prisonBonus;
    const clutch = !ghost && (buzzer || timeUp);
    const tag = clutch
      ? "绝杀"
      : ghost
        ? "分身"
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
      if (!ninjaGhost) gain += 5;
      if (!champFinishing) {
        buzzer = false;
        buzzerTimer = 0;
        timeUp = false;
      }
    }
    if (champMode && !bunshinGhost && !ninjaGhost) gain *= CHAMP_SCORE_MULT;
    if (isAnti() && holeOn) gain = 0;
    if (isRogueMode() && rogueRun && !ghost && rogueRun.buffPowerLeft > 0) {
      gain += catalogOf("ineedpower")?.powerBoostAdd ?? 20;
    }
    if (isRogueMode() && rogueRun && !bunshinGhost && !ninjaGhost) {
      const mod = applyRogueMakeMods(gain, rogueRun, {
        swish,
        bank,
        toilet,
        lucky,
        depth,
        needle,
        clutch,
        streak,
        holeOn,
      });
      gain = mod.gain;
      if (mod.gold > 0) {
        rogueRun.gold += mod.gold;
        rogueRun.peakGold = Math.max(rogueRun.peakGold, rogueRun.gold);
        callouts.push({
          text: `+${mod.gold}金`,
          x: scoredHoop.x,
          y: scoredHoop.y - 88,
          life: 0.85,
          max: 0.85,
          kind: "tag",
        });
      }
    }
    score += gain;
    noteGraf();
    if (isRogueMode() && rogueRun && !ghost) {
      rogueRun.stageScore = score;
      rogueRun.peakStreak = Math.max(rogueRun.peakStreak, streak);
      rogueRun.peakStreakAll = Math.max(rogueRun.peakStreakAll, streak);
      rogueRun.peakMake = Math.max(rogueRun.peakMake, gain);
      rogueRun.peakGold = Math.max(rogueRun.peakGold, rogueRun.gold);
      if (swish || bank || toilet || lucky || depth || needle || clutch) {
        rogueRun.specialMakes += 1;
      }
      // 小小我：每层迷你分身 +1 连击、本体一半分
      const minis = miniMeStacks(rogueRun);
      if (minis > 0) {
        for (let i = 0; i < minis; i++) {
          streak += 1;
          const half = Math.round(gain / 2);
          score += half;
          callouts.push({
            text: half > 0 ? `小+${half}` : "小+0",
            x: scoredHoop.x + (i - (minis - 1) / 2) * 22,
            y: scoredHoop.y - 58,
            life: 0.8,
            max: 0.8,
            kind: "tag",
          });
        }
        combo = Math.max(combo, streak);
        rogueRun.stageScore = score;
        rogueRun.peakStreak = Math.max(rogueRun.peakStreak, streak);
        rogueRun.peakStreakAll = Math.max(rogueRun.peakStreakAll, streak);
        rogueRun.peakMake = Math.max(rogueRun.peakMake, gain + Math.round(gain / 2) * minis);
      }
    } else if (isRogueMode() && rogueRun && bunshinGhost) {
      rogueRun.stageScore = score;
      rogueRun.peakStreak = Math.max(rogueRun.peakStreak, streak);
      rogueRun.peakStreakAll = Math.max(rogueRun.peakStreakAll, streak);
      rogueRun.peakMake = Math.max(rogueRun.peakMake, gain);
    }
    noteBest();
    if (!timerArmed) timerArmed = true;
    audio.swish();
    audio.score(swish, heatN());
    if (!reduced && !ghost) {
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
    const popX = scoredHoop.x;
    const popY = scoredHoop.y;
    const popInner = scoredHoop.inner;
    if (!ghost) {
      tugNet(hoop);
    } else {
      const near =
        (other && Math.hypot(other.x - popX, other.y - popY) < popInner * 2.5 ? other : null) ||
        (Math.hypot(hoop.x - popX, hoop.y - popY) < popInner * 2.5 ? hoop : null);
      if (near) tugNet(near);
    }
    const boardTop = ghost
      ? popY - popInner * RIM_RY - 40
      : boardGeom(hoop, world).visY;
    const hideMakeScore = (isAnti() && holeOn) || (ninjaGhost && gain <= 0);
    if (!hideMakeScore) {
      callouts.push({
        text: `+${gain}`,
        x: popX,
        y: popY - popInner * RIM_RY - 14,
        capY: boardTop + 8,
        life: 0.9,
        max: 0.9,
        kind: "score",
      });
    }
    if (freed && prisonBonus > 0) {
      callouts.push({
        text: `铐+${prisonBonus}`,
        x: popX,
        y: popY - popInner * RIM_RY + 18,
        capY: boardTop + 8,
        life: 0.85,
        max: 0.85,
        kind: "tag",
      });
    }
    if (isGlass() && swish && !ghost) {
      healGlass(GLASS_SWISH_HEAL, popX, popY - popInner * RIM_RY + 18);
    }
    if (frostGain > 0) {
      callouts.push({
        text: `冻+${frostBonus}`,
        x: popX,
        y: popY - popInner * RIM_RY + 18,
        capY: boardTop + 8,
        life: 0.85,
        max: 0.85,
        kind: "base",
      });
    }
    if (tag && !hideMakeScore) {
      callouts.push({
        text: tag,
        x: popX,
        y: popY - 70,
        life: 0.95,
        max: 0.95,
        kind: "tag",
      });
    }
    if (!ghost && isChamp() && !champMode && timerArmed) {
      const left = Math.max(0, timer);
      if (left > 0.05) {
        const add = left * CHAMP_BANK_RATE;
        if (add > 0.05) champBank += add;
      }
    }
    if (!champMode) {
      refillShotClock();
    } else if (!ghost && !champFinishing) {
      champIdleLeft = CHAMP_IDLE;
    }
    if (champFinishing && clutch && !ghost) {
      syncNinjaGhosts();
      champFinishing = false;
      champMode = false;
      champIdleLeft = -1;
      // 肉鸽：绝杀进球若已达目标则过关，否则本关失败；经典模式仍直接结束
      if (isRogueMode() && rogueRun) {
        emitHud();
        if (!rogueRun.endless && rogueRun.stageScore >= rogueRun.target) {
          enterRogueSettle();
        } else {
          failRogueOrOver();
        }
        return;
      }
      emitHud();
      gameOver({ quiet: true });
      return;
    }
    const stage = fireStage(heatN());
    if (!ghost) {
      if (isFrost() && Math.random() < frostChance()) {
        // hoop is the stand just scored into (swapped earlier if needed).
        const refreshing = hoop.frostLeft > 0;
        applyFrostToHoop(hoop, refreshing);
        callouts.push({
          text: refreshing ? "续冻" : "冻结",
          x: hoop.x,
          y: hoop.y - 78,
          life: 0.95,
          max: 0.95,
          kind: "tag",
        });
        frostSmoke(hoop);
      }
      nextHoop();
      if (!isFrost() && other && stage >= 2) {
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
    }
    syncNinjaGhosts();
    emitHud();
    if (
      !ghost &&
      isRogueMode() &&
      rogueRun &&
      !rogueRun.endless &&
      rogueRun.stageScore >= rogueRun.target
    ) {
      enterRogueSettle();
    }
  }

  function nextHoop() {
    const scored = hoop;
    scored.moving = false;
    scored.jolt = 0;
    scored.couple = true;
    scored.targetX = scored.x;

    const nextSide: -1 | 1 = scored.side < 0 ? 1 : -1;
    const frozenOther = other && other.frostLeft > 0 ? other : null;

    if (scored.frostLeft > 0) {
      scored.active = true;
    } else {
      scored.active = false;
      // Shattered stands are already dismissed (couple false).
      if (scored.couple) scored.hold = HOOP_HOLD;
    }

    if (frozenOther) {
      // Already two stands — never spawn a third. Same-side spawn blocked by frozenOther.
      if (frozenOther.side === nextSide) {
        hoop = frozenOther;
        other = scored;
      } else {
        hoop = scored;
        other = frozenOther;
      }
      hoop.active = true;
      other.active = other.frostLeft > 0 || other.hold > 0;
      ball.hitRim = false;
      ball.hitBoard = false;
      overRim = false;
      otherOverRim = false;
      return;
    }

    other = scored;
    otherOverRim = false;

    if (isFrost() && sideFrosted(nextSide)) {
      hoop = scored;
      hoop.active = true;
      ball.hitRim = false;
      ball.hitBoard = false;
      overRim = false;
      return;
    }

    hoop = makeHoop(world, nextSide, false, madeCount);
    hoop.x = nextSide < 0 ? -90 : world.w + 90;
    applyRogueHoopScale(hoop);
    hoop.net = buildNet(hoop);
    if (madeCount >= 50 && Math.random() < Math.max(0, moveChance + (isRogueMode() && rogueRun ? rogueMoveChanceDelta(rogueRun) : 0))) {
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

  function frostSmoke(h: Hoop) {
    if (!gfx.particles) return;
    for (let i = 0; i < 12; i++) {
      particles.push({
        x: h.x + (Math.random() - 0.5) * h.inner * 2.2,
        y: h.y - 10 + Math.random() * 36,
        vx: (Math.random() - 0.5) * 22,
        vy: -18 - Math.random() * 46,
        life: 0.45 + Math.random() * 0.45,
        max: 0.9,
        size: 2.2 + Math.random() * 4,
        hue: 82 + Math.random() * 14,
        spin: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 5,
      });
    }
  }

  function spawnFrostBits(dt: number) {
    if (!gfx.particles) return;
    if (Math.random() > 0.4 + dt) return;
    if (particles.length > 90) return;
    particles.push({
      x: ball.x + (Math.random() - 0.5) * ball.r * 1.4,
      y: ball.y + (Math.random() - 0.5) * ball.r * 1.4,
      vx: (Math.random() - 0.5) * 40 + ball.vx * 0.12,
      vy: -24 - Math.random() * 55 + ball.vy * 0.08,
      life: 0.16 + Math.random() * 0.22,
      max: 0.4,
      size: 1.8 + Math.random() * 2.6,
      hue: 84 + Math.random() * 12,
      spin: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 8,
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
        if (isFrost() && phase === "playing" && streak > 0) spawnFrostBits(tick);
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
          const timer01 = phase === "over" ? 1 : timerMax > 0 ? timer / timerMax : 0;
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
            fxCombo(),
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
            comboCounting && streak >= 1 && isPrison() && prisonMode === "shackle"
              ? streak
              : comboCounting && streak >= 2
                ? streak
                : 0,
            opener > 0 && streak < 2 ? "好戏开始" : champMode ? "冠军时刻" : holeOn ? "黑洞时刻" : "",
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
            prisonHud(),
            ninjaClonesDraw(),
            isChamp() && !champMode ? champBank : -1,
            holeOn ? { x: holeX, y: holeY, r: holeR, left: holeLeft } : null,
            isAnti() ? antiCharge : -1,
            isAnti() ? antiMatter : null,
            isRogueMode() && rogueRun
              ? rogueRun.endless
                ? `∞:${rogueRun.runScore + rogueRun.stageScore}`
                : `${rogueRun.target}:${rogueRun.stageScore}`
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
  if (isAnti()) {
    resetAntiRun();
  }
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
      autoPlay.setEnabled(false);
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
    setPlayMode(mode) {
      if (mode !== "classic" && mode !== "minute" && mode !== "rogue") return;
      if (mode === "minute" && ballId === "champ") return;
      if (playMode === mode) return;
      playMode = mode;
      if (phase === "title" || phase === "over") {
        timerMax = timerBudget();
        timer = timerMax;
        timerArmed = false;
      }
      persist();
      emitHud();
    },
    buyRogue(uid) {
      buyRogueOffer(uid);
    },
    grantRogue(id) {
      grantRogueGear(id);
    },
    revokeRogue(id) {
      revokeRogueGear(id);
    },
    resetRogueLoadout() {
      resetRogueOwnedLoadout();
    },
    closeRogueShop() {
      closeDevRogueShop();
    },
    rogueContinue() {
      continueRogueFromHub();
    },
    rogueConfirmSettle() {
      confirmRogueSettle();
    },
    rogueEndless() {
      startRogueEndless();
    },
    rogueEndRun() {
      endRogueFromSettle();
    },
    devBackFromSettle() {
      returnDevFromSettle();
    },
    useRogue(id) {
      useRogueGear(id);
    },
    answerStreakSave(use) {
      resolveStreakSavePrompt(use);
    },
    answerFlameReuse(use) {
      resolveFlameReusePrompt(use);
    },
    setRogueFuse(id) {
      applyRogueFuse(id);
    },
    setAutoPlay(on) {
      autoPlay.setEnabled(Boolean(on));
      emitHud();
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
        playMode,
        rogueStage: rogueRun?.stage ?? null,
        rogueEndless: rogueRun?.endless ?? null,
        autoPlay: autoPlay.enabled(),
        autoPlayReason: autoPlay.lastDecision()?.reason ?? null,
      };
    },
    tap: () => tapJump(),
    setAutoPlay: (on: boolean) => {
      autoPlay.setEnabled(Boolean(on));
      emitHud();
    },
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
    rogueEndless: () => startRogueEndless(),
    rogueEndRun: () => endRogueFromSettle(),
    /** Dev: jump to stage-5 clear settle for UI QA. */
    forceRogueClearSettle() {
      playMode = "rogue";
      rogueRun = createRogueRun();
      rogueRun.stage = ROGUE_CAMPAIGN_STAGES;
      rogueRun.target = 200;
      rogueRun.stageScore = 200;
      rogueRun.peakStreak = 5;
      rogueRun.peakStreakAll = 5;
      rogueRun.peakMake = 12;
      rogueRun.runScore = 800;
      rogueRun.gold = 40;
      rogueRun.peakGold = 40;
      rogueRun.stagesCleared = 4;
      enterRogueSettle();
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

function makeBall(world: World, side: -1 | 1, r = world.ballR): Ball {
  const x = side < 0 ? world.w * 0.22 : world.w * 0.78;
  return {
    x,
    y: world.floorY - r,
    vx: 0,
    vy: 0,
    r,
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
    frost: 0,
    frostLeft: 0,
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
