import { stepTrainSmoke } from "./train-smoke";
import { createAntiRecovery, launchAntiRecovery, scoreAntiRecovery, stepAntiRecovery, antiRecoveryIgnoresHoops, type AntiRecovery } from "./anti-recovery";
import { BUZZER_WINDOW, BUZZER_SPEED, hasBuzzerChance } from "./buzzer";
import { touchesAntimatter } from "./antimatter-pickup";
import { getTrainTunnel, restoreTrainTunnel, stepTrainTunnel, tunnelPassing, tunnelReserved, tunnelHoopMin, tunnelGeometry, collideTunnel } from "./train-tunnel.ts";
import { collideTrainGantries, getTrainGantries, getTrainGantryWarnings } from "./train-gantry.ts";
import { createBirds, stepBirds, collideBirds, collideFrozenBirds, releaseBirdCarrier, type BirdSkills, collideBirdGantries, birdOwnsBall, spawnBirdWave, type BirdKind, type BirdState } from "./birds.ts";
import { createRocket, rocketLayout, releaseRocket, stepRocket, refillRocket, drawRocket } from "./rocket";
import { SUPER, createSuper, superSwipe, superImpact, superBirdImpact, superToggle, superPulseShield, superBaseBonus, superScore, stepSuper, superDashVelocity, superLayout, drawSuper, drawSuperGhosts, drawSuperGas, drawSuperAura, superIsFrozen } from "./super";
import { VECTOR, createVector, vectorLayout, vectorRecover, vectorMake, vectorRelease, vectorHold, cancelVectorPress, drawVector, vectorPulse, vectorChargeScale, vectorFinishBurst, stepVectorLeak, vectorLeakBounce, stepVectorCorrection } from "./vector";
import { createAudio } from "./audio";
import { primeArt, artProgress, reloadSceneArt } from "./art";
import { canvasDpr } from "./perf";
import { primeSearchlightLayout } from "./searchlight-layout";
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
import { boardGeom, braceColliders, clearSceneLayers, drawBoot, drawScene, paintBallSprite } from "./render";
import { loadSave, writeSave } from "./save";
import { ballRadius, effectiveBall, getBall, parseBall, type BallId } from "./balls";
import { makeChain, resetChain, stepChain, type Chain } from "./chain";
import { hackerPadLayout, hitHackerPad, type HackerDir } from "./hacker-pad";
import { mazeGravityFromPoint, mazePadLayout, type MazeGravity } from "./maze-pad";
import { clearSparseCodeRain } from "./sparse-rain";
import { parseBalanceImport, mergeBalanceStores, automaticStrength, loadBalanceStore, saveBalanceStore, report as balanceReport, configKey as balanceConfigKey, type BalanceSession, type BalanceStore, type SkillState, DEFAULT_STRENGTH } from "./balance-test";
import { DEFAULT_MAZE, DEFAULT_PHYS, clampMaze, clampPhys, clampPhysKey, wantDevQuery, type DevCmd, type DevMaze, type DevPhys, type DevSceneId } from "./dev";
import { createModifier, modifierName, type ModifierId, type StageModifier } from "./modifiers";
import { getScene, getSceneId, setScene, type GrafKey, type SceneId } from "./scenes";
import { beginTrafficAbsorption, collideTraffic, createTraffic, grantTrafficSafe, stepTraffic, stepTrafficNearMiss, updateTrafficHackerSlide, trafficOutOfBounds } from "./traffic";
import { TRAIN_INERTIA_K, restoreTrainScroll, getTrainScroll, resetTrainScroll, startTrainScroll, stepTrainScroll, trainGravScale, trainInertiaAccel } from "./train-bg";
import { drawTrafficAlerts, drawTrafficWorld } from "./traffic-render";
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

export const GAME_REV = 306;

const STEP = 1 / 60;
const TIMER_START = 15;
const TIMER_MINUTE = 60;
const TIMER_MIN = 2.6;
const TIMER_DECAY = 0.972;
const GRAF_IN = 1.2;
const COMBO_STOP = 6;
const COMBO_DROP = 2;
const HOOP_HOLD = 0.72;
const FIRE_HOLD = 1.35;
const FROST_DUR_FIRST = 4;
const FROST_DUR_REFRESH = 3;
const FROST_CHANCE_BASE = 0.1;
const FROST_CHANCE_PER_STREAK = 0.01;
/** Champ: bank this fraction of leftover timer per make. */
const CHAMP_BANK_RATE = 0.2;
const CHAMP_SCORE_MULT = 2;
/** Anti ball: chance to spawn antimatter pickup after a make. */
const ANTI_SPAWN_CHANCE = 0.55;
const ANTI_HOLE_DUR_MIN = 10;
const ANTI_HOLE_DUR_MAX = 20;
const ANTI2_HOLE_DUR_MIN = 15;
const ANTI2_HOLE_DUR_MAX = 25;
/** Antimatter field linger (sec) × this = seconds shaved off hole duration. */
const ANTI_LINGER_PENALTY = 0.75;
const GLASS_BASE_START = 30;
const GLASS_BASE_MAX = 50;
const GLASS_RIM_HURT_MAX = 2;
const GLASS_BOARD_HURT_MAX = 1;
const GLASS_LAND_HURT_MAX = 10;
const GLASS_SWISH_HEAL = 4;
const MOVE_CHANCE_STEP = 0.004;
const MOVE_CHANCE_MAX = 0.5;
const BOLT_TICK = 0.1;
const BOLT_IDLE_DRAIN_TICK = 0.5;
const BOLT_ROLL_CHARGE_MAX = 8;
const BOLT_DRAIN_STEP = 1;
const BOLT_COST = 10;
const BOLT_HOLD_ARM = 0.5;
const BOLT_DIVE_DUR = 0.14;
const BOLT_GAP_DUR = 0.06;
const BOLT_OVERHEAT_DUR = 3;
const FROST_BONUS_PER_HIT = 2;
const PRISON_FREE_PER_COMBO = 3;
const PRISON_FREE_EXTEND = 10;
const NINJA_DELAYS = [0.11, 0.22, 0.33] as const;
const NINJA_CLONE_AT = [10, 26, 47] as const;
const MOVE_SPD0_LO = 0.048;
const MOVE_SPD0_HI = 0.078;
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
  setScene: (id: SceneId) => void;
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
  /** Activate inventory item / usable ornament from pause. */
  useRogue: (id: string) => void;
  /** Answer连击保护 prompt. */
  answerStreakSave: (use: boolean) => void;
  /** Answer热火饮料续用 prompt. */
  answerFlameReuse: (use: boolean) => void;
  /** Rogue open-run fuse: secondary ball or null = 不融�? */
  setRogueFuse: (id: BallId | null) => void;
  dev: (cmd: DevCmd) => void;
  resize: () => void;
};

export function rankFor(score: number): string {
  if (score <= 0) return "空气球员";
  if (score < 8) return "热身球员";
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
  const save = loadSave();
  setScene(save.scene);
  reloadSceneArt();
  primeArt();
  primeSearchlightLayout();
  const audio = createAudio();
  const reduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let world: World = layout(390, 844);
  let traffic = createTraffic();
  const trafficEnabled = () => getSceneId() === "overpass" && !(devOn && devScene === "void");
  const trainBackdropOn = () => getSceneId() === "train" && !(devOn && devScene === "void");
  let phase: Phase = "title";
  let booted = artProgress().ready;
  let lastLoadN = booted ? 100 : -1;
  let score = 0;
  // Lasts for this whole run (including rogue stages), never saved across new games.
  let birdBaseBonus = 0;
  let best = save.best;
  let bestMinute = save.bestMinute ?? 0;
  let bestRogue = save.bestRogue ?? 0;
  let playMode: PlayMode =
    save.playMode === "minute" || save.playMode === "rogue" ? save.playMode : "classic";
  let rogueRun: RogueRun | null = null;
  /** Active for current rogue stage only (from rest "缓时"). */
  let rogueStageDecay: number | null = null;
  let stageMod: StageModifier = createModifier("none");
  let devModifierForce: ModifierId | null = null;
  let combo = 0;
  let streak = 0;
  // Sandbox Match-tab settings hold these values steady until the user sets a new one or exits.
  let devScoreLock: number | null = null;
  let devComboLock: number | null = null;
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
  /** Player graphics state captured before the temporary developer sandbox overrides it. */
  let devGfxBackup: Gfx | null = null;
  let ballId: BallId = parseBall(save.ball);
  let paused = false;
  let hint = true;
  let devUnlocked = save.devUnlocked || wantDevQuery();
  let devOn = false;
  let devScene: DevSceneId = "void";
  let devFreeze = false;
  let devHoldHeat = false;
  let devPhys: DevPhys = { ...DEFAULT_PHYS };
  let devMaze: DevMaze = { ...DEFAULT_MAZE };
  let devPrisonProjectiles = true;
  let balanceStore: BalanceStore = typeof window === "undefined" ? { version: 1, config: { k: .06, r0Tolerance: .08, r1Min: .9, r1Max: 1.1, strength: {}, autoWeights: { score: 0.3, safety: 0.25, tempo: 0.15, burst: 0.15, cost: -0.15 } }, sessions: [] } : loadBalanceStore();
  let balanceSession: BalanceSession | null = null;
  let balanceSkillOn = true;
  let balancePeakCombo = 0;
  let balanceTriggers = 0;
  let balanceSkillScore = 0;
  /** Prevent gameOver and manual retry from saving the same balance trial twice. */
  let balanceTrialRecorded = false;
  let balanceMisses = 0;
  let balanceLastMakeAt: number | null = null;
  let balanceMaxMakeGapSeconds = 0;
  let balanceClicks = 0;
  let balanceHolds = 0;
  let balanceSkillInputs = 0;
  let balanceSkillActiveSeconds = 0;
  /** Countdown seconds the bolt is locked by overheat. A cost, not activation time. */
  let balanceSkillLockSeconds = 0;
  let balanceDirectMakes = 0;
  let balanceDirectScore = 0;
  let balanceRescues = 0;
  let balanceUnattributedScore = 0;
  let balancePlainGainAcc = 0;
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
  let pathHist: PathSample[] = [];
  let pathClock = 0;
  let ninjaGhosts: NinjaGhost[] = [];
  let ninjaGates: NinjaGate[] = [];
  let miniGhosts: MiniGhost[] = [];

  function activeBallR() {
    let r = world.ballR * kit().rScale;
    if (isRogueMode() && rogueRun) {
      const mul = rogueBallRMul(rogueRun);
      // 叠在球种半径上：经典→弹力球大小；弹力球再缩一�?
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

  function fuseIds(): BallId[] {
    if (!isRogueMode() || !rogueRun) return [];
    return rogueRun.fuseBalls ?? (rogueRun.fuseBall ? [rogueRun.fuseBall] : []);
  }

  function fuseId(): BallId | null {
    return fuseIds()[0] ?? null;
  }

  function kit() {
    return effectiveBall(ballId, fuseIds());
  }

  function skillsEnabled() { return !devOn || !balanceSession || balanceSkillOn; }
  function balanceLocked() { return Boolean(balanceSession && devOn); }

  function isPrison() { return skillsEnabled() && kit().chain; }

  function isNinja() { return skillsEnabled() && kit().ninja; }

  function isHacker() { return skillsEnabled() && kit().codeRain; }

  function isRocket() { return skillsEnabled() && kit().rocket; }
  function isVector() { return skillsEnabled() && kit().vector; }
  function isSuper() { return skillsEnabled() && kit().super; }

  function isMaze() { return skillsEnabled() && kit().maze; }

  function isQuantum() { return skillsEnabled() && kit().quantum; }

  function isTime() { return skillsEnabled() && kit().time; }

  function timeRewindBlocked() {
    return buzzer || timeUp;
  }

  function timeButtonLayout() {
    const r = Math.max(31, Math.min(46, world.w * 0.09));
    return { cx: world.w * 0.5, cy: world.floorY + (world.h - world.floorY) * 0.54, r };
  }

  function inTimeButton(x: number, y: number) {
    const button = timeButtonLayout();
    return Math.hypot(x - button.cx, y - button.cy) <= button.r * 1.18;
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
    // 小小我：本体半径的一半（弹力�?儿童装已缩小后，再取其一半）
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
    comboRescue = "approach";
    shotAirborne = false;
    resetTrail();
  }

  function markShotMissed() {
    if (shotOpen && !shotMade) {
      shotMissed = true;
      // Count one completed miss per shot, only after the balance minute is live.
      if (balanceSession && isMinuteMode() && timerArmed) balanceMisses += 1;
    }
  }

  /** Break active streak (timeout or finished miss jump). Heat may keep decaying. */
  function breakComboStreak() {
    if (buzzer) return;
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

  /** Break streak only when opening a new shot after a settled miss �?not mid-air / wrap. */
  function breakComboOnMissJump() {
    if (!shotMissed) return;
    shotMissed = false;
    comboRescue = "approach";
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
    // 铐奖 = 上一段枷锁最高连�?× 3；自由时长仍为连�?× 3 �?
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
      // Fading / waiting ghost rings should not shove the chain ball.
      if (!h.active || h.scoreable === false) continue;
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
      // Naked rims: no invisible backboard solid.
      if (h.noBoard) continue;
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
  let birds = createBirds();
  let tapLock = 0;
  let scoredLock = 0;
  /** Physical hoop that last accepted a make; clears the per-ball score gate once exited. */
  let scoreGateHoop: Hoop | null = null;
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
  /** Previous attempt finished without a make (floor settle) �?next new jump breaks streak. */
  let shotMissed = false;
  /** Left the floor during this attempt �?avoids marking miss on takeoff overlap. */
  let shotAirborne = false;
  // Natural ricochets do not spend the rescue; only a jump after contact starts it.
  type ComboRescue = "approach" | "contact" | "rescue" | "spent";
  let comboRescue: ComboRescue = "approach";
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
  let moveChance = 0;
  /** Raises only the high end of dynamic-hoop speed when a moving hoop is scored. */
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
  /** Permanent base-score pickups earned by close Maze Ball hole passes. */
  let mazeBaseBonus = 0;
  let frostBonus = 0;
  let champBank = 0;
  let champMode = false;
  /** Anti ball: antimatter charge 0–100, pickups, timed black hole. */
  let antiCharge = 0;
  let antiRecovery = createAntiRecovery();
  let antiMatter: { x: number; y: number; r: number; pct: number; age: number } | null =
    null;
  /** Sum of antimatter field linger this charge cycle (cuts hole duration). */
  let antiLingerAcc = 0;
  let antiPickupCount = 0;
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
  /**
   * Glass: one rim / board / floor penalty per jump.
   * Cleared only on tapJump �?not in resetShotFlags (floor settle used to re-arm
   * and cause multi-deduct while rattling on rim/board or hopping on the floor).
   */
  let glassRimHurtShot = false;
  let glassBoardHurtShot = false;
  let glassFloorHurtShot = false;
  /** Highest point (lowest Y) reached while this glass shot is armed for floor hurt. */
  let glassPeakY = 0;
  /** Lightning ball charge 0�?00. */
  let boltCharge = 0;
  let boltTickAcc = 0;
  let boltIdleDrainAcc = 0;
  let boltFloorGrip = false;
  let boltFloorSpeed = 0;
  let boltChargeUnlocked = false;
  let boltBoardGrip = false;
  let boltBoardTopHold = 0;
  let boltFastFill = false;
  let boltStormMakes = 0;
  let boltOverheatLeft = 0;
  let boltOverheatStartCharge = 0;
  let pointerHeld = false;
  let boltHoldArm = 0;
  let boltPendingTap = false;
  let boltStorm: null | {
    phase: "dive" | "gap";
    t: number;
    dur: number;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } = null;
  let boltTrail: { x: number; y: number }[] = [];
  let hackerDir: HackerDir | null = null;
  let hackerRimSlide: { dir: HackerDir; hoop: Hoop; turn: -1 | 1 } | null = null;
  let hackerAwaken = false;
  /** Energy, gesture ownership and flight state of the Vector Ball. */
  let rocket = createRocket();
  let vector = createVector();
  let superBall = createSuper();
  /** Pre-jump snapshot for the current super press; cleared on release or after swipeCancel. */
  let superTapUndo: null | {
    at: number;
    x: number; y: number; vx: number; vy: number; omega: number; squash: number;
    scored: boolean;
    shotOpen: boolean; shotMade: boolean; shotMissed: boolean; shotAirborne: boolean;
    combo: number; streak: number; comboClock: number; comboCounting: boolean; comboRescue: ComboRescue;
  } = null;
  /** Seconds remaining in Quantum Ball phase-through state. */
  let quantumTunnelLeft = 0;
  let quantumCheckedTier = 0;
  /** Unit-like gravity vector read from the Maze Ball floor joystick. */
  let mazeGravity: MazeGravity = { x: 0, y: 0 };
  let mazePointerId: number | null = null;
  let mazeTiltActive = false;
  let mazeTiltBase: { beta: number; gamma: number } | null = null;
  let mazeMotionBase: { x: number; y: number } | null = null;
  type MazeHole = { x: number; y: number; r: number; left: number; bonusTaken: boolean; closePassed: boolean };
  let mazeHoles: MazeHole[] = [];
  let mazeHoleSpawnLeft = 2.8;
  let mazeRespawnLeft = 0;

  // A compact rolling world history replays recent game state backward, including
  // score and combo, while permanent save data remains untouched.
  const REWIND_SECONDS = 5;
  const REWIND_SAMPLE_SECONDS = 1 / 30;
  type RewindSnapshot = {
    comboClock: number;
    comboCounting: boolean;
    comboRescue: ComboRescue;
    ball: Ball;
    traffic: ReturnType<typeof createTraffic>;
    hoop: Hoop;
    other: Hoop | null;
    particles: Particle[];
    callouts: Callout[];
    mazeHoles: MazeHole[];
    antiMatter: { x: number; y: number; r: number; pct: number; age: number } | null;
    holeOn: boolean;
    holeX: number;
    holeY: number;
    holeR: number;
    holeLeft: number;
    antiRecovery: AntiRecovery;
    boltTrail: { x: number; y: number }[];
    quantumTunnelLeft: number;
    mazeRespawnLeft: number;
    score: number;
    combo: number;
    streak: number;
    timer: number;
    timerArmed: boolean;
    buzzer: boolean;
    buzzerTimer: number;
    timeUp: boolean;
    madeCount: number;
    chain: Chain | null;
    ninjaGhosts: NinjaGhost[];
    ninjaGates: NinjaGate[];
    miniGhosts: MiniGhost[];
    pathHist: PathSample[];
    pathClock: number;
    time: number;
    cloudT: number;
    cloudShift: number;
    cloudHop: number;
    cloudMode: "drift" | "g1" | "g2" | "g3";
    cloudSx: number;
    cloudSy: number;
    stageState: unknown;
    trainRoute: ReturnType<typeof getTrainScroll>;
    tunnel: ReturnType<typeof getTrainTunnel>;
    birds: BirdState;
    birdBaseBonus: number;
    frostBonus: number; glassBase: number;
    holeLived: number; holeScoreAcc: number; holeTick: number;
    overRim: boolean; otherOverRim: boolean; scoredLock: number; rimHitLock: number; boardHitLock: number;
    shotState: { open: boolean; made: boolean; missed: boolean; airborne: boolean; rimHits: number; hitBoardTop: boolean; wentOffTop: boolean; fromBelow: boolean; gate: "hoop" | "other" | null };
  };
  let rewindHistory: RewindSnapshot[] = [];
  let rewindSampleLeft = 0;
  let rewindActive = false;
  let rewindStepLeft = 0;
  /** Time Ball energy: 100 points yields the full five-second rewind. */
  let timeEnergy = 0;
  let timeRewindPointer: number | null = null;
  const TIME_ENERGY_MAX = 100;
  const TIME_REWIND_MAX_SECONDS = 5;
  const TIME_ENERGY_DRAIN = TIME_ENERGY_MAX / TIME_REWIND_MAX_SECONDS;
  const HACKER_SPEED_BASE = 300;

  let hackerSpeed = HACKER_SPEED_BASE;

  function captureRewindSnapshot(dt: number) {
    if (phase !== "playing" || rewindActive) return;
    rewindSampleLeft -= dt;
    if (rewindSampleLeft > 0) return;
    rewindSampleLeft = REWIND_SAMPLE_SECONDS;
    rewindHistory.push({
      ball: structuredClone(ball),
      traffic: structuredClone(traffic),
      hoop: structuredClone(hoop),
      other: other ? structuredClone(other) : null,
      particles: structuredClone(particles),
      callouts: structuredClone(callouts),
      mazeHoles: structuredClone(mazeHoles),
      antiMatter: antiMatter ? { ...antiMatter } : null,
      holeOn, holeX, holeY, holeR, holeLeft,
      antiRecovery: { ...antiRecovery },
      boltTrail: structuredClone(boltTrail),
      quantumTunnelLeft, mazeRespawnLeft,
      score, combo, streak, comboClock, comboCounting, comboRescue, timer, timerArmed, buzzer, buzzerTimer, timeUp, madeCount,
      chain: chain ? structuredClone(chain) : null,
      ninjaGhosts: structuredClone(ninjaGhosts),
      ninjaGates: structuredClone(ninjaGates),
      miniGhosts: structuredClone(miniGhosts),
      pathHist: structuredClone(pathHist),
      pathClock,
      time, cloudT, cloudShift, cloudHop, cloudMode, cloudSx, cloudSy,
      stageState: stageMod.rewindState?.(),
      trainRoute: getTrainScroll(), tunnel: getTrainTunnel(),
      birds: structuredClone(birds),
      birdBaseBonus, frostBonus, glassBase, holeLived, holeScoreAcc, holeTick,
      overRim, otherOverRim, scoredLock, rimHitLock, boardHitLock,
      shotState: { open: shotOpen, made: shotMade, missed: shotMissed, airborne: shotAirborne,
        rimHits, hitBoardTop, wentOffTop, fromBelow, gate: scoreGateHoop === hoop ? "hoop" : other && scoreGateHoop === other ? "other" : null },
    });
    const maxSamples = Math.ceil(REWIND_SECONDS / REWIND_SAMPLE_SECONDS) + 2;
    if (rewindHistory.length > maxSamples) rewindHistory.shift();
  }

  function restoreRewindSnapshot(snapshot: RewindSnapshot) {
    restoreTrainScroll(snapshot.trainRoute); restoreTrainTunnel(snapshot.tunnel);
    birds = structuredClone(snapshot.birds);
    birdBaseBonus = snapshot.birdBaseBonus;
    frostBonus = snapshot.frostBonus; glassBase = snapshot.glassBase;
    holeLeft = snapshot.holeLeft; holeLived = snapshot.holeLived; holeScoreAcc = snapshot.holeScoreAcc; holeTick = snapshot.holeTick;
    overRim = snapshot.overRim; otherOverRim = snapshot.otherOverRim;
    scoredLock = snapshot.scoredLock; rimHitLock = snapshot.rimHitLock; boardHitLock = snapshot.boardHitLock;
    ball = structuredClone(snapshot.ball);
    traffic = structuredClone(snapshot.traffic);
    hoop = structuredClone(snapshot.hoop);
    other = snapshot.other ? structuredClone(snapshot.other) : null;
    shotOpen = snapshot.shotState.open; shotMade = snapshot.shotState.made;
    shotMissed = snapshot.shotState.missed; shotAirborne = snapshot.shotState.airborne;
    rimHits = snapshot.shotState.rimHits; hitBoardTop = snapshot.shotState.hitBoardTop;
    wentOffTop = snapshot.shotState.wentOffTop; fromBelow = snapshot.shotState.fromBelow;
    scoreGateHoop = snapshot.shotState.gate === "hoop" ? hoop : snapshot.shotState.gate === "other" ? other : null;
    particles = structuredClone(snapshot.particles);
    callouts = structuredClone(snapshot.callouts);
    mazeHoles = structuredClone(snapshot.mazeHoles);
    antiMatter = snapshot.antiMatter ? { ...snapshot.antiMatter } : null;
    holeOn = snapshot.holeOn;
    holeX = snapshot.holeX;
    holeY = snapshot.holeY;
    holeR = snapshot.holeR;
    holeLeft = snapshot.holeLeft;
    antiRecovery = { ...snapshot.antiRecovery };
    boltTrail = structuredClone(snapshot.boltTrail);
    quantumTunnelLeft = snapshot.quantumTunnelLeft;
    mazeRespawnLeft = snapshot.mazeRespawnLeft;
    score = snapshot.score;
    combo = snapshot.combo;
    streak = snapshot.streak;
    comboClock = snapshot.comboClock;
    comboCounting = snapshot.comboCounting;
    comboRescue = snapshot.comboRescue;
    timer = snapshot.timer;
    timerArmed = snapshot.timerArmed;
    buzzer = snapshot.buzzer;
    buzzerTimer = snapshot.buzzerTimer;
    timeUp = snapshot.timeUp;
    madeCount = snapshot.madeCount;
    chain = snapshot.chain ? structuredClone(snapshot.chain) : null;
    ninjaGhosts = structuredClone(snapshot.ninjaGhosts);
    ninjaGates = structuredClone(snapshot.ninjaGates);
    miniGhosts = structuredClone(snapshot.miniGhosts);
    pathHist = structuredClone(snapshot.pathHist);
    pathClock = snapshot.pathClock;
    time = snapshot.time;
    cloudT = snapshot.cloudT;
    cloudShift = snapshot.cloudShift;
    cloudHop = snapshot.cloudHop;
    cloudMode = snapshot.cloudMode;
    cloudSx = snapshot.cloudSx;
    cloudSy = snapshot.cloudSy;
    stageMod.restoreRewindState?.(snapshot.stageState);
    prevBallX = ball.x;
    prevBallY = ball.y;
    if (isRogueMode() && rogueRun) rogueRun.stageScore = score;
  }

  function rewindWorld() {
    if (!isTime() || phase !== "playing" || paused || timeRewindBlocked() || rewindActive || timeEnergy <= 0 || rewindHistory.length < 2) return;
    rewindActive = true;
    rewindStepLeft = 0;
    pointerHeld = false;
    mazePointerId = null;
    cancelVectorPress(vector);
    emitHud();
  }

  function stepRewind(dt: number) {
    timeEnergy = Math.max(0, timeEnergy - TIME_ENERGY_DRAIN * dt);
    rewindStepLeft -= dt;
    while (rewindStepLeft <= 0 && rewindHistory.length > 1) {
      rewindStepLeft += REWIND_SAMPLE_SECONDS;
      rewindHistory.pop();
      restoreRewindSnapshot(rewindHistory[rewindHistory.length - 1]!);
    }
    if (rewindHistory.length <= 1 || timeEnergy <= 0) {
      rewindActive = false;
      timeRewindPointer = null;
      rewindHistory = [];
      rewindSampleLeft = 0;
      rewindStepLeft = 0;
    }
    emitHud();
  }

  function noteComboContact(h: Hoop) {
    if (h.comboScored || !shotOpen || shotMade || shotMissed || ball.scored) return;
    if (comboRescue === "approach") comboRescue = "contact";
    else if (comboRescue === "rescue") comboRescue = "spent";
  }

  function resetShotFlags() {
    ball.hitRim = false;
    ball.hitBoard = false;
    overRim = false;
    rimHits = 0;
    hitBoardTop = false;
    wentOffTop = false;
    fromBelow = false;
  }

  function armGlassShotHurts() {
    glassRimHurtShot = false;
    glassBoardHurtShot = false;
    glassFloorHurtShot = false;
    glassLand = true;
    glassPeakY = ball.y;
  }

  function clearGlassShotHurts() {
    glassRimHurtShot = false;
    glassBoardHurtShot = false;
    glassFloorHurtShot = false;
    glassLand = false;
    glassPeakY = 0;
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
    // Minute mode keeps a fixed 60s clock �?no per-make shrink/refill.
    if (isMinuteMode() || champMode) return;
    const decay = activeDecay();
    if (hackerAwaken && isHacker()) {
      const prev = timerMax;
      timerMax = Math.min(timerBudget(), timerMax / Math.max(0.85, decay));
      const ratio = prev > 1e-6 ? timerMax / prev : 1;
      if (ratio > 1.0001) {
        hackerSpeed *= ratio;
        if (hackerDir) setHackerVelocity(hackerDir);
      }
    } else {
      timerMax = Math.max(TIMER_MIN, timerMax * decay);
    }
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

  function applyDevStatLocks() {
    if (balanceSession) balancePeakCombo = Math.max(balancePeakCombo, streak);
    if (!devOn) return;
    if (devScoreLock !== null) {
      score = devScoreLock;
      if (isRogueMode() && rogueRun) rogueRun.stageScore = score;
    }
    if (devComboLock !== null) {
      combo = devComboLock;
      streak = devComboLock;
      comboClock = 0;
      comboCounting = true;
      recoverTo = 0;
      recoverMakes = 0;
    }
  }

  function emitHud() {
    const raw01 = timerMax > 0 ? timer / timerMax : 0;
    const timer01 = hackerAwaken ? 1 - raw01 : raw01;
    const displayScore =
      isRogueMode() && rogueRun && phase === "over" ? rogueTotalScore() : score;
    onHud({
      phase,
      score: displayScore,
      best: modeBest(),
      combo: comboCounting ? streak : 0,
      trafficNearMiss: trafficEnabled() ? traffic.nearMiss : 0,
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
        fuseBalls: fuseIds(),
        phys: { ...devPhys },
        maze: { ...devMaze },
        playMode,
        modifierForce: devModifierForce,
        modifier: stageMod.id,
        prisonProjectiles: devPrisonProjectiles,
        scoreLocked: devScoreLock !== null,
        comboLocked: devComboLock !== null,
        balance: {
          session: balanceSession,
          config: balanceStore.config,
          skillOn: balanceSkillOn,
          rows: balanceSession
            ? balanceReport(balanceSession, balanceStore.config, {
                gameRev: GAME_REV,
                scene: balanceSession.scene,
                playMode: balanceSession.playMode || "minute",
              })
            : [],
          auto: balanceSession ? automaticStrength(balanceSession, balanceStore.config) : null,
        },
      },
      ballId,
      playMode,
      sceneId: getSceneId(),
      prison: prisonHud(),
      rogue: toRogueHud(isRogueMode() ? rogueRun : null),
    });
  }

  function persist() {
    writeSave({
      version: 11,
      best,
      bestMinute,
      bestRogue,
      playMode,
      scene: getSceneId(),
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

  // Glass uses a dedicated score/durability mode rather than a BallKit skill
  // flag, but it is still an ability for an R0 skills-off comparison.
  function isGlass() {
    return skillsEnabled() && kit().glass;
  }

  function glassScaledHurt(
    speed: number,
    dist: number,
    maxHurt: number,
    speedRef: number,
    distRef: number,
  ) {
    const s = clamp(speed / Math.max(1, speedRef), 0, 1);
    const d = clamp(dist / Math.max(1, distRef), 0, 1);
    return Math.round(maxHurt * clamp(0.7 * s + 0.3 * d, 0, 1));
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
    const collectionTime = isAnti2() ? lingerSec / Math.max(1, antiPickupCount) : lingerSec;
    const shaved = collectionTime * ANTI_LINGER_PENALTY;
    const min = isAnti2() ? ANTI2_HOLE_DUR_MIN : ANTI_HOLE_DUR_MIN;
    const max = isAnti2() ? ANTI2_HOLE_DUR_MAX : ANTI_HOLE_DUR_MAX;
    return Math.max(min, max - shaved);
  }

  function ballDefaultPhys(): DevPhys {
    const next = { ...DEFAULT_PHYS };
    const phys = getBall(ballId).phys;
    if (phys) {
      (Object.keys(phys) as (keyof DevPhys)[]).forEach((k) => {
        const v = phys[k];
        if (typeof v === "number") next[k] = v;
      });
    }
    return next;
  }

  /** In the sandbox, reset means the selected ball's authored baseline. */
  function applyKitPhys() {
    devPhys = ballDefaultPhys();
  }

  function gravity() {
    return world.h * 3.1 * pMul("grav") * (stageMod.gravMul?.() ?? 1);
  }

  /** Classic vertical accel: gravity multiplier 1 and no stage gravity. */
  function baseBallGravity() {
    return world.h * 3.1;
  }

  /** Fictitious horizontal accel for the ball on the train. 0 off the train and in cruise. */
  function trainPull() {
    if (!trainBackdropOn() || phase !== "playing") return 0;
    return trainInertiaAccel(undefined, TRAIN_INERTIA_K, trainGravScale(gravity(), baseBallGravity()));
  }

  function jumpVy() {
    return -Math.sqrt(
      2 * gravity() * world.h * 0.185 * pMul("jumpUp") * (stageMod.jumpMul?.() ?? 1),
    );
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

  function mazeRestitution(impact: number, _base: number) {
    // This ball rolls on the whole tilted court. Contacts must stay lively even
    // at low speed, then approach a hard-board rebound as impact increases.
    return clamp(0.68 + Math.min(0.24, impact / 1500), 0.68, 0.92);
  }

  function jumpVx() {
    return hoop.side * world.w * 0.76 * pMul("jumpFwd");
  }

  function wrapPad() {
    return Math.max(52, world.w * 0.15);
  }

  function canHeat() { return skillsEnabled() && kit().heat; }

  function isFrost() { return skillsEnabled() && kit().frost; }

  function isChamp() { return skillsEnabled() && kit().champ; }

  function isAnti() { return skillsEnabled() && kit().anti; }
  function isAnti2() { return skillsEnabled() && kit().anti2; }
  function anti2ReturnLocked() { return holeOn && isAnti2() && antiRecoveryIgnoresHoops(antiRecovery); }
  function legacyHole() { return holeOn && !isAnti2(); }

  function isBolt() { return skillsEnabled() && kit().bolt; }

  function modifierHost() {
    return {
      world,
      getHoop: () => hoop,
      setHoop: (h: Hoop) => {
        hoop = h;
      },
      clearOther: () => {
        other = null;
        otherOverRim = false;
      },
      makeGhostHoop: (side: -1 | 1) => {
        const h = makeHoop(world, side, false, madeCount, activeHoopYLimits());
        h.moving = false;
        h.moveAmp = 0;
        h.noBoard = true;
        h.fxAlpha = 0;
        h.fxScale = 0.72;
        h.scoreable = false;
        const x = side < 0 ? h.inner + world.w * 0.1 : world.w - h.inner - world.w * 0.1;
        h.x = x;
        h.targetX = x;
        h.baseX = x;
        return h;
      },
      applyHoopScale: (h: Hoop) => applyRogueHoopScale(h),
      getBall: () => ({ x: ball.x, y: ball.y, r: ball.r }),
      getBallBody: () => ball,
      getMadeCount: () => madeCount,
      notePrev: () => {
        prevBallX = ball.x;
        prevBallY = ball.y;
      },
      hoopYRange: () => activeHoopYLimits(),
      hit: (kind: "bone" | "glass") => {
        if (kind === "glass") {
          camShake = 0.22;
          whiteFlash = Math.max(whiteFlash, 0.14);
          audio.board(1);
        } else {
          camShake = Math.max(camShake, 0.07);
          audio.bounce(0.5);
        }
      },
      tag: (text: string) => {
        callouts.push({
          text,
          x: ball.x,
          y: ball.y - ball.r * 2.4,
          life: 0.75,
          max: 0.75,
          kind: "tag",
        });
      },
      rollFromOpposite: () => {
        const fromRight = hoop.side < 0;
        const spd = 52;
        ball.y = world.floorY - ball.r;
        ball.vy = 0;
        ball.squash = 1;
        ball.scored = false;
        ball.hitRim = false;
        ball.hitBoard = false;
        if (fromRight) {
          ball.x = world.w + ball.r + 8;
          ball.vx = -spd;
        } else {
          ball.x = -ball.r - 8;
          ball.vx = spd;
        }
        ball.omega = ball.vx / Math.max(8, ball.r);
        prevBallX = ball.x;
        prevBallY = ball.y;
        shotAirborne = false;
        resetTrail();
        syncChain();
      },
      paintBall: (
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        r: number,
        spin: number,
      ) => {
        paintBallSprite(ctx, x, y, r, spin, ballId, time);
      },
      isHackerAwaken: () => hackerAwaken,
      isMaze: () => isMaze(),
      onProjectileImpact: (vx: number, vy: number) => {
        if(isSuper()) {
          const len=Math.hypot(vx,vy)||1;
          return superImpact(superBall,ball,{nx:vx/len,ny:vy/len});
        }
        if (!isVector()) return false;
        // Restore pre-charge momentum first, so canceling the hold cannot erase the hit.
        cancelVectorInput();
        const incoming = { vx: ball.vx, vy: ball.vy };
        ball.vx += vx; ball.vy += vy;
        vectorCollision(incoming.vx, incoming.vy);
        return true;
      },
      getMazeHoles: () => mazeHoles,
      getBlackHole: () => holeOn ? { x: holeX, y: holeY, r: holeR } : null,
      onObjectAbsorbed: rewardAbsorbedObjects,
    };
  }

  function applyScenePack(id: SceneId) {
    if (getSceneId() === id) return;
    setScene(id);
    birds = createBirds();
    traffic = createTraffic();
    ball.trafficSafe = false;
    ball.sootLeft = 0; hoop.sootLeft = 0; if (other) other.sootLeft = 0;
    clearSceneLayers();
    reloadSceneArt();
    if (id === "train") resetTrainScroll();
    persist();
  }

  function bootStageModifier(opts?: { announce?: boolean }) {
    if (stageMod.holdsBall?.()) {
      ball.x = world.w * 0.32;
      ball.y = world.floorY - ball.r;
      ball.vx = 0;
      ball.vy = 0;
      ball.scored = false;
    }
    stageMod.end();
    let id: ModifierId = "none";
    const sceneDefault = getScene().defaultModifier;
    if (sceneDefault && sceneDefault !== "none") {
      id = sceneDefault;
      if (isRogueMode() && rogueRun) rogueRun.modifier = sceneDefault;
    } else if (isRogueMode() && rogueRun) {
      if (devModifierForce) {
        rogueRun.modifier = devModifierForce;
      }
      id = rogueRun.modifier;
    }
    if (devOn && devModifierForce) {
      id = devModifierForce;
      if (rogueRun) rogueRun.modifier = devModifierForce;
    }
    // The void is deliberately modifier-free so prison lights and projectiles cannot leak in.
    if (devOn && devScene === "void" && !devModifierForce) id = "none";
    // Title / hub: only scene-bound modifiers (e.g. prison daytime), never rogue rolls.
    if (phase === "title" || phase === "hub" || phase === "over" || phase === "settle") {
      id = sceneDefault && sceneDefault !== "none" ? sceneDefault : "none";
    }
    stageMod = createModifier(id);
    stageMod.begin(modifierHost());
    stageMod.setProjectiles?.(devPrisonProjectiles);
    const announce = opts?.announce !== false && phase === "playing" && id !== "none";
    if (announce) {
      callouts.push({
        text: modifierName(id),
        x: world.w * 0.5,
        y: world.h * 0.26,
        life: 1.05,
        max: 1.05,
        kind: "tag",
      });
    }
  }

  function resetBoltRun() {
    boltCharge = 0;
    boltTickAcc = 0;
    boltIdleDrainAcc = 0;
    boltFloorGrip = false;
    boltFloorSpeed = 0;
    boltChargeUnlocked = false;
    boltBoardGrip = false;
    boltBoardTopHold = 0;
    boltFastFill = false;
    boltStormMakes = 0;
    boltOverheatLeft = 0;
    boltOverheatStartCharge = 0;
    boltHoldArm = 0;
    boltPendingTap = false;
    boltStorm = null;
    boltTrail = [];
  }

  function boltAboveY(h: Hoop) {
    return h.y - Math.max(110, world.h * 0.22);
  }

  function boltBelowY(h: Hoop) {
    return h.y + Math.max(70, world.h * 0.12);
  }

  function beginBoltDive() {
    if (!isBolt() || phase !== "playing") return;
    if (boltCharge < BOLT_COST) {
      endBoltStorm();
      return;
    }
    const h = hoop;
    const x0 = h.x;
    const y0 = boltAboveY(h);
    const x1 = h.x;
    const y1 = boltBelowY(h);
    ball.x = x0;
    ball.y = y0;
    ball.vx = 0;
    ball.vy = 0;
    ball.omega = 0;
    ball.scored = false;
    ball.hitRim = false;
    ball.hitBoard = false;
    ball.squash = 1.04;
    prevBallX = x0;
    prevBallY = y0;
    resetShotFlags();
    shotOpen = true;
    shotMade = false;
    shotMissed = false;
    comboRescue = "approach";
    shotAirborne = true;
    boltTrail = [{ x: x0, y: y0 }];
    boltStorm = {
      phase: "dive",
      t: 0,
      dur: BOLT_DIVE_DUR,
      x0,
      y0,
      x1,
      y1,
    };
    // Prison: bolt ult can knock out searchlights in this vertical column.
    stageMod.strikeColumn?.(modifierHost(), x0);
  }

  function startBoltStorm() {
    if (!isBolt() || boltStorm || boltCharge < BOLT_COST || boltOverheatLeft > 0 || phase !== "playing") return;
    if (paused || buzzer || timeUp) return;
    boltPendingTap = false;
    boltHoldArm = 0;
    boltStormMakes = 0;
    hint = false;
    if (!timerArmed) timerArmed = true;
    noteBalanceHold();
    noteBalanceSkillInput();
    noteBalanceSkillEffect({ trigger: true });
    beginBoltDive();
  }

  function endBoltStorm() {
    if (!boltStorm && boltTrail.length === 0) return;
    boltStorm = null;
    boltTrail = [];
    boltHoldArm = 0;
    // Soft drop under the active hoop after the chain ends.
    ball.vx = hoop.side * 40;
    ball.vy = 80;
    ball.omega = ball.vx / Math.max(8, ball.r);
    shotAirborne = true;
  }

  function finishBoltDive() {
    if (!boltStorm) return;
    ball.x = boltStorm.x1;
    ball.y = boltStorm.y1;
    ball.vx = 0;
    ball.vy = 220;
    prevBallX = boltStorm.x0;
    prevBallY = boltStorm.y0;
    ball.hitRim = false;
    ball.hitBoard = false;
    boltCharge = Math.max(0, boltCharge - BOLT_COST);
    if (gfx.flash) {
      whiteFlash = 0.16;
      camShake = 0.18;
    }
    registerScore({ forceSwish: true });
    audio.whoosh(0.85);
    boltStormMakes += 1;
    if (boltStormMakes > 4 && Math.random() < Math.min(1, (boltStormMakes - 4) * 0.05)) {
      beginBoltOverheat();
      return;
    }
    if (!pointerHeld || boltCharge < BOLT_COST || phase !== "playing") {
      endBoltStorm();
      return;
    }
    boltStorm = { phase: "gap", t: 0, dur: BOLT_GAP_DUR, x0: 0, y0: 0, x1: 0, y1: 0 };
    boltTrail = [];
  }

  function beginBoltOverheat() {
    boltStorm = null;
    boltTrail = [];
    boltPendingTap = false;
    boltHoldArm = 0;
    pointerHeld = false;
    boltOverheatLeft = BOLT_OVERHEAT_DUR;
    boltOverheatStartCharge = Math.max(1, boltCharge);
    pinBoltOverheatBall();
    shotAirborne = false;
    callouts.push({
      text: "过热",
      x: ball.x,
      y: ball.y - ball.r * 2.6,
      life: 1,
      max: 1,
      kind: "tag",
    });
    if (gfx.flash) {
      whiteFlash = 0.14;
      camShake = 0.16;
    }
  }

  function pinBoltOverheatBall() {
    ball.x = Math.max(ball.r, Math.min(world.w - ball.r, ball.x));
    ball.y = world.floorY - ball.r;
    ball.vx = 0;
    ball.vy = 0;
    ball.omega = 0;
    ball.scored = false;
  }

  function stepBoltOverheat(dt: number) {
    if (!isBolt() || boltOverheatLeft <= 0) return false;
    boltOverheatLeft = Math.max(0, boltOverheatLeft - dt);
    const p = boltOverheatLeft / BOLT_OVERHEAT_DUR;
    boltCharge = Math.min(boltCharge, boltOverheatStartCharge * p);
    pinBoltOverheatBall();
    ball.squash += (0.94 - ball.squash) * (1 - Math.exp(-10 * dt));
    if (boltOverheatLeft <= 0) {
      boltCharge = 0;
      boltStormMakes = 0;
      ball.squash = 1;
    }
    return true;
  }
  function stepBoltStorm(dt: number) {
    if (!boltStorm) return false;
    boltStorm.t += dt;
    if (boltStorm.phase === "gap") {
      if (boltStorm.t >= boltStorm.dur) {
        if (!pointerHeld || boltCharge < BOLT_COST) endBoltStorm();
        else beginBoltDive();
      }
      return true;
    }
    const u = Math.min(1, boltStorm.t / Math.max(0.001, boltStorm.dur));
    // Ease-in dive
    const e = u * u;
    ball.x = boltStorm.x0 + (boltStorm.x1 - boltStorm.x0) * e;
    ball.y = boltStorm.y0 + (boltStorm.y1 - boltStorm.y0) * e;
    ball.vx = 0;
    ball.vy = (boltStorm.y1 - boltStorm.y0) / Math.max(0.001, boltStorm.dur);
    boltTrail.push({ x: ball.x, y: ball.y });
    if (boltTrail.length > 28) boltTrail.shift();
    if (u >= 1) finishBoltDive();
    return true;
  }

  function stepBoltCharge(dt: number) {
    if (!isBolt() || phase !== "playing" || paused) return;
    if (!boltChargeUnlocked) {
      boltTickAcc = 0;
      boltIdleDrainAcc = 0;
      return;
    }
    if (boltStorm) return;
    if (boltFastFill || boltFloorGrip) {
      boltIdleDrainAcc = 0;
      boltTickAcc += dt;
      while (boltTickAcc >= BOLT_TICK) {
        boltTickAcc -= BOLT_TICK;
        if (boltFastFill) {
          boltCharge = Math.min(100, boltCharge + 25);
        } else {
          const stopSpeed = 2.2;
          const fullSpeed = Math.max(stopSpeed + 1, Math.abs(jumpVx()));
          const speed01 = clamp((boltFloorSpeed - stopSpeed) / (fullSpeed - stopSpeed), 0, 1);
          boltCharge = Math.min(100, boltCharge + BOLT_ROLL_CHARGE_MAX * speed01);
        }
      }
      return;
    }
    boltTickAcc = 0;
    boltIdleDrainAcc += dt;
    while (boltIdleDrainAcc >= BOLT_IDLE_DRAIN_TICK) {
      boltIdleDrainAcc -= BOLT_IDLE_DRAIN_TICK;
      boltCharge = Math.max(0, boltCharge - BOLT_DRAIN_STEP);
    }
  }

  function resetAntiRun() {
    antiRecovery = createAntiRecovery();
    antiCharge = 0;
    antiMatter = null;
    antiLingerAcc = 0;
    antiPickupCount = 0;
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
    antiRecovery = createAntiRecovery();
    holeOn = false;
    holeLeft = 0;
    holeScoreAcc = 0;
    holeLived = 0;
    holeTick = 0;
    antiMatter = null;
    antiLingerAcc = 0;
    antiPickupCount = 0;
    // Refill countdown bar when the hole ends (classic shot clock only).
    if (phase === "playing" && !isMinuteMode() && !timeUp && !buzzer && timer > 0) {
      timer = timerMax;
      if (!timerArmed) timerArmed = true;
    }
    emitHud();
  }

  function openAntiHole(dur?: number) {
    antiRecovery = createAntiRecovery();
    const resolved =
      typeof dur === "number" && dur > 0 ? dur : rollAntiHoleDur(antiLingerAcc);
    antiLingerAcc = 0;
    antiPickupCount = 0;
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
    if (phase === "playing" && !isMinuteMode() && !isRogueMode() && !timeUp && !buzzer && timer > 0) {
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
    if (isAnti() && !isAnti2()) {
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
    if (!isAnti() || !antiMatter || holeOn) return;
    if (!touchesAntimatter({ x: prevBallX, y: prevBallY }, ball, antiMatter)) return;
    const got = antiMatter.pct;
    antiLingerAcc += antiMatter.age;
    antiPickupCount += 1;
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
    timeUp = false;
    buzzer = false;
    buzzerTimer = 0;
    timerMax = Math.max(bank, 0.5);
    timer = timerMax;
    timerArmed = true;
    emitHud();
    return true;
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
    h.baseX = h.x;
    h.baseY = h.y;
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
    // Champ is not allowed in 1-minute �?fall back to classic when picking it.
    if (next === "champ" && playMode === "minute") {
      playMode = "classic";
    }
    ballId = next;
    vector = createVector(); superBall = createSuper();
    rocket = createRocket();
    quantumTunnelLeft = 0;
    quantumCheckedTier = 0;
    mazeGravity = { x: 0, y: 0 };
    mazePointerId = null;
    mazeHoles = [];
    mazeHoleSpawnLeft = 2.8;
    mazeRespawnLeft = 0;
    ball.blink = false;
    if (rogueRun) {
      rogueRun.fuseBalls = (rogueRun.fuseBalls ?? []).filter((id) => id !== ballId);
      rogueRun.fuseBall = rogueRun.fuseBalls[0] ?? null;
    }
    glassBase = GLASS_BASE_START;
    clearGlassShotHurts();
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
    }
    if (!isAnti()) {
      antiCharge = 0;
      antiMatter = null;
      antiLingerAcc = 0;
      antiPickupCount = 0;
      holeOn = false;
      holeLeft = 0;
      holeScoreAcc = 0;
      holeLived = 0;
      holeTick = 0;
    } else {
      resetAntiRun();
    }
    if (!isBolt()) resetBoltRun();
    else {
      boltStorm = null;
      boltTrail = [];
      boltPendingTap = false;
      boltHoldArm = 0;
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
    persist();
    emitHud();
  }

  /** Rogue open-run / dev: OR secondary ball skills onto primary look/feel. */
  function applyRogueFuse(id: BallId | null) {
    if (!isRogueMode()) return;
    if (!rogueRun) rogueRun = createRogueRun();
    const next = id && parseBall(id) !== ballId ? parseBall(id) : null;
    const current = rogueRun.fuseBalls ?? (rogueRun.fuseBall ? [rogueRun.fuseBall] : []);
    const fuses = next
      ? current.includes(next)
        ? current.filter((fuse) => fuse !== next)
        : current.length < 3
          ? [...current, next]
          : current
      : [];
    rogueRun.fuseBalls = fuses;
    rogueRun.fuseBall = fuses[0] ?? null;
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
    }
    if (!isAnti()) {
      antiCharge = 0;
      antiMatter = null;
      antiLingerAcc = 0;
      antiPickupCount = 0;
      holeOn = false;
      holeLeft = 0;
      holeScoreAcc = 0;
      holeLived = 0;
      holeTick = 0;
    } else if (!holeOn && !antiMatter && antiCharge <= 0) {
      resetAntiRun();
    }
    if (!isBolt()) resetBoltRun();
    if (!isHacker()) {
      hackerDir = null;
      hackerAwaken = false;
      hackerSpeed = HACKER_SPEED_BASE;
      clearSparseCodeRain();
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

  function predictBuzzerMake() {
    const pending = shotOpen && !shotMade && !shotMissed && !ball.scored &&
      !birdOwnsBall(birds) && !stageMod.holdsBall?.() &&
      !(holeOn && isAnti2() && antiRecovery.mode !== "flight");
    const targets = [hoop, ...(other && (other.active || other.frostLeft > 0) ? [other] : [])]
      .filter(h => stageMod.canScore(h))
      .map(h => {
        const g = boardGeom(h, world);
        return { x: h.x, y: h.y, inner: h.inner,
          boardTop: h.noBoard ? h.y - h.inner : g.visY,
          boardX: h.noBoard ? h.x : g.visX + g.visW / 2,
          movingPad: h.moving ? Math.min(h.inner, 24) : 0 };
      });
    return hasBuzzerChance({ ball, targets, shotPending: pending,
      floorY: world.floorY, width: world.w, wrapPad: holeOn ? null : wrapPad(),
      gravity: gravity(), air: pMul("air"), buoy: pMul("buoy"),
      fallBoost: !holeOn && pMul("ball") <= 1.15,
      straight: (isHacker() && hackerAwaken) || vector.burst > 0 || !!superBall.dash });
  }

  function finishExpiredShot() {
    if (isRogueMode() && rogueRun && !rogueRun.endless && rogueRun.stageScore >= rogueRun.target) {
      enterRogueSettle();
    } else if (!isMinuteMode() && isHacker() && !hackerAwaken) {
      enterHackerAwaken();
    } else {
      failRogueOrOver();
    }
  }

  function beginLastShotOrFinish() {
    timeUp = true;
    if (!predictBuzzerMake()) {
      finishExpiredShot();
      return;
    }
    buzzer = true;
    buzzerTimer = BUZZER_WINDOW;
    audio.buzzer();
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
    for (const b of birds.birds) {
      b.x *= sx; b.px *= sx; b.y *= sy; b.py *= sy;
      b.vx *= sx; b.vy *= sy; b.baseY *= sy;
      b.flightVx = birds.trainSpeed + (b.flightVx - birds.trainSpeed) * sx; b.exitX *= sx;
      b.r = world.ballR * (b.kind === "eagle" ? 1.05 : 0.9);
    }
    if (birds.respawn) {
      birds.respawn.x *= sx; birds.respawn.y *= sy;
      birds.respawn.vx *= sx; birds.respawn.vy *= sy;
    }
    for (const vehicle of traffic.vehicles) {
      vehicle.x *= sx;
      vehicle.prevX *= sx;
      vehicle.speed *= sx;
      if (vehicle.burnLaunch) {
        vehicle.burnLaunch.vx *= sx;
        vehicle.burnLaunch.vy *= sy;
      }
      if (vehicle.absorbed) {
        vehicle.absorbed.x *= sx;
        vehicle.absorbed.y *= sy;
        vehicle.absorbed.targetX *= sx;
        vehicle.absorbed.targetY *= sy;
      }
    }
    for (const warning of traffic.warnings) warning.speed *= sx;
    ball.x *= sx;
    ball.y *= sy;
    ball.r = activeBallR();
    if (!birdOwnsBall(birds) && ball.y + ball.r > world.floorY) ball.y = world.floorY - ball.r;
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

  function resetBalanceTrialCounters() {
    balancePeakCombo = 0;
    balanceTriggers = 0;
    balanceSkillScore = 0;
    balanceTrialRecorded = false;
    balanceMisses = 0;
    balanceLastMakeAt = null;
    balanceMaxMakeGapSeconds = 0;
    balanceClicks = 0;
    balanceHolds = 0;
    balanceSkillInputs = 0;
    balanceSkillActiveSeconds = 0;
    balanceSkillLockSeconds = 0;
    balanceDirectMakes = 0;
    balanceDirectScore = 0;
    balanceRescues = 0;
    balanceUnattributedScore = 0;
    balancePlainGainAcc = 0;
  }

  function balanceTelemetryLive() {
    return Boolean(balanceSession && devOn && isMinuteMode() && timerArmed);
  }

  function noteBalanceClick() {
    if (balanceTelemetryLive()) balanceClicks += 1;
  }

  function noteBalanceHold() {
    if (balanceTelemetryLive()) balanceHolds += 1;
  }

  function noteBalanceSkillInput() {
    if (balanceTelemetryLive()) balanceSkillInputs += 1;
  }

  /** Attribute a skill-driven make/score/rescue at the moment the skill actually helps. */
  function noteBalanceSkillEffect(opts: {
    trigger?: boolean;
    directMake?: boolean;
    directScore?: number;
    rescue?: boolean;
  }) {
    if (!balanceSession || !devOn || !balanceSkillOn) return;
    if (ballId === balanceSession.baseline) return;
    if (opts.trigger) balanceTriggers += 1;
    if (opts.directMake) balanceDirectMakes += 1;
    if (opts.directScore && opts.directScore > 0) {
      balanceDirectScore += opts.directScore;
      balanceSkillScore += opts.directScore;
    }
    if (opts.rescue) balanceRescues += 1;
  }

  function rewardAbsorbedObjects(count: number) {
    if (count <= 0 || phase !== "playing") return;
    score += count;
    if (isRogueMode() && rogueRun) rogueRun.stageScore = score;
    noteBalanceSkillEffect({ trigger: true, directScore: count });
    noteBest();
    callouts.push({ text: `吸收 +${count}`, x: holeX, y: holeY - holeR * 1.2, life: 0.65, max: 0.65, kind: "tag" });
    emitHud();
  }

  function rewardBirdStuns(count: number) {
    if (count <= 0 || holeOn) return;
    birdBaseBonus += count * 2;
    const stunned = birds.birds.find(b => b.mode === "stunned" && b.modeTime === 0);
    callouts.push({ text: `基础 +${count * 2}`, x: Math.max(50, Math.min(world.w - 50, stunned?.x ?? ball.x)),
      y: Math.max(90, Math.min(world.floorY - 40, (stunned?.y ?? ball.y) - ball.r * 2)), life: 1.1, max: 1.1, kind: "base" });
    emitHud();
  }

  function birdSkills(): BirdSkills {
    return {
      unobservable: quantumTunnelLeft > 0,
      lethal: (isHacker() && hackerAwaken) || (isBolt() && (Boolean(boltStorm) || (boltCharge > 90 && !ball.scored))),
      burn: heatN() >= STAGE_IGNITE,
      frostChance: isFrost() ? frostChance() : 0,
      hole: holeOn ? { x: holeX, y: holeY, r: holeR } : undefined,
      block: isSuper() ? (catching, nx, ny) => superBirdImpact(superBall, ball, catching, nx, ny) : undefined,
    };
  }

  function settleBirdEffects(iceBefore: number, absorbedBefore: number) {
    const frostGain = (birds.iceBreaks - iceBefore) * 3;
    if (frostGain > 0) {
      frostBonus += frostGain;
      callouts.push({ text: `基础 +${frostGain}`, x: ball.x, y: ball.y - ball.r * 2, life: 1, max: 1, kind: "base" });
      emitHud();
    }
    rewardAbsorbedObjects(birds.absorbed - absorbedBefore);
  }

  function stepBirdIce(scrollDelta: number) {
    if (!birds.birds.some(b => b.mode === "frozen")) return;
    const boxes: Array<{ x: number; y: number; w: number; h: number; shift?: number }> = [
      { x: -world.w, y: world.floorY, w: world.w * 3, h: world.h },
    ];
    const segments: Array<{ x0: number; y0: number; x1: number; y1: number; halfW: number }> = [];
    for (const target of other ? [hoop, other] : [hoop]) {
      if (!target.noBoard) {
        const g = boardGeom(target, world);
        boxes.push({ x: g.visX, y: g.visY, w: g.visW, h: g.bh });
        segments.push(...braceColliders(target, world));
      }
      for (const side of [-1, 1]) boxes.push({ x: target.x + side * target.inner - target.tube, y: target.y - target.tube, w: target.tube * 2, h: target.tube * 2 });
    }
    for (const gantry of getTrainGantries(world, getTrainScroll(), Math.abs(scrollDelta) + world.ballR * 3)) {
      for (const rect of gantry.rects) boxes.push({ ...rect, shift: scrollDelta });
    }
    if (tunnelPassing()) {
      const g = tunnelGeometry(world);
      boxes.push({ x: g.x, y: -world.h * 4, w: g.end - g.x, h: world.h * 4 + g.roof, shift: scrollDelta });
    }
    collideFrozenBirds(birds, boxes, segments);
  }

  function resolveBirdContact(fromX: number, fromY: number) {
    const iceBefore = birds.iceBreaks, absorbedBefore = birds.absorbed;
    let incoming = 0, contactDistance = 0;
    const skills = birdSkills();
    skills.contact = (impact, distance) => { incoming = impact; contactDistance = distance; };
    const hit = collideBirds(birds, ball, fromX, fromY, skills);
    settleBirdEffects(iceBefore, absorbedBefore);
    if (!hit) return null;
    if (hit === "knockdown") rewardBirdStuns(1);
    if (isGlass() && hit !== "knockdown" && hit !== "caught" && !glassBoardHurtShot) {
      const damage = glassScaledHurt(incoming, contactDistance, GLASS_BOARD_HURT_MAX, 520, ball.r * 2);
      if (damage > 0) { glassBoardHurtShot = true; hurtGlass(damage, ball.x, ball.y); }
    }
    prevBallX = ball.x; prevBallY = ball.y;
    resetShotFlags(); resetTrail(); audio.board(0.45);
    if (hit === "caught") {
      const caughtBody = { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy };
      const parryPointer = isSuper() ? superBall.pointer : null;
      cancelVectorInput(); vector.burst = 0; vector.correction = null; vector.anchor = null;
      vector.trail = []; superBall.ghosts = [];
      superBall.pending = null; superBall.queue = []; superBall.dash = null; superBall.pointer = parryPointer;
      releaseRocket(rocket, ball); pointerHeld = false; boltPendingTap = false; boltStorm = null;
      holeOn = false; hackerDir = null;
      ball.scored = false; scoreGateHoop = null;
      Object.assign(ball, caughtBody);
    }
    return hit;
  }

  function beginPlay() {
    birdBaseBonus = 0;
    birds = createBirds();
    traffic = createTraffic();
    ball.trafficSafe = false;
    resetBalanceTrialCounters();
    phase = "playing";
    paused = false;
    rewindHistory = [];
    rewindSampleLeft = 0;
    rewindActive = false;
    rewindStepLeft = 0;
    timeEnergy = 0;
    timeRewindPointer = null;
    score = 0;
    mazeBaseBonus = 0;
    combo = 0;
    streak = 0;
    hint = true;
    hackerDir = null;
    hackerAwaken = false;
    vector = createVector(); superBall = createSuper();
    rocket = createRocket();
    quantumTunnelLeft = 0;
    quantumCheckedTier = 0;
    mazeGravity = { x: 0, y: 0 };
    mazePointerId = null;
    mazeHoles = [];
    mazeHoleSpawnLeft = 2.8;
    mazeRespawnLeft = 0;
    ball.blink = false;
    mazeTiltActive = typeof DeviceOrientationEvent !== "undefined" || typeof DeviceMotionEvent !== "undefined";
    mazeTiltBase = null;
    mazeMotionBase = null;
    hackerSpeed = HACKER_SPEED_BASE;
    clearSparseCodeRain();
    madeCount = 0;
    resetTrainScroll();
    ball.sootLeft = 0;
    if (isRogueMode()) {
      rogueRun = createRogueRun();
      rogueStageDecay = null;
      if (devOn) {
        rogueRun.endless = true;
        // Sandbox skips open-run fuse UI; use 融合�?chips instead.
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
    scoreGateHoop = null;
    tapLock = 0;
    comboClock = 0;
    comboCounting = true;
    shotOpen = false;
    shotMade = false;
    shotMissed = false;
    comboRescue = "approach";
    shotAirborne = false;
    opener = 0;
    bgmOn = false;
    recoverTo = 0;
    recoverMakes = 0;
    moveChance = 0;
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
    if (isMaze()) {
      ball.vx = 0;
      ball.vy = 0;
    } else {
      ball.vx = jumpVx() * 0.18;
      ball.vy = jumpVy() * 0.16;
    }
    prevBallX = ball.x;
    prevBallY = ball.y;
    particles = [];
    callouts = [];
    resetTrail();
    resetGraf();
    clearGlassShotHurts();
    glassBase = GLASS_BASE_START;
    frostBonus = 0;
    champBank = 0;
    champMode = false;
    resetAntiRun();
    resetBoltRun();
    otherOverRim = false;
    boardHitLock = 0;
    resetPrisonRun();
    resetNinjaPath();
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
    bootStageModifier();
    emitHud();
  }

  function recordBalanceTrial(endReason: "time" | "retry" = "time") {
    // A test run is valid only after its first make has armed the minute clock.
    if (!balanceSession || !devOn || !isMinuteMode() || !timerArmed || balanceTrialRecorded) return;
    const isBaseline = ballId === balanceSession.baseline;
    const skillState: SkillState = isBaseline ? "baseline" : balanceSkillOn ? "on" : "off";
    const effectiveSeconds = Math.max(0, timerMax - timer);
    balanceSession.trials.push({
      id: crypto.randomUUID(),
      sessionId: balanceSession.id,
      ballId,
      skillState,
      score,
      maxCombo: balancePeakCombo,
      triggers: balanceTriggers,
      skillScore: balanceSkillScore,
      makes: madeCount,
      misses: balanceMisses,
      maxMakeGapSeconds: balanceMaxMakeGapSeconds,
      effectiveSeconds,
      completed: timer <= 0,
      endReason,
      clicks: balanceClicks,
      holds: balanceHolds,
      skillInputs: balanceSkillInputs,
      skillActiveSeconds: Math.round(balanceSkillActiveSeconds * 100) / 100,
      skillLockSeconds: Math.round(balanceSkillLockSeconds * 100) / 100,
      directMakes: balanceDirectMakes,
      directScore: balanceDirectScore,
      rescues: balanceRescues,
      unattributedScore: isBaseline || !balanceSkillOn ? 0 : Math.round(balanceUnattributedScore),
      timestamp: new Date().toISOString(),
      gameRev: GAME_REV,
      configKey: balanceConfigKey(balanceSession.configSnapshot ?? balanceStore.config),
    });
    const existing = balanceStore.sessions.findIndex((session) => session.id === balanceSession!.id);
    if (existing >= 0) balanceStore.sessions[existing] = balanceSession;
    else balanceStore.sessions.push(balanceSession);
    saveBalanceStore(balanceStore);
    balanceTrialRecorded = true;
  }

  function gameOver(opts?: { quiet?: boolean }) {
    if (phase === "over") return;
    recordBalanceTrial();
    phase = "over";
    paused = false;
    buzzer = false;
    buzzerTimer = 0;
    hackerDir = null;
    hackerAwaken = false;
    vector = createVector(); superBall = createSuper();
    rocket = createRocket();
    quantumTunnelLeft = 0;
    quantumCheckedTier = 0;
    mazeGravity = { x: 0, y: 0 };
    mazePointerId = null;
    mazeHoles = [];
    mazeHoleSpawnLeft = 2.8;
    mazeRespawnLeft = 0;
    ball.blink = false;
    mazeTiltActive = typeof DeviceOrientationEvent !== "undefined" || typeof DeviceMotionEvent !== "undefined";
    mazeTiltBase = null;
    mazeMotionBase = null;
    hackerSpeed = HACKER_SPEED_BASE;
    clearSparseCodeRain();
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
    comboRescue = "approach";
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
    noteBest();
    emitHud();
  }

  function confirmRogueSettle() {
    if (!isRogueMode() || !rogueRun || phase !== "settle") return;
    // Campaign clear (final stage): stay on settle for End / Endless UI.
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
    // settleStagePayout already folded last stage into runScore �?carry that total.
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
    if (isGlass() && glassBase <= 0) glassBase = GLASS_BASE_START;
    clearGlassShotHurts();
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
      text: "閲婃斁",
      x: world.w * 0.5,
      y: world.h * 0.28,
      life: 0.9,
      max: 0.9,
      kind: "tag",
    });
    emitHud();
  }

  function startRogueStageCourt() {
    birds = createBirds();
    traffic = createTraffic();
    ball.trafficSafe = false;
    madeCount = 0;
    resetTrainScroll();
    ball.sootLeft = 0;
    score = 0;
    mazeBaseBonus = 0;
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
    scoreGateHoop = null;
    tapLock = 0;
    comboClock = 0;
    comboCounting = true;
    shotOpen = false;
    shotMade = false;
    shotMissed = false;
    comboRescue = "approach";
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
    if (isMaze()) {
      ball.vx = 0;
      ball.vy = 0;
    } else {
      ball.vx = jumpVx() * 0.18;
      ball.vy = jumpVy() * 0.16;
    }
    prevBallX = ball.x;
    prevBallY = ball.y;
    particles = [];
    callouts = [];
    resetTrail();
    resetAntiRun();
    resetBoltRun();
    otherOverRim = false;
    boardHitLock = 0;
    frostBonus = 0;
    champBank = 0;
    champMode = false;
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
      // 黑洞饰品：每关开局自动开启（时长 = 4s × 层数�?
      const holeSec = rogueBlackholeSec(rogueRun);
      if (holeSec > 0) openAntiHole(holeSec);
    }
    bootStageModifier();
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

  function setHackerVelocity(dir: HackerDir) {
    const speed = hackerSpeed;
    if (dir === "l") {
      ball.vx = -speed;
      ball.vy = 0;
    } else if (dir === "r") {
      ball.vx = speed;
      ball.vy = 0;
    } else if (dir === "u") {
      ball.vx = 0;
      ball.vy = -speed;
    } else {
      ball.vx = 0;
      ball.vy = speed;
    }
    ball.omega = ball.vx / Math.max(8, ball.r);
  }


  function hackerDirectionVector(dir: HackerDir) {
    if (dir === "l") return { x: -1, y: 0 };
    if (dir === "r") return { x: 1, y: 0 };
    if (dir === "u") return { x: 0, y: -1 };
    return { x: 0, y: 1 };
  }

  function updateHackerRimSlide() {
    const slide = hackerRimSlide;
    if (!slide) {
      if (hackerDir) setHackerVelocity(hackerDir);
      return;
    }
    const h = slide.hoop;
    const points = [
      { x: h.x - h.inner, y: h.y },
      { x: h.x + h.inner, y: h.y },
    ];
    const nearest = points.reduce((best, point) =>
      Math.hypot(ball.x - point.x, ball.y - point.y) < Math.hypot(ball.x - best.x, ball.y - best.y)
        ? point
        : best,
    );
    const dx = ball.x - nearest.x;
    const dy = ball.y - nearest.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    const normalX = dx / dist;
    const normalY = dy / dist;
    const desired = hackerDirectionVector(slide.dir);
    if (desired.x * normalX + desired.y * normalY >= -0.02) {
      hackerRimSlide = null;
      setHackerVelocity(slide.dir);
      return;
    }
    ball.vx = -normalY * hackerSpeed * slide.turn;
    ball.vy = normalX * hackerSpeed * slide.turn;
    ball.omega = ball.vx / Math.max(8, ball.r);
  }
  function applyHackerDir(dir: HackerDir) {
    hackerRimSlide = null;
    hackerDir = dir;
    setHackerVelocity(dir);
    ball.scored = false;
    resetShotFlags();
    shotOpen = true;
    shotMade = false;
    shotMissed = false;
    comboRescue = "approach";
    shotAirborne = dir === "u" || dir === "d";
    hint = false;
    overRim = false;
    fromBelow = false;
    otherOverRim = false;
  }

  function enterHackerAwaken() {
    if (hackerAwaken || !isHacker()) return;
    hackerAwaken = true;
    hackerRimSlide = null;
    hackerSpeed = HACKER_SPEED_BASE;
    timeUp = false;
    buzzer = false;
    buzzerTimer = 0;
    timer = timerMax;

    const horizontal = Math.abs(ball.vx);
    const vertical = Math.abs(ball.vy);
    if (horizontal >= vertical && horizontal > 8) {
      applyHackerDir(ball.vx >= 0 ? "r" : "l");
    } else if (vertical > 8) {
      applyHackerDir(ball.vy >= 0 ? "d" : "u");
    } else {
      applyHackerDir("u");
    }

    callouts.push({
      text: "觉醒",
      x: ball.x,
      y: ball.y - ball.r * 2.6,
      life: 1.1,
      max: 1.1,
      kind: "tag",
    });
    emitHud();
  }

  function syncHackerDirFromVelocity() {
    const horizontal = Math.abs(ball.vx);
    const vertical = Math.abs(ball.vy);
    if (horizontal < 6 && vertical < 6) return;
    hackerDir =
      horizontal >= vertical
        ? ball.vx >= 0
          ? "r"
          : "l"
        : ball.vy >= 0
          ? "d"
          : "u";
    setHackerVelocity(hackerDir);
  }

  function wrapHackerBounds() {
    const r = ball.r;
    if (ball.x < -r) ball.x += world.w + r * 2;
    else if (ball.x > world.w + r) ball.x -= world.w + r * 2;
    if (ball.y < r) {
      ball.y = r;
      applyHackerDir("d");
    }
    if (ball.y + r > world.floorY) {
      ball.y = world.floorY - r;
      applyHackerDir("u");
    }
  }


  function releaseVectorAnchor() {
    if(vector.anchor) { ball.vx=vector.anchor.vx; ball.vy=vector.anchor.vy; vector.anchor=null; }
  }
  function cancelVectorInput() {
    releaseVectorAnchor(); cancelVectorPress(vector); releaseRocket(rocket,ball);
    superBall.pointer=null;superBall.pending=null;superBall.queue=[];superTapUndo=null;
    if(superBall.dash){ball.vx=superBall.dash.vx;ball.vy=superBall.dash.vy;superBall.dash=null;}
  }

  function restoreSuperTapUndo() {
    const u = superTapUndo;
    if (!u) return false;
    ball.x = u.x; ball.y = u.y; ball.vx = u.vx; ball.vy = u.vy;
    ball.omega = u.omega; ball.squash = u.squash; ball.scored = u.scored;
    shotOpen = u.shotOpen; shotMade = u.shotMade; shotMissed = u.shotMissed; shotAirborne = u.shotAirborne;
    combo = u.combo; streak = u.streak;
    comboClock = u.comboClock; comboCounting = u.comboCounting; comboRescue = u.comboRescue;
    tapLock = 0;
    superTapUndo = null;
    emitHud();
    return true;
  }

  /** Rim / board / brace: same parry window as cars. Shield stays cars-and-bullets only. Scoring never arms cancel. */
  function superCancelsSolid(nx: number, ny: number) {
    if (!isSuper() || ball.scored) return false;
    return superImpact(superBall, ball, { shield: false, nx, ny });
  }

  function prepareVectorShot() {
    traffic.launched = false;
    ball.scored = false;
    scoreGateHoop = null;
    resetShotFlags();
    shotOpen = true; shotMade = false; shotMissed = false; shotAirborne = true; comboRescue = "approach";
    hint = false;
    noteBalanceSkillEffect({ trigger: true, rescue: true });
    audio.whoosh(0.7);
  }

  function startVectorCorrection() {
    prepareVectorShot();
    vector.coast = 0;
    vector.correction = vectorPulse(ball,hoop,world.w,boardGeom(hoop,world).visY);
    vector.powered = true;
    emitHud();
  }

  function vectorAim(x: number, y: number) {
    const dx=x-ball.x, dy=y-ball.y, distance=Math.hypot(dx,dy)||1;
    const speed=world.w*5.5;
    ball.vx=dx/distance*speed;
    ball.vy=dy/distance*speed;
  }

  function normalizeVectorSpeed() {
    const speed=Math.hypot(ball.vx,ball.vy);
    if (speed<5) { vectorAim(hoop.x,ball.r); return; }
    const scale=world.w*5.5/speed;
    ball.vx*=scale; ball.vy*=scale;
    ball.omega=clamp(ball.vx/ball.r,-22,22);
  }

  function vectorCollision(vx: number, vy: number) {
    if(isSuper()) superBall.dash=null;
    if (!isVector()) return;
    const absorbed=vectorRecover(vector,Math.hypot(ball.vx-vx,ball.vy-vy),Math.hypot(ball.vx,ball.vy),Math.abs(jumpVy()));
    const remainingSpeed=Math.sqrt(1-absorbed);
    ball.vx*=remainingSpeed; ball.vy*=remainingSpeed;
    const rebound=vectorLeakBounce(vector,{vx,vy},ball,Math.abs(jumpVy()));
    ball.vx=rebound.vx;ball.vy=rebound.vy;
    // A solid object always interrupts correction: no tunnelling through cars/boards.
    vector.correction=null;
    if (vector.burst>0) normalizeVectorSpeed();
  }

  function vectorBounds() {
    let hit=false, top=false;
    const r=ball.r;
    if(ball.x<r) { ball.x=r; ball.vx=Math.abs(ball.vx); hit=true; }
    else if(ball.x>world.w-r) { ball.x=world.w-r; ball.vx=-Math.abs(ball.vx); hit=true; }
    if(ball.y<r) { ball.y=r; ball.vy=Math.abs(ball.vy); hit=true; top=true; }
    else if(ball.y>world.floorY-r) { ball.y=world.floorY-r; ball.vy=-Math.abs(ball.vy); hit=true; }
    if(!hit) return;
    vector.bounces++;
    // Only redirect on walls. All paths between impacts remain straight.
    if(top && stageMod.canScore(hoop)) vectorAim(hoop.x,hoop.y);
    else if(vector.bounces%3===0) vectorAim(hoop.x,2*r-hoop.y);
    normalizeVectorSpeed();
    traffic.launched=false;
    vector.trail.push({x:ball.x,y:ball.y});
  }

  function stepVector(dt: number) {
    vector.storageCooldown=Math.max(0,vector.storageCooldown-dt);
    vector.notice=Math.max(0,vector.notice-dt);
    vector.collisionCooldown=Math.max(0,vector.collisionCooldown-dt);
    vector.storeFlash=Math.max(0,vector.storeFlash-dt);
    if (!isVector() || phase!=="playing") return;
    if(buzzer || timeUp || stageMod.holdsBall?.()) cancelVectorInput();
    if(!buzzer && !timeUp && !stageMod.holdsBall?.() && stepVectorLeak(vector,dt)) {
      callouts.push({text:"能量泄漏",x:ball.x,y:ball.y-ball.r*2,life:1,max:1,kind:"tag"});
    }
    if(vectorHold(vector,dt)) {
      prepareVectorShot();
      vector.anchor=null;
      ball.x=clamp(ball.x,ball.r,world.w-ball.r);
      ball.y=clamp(ball.y,ball.r,world.floorY-ball.r);
      prevBallX=ball.x; prevBallY=ball.y;
      const angle=Math.random()*Math.PI*2;
      ball.vx=Math.cos(angle)*world.w*5.5;
      ball.vy=Math.sin(angle)*world.w*5.5;
      callouts.push({text:"矢量风暴",x:ball.x,y:ball.y-ball.r*2,life:0.8,max:0.8,kind:"tag"});
    }
    if(vector.pointer!==null && !vector.consumed && vector.held>=VECTOR.chargeStart && vector.energy>=VECTOR.burstMin) {
      if(!vector.anchor) vector.anchor={x:ball.x,y:ball.y,vx:ball.vx,vy:ball.vy};
      ball.x=vector.anchor.x; ball.y=vector.anchor.y; ball.vx=0; ball.vy=0;
    } else if(vector.anchor) releaseVectorAnchor();
    if(vector.burst>0) {
      vector.burst=Math.max(0,vector.burst-VECTOR.drain*dt);
      vector.trail.push({x:ball.x,y:ball.y});
      if(vector.trail.length>65) vector.trail.shift();
    }
    if(vectorFinishBurst(vector)) {
      vector.coast=0.24;
      vector.trail=[];
      resetTrail();
    }
    if(vector.coast>0) {
      vector.coast=Math.max(0,vector.coast-dt);
      const speed=Math.hypot(ball.vx,ball.vy), limit=Math.abs(jumpVy())+(world.w*5.5-Math.abs(jumpVy()))*vector.coast/0.24;
      if(speed>limit) { ball.vx*=limit/speed; ball.vy*=limit/speed; }
    }
  }

  function tapJump(pointerId: number = -1) {
    if (birdOwnsBall(birds)) return;
    if (!booted) return;
    if (phase === "title") {
      audio.unlock();
      beginPlay();
    }
    if (phase !== "playing") return;
    if (paused) return;
    if (vector.burst > 0) return;
    if (isSuper() && superIsFrozen(superBall)) return;
    if (stageMod.holdsBall?.()) return;
    const heroClutch =
      isRogueMode() && rogueRun && hasHeroMoment(rogueRun) && (buzzer || timeUp);
    if ((buzzer || timeUp) && !heroClutch) return;
    if (tapLock > 0) return;
    if (ballHidden() && !onApproachSide() && !stageMod.allowHiddenTap?.()) return;
    if (shotOpen && !shotMade && !shotMissed) {
      if (comboRescue === "spent") {
        // This input starts another attempt, rather than a second rescue round.
        comboRescue = "approach";
        breakComboStreak();
        if (paused) return;
      } else if (comboRescue === "contact") {
        comboRescue = "rescue";
      }
    }
    cancelVectorInput();
    vector.correction = null;
    vector.coast = 0;
    if (!shotOpen || shotMade || shotMissed) vector.powered = false;
    traffic.launched = false;
    if (holeOn && isAnti2()) {
      launchAntiRecovery(antiRecovery);
      // A fresh manual shot can interrupt recovery, including a scored return.
      scoreGateHoop = null;
      scoredLock = 0;
    }
    // Mid-air re-tap on an unfinished attempt: boost only �?do not break combo.
    if (shotOpen && !shotMade && !shotMissed) {
      hint = false;
      if (legacyHole()) {
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
      ball.omega = (ball.vx / Math.max(8, ball.r)) * 1.35 + (legacyHole() ? 10 : 0);
      ball.squash = 1.08;
      ball.scored = false;
      resetShotFlags();
      armGlassShotHurts();
      tapLock = 0.03;
      audio.whoosh(0.5);
      stageMod.onTap?.(modifierHost());
      emitHud();
      return;
    }
    breakComboOnMissJump();
    hint = false;
    if (legacyHole()) {
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
    ball.omega = (ball.vx / Math.max(8, ball.r)) * 1.35 + (legacyHole() ? 10 : 0);
    ball.squash = 1.08;
    ball.scored = false;
    resetShotFlags();
    shotOpen = true;
    shotMade = false;
    shotMissed = false;
    comboRescue = "approach";
    shotAirborne = false;
    armGlassShotHurts();
    tapLock = 0.03;
    audio.whoosh(0.5);
    stageMod.onTap?.(modifierHost());
    emitHud();
  }

  function pointerWorld(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / Math.max(1, rect.width)) * world.cssW - world.ox,
      y: ((e.clientY - rect.top) / Math.max(1, rect.height)) * world.cssH - world.oy,
    };
  }

  async function requestMazeTiltPermission() {
    type MotionPermissionEvent = {
      requestPermission?: () => Promise<PermissionState>;
    };
    // iOS may gate these two streams independently; Android browsers generally
    // expose neither method and can start delivering events immediately.
    const orientation = DeviceOrientationEvent as typeof DeviceOrientationEvent & MotionPermissionEvent;
    const motion = DeviceMotionEvent as typeof DeviceMotionEvent & MotionPermissionEvent;
    try {
      const requests: Promise<PermissionState>[] = [];
      if (orientation.requestPermission) requests.push(orientation.requestPermission());
      if (motion.requestPermission) requests.push(motion.requestPermission());
      const results = await Promise.all(requests);
      if (results.some((result) => result !== "granted")) return;
      mazeTiltActive = true;
      // First valid reading from either stream establishes the neutral board.
      mazeTiltBase = null;
      mazeMotionBase = null;
    } catch {
      // If a platform rejects an optional stream, keep touch controls usable.
    }
  }

  function applyMazeTilt(rawX: number, rawY: number, source: "orientation" | "motion") {
    if (buzzer || timeUp) return;
    if (!mazeTiltActive || mazePointerId !== null || !isMaze() || phase !== "playing" || paused) return;
    const screenAngle = screen.orientation?.angle ?? (window.orientation as number | undefined) ?? 0;
    let x = rawX;
    let y = rawY;
    // Map the device axes back to the screen axes in portrait or either landscape rotation.
    if (screenAngle === 90) [x, y] = [y, -x];
    else if (screenAngle === -90 || screenAngle === 270) [x, y] = [-y, x];
    else if (Math.abs(screenAngle) === 180) [x, y] = [-x, -y];
    const tilt = source === "motion" ? 2.8 : 18;
    const tuning = devOn ? devMaze : DEFAULT_MAZE;
    const dx = Math.max(-1, Math.min(1, (x / tilt) * tuning.sensitivity));
    const dy = Math.max(-1, Math.min(1, (y / tilt) * tuning.sensitivity));
    const dead = tuning.deadzone;
    const target = { x: Math.abs(dx) < dead ? 0 : -dx, y: Math.abs(dy) < dead ? 0 : dy };
    // Frame-rate independent low-pass filter removes gyro jitter without delaying touch control.
    const blend = 1 - Math.exp(-tuning.smoothing / 60);
    mazeGravity = {
      x: mazeGravity.x + (target.x - mazeGravity.x) * blend,
      y: mazeGravity.y + (target.y - mazeGravity.y) * blend,
    };
  }

  function onDeviceOrientation(e: DeviceOrientationEvent) {
    if (e.beta == null || e.gamma == null) return;
    if (!mazeTiltBase) {
      mazeTiltBase = { beta: e.beta, gamma: e.gamma };
      return;
    }
    applyMazeTilt(e.gamma - mazeTiltBase.gamma, e.beta - mazeTiltBase.beta, "orientation");
  }

  function onDeviceMotion(e: DeviceMotionEvent) {
    // Chrome on Android often provides gravity only through accelerationIncludingGravity.
    const acceleration = e.accelerationIncludingGravity;
    if (!acceleration || acceleration.x == null || acceleration.y == null) return;
    if (!mazeMotionBase) {
      mazeMotionBase = { x: acceleration.x, y: acceleration.y };
      return;
    }
    applyMazeTilt(acceleration.x - mazeMotionBase.x, acceleration.y - mazeMotionBase.y, "motion");
  }

  function onDown(e: PointerEvent) {
    if (e.button !== undefined && e.button !== 0) return;
    audio.unlock();
    if (phase === "over") return;
    e.preventDefault();
    if (birdOwnsBall(birds) && !(isSuper() || isVector() || isTime())) return;
    if (birdOwnsBall(birds) && isSuper() && !superBall.impact) return;
    if(phase==="playing" && isSuper()) {
      if(paused || buzzer || timeUp || stageMod.holdsBall?.() || superBall.pointer) return;
      const p=pointerWorld(e),bar=superLayout(world);
      superBall.lastAction=superBall.clock;
      if(p.x>=bar.x-10 && p.x<=bar.x+bar.w+10 && p.y>=bar.y-10 && p.y<=bar.y+bar.h+10){
        if(superBall.dash){ball.vx=superBall.dash.vx;ball.vy=superBall.dash.vy;superBall.dash=null;}
        superToggle(superBall);
        superTapUndo=null;
        superBall.pointer={id:e.pointerId,x:p.x,y:p.y,used:true};
        try{canvas.setPointerCapture(e.pointerId);}catch{}
        return;
      }
      // Jump immediately (same as other balls). A swipe inside swipeCancel rewinds this jump, so dash never hop-then-glide.
      // Perfect-cancel swipes skip the rewind and freeze in place instead.
      const undo={
        at:superBall.clock,
        x:ball.x,y:ball.y,vx:ball.vx,vy:ball.vy,omega:ball.omega,squash:ball.squash,
        scored:ball.scored,shotOpen,shotMade,shotMissed,shotAirborne,combo,streak,comboClock,comboCounting,comboRescue,
      };
      noteBalanceClick();
      if(!superIsFrozen(superBall)) tapJump(e.pointerId);
      // tapJump → cancelVectorInput clears gesture state; re-arm after the jump commits.
      superTapUndo=undo;
      superPulseShield(superBall);
      superBall.pointer={id:e.pointerId,x:p.x,y:p.y,used:false};
      try{canvas.setPointerCapture(e.pointerId);}catch{}
      return;
    }
    if(phase==="playing" && isRocket()) {
      const p=pointerWorld(e),c=rocketLayout(world.w,world.h,world.floorY);
      if(Math.hypot(p.x-c.x,p.y-c.y)<=c.r+8) {
        if(!paused && !buzzer && !timeUp && !stageMod.holdsBall?.() && rocket.pointer===null) {
          rocket.pointer=e.pointerId;rocket.steer=0;hint=false;emitHud();
          noteBalanceSkillInput();
          try{canvas.setPointerCapture(e.pointerId);}catch{}
        }
        return;
      }
    }
    if (phase === "playing" && isVector()) {
      const p = pointerWorld(e), b = vectorLayout(world.w, world.h, world.floorY);
      if (Math.abs(p.x-b.x)<=b.r*2.15+7 && p.y>=b.y+8-b.r*2.15-7 && p.y<=b.y+34) {
        if (!paused && !buzzer && !timeUp && !stageMod.holdsBall?.() && vector.burst <= 0 && vector.pointer === null) {
          vector.pointer=e.pointerId; vector.held=0; vector.consumed=false;
          noteBalanceSkillInput();
          try { canvas.setPointerCapture(e.pointerId); } catch { /* detached canvas */ }
        }
        return;
      }
    }
    if (birdOwnsBall(birds) && !isTime()) return;
    pointerHeld = true;
    if (phase === "playing" && !paused && isTime() && !timeRewindBlocked()) {
      const point = pointerWorld(e);
      if (inTimeButton(point.x, point.y)) {
        timeRewindPointer = e.pointerId;
        noteBalanceSkillInput();
        rewindWorld();
        try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        return;
      }
    }
    if (phase === "playing" && !paused && isBolt() && boltOverheatLeft > 0) return;
    if (phase === "playing" && !paused && !buzzer && !timeUp && isMaze()) {
      // iOS requires this permission request to originate from a real touch.
      // Other mobile browsers already stream orientation events automatically.
      void requestMazeTiltPermission();
      const point = pointerWorld(e);
      const layout = mazePadLayout(world);
      const insidePad = Math.hypot(point.x - layout.cx, point.y - layout.cy) <= layout.r;
      if (insidePad) {
        const gravity = mazeGravityFromPoint(point.x, point.y, layout)!;
        mazeGravity = gravity;
        mazePointerId = e.pointerId;
        noteBalanceSkillInput();
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
      return;
    }
    if (phase === "playing" && !paused && !buzzer && !timeUp && isHacker() && hackerAwaken) {
      const point = pointerWorld(e);
      const dir = hitHackerPad(point.x, point.y, hackerPadLayout(world));
      if (dir) {
        applyHackerDir(dir);
        noteBalanceSkillInput();
        emitHud();
      }
      return;
    }
    noteBalanceClick();
    tapJump(e.pointerId);
    if (
      phase === "playing" &&
      !paused &&
      isBolt() &&
      boltCharge >= BOLT_COST &&
      !boltStorm
    ) {
      boltPendingTap = true;
      boltHoldArm = 0;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  }

  function onMove(e: PointerEvent) {
    if (birdOwnsBall(birds) && !(isSuper() || isVector())) return;
    if (birdOwnsBall(birds) && isSuper() && !superBall.impact) return;
    if(isSuper() && superBall.pointer?.id===e.pointerId){
      const start=superBall.pointer,p=pointerWorld(e);superBall.lastAction=superBall.clock;
      if(!start.used && Math.hypot(p.x-start.x,p.y-start.y)>=SUPER.swipeSlop){
        start.used=true;
        if(!paused && phase==="playing" && !buzzer && !timeUp && !stageMod.holdsBall?.()){
          const canParry=!!(superBall.impact && superBall.clock-superBall.impact.at<=SUPER.parryWindow);
          // Dash swipes may rewind the optimistic jump; perfect cancel keeps the current spot and freezes.
          if(!canParry && superTapUndo && superBall.clock-superTapUndo.at<=SUPER.swipeCancel) restoreSuperTapUndo();
          else superTapUndo=null;
          const result=superSwipe(superBall,ball,p.x-start.x,p.y-start.y);
          if(result==='dash'){prepareVectorShot();}
          if(result==='parry'){
            if (releaseBirdCarrier(birds)) rewardBirdStuns(1);
            traffic.launched=false;
            ball.vx=0;ball.vy=0;ball.omega=0;
            ball.hitRim=false;ball.hitBoard=false;hitBoardTop=false;
            superTapUndo=null;
            modifierHost().tag('完美抵消');
          }
          if(result==='empty')modifierHost().tag('能量不足');
        }
      }
      e.preventDefault();return;
    }
    if(rocket.pointer===e.pointerId) {
      if(buzzer || timeUp) return;
      if(paused || phase!=="playing"){releaseRocket(rocket,ball);return;}
      const p=pointerWorld(e),c=rocketLayout(world.w,world.h,world.floorY);
      rocket.steer=clamp((p.x-c.x)/c.half,-1,1);e.preventDefault();return;
    }
    if (vector.pointer === e.pointerId) {
      const p = pointerWorld(e), b = vectorLayout(world.w, world.h, world.floorY);
      if (Math.abs(p.x-b.x)>b.r*2.15+20 || p.y<b.y+8-b.r*2.15-20 || p.y>b.y+47) cancelVectorInput();
      return;
    }
    if (mazePointerId !== e.pointerId || !isMaze() || phase !== "playing" || paused || buzzer || timeUp) return;
    const point = pointerWorld(e);
    const gravity = mazeGravityFromPoint(point.x, point.y, mazePadLayout(world));
    mazeGravity = gravity ?? { x: 0, y: 0 };
  }

  function onUp(e: PointerEvent) {
    if ((buzzer || timeUp) && isRocket() && rocket.pointer === e.pointerId) return;
    if (birdOwnsBall(birds) && !(isSuper() || isVector() || isTime())) { pointerHeld = false; return; }
    if(isSuper() && superBall.pointer?.id===e.pointerId){
      superBall.pointer=null;
      superTapUndo=null;
      return;
    }
    if(rocket.pointer===e.pointerId){releaseRocket(rocket,ball);return;}
    if (e.button !== undefined && e.button !== 0) return;
    if (vector.pointer === e.pointerId) {
      releaseVectorAnchor();
      if (e.type === "pointercancel" || e.type === "lostpointercapture" || paused || phase !== "playing" || buzzer || timeUp || stageMod.holdsBall?.()) cancelVectorInput();
      else if (vectorRelease(vector) === "correct") {
        if (releaseBirdCarrier(birds)) rewardBirdStuns(1);
        startVectorCorrection();
      }
      return;
    }
    if (timeRewindPointer === e.pointerId) {
      timeRewindPointer = null;
      rewindActive = false;
      rewindStepLeft = 0;
      rewindHistory = [];
      rewindSampleLeft = 0;
      pointerHeld = false;
      emitHud();
      return;
    }
    if (mazePointerId === e.pointerId) {
      mazePointerId = null;
      // A released stick levels the board. Recalibrate the current phone pose as
      // neutral so a stale gyro slope cannot keep accelerating the ball forever.
      mazeGravity = { x: 0, y: 0 };
      mazeTiltBase = null;
      mazeMotionBase = null;
    }
    pointerHeld = false;
    boltHoldArm = 0;
    if (boltStorm) {
      endBoltStorm();
      boltPendingTap = false;
      return;
    }
    boltPendingTap = false;

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
    if (birdOwnsBall(birds)) return;
    if (phase === "playing" && !paused && isHacker() && hackerAwaken) {
      const directions: Record<string, HackerDir> = {
        ArrowLeft: "l",
        ArrowRight: "r",
        ArrowUp: "u",
        ArrowDown: "d",
        KeyA: "l",
        KeyD: "r",
        KeyW: "u",
        KeyS: "d",
      };
      const dir = directions[e.code];
      if (dir) {
        e.preventDefault();
        applyHackerDir(dir);
        emitHud();
        return;
      }
    }
    if (e.code !== "Space" && e.code !== "ArrowUp") return;
    e.preventDefault();
    audio.unlock();
    if (isBolt() && boltOverheatLeft > 0) return;
    tapJump();
  }

  function pausePlay() {
    if (phase !== "playing" || paused) return;
    paused = true;
    cancelVectorInput();
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
    birdBaseBonus = 0;
    birds = createBirds();
    traffic = createTraffic();
    ball.trafficSafe = false;
    phase = "title";
    paused = false;
    rewindHistory = [];
    rewindSampleLeft = 0;
    rewindActive = false;
    rewindStepLeft = 0;
    timeEnergy = 0;
    timeRewindPointer = null;
    score = 0;
    mazeBaseBonus = 0;
    combo = 0;
    streak = 0;
    hint = true;
    madeCount = 0;
    resetTrainScroll();
    ball.sootLeft = 0;
    hackerDir = null;
    hackerAwaken = false;
    vector = createVector(); superBall = createSuper();
    rocket = createRocket();
    quantumTunnelLeft = 0;
    quantumCheckedTier = 0;
    mazeGravity = { x: 0, y: 0 };
    mazePointerId = null;
    mazeHoles = [];
    mazeHoleSpawnLeft = 2.8;
    mazeRespawnLeft = 0;
    ball.blink = false;
    mazeTiltActive = typeof DeviceOrientationEvent !== "undefined" || typeof DeviceMotionEvent !== "undefined";
    mazeTiltBase = null;
    mazeMotionBase = null;
    hackerSpeed = HACKER_SPEED_BASE;
    clearSparseCodeRain();
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
    comboRescue = "approach";
    shotAirborne = false;
    other = null;
    hoop = makeHoop(world, -1, true);
    applyRogueHoopScale(hoop);
    resetAntiRun();
    resetBoltRun();
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
    // Restore scene daytime / clear foreign modifiers (e.g. prison searchlights).
    bootStageModifier({ announce: false });
    emitHud();
  }

  function leaveSandbox() {
    if (devGfxBackup) {
      // Developer-only effect toggles are never allowed to leak into normal play.
      // Repair the previously leaked shadow setting as part of this restoration.
      gfx = { ...devGfxBackup, ballShadow: true };
      devGfxBackup = null;
    }
    devOn = false;
    devScene = "void";
    devFreeze = false;
    devHoldHeat = false;
    devScoreLock = null;
    devComboLock = null;
    devPhys = { ...DEFAULT_PHYS };
  }

  function enterSandbox() {
    if (!booted) return;
    devUnlocked = true;
    persist();
    if (!devOn) devGfxBackup = { ...gfx };
    devOn = true;
    if (!devScene) devScene = "void";
    beginPlay();
    hint = false;
    timerArmed = false;
    timer = timerMax;
    devFreeze = false;
    devHoldHeat = false;
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
    // Runtime motion expects pixels per second; the previous raw 0.063 value
    // was effectively immobile on every viewport.
    hoop.moveAmp = world.h * (MOVE_SPD0_LO + MOVE_SPD0_HI) * 0.5;
    hoop.moveT = 0;
    // Nudge immediately so selecting a motion mode has visible feedback.
    if (hoop.moveKind === 0 || hoop.moveKind === 1 || hoop.moveKind === 2) {
      const { minY, maxY } = boardTravel();
      hoop.y = Math.min(maxY, Math.max(minY, hoop.y + world.h * 0.025));
    }
  }


  function applyDev(cmd: DevCmd) {
    if (cmd.t === "antiHole") {
      if (devOn && isAnti() && phase === "playing" && !balanceLocked()) openAntiHole(15);
      return;
    }
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
        if (balanceLocked()) return;
        if (!devOn) enterSandbox();
        devScene = cmd.id;
        traffic = createTraffic();
        ball.trafficSafe = false;
        if (cmd.id !== "void") {
          applyScenePack(cmd.id);
          resetGraf();
        }
        bootStageModifier({ announce: phase === "playing" });
        emitHud();
        return;
      case "playMode": {
        if (balanceLocked()) return;
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
          devFreeze = false;
          devHoldHeat = false;
          madeCount = 1;
          applyKitPhys();
        }
        if (playMode === "rogue" && rogueRun) {
          if (devOn) rogueRun.target = Infinity;
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
      case "rogueGold": {
        if (!rogueRun) rogueRun = createRogueRun();
        rogueRun.gold = Math.max(0, Math.floor(cmd.n));
        rogueRun.peakGold = Math.max(rogueRun.peakGold, rogueRun.gold);
        emitHud();
        return;
      }
      case "rogueScore": {
        if (!rogueRun) rogueRun = createRogueRun();
        score = Math.max(0, Math.floor(cmd.n));
        rogueRun.stageScore = score;
        emitHud();
        return;
      }
      case "rogueTarget": {
        if (!rogueRun) rogueRun = createRogueRun();
        rogueRun.target = Math.max(1, Math.floor(cmd.n));
        emitHud();
        return;
      }
      case "rogueGrant": {
        if (!rogueRun) rogueRun = createRogueRun();
        devGrantRogue(rogueRun, cmd.id);
        emitHud();
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
      case "modifier": {
        devModifierForce = cmd.id === "auto" ? null : cmd.id;
        if (isRogueMode() && rogueRun && devModifierForce) rogueRun.modifier = devModifierForce;
        if (phase === "playing") bootStageModifier();
        emitHud();
        return;
      }
      case "prisonProjectiles":
        devPrisonProjectiles = cmd.on;
        stageMod.setProjectiles?.(cmd.on);
        emitHud();
        return;
      case "score":
        devScoreLock = Math.max(0, Math.floor(cmd.n));
        score = devScoreLock;
        if (isRogueMode() && rogueRun) rogueRun.stageScore = score;
        emitHud();
        return;
      case "addScore":
        score = Math.max(0, score + cmd.n);
        emitHud();
        return;
      case "combo": {
        const n = Math.max(0, Math.floor(cmd.n));
        devComboLock = n;
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
        devFreeze = false;
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
        if (balanceLocked()) return;
        applyBall(cmd.id);
        return;
      case "balanceStart": {
        if (!devOn) enterSandbox();
        const testBall = parseBall(cmd.ballId);
        const baselineBall = parseBall(cmd.baseline);
        if (!balanceSession) {
          balanceSession = {
            id: crypto.randomUUID(),
            baseline: baselineBall,
            // Focus ball for R0/R1; Classic-only runs keep ballId as classic until a special is picked.
            ballId: testBall === baselineBall ? baselineBall : testBall,
            scene: devScene,
            playMode: "minute",
            physKey: JSON.stringify(devPhys),
            createdAt: new Date().toISOString(),
            gameRev: GAME_REV,
            configSnapshot: structuredClone(balanceStore.config),
            trials: [],
          };
        } else if (testBall !== baselineBall) {
          balanceSession.ballId = testBall;
        }
        // Start the selected ball as-is — Classic runs feed B; specials feed R0/R1.
        playMode = "minute";
        applyBall(testBall);
        if (testBall === baselineBall) balanceSkillOn = true;
        beginPlay();
        hint = false;
        emitHud();
        return;
      }
      case "balancePick": {
        if (!devOn) enterSandbox();
        const pick = parseBall(cmd.ballId);
        applyBall(pick);
        if (balanceSession && pick !== balanceSession.baseline) {
          balanceSession.ballId = pick;
        }
        emitHud();
        return;
      }
      case "balanceSkill": balanceSkillOn = cmd.on; refreshFuseSkills(); emitHud(); return;
      case "balanceRetry": {
        // No session yet → same as starting a fresh minute on the selected ball.
        if (!balanceSession) {
          const testBall = parseBall(ballId);
          balanceSession = {
            id: crypto.randomUUID(),
            baseline: "plain",
            ballId: testBall === "plain" ? "plain" : testBall,
            scene: devScene,
            playMode: "minute",
            physKey: JSON.stringify(devPhys),
            createdAt: new Date().toISOString(),
            gameRev: GAME_REV,
            configSnapshot: structuredClone(balanceStore.config),
            trials: [],
          };
        } else {
          recordBalanceTrial("retry");
        }
        playMode = "minute";
        beginPlay();
        hint = false;
        emitHud();
        return;
      }
      case "balanceImport": {
        try {
          const incoming = parseBalanceImport(cmd.data);
          // Include persisted records and the live session before merging; never replace local config.
          let current = mergeBalanceStores(balanceStore, loadBalanceStore());
          if (balanceSession) {
            current = mergeBalanceStores(current, { version: 1, config: current.config, sessions: [balanceSession] });
          }
          const beforeTrials = current.sessions.reduce((total, session) => total + session.trials.length, 0);
          const merged = mergeBalanceStores(current, incoming);
          const trials = merged.sessions.reduce((total, session) => total + session.trials.length, 0);
          // Unlike routine saves, import must surface quota/storage errors before reporting success.
          localStorage.setItem("tq-balance-test-v1", JSON.stringify(merged));
          const addedSessions = merged.sessions.length - current.sessions.length;
          balanceStore = merged;
          if (balanceSession) balanceSession = balanceStore.sessions.find((session) => session.id === balanceSession!.id) ?? balanceSession;
          emitHud();
          cmd.onResult({ addedSessions, addedTrials: trials - beforeTrials, sessions: merged.sessions.length, trials });
        } catch (error) {
          cmd.onResult({ error: error instanceof Error ? error.message : "导入失败，原数据未改变" });
        }
        return;
      }
      case "balanceClear": balanceSession = null; emitHud(); return;
      case "balanceConfig": {
        const c=balanceStore.config; if(typeof cmd.k==="number") c.k=Math.max(0,Math.min(1,cmd.k)); if(typeof cmd.r0Tolerance==="number") c.r0Tolerance=Math.max(0,Math.min(1,cmd.r0Tolerance)); if(typeof cmd.r1Min==="number") c.r1Min=Math.max(0,Math.min(2,cmd.r1Min)); if(typeof cmd.r1Max==="number") c.r1Max=Math.max(0,Math.min(2,cmd.r1Max)); if(cmd.ballId&&cmd.strengthKey&&typeof cmd.n==="number"){const s=c.strength[cmd.ballId]||{...DEFAULT_STRENGTH}; s[cmd.strengthKey]=Math.max(-3,Math.min(3,Math.round(cmd.n))); c.strength[cmd.ballId]=s;} saveBalanceStore(balanceStore); emitHud(); return;
      }
      case "resetMatch":
        beginPlay();
        if (devOn) {
          hint = false;
          timerArmed = false;
          devFreeze = false;
          devHoldHeat = false;
        }
        return;
      case "gfx":
        gfx = { ...gfx, [cmd.key]: cmd.on };
        emitHud();
        return;
      case "phys":
        if (balanceLocked()) return;
        devPhys = { ...devPhys, [cmd.k]: clampPhysKey(cmd.k, cmd.n) };
        emitHud();
        return;
      case "maze":
        if (balanceLocked()) return;
        devMaze = { ...devMaze, [cmd.k]: clampMaze(cmd.k, cmd.n) };
        emitHud();
        return;
      case "mazeReset":
        if (balanceLocked()) return;
        devMaze = { ...DEFAULT_MAZE };
        emitHud();
        return;
      case "physGroupReset": {
        if (balanceLocked()) return;
        const defaults = ballDefaultPhys();
        devPhys = { ...devPhys };
        const keys: (keyof DevPhys)[] = cmd.group === "ball"
          ? ["jumpUp", "jumpFwd", "ball", "grav"]
          : ["buoy", "air", "roll", "floor", "hoop", "rimFric", "boardFric"];
        for (const key of keys) devPhys[key] = defaults[key];
        emitHud();
        return;
      }
      case "physReset":
        if (balanceLocked()) return;
        devPhys = ballDefaultPhys();
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

  function spawnMazeHole() {
    if (!isMaze() || phase !== "playing" || mazeHoles.length >= 2) return;
    const r = Math.max(22, world.ballR * 1.12);
    const padX = Math.max(r * 2.5, world.w * 0.14);
    const minY = Math.max(r * 2, world.h * 0.16);
    const maxY = world.floorY - r * 2.2;
    for (let attempt = 0; attempt < 20; attempt++) {
      const x = padX + Math.random() * Math.max(1, world.w - padX * 2);
      const y = minY + Math.random() * Math.max(1, maxY - minY);
      const clear = (h: Hoop | null) => !h || Math.hypot(x - h.x, y - h.y) > h.inner * 3.4 + r;
      const spaced = mazeHoles.every((h) => Math.hypot(x - h.x, y - h.y) > h.r * 5.5 + r);
      if (clear(hoop) && clear(other) && spaced) {
        mazeHoles.push({ x, y, r, left: 10, bonusTaken: false, closePassed: false });
        return;
      }
    }
  }

  function respawnMazeBall() {
    const side = hoop.side < 0 ? 1 : -1;
    ball.x = side < 0 ? -ball.r + 2 : world.w + ball.r - 2;
    ball.y = world.floorY - ball.r;
    ball.vx = side * Math.max(28, world.w * 0.055);
    ball.vy = 0;
    ball.omega = ball.vx / Math.max(8, ball.r);
    ball.scored = false;
    resetShotFlags();
    resetTrail();
    prevBallX = ball.x;
    prevBallY = ball.y;
  }

  function stepMazeHoles(dt: number) {
    if (!isMaze() || phase !== "playing") return;
    for (let i = mazeHoles.length - 1; i >= 0; i--) {
      const h = mazeHoles[i]!;
      h.left -= dt;
      if (h.left <= 0) mazeHoles.splice(i, 1);
    }
    mazeHoleSpawnLeft -= dt;
    if (mazeHoleSpawnLeft <= 0) {
      spawnMazeHole();
      mazeHoleSpawnLeft = 5.6 + Math.random() * 2.6;
    }
    if (mazeRespawnLeft > 0) {
      mazeRespawnLeft = Math.max(0, mazeRespawnLeft - dt);
      ball.blink = true;
      if (mazeRespawnLeft <= 0) ball.blink = false;
      return;
    }
    for (const h of mazeHoles) {
      const dist = Math.hypot(ball.x - h.x, ball.y - h.y);
      const sinkR = h.r * 0.72 + ball.r * 0.3;
      const closeR = h.r + ball.r * 1.25;
      const leaveR = h.r + ball.r * 2.5;
      if (dist <= sinkR) {
        // Falling in is a failure route, never a reward route.
        respawnMazeBall();
        mazeRespawnLeft = 4;
        ball.blink = true;
        return;
      }
      if (!h.bonusTaken && dist <= closeR) h.closePassed = true;
      if (!h.bonusTaken && h.closePassed && dist >= leaveR) {
        h.bonusTaken = true;
        mazeBaseBonus += 1;
        callouts.push({ text: "基础 +1", x: h.x, y: h.y - h.r * 1.5, life: 0.8, max: 0.8, kind: "base" });
        emitHud();
      }
    }
  }

  function physics(dt: number) {
    if (rewindActive) {
      stepRewind(dt);
      return;
    }
    if (!birdOwnsBall(birds)) stepVector(dt);
    else if (isVector() && vector.pointer !== null) vector.held += dt;
    if(isSuper() && phase==='playing') {
      stepSuper(superBall,ball,dt);
      if(stageMod.holdsBall?.()){superBall.pending=null;superBall.queue=[];superBall.dash=null;superBall.pointer=null;superTapUndo=null;}
    }
    if(isRocket() && stageMod.holdsBall?.()) releaseRocket(rocket,ball);
    stepGraf(dt);
    if (quantumTunnelLeft > 0) {
      quantumTunnelLeft = Math.max(0, quantumTunnelLeft - dt);
      ball.blink = quantumTunnelLeft > 0;
      if (quantumTunnelLeft <= 0) ball.blink = false;
    }
    if (!birdOwnsBall(birds)) stepMazeHoles(dt);
    if (camShake > 0) camShake = Math.max(0, camShake - dt);
    else camShake = 0;
    if (whiteFlash > 0) whiteFlash = Math.max(0, whiteFlash - dt);
    else whiteFlash = 0;
    if (opener > 0) opener = Math.max(0, opener - dt);
    if (hitstop > 0) {
      hitstop -= dt;
      return;
    }
    const trainBefore = getTrainScroll().near;
    if (phase === "playing" && trainBackdropOn()) {
      stepTrainScroll(dt);
      const smokyHoops = [hoop, ...(other ? [other] : [])].map(h => ({ x: h.x, y: h.y, r: h.inner, sootLeft: h.sootLeft }));
      stepTrainSmoke(dt, getTrainScroll().trainSpeed, world, [ball, ...birds.birds, ...smokyHoops], getTrainScroll());
      hoop.sootLeft = smokyHoops[0].sootLeft;
      if (other) other.sootLeft = smokyHoops[1].sootLeft;
      stepTrainTunnel(getTrainScroll(), world, dt, () => {
        const minimum = tunnelHoopMin(world);
        const safeHoop = (h: Hoop) => h.y >= minimum && (h.moving || h.baseY >= minimum);
        return safeHoop(hoop) && (!other || safeHoop(other)) &&
          !birdOwnsBall(birds) && !birds.enteringFromTop && birds.birds.length === 0 &&
          ball.y - ball.r > getTrainTunnel().depth * world.h + world.ballR &&
          getTrainGantries(world, getTrainScroll()).length === 0;
      });
    }
    if (trafficEnabled() && madeCount > 0) {
      rewardAbsorbedObjects(stepTraffic(traffic, world, dt));
      if (holeOn) beginTrafficAbsorption(traffic, holeX, holeY);
    }
    ball.trafficSafe = trafficEnabled() && traffic.safeLeft > 0;
    ball.trafficNearMiss = trafficEnabled() ? traffic.nearMiss : 0;
    if (tapLock > 0) tapLock -= dt;
    if (scoredLock > 0) scoredLock -= dt;
    if (rimHitLock > 0) rimHitLock -= dt;
    if (boardHitLock > 0) boardHitLock -= dt;
    if (burnFlash > 0) burnFlash = Math.max(0, burnFlash - dt);

    // Overheat locks the ball only. Clock, hoops, frost, combo, and stage mechanisms keep stepping.
    const boltOverheated = !birdOwnsBall(birds) && stepBoltOverheat(dt);

    if (
      !boltOverheated &&
      phase === "playing" &&
      !paused &&
      pointerHeld &&
      boltPendingTap &&
      isBolt() &&
      !boltStorm &&
      boltCharge >= BOLT_COST
    ) {
      boltHoldArm += dt;
      if (boltHoldArm >= BOLT_HOLD_ARM) {
        boltPendingTap = false;
        startBoltStorm();
      }
    }

    if (phase === "playing" && timerArmed && !buzzer && !timeUp && !devFreeze && !stageMod.holdsBall?.()) {
      let drain = dt;
      if (legacyHole()) {
        // Far from hole — timer drains slower; at center — normal speed.
        const dist = Math.hypot(ball.x - holeX, ball.y - holeY);
        const maxD = Math.max(120, world.w * 0.55);
        const t = Math.max(0, Math.min(1, dist / maxD));
        drain = dt * (1 - t * 0.78);
      }
      timer -= drain;
      if (balanceTelemetryLive() && balanceSkillOn && ballId !== balanceSession?.baseline) {
        const skillBusy =
          quantumTunnelLeft > 0 ||
          Boolean(boltStorm) ||
          holeOn ||
          champMode ||
          rewindActive ||
          (vector.burst > 0 || vector.correction !== null) ||
          hoop.frostLeft > 0 ||
          Boolean(other && other.frostLeft > 0);
        if (skillBusy) balanceSkillActiveSeconds += drain;
        // Overheat is lost time (ball locked), not time the skill is active.
        // Count the same countdown drain, and not the dive frame that starts it.
        if (boltOverheated) balanceSkillLockSeconds += drain;
      }
      if (timer <= 0) {
        timer = 0;
        if (!isMinuteMode() && isChamp() && !champMode && enterChampionMoment()) {
          // A banked skill countdown is consumed before the final-shot decision.
        } else if (isRogueMode() && tryRogueRevive()) {
          // Keep the existing revive replacement for a lost life.
        } else if (isRogueMode() && tryRogueMoneyProtect()) {
          // Converted gold may complete the stage.
        } else {
          beginLastShotOrFinish();
        }
      }
    } else if (buzzer && phase === "playing") {
      const settled = ball.y + ball.r >= world.floorY - 2 &&
        Math.abs(ball.vy) < 90 && Math.abs(ball.vx) < 70;
      const recovered = holeOn && isAnti2() && antiRecovery.mode === "ready";
      if (buzzerTimer <= 0 || settled || recovered) finishExpiredShot();
    } else if (timeUp && phase === "playing") {
      // One decision at the deadline; never wait in an unbounded limbo state.
      beginLastShotOrFinish();
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
    if (phase === "playing" && !paused && !birdOwnsBall(birds)) {
      stageMod.update(dt, modifierHost());
    }
    if (trainBackdropOn() && tunnelPassing()) {
      // Modifiers can move ghost/frozen targets outside stepHoop's normal path.
      for (const target of other ? [hoop, other] : [hoop]) {
        const shift = Math.max(0, tunnelHoopMin(world) - target.y);
        if (shift > 0) { target.y += shift; nudgeNet(target, 0, shift); }
        target.baseY = Math.max(tunnelHoopMin(world), target.baseY);
      }
    }
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
      // Keep frosted secondary stands still; only slide out after thaw.
      if (other.frostLeft <= 0) {
        other.x += (other.targetX - other.x) * (1 - Math.exp(-7.5 * dt));
      } else {
        other.moving = false;
        other.targetX = other.x;
        other.baseX = other.x;
        other.baseY = other.y;
      }
      nudgeNet(other, other.x - ox, 0);
      const gone = other.side < 0 ? other.x < -world.w * 0.28 : other.x > world.w * 1.28;
      if (gone) {
        other = null;
        otherOverRim = false;
      }
    }

    if (trainBackdropOn() && (phase === "playing" || birdOwnsBall(birds))) {
      const wasOwned = birdOwnsBall(birds);
      const iceBefore = birds.iceBreaks, absorbedBefore = birds.absorbed;
      const route = getTrainScroll(), scrollDelta = route.near - trainBefore;
      const relativeTrainSpeed = scrollDelta / dt;
      const returned = stepBirds(birds, world, ball, dt, phase === "playing" && madeCount > 0 && !buzzer && !timeUp && !tunnelReserved(), Math.random, relativeTrainSpeed, madeCount, birdSkills());
      // Eagles leave naturally at their next edge rather than reentering a tunnel.
      if (tunnelReserved()) birds.birds = birds.birds.filter(b => b.mode !== "outside");
      if (phase === "playing" && !holeOn) {
        const padding = birds.birds.reduce((max, b) => Math.max(max, Math.abs(b.x - b.px + scrollDelta) + b.r * 3), 0);
        // Environmental stuns do not grant the basketball's permanent base bonus.
        collideBirdGantries(birds, getTrainGantries(world, route, padding), scrollDelta);
      }
      stepBirdIce(scrollDelta);
      settleBirdEffects(iceBefore, absorbedBefore);
      if (returned) {
        ball.scored = false; scoreGateHoop = null; scoredLock = 0;
        resetShotFlags(); resetTrail(); syncChain();
      }
      if (wasOwned || birdOwnsBall(birds) || returned) {
        prevBallX = ball.x; prevBallY = ball.y;
        stepParticles(dt);
        stepNet(hoop, ball, ball.x, ball.y, world, dt, time, false);
        if (other) stepNet(other, ball, ball.x, ball.y, world, dt, time, false);
        captureRewindSnapshot(dt);
        return;
      }
    }

    boltFloorGrip = false;
    boltFloorSpeed = 0;
    boltBoardGrip = false;
    boltFastFill = false;
    const boltFromX = ball.x, boltFromY = ball.y;
    const boltLock = boltOverheated || stepBoltStorm(dt) || vector.anchor !== null;
    if (boltLock && boltStorm && trainBackdropOn() && phase === "playing") resolveBirdContact(boltFromX, boltFromY);

    if (!boltLock) {
    prevBallX = ball.x;
    prevBallY = ball.y;
    const live =
      (phase === "playing" || phase === "over" || phase === "title" || phase === "hub" || phase === "settle") &&
      !stageMod.holdsBall?.();
    if (live) {
      const superFreezePin = isSuper() && superIsFrozen(superBall) ? { x: ball.x, y: ball.y } : null;
      if (superFreezePin) { ball.vx = 0; ball.vy = 0; ball.omega = 0; }
      const hacking = phase === "playing" && isHacker() && hackerAwaken && hackerDir !== null;
      const gScale = 1;
      // High-bounce kits skip fallBoost �?otherwise each landing gains height.
      const fallBoost = (() => {
        if (pMul("ball") > 1.15) return 1;
        if (holeOn) return 1;
        return ball.vy > 20 ? 1.28 : 1;
      })();
      const buoy = pMul("buoy");
      if(isRocket() && phase==="playing") stepRocket(rocket,ball,gravity(),dt);
      const superDriven = isSuper() && superDashVelocity(superBall,ball,dt);
      const vectorDriven = vector.burst > 0 || vector.correction !== null || superDriven;
      if (vectorDriven) {
        if (vector.burst > 0) normalizeVectorSpeed();
        else if (vector.correction) {
          if (!stepVectorCorrection(ball, vector.correction, dt)) {
            vector.correction = null;
            ball.vx = 0;
            ball.vy = 0;
          }
        }
      } else if (hacking) {
        if (scoredLock <= 0 && ball.scored) {
          ball.scored = false;
          resetShotFlags();
          shotOpen = true;
        }
        updateHackerRimSlide();
        if (trafficEnabled() && hackerDir) updateTrafficHackerSlide(traffic, world, ball, { ...hackerDirectionVector(hackerDir), speed: hackerSpeed });
      } else if (holeOn && isAnti2()) {
        const wasFlight = antiRecovery.mode === "flight";
        stepAntiRecovery(antiRecovery, ball, { x: holeX, y: holeY },
          other && other.active ? [hoop, other] : [hoop], world.floorY, gravity() * gScale, dt);
        if (wasFlight && antiRecovery.mode === "return" && !ball.scored) markShotMissed();
      } else if (holeOn) {
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
        // Near the rim plane with almost no vertical speed �?nudge down through the hoop.
        if (
          phase === "playing" &&
          !ball.scored &&
          Math.abs(ball.y - hoop.y) < hoop.inner * 0.45 &&
          Math.abs(ball.vy) < 70 &&
          Math.abs(ball.x - hoop.x) < hoop.inner * 2.6
        ) {
          ball.vy += 200 * dt;
        }
      } else if (isMaze()) {
        // Treat the entire court as a tilted plane. The control changes the
        // plane's downhill direction, so it is an acceleration?not a speed target.
        const mazeForce = gravity() * 1.18;
        // Maze Ball top speed: 20% below the previous cap, across all aspect ratios.
        const mazeTuning = devOn ? devMaze : DEFAULT_MAZE;
        const mazeMaxSpeed = Math.max(521, world.w * 0.9072) * mazeTuning.maxSpeed;
        ball.vx += mazeGravity.x * mazeForce * dt;
        ball.vy += mazeGravity.y * mazeForce * dt;
        const mazeSpeed = Math.hypot(ball.vx, ball.vy);
        if (mazeSpeed > mazeMaxSpeed) {
          const scale = mazeMaxSpeed / mazeSpeed;
          ball.vx *= scale;
          ball.vy *= scale;
        }
      } else {
        ball.vy += gravity() * dt * (gScale * fallBoost - buoy);
      }
      if (!hacking && !vectorDriven) {
      // Train frame: hoop and carriage stay put. Accel pulls the ball left,
      // decel pulls it right, cruise adds nothing. Pause never calls physics;
      // rewind returns above. Other scenes leave this at zero.
      if (trainBackdropOn()) ball.vx += trainPull() * dt;
      const air = pMul("air");
      const roll = pMul("roll");
      if (isMaze()) {
        // Constant rolling friction belongs to the court itself, independent of
        // stick position. It removes a fixed amount of speed every second and
        // lets the ball come to a clean natural rest on a level court.
        const speed = Math.hypot(ball.vx, ball.vy);
        const mazeBrake = devOn ? devMaze.brake : DEFAULT_MAZE.brake;
        const nextSpeed = Math.max(0, speed - mazeBrake * dt);
        if (speed > 0.001) {
          const scale = nextSpeed / speed;
          ball.vx *= scale;
          ball.vy *= scale;
        }
        if (nextSpeed < 0.5) {
          ball.vx = 0;
          ball.vy = 0;
        }
      }
      const onFloor = !isMaze() && ball.y + ball.r >= world.floorY - 0.5 && ball.vy >= 0;
      if (!isMaze() && !onFloor && ball.y + ball.r < world.floorY - 2) shotAirborne = true;
      if (onFloor) {
        if (Math.abs(ball.vx) > 2.2) {
          boltFloorGrip = true;
          boltFloorSpeed = Math.abs(ball.vx);
        }
        ball.vx *= 1 - Math.min(0.85, 0.28 * roll * dt);
        ball.omega = ball.vx / Math.max(8, ball.r);
        if (isRogueMode() && rogueRun && phase === "playing") {
          const jn = ornamentStacks(rogueRun, "jiahao");
          if (jn > 0) {
            // 接触地面累计 0.5s �?+1 �?×层数（不要求滚动�?
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
        const spinDrag = legacyHole() ? 0.06 : 0.28;
        ball.omega *= 1 - Math.min(0.85, spinDrag * air * dt);
      }
      ball.vy *= 1 - Math.min(0.85, 0.025 * air * dt);
      ball.omega = clamp(ball.omega, -22, 22);
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      }
      if (hacking || vectorDriven) {
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
      }
      if (trainBackdropOn() && phase === "playing" && quantumTunnelLeft <= 0) {
        if (resolveBirdContact(prevBallX, prevBallY) === "caught") {
          captureRewindSnapshot(dt); return;
        }
        const incomingVx = ball.vx, incomingVy = ball.vy;
        const route = getTrainScroll();
        if (collideTunnel(world, ball, prevBallX, prevBallY, dt) || collideTrainGantries(world, route, ball, prevBallX, prevBallY, route.near - trainBefore, dt, isSuper() ? (nx, ny) => superCancelsSolid(nx, ny) : undefined)) {
          vectorCollision(incomingVx, incomingVy);
          shotAirborne = true;
          // Do not let the displacement caused by a collision count as a basket.
          prevBallX = ball.x; prevBallY = ball.y;
          if (boardHitLock <= 0) {
            audio.board(0.7); boardHitLock = 0.12;
            if (gfx.impact) camShake = Math.max(camShake, 0.1);
          }
        }
      }
      const rocketFreeY=ball.y,rocketFreeVy=ball.vy;
      if (trafficEnabled() && phase === "playing") {
        const vectorIncoming = {vx:ball.vx,vy:ball.vy};
        if (holeOn) beginTrafficAbsorption(traffic, holeX, holeY);
        const nearMissBefore = traffic.nearMiss;
        const desired = hacking && hackerDir ? hackerDirectionVector(hackerDir) : null;
        if (collideTraffic(traffic, world, ball, prevBallX, prevBallY, {
          dt,
          blockImpact: isSuper()
            ? (fresh, nx, ny) => (!fresh && superBall.shield) || superImpact(superBall, ball, { nx, ny })
            : undefined,
          tunneling: quantumTunnelLeft > 0,
          hacker: desired ? { ...desired, speed: hackerSpeed } : undefined,
          lightning: isBolt(),
          roofFriction: 0.28 * pMul("roll"),
          discharge: isBolt() && boltCharge > 90 && !ball.scored,
          ignite: heatN() >= STAGE_IGNITE && heatN() < STAGE_BLAZE,
          blaze: heatN() >= STAGE_BLAZE,
          frost: isFrost() ? { chance: frostChance(), first: FROST_DUR_FIRST, refresh: FROST_DUR_REFRESH } : undefined,
        })) {
          vectorCollision(vectorIncoming.vx,vectorIncoming.vy);
          shotAirborne = true;
          if (!hacking && traffic.roofSpeed <= 0) {
            if (gfx.impact) camShake = Math.max(camShake, 0.14);
            audio.board(0.7);
          }
        }
        if (traffic.igniteUpgrade) {
          combo = Math.max(combo, STAGE_BLAZE);
          callouts.push({ text: "烈焰", x: ball.x, y: ball.y - ball.r * 2, life: 0.8, max: 0.8, kind: "base" });
          emitHud();
        }
        if (traffic.lightningHit) {
          score += 1;
          boltCharge = Math.max(0, boltCharge - 1);
          if (isRogueMode() && rogueRun) rogueRun.stageScore = score;
          noteBalanceSkillEffect({ trigger: true, directScore: 1 });
          noteBest();
          callouts.push({ text: "+1", x: ball.x, y: ball.y - ball.r * 2, life: 0.6, max: 0.6, kind: "base" });
          emitHud();
        }
        if (traffic.burnScore > 0) {
          score += traffic.burnScore;
          if (isRogueMode() && rogueRun) rogueRun.stageScore = score;
          noteBest();
          audio.burn();
          if (gfx.flash) burnFlash = 0.16;
          if (gfx.impact) camShake = Math.max(camShake, 0.12);
          callouts.push({ text: `+${traffic.burnScore}`, x: ball.x, y: ball.y - ball.r * 2, life: 0.8, max: 0.8, kind: "base" });
          emitHud();
        }
        if (traffic.frostGain > 0) {
          frostBonus += traffic.frostGain;
          callouts.push({ text: "基础 +1", x: ball.x, y: ball.y - ball.r * 2, life: 0.8, max: 0.8, kind: "base" });
        }
        if (isBolt() && traffic.roofSpeed > 2.2) {
          boltFloorGrip = true;
          boltFloorSpeed = Math.max(boltFloorSpeed, traffic.roofSpeed);
        }
        stepTrafficNearMiss(traffic, world, ball, quantumTunnelLeft > 0);
        ball.trafficNearMiss = traffic.nearMiss;
        if (nearMissBefore !== traffic.nearMiss) {
          if (traffic.nearMiss > nearMissBefore) callouts.push({ text: `擦车而过 ×${traffic.nearMiss}`, x: ball.x, y: ball.y - ball.r * 2, life: 0.8, max: 0.8, kind: "base" });
          emitHud();
        }
        if (vector.burst <= 0 && trafficOutOfBounds(traffic, world, ball)) grantTrafficSafe(traffic, ball);
        else if (traffic.launched && ball.vy >= 0 && ball.y + ball.r >= world.floorY - 1) traffic.launched = false;
      }
      // Resolve traffic escape before hacker wrapping; otherwise side wrapping hides it.
      if (hacking) wrapHackerBounds();
      if (isMaze() && !birds.enteringFromTop && ball.y - ball.r < 0 && !(trafficEnabled() && traffic.launched)) {
        // The top of the court is a solid wall for the rolling-board mode.
        // Keep the normal impact speed and reflect it with maze restitution.
        const impact = -ball.vy;
        ball.y = ball.r;
        if (impact > 0) {
          ball.vy = impact * mazeRestitution(impact, bounceRest("board"));
          ball.omega = ball.vx / Math.max(8, ball.r);
          if (phase !== "title") audio.board(Math.min(1, impact / 700));
        }
      }
      if (ball.y + ball.r < 0 && !birds.enteringFromTop) wentOffTop = true;
      // Leash before wrap so a taut chain yanks the ball and can block side-respawn.
      if (phase === "playing" && !stageMod.holdsBall?.()) {
        stageMod.afterPhysics?.(dt, modifierHost());
      }
      // Collect along the physical path before wrapping replaces its endpoints.
      // The later check also covers contact after rim/board collision resolution.
      if (phase === "playing" && isAnti()) tryCollectAntiMatter();
      if(isRocket()) {
        if(ball.x<ball.r){ball.x=ball.r;ball.vx=Math.max(0,ball.vx);}
        if(ball.x>world.w-ball.r){ball.x=world.w-ball.r;ball.vx=Math.min(0,ball.vx);}
        if(ball.y<ball.r && !birds.enteringFromTop){ball.y=ball.r;ball.vy=Math.max(0,ball.vy);}
      } else if (vector.burst > 0) vectorBounds();
      else if (!hacking && !(holeOn && isAnti2())) wrapX();
      if (birds.enteringFromTop && ball.y >= ball.r) birds.enteringFromTop = false;
      pushNinjaPath(dt);
      stepNinjaGhosts(dt);
      pushTrail();
      // A make only locks the ball while it is threading its scored hoop. Once it
      // has cleared that hoop, permit the next basket without waiting for floor contact.
      if (ball.scored && scoredLock <= 0 && scoreGateHoop) {
        const clearR = scoreGateHoop.inner + ball.r * 1.5;
        if (Math.hypot(ball.x - scoreGateHoop.x, ball.y - scoreGateHoop.y) > clearR) {
          ball.scored = false;
          scoreGateHoop = null;
          resetShotFlags();
        }
      }
      ball.spin += ball.omega * dt;
      ball.squash += (1 - ball.squash) * (1 - Math.exp(-12 * dt));
      // Score before rim/board so a clean thread isn't eaten by rim bounce.
      if (phase === "playing") checkScore();
      if (phase !== "title" && !ballHidden() && !anti2ReturnLocked()) {
        const vx0 = ball.vx;
        const vy0 = ball.vy;

        if (scoredLock <= 0 && quantumTunnelLeft <= 0) {
          if (hacking) {
            if (stageMod.canScore(hoop)) collideHackerRim(hoop);
            if (other && stageMod.canScore(other)) collideHackerRim(other);
          } else {
            if (stageMod.canScore(hoop)) collideRim(hoop);
            if (other && stageMod.canScore(other)) collideRim(other);
          }
        }
        if (quantumTunnelLeft <= 0 && !hoop.noBoard && !stageMod.skipBoard(hoop)) collideBoard(hoop);
        if (quantumTunnelLeft <= 0 && !hoop.noBoard && !stageMod.skipBrace(hoop)) collideBrace(hoop);
        if (other && quantumTunnelLeft <= 0) {
          if (!other.noBoard && !stageMod.skipBoard(other)) collideBoard(other);
          if (!other.noBoard && !stageMod.skipBrace(other)) collideBrace(other);
        }
        if (ball.vx !== vx0 || ball.vy !== vy0) traffic.launched = false;
        if (ball.vx !== vx0 || ball.vy !== vy0) vectorCollision(vx0,vy0);
        if (
          hacking &&
          !hackerRimSlide &&
          (Math.abs(ball.vx - vx0) > 0.5 || Math.abs(ball.vy - vy0) > 0.5)
        ) {
          syncHackerDirFromVelocity();
        }
      }
      if (phase === "playing") {
        if (isAnti()) tryCollectAntiMatter();
        if (holeOn) stepAntiHole(dt);
        if (antiMatter && !holeOn && isAnti()) antiMatter.age += dt;
        tickRogueBuffs(dt);
      }
      if (phase === "playing" && isGlass() && glassLand) {
        glassPeakY = Math.min(glassPeakY, ball.y);
      }
      const caught = phase === "playing" && stageMod.touchBall?.(modifierHost()) === true;
      if (!caught && !hacking && vector.burst <= 0) {
        const incomingVelocity = {vx:ball.vx,vy:ball.vy};
        const landed = ball.y + ball.r >= world.floorY && ball.vy > 40;
        collideFloor();
        if (landed) vectorCollision(incomingVelocity.vx,incomingVelocity.vy);
      }
      if (superFreezePin) {
        ball.x = superFreezePin.x;
        ball.y = superFreezePin.y;
        ball.vx = 0;
        ball.vy = 0;
        ball.omega = 0;
      }
      stepBoltBoardTop(dt);
      stepBoltCharge(dt);
      if(isRocket() && phase==="playing") {
        const floor=Math.abs(ball.y+ball.r-world.floorY)<2;
        const platform=rocketFreeVy>0 && ball.y<rocketFreeY-0.01 && ball.vy<=5;
        refillRocket(rocket,(floor||platform)&&Math.abs(ball.vy)<75,dt);
      }
      if (chain && hasChain() && !caught && !stageMod.holdsBall?.()) {
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
    } else if ((boltOverheated || vector.anchor !== null) && phase === "playing" && !stageMod.holdsBall?.()) {
      // Projectiles and other post-step mechanisms still advance; the ball stays pinned below.
      stageMod.afterPhysics?.(dt, modifierHost());
    }

    stepBoltBoardTop(dt);

    if (Math.hypot(ball.x - hoop.x, ball.y - hoop.y) > world.w * 0.55) {
      ball.hitRim = false;
      ball.hitBoard = false;
    }
    const rimClear = hoop.inner + ball.r * 2.8;
    const farHoop = Math.hypot(ball.x - hoop.x, ball.y - hoop.y) > rimClear;
    const farOther = !other || Math.hypot(ball.x - other.x, ball.y - other.y) > rimClear;
    if (farHoop && farOther) rimAudioArmed = true;

    const ghostQuiet = hoop.noBoard && hoop.scoreable === false;
    const nearHoop = !ghostQuiet && netNearHoop(hoop, ball);
    stepNet(hoop, ball, prevBallX, prevBallY, world, dt, time, !anti2ReturnLocked() && !vector.anchor && vector.burst <= 0 && nearHoop && netShouldCollide(hoop, ball));
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
        !anti2ReturnLocked() && !vector.anchor && vector.burst <= 0 && nearOther && other.couple && netShouldCollide(other, ball),
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
    if (boltOverheated) pinBoltOverheatBall();
    captureRewindSnapshot(dt);
  }

  function activeHoopYLimits(useTunnel = true) {
    const limits = hoopYLimits(world, useTunnel);
    if (!holeOn || !isAnti2()) return limits;
    // Keep black-hole shots near the center while respecting scene clearance.
    const minY = clamp(world.h * 0.30, limits.minY, limits.maxY);
    const maxY = clamp(world.h * 0.56, minY, limits.maxY);
    return { minY, maxY };
  }

  function boardTravel() {
    return activeHoopYLimits(tunnelPassing());
  }

  function rollMoveSpeed() {
    const lo = MOVE_SPD0_LO;
    const hi = Math.min(MOVE_SPD_CAP_HI, MOVE_SPD0_HI + moveHits * MOVE_SPD_STEP);
    return world.h * (lo + Math.random() * Math.max(0.004, hi - lo));
  }

  function stepHoop(h: Hoop, dt: number) {
    if (h.jolt > 0) h.jolt = Math.max(0, h.jolt - dt / 0.28);
    // Frozen stands stay locked in place — no travel, no baseY settle.
    if (h.frostLeft > 0 && h.frost > 0) {
      h.moving = false;
      h.targetX = h.x;
      h.baseX = h.x;
      h.baseY = h.y;
      return;
    }
    // Ghost rings: modifier owns position — do not lerp / travel.
    if (h.noBoard) {
      h.moving = false;
      return;
    }
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
          const ry = Math.min(24, world.h * 0.042, Math.max(0, (maxY - minY) / 2 - 2));
          const padY = Math.min(2, Math.max(0, (maxY - minY) / 2 - ry));
          const cy = clamp(h.baseY, minY + ry + padY, maxY - ry - padY);
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
    if (holeOn && isAnti2() && h.moving) {
      const { minY, maxY } = boardTravel();
      h.y = clamp(h.y, minY, maxY);
      h.baseY = clamp(h.baseY, minY, maxY);
    }
    if (trainBackdropOn() && tunnelPassing()) {
      const minY = tunnelHoopMin(world);
      h.y = Math.max(minY, h.y); h.baseY = Math.max(minY, h.baseY);
    }
    nudgeNet(h, h.x - ox, h.y - oy);
  }

  /** Resting on a board top for two seconds triggers a rapid battery fill. */
  function stepBoltBoardTop(dt: number) {
    if (!isBolt() || phase !== "playing" || boltStorm) {
      boltBoardTopHold = 0;
      return;
    }
    const onTop = (h: Hoop) => {
      const g = boardGeom(h, world);
      const within = ball.x >= g.visX - ball.r * 0.45 && ball.x <= g.visX + g.visW + ball.r * 0.45;
      const restingY = Math.abs(ball.y + ball.r - g.visY) <= Math.max(3, ball.r * 0.22);
      return within && restingY && Math.abs(ball.vy) < 28 && Math.abs(ball.vx) < 38;
    };
    if (onTop(hoop) || Boolean(other && onTop(other))) {
      boltBoardTopHold += dt;
      if (boltBoardTopHold >= 2) boltFastFill = true;
    } else {
      boltBoardTopHold = 0;
    }
  }

  function collideHackerRim(h: Hoop) {
    const rad = h.tube * 0.92;
    const points = [
      { x: h.x - h.inner, y: h.y },
      { x: h.x + h.inner, y: h.y },
    ];
    let normalX = 0;
    let normalY = 0;
    let penetration = 0;
    for (const point of points) {
      const dx = ball.x - point.x;
      const dy = ball.y - point.y;
      const distance = Math.hypot(dx, dy) || 0.0001;
      const overlap = ball.r + rad - distance;
      if (overlap > penetration) {
        penetration = overlap;
        normalX = dx / distance;
        normalY = dy / distance;
      }
    }
    if (penetration <= 0 || !hackerDir) return;

    // The rim stays solid: remove only the inward movement and cruise along its tangent.
    ball.x += normalX * (penetration + 0.7);
    ball.y += normalY * (penetration + 0.7);
    const dir = hackerRimSlide?.dir ?? hackerDir;
    const desired = hackerDirectionVector(dir);
    const tangentX = -normalY;
    const tangentY = normalX;
    const tangentDot = desired.x * tangentX + desired.y * tangentY;
    const turn: -1 | 1 =
      Math.abs(tangentDot) > 0.001
        ? tangentDot > 0
          ? 1
          : -1
        : ball.y <= h.y
          ? 1
          : -1;
    hackerRimSlide = { dir, hoop: h, turn };
    ball.vx = tangentX * hackerSpeed * turn;
    ball.vy = tangentY * hackerSpeed * turn;
    ball.omega = ball.vx / Math.max(8, ball.r);
    ball.hitRim = true;
    h.jolt = 1;
    h.joltDir = ball.vy < 0 ? -1 : 1;
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
    // Couple spin �?tangential velocity (rolling contact). Spinning balls deflect off the rim.
    const applySpinDeflect = () => {
      if (isMaze()) {
        ball.omega = clamp((ball.vx * tx + ball.vy * ty) / r, -22, 22);
        return;
      }
      const vt = ball.vx * tx + ball.vy * ty;
      const slip = vt - ball.omega * r;
      const baseK = legacyHole() ? 0.42 : 0.22;
      const k = Math.min(0.72, baseK * pMul("rimFric"));
      ball.vx -= k * slip * tx;
      ball.vy -= k * slip * ty;
      ball.omega += (k * slip) / r;
      // Extra kick from residual spin so flat pinball contacts still glance away.
      const spinKick = clamp(ball.omega * r * (legacyHole() ? 0.28 : 0.12), -160, 160);
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
      if (legacyHole() && !ball.scored && Math.abs(ball.y - h.y) < ball.r * 1.35 && Math.abs(ball.vy) < 100) {
        ball.vy += 150;
        ball.vx *= 0.7;
      }
      return;
    }
    const throughHole = Math.abs(ball.x - h.x) < h.inner * 0.55 && ball.vy > 28;
    noteComboContact(h);
    // Going through the hoop is a make path — do not arm perfect cancel on that graze.
    if (!throughHole && superCancelsSolid(nx, ny)) return;
    const rest = isMaze() ? mazeRestitution(-vn, bounceRest("rim")) : bounceRest("rim");
    ball.vx -= (1 + rest) * vn * nx;
    ball.vy -= (1 + rest) * vn * ny;
    applySpinDeflect();
    ball.hitRim = true;
    h.jolt = 1;
    h.joltDir = ball.vy < 0 ? -1 : 1;
    // Black-hole mode: break horizontal rim pinball by kicking off the rim plane.
    if (legacyHole() && !ball.scored) {
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
    const impact = -vn;
    if (h.active && rimHitLock <= 0) {
      rimHits += 1;
      rimHitLock = 0.08;
      if (isBolt() && boltCharge > 90 && !ball.scored) {
        score += 1;
        boltCharge = Math.max(0, boltCharge - 1);
        if (isRogueMode() && rogueRun) rogueRun.stageScore = score;
        callouts.push({ text: "+1", x: ball.x, y: ball.y - ball.r * 2, life: 0.6, max: 0.6, kind: "base" });
        noteBest();
      }
      if (
        !ball.scored &&
        !throughHole &&
        isGlass() &&
        !glassRimHurtShot
      ) {
        const rimDist = Math.hypot(ball.x - h.x, ball.y - h.y);
        const dmg = glassScaledHurt(impact, rimDist, GLASS_RIM_HURT_MAX, 520, h.inner * 2.4);
        if (dmg > 0) {
          glassRimHurtShot = true;
          hurtGlass(dmg, ball.x, ball.y);
        }
      }
    }
    if (rimAudioArmed && !ball.scored && !throughHole && impact > 160) {
      audio.rim(Math.min(1, (impact - 120) / 520));
      rimAudioArmed = false;
    }
  }

  function collideBoard(h: Hoop) {
    if (h.noBoard) return;
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
    if (vn >= 0) {
      ball.hitBoard = true;
      return;
    }
    noteComboContact(h);
    if (superCancelsSolid(nx, ny)) return;
    const rest = isMaze() ? mazeRestitution(-vn, bounceRest("board")) : bounceRest("board");
    ball.vx -= (1 + rest) * vn * nx;
    ball.vy -= (1 + rest) * vn * ny;
    const tx = -ny;
    const ty = nx;
    const vt = ball.vx * tx + ball.vy * ty;
    const grip = isMaze() ? 0.015 : Math.min(0.92, 0.1 * pMul("boardFric"));
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
      if (isGlass() && !glassBoardHurtShot) {
        const boardCx = (left + right) * 0.5;
        const boardCy = (top + bottom) * 0.5;
        const boardDist = Math.hypot(ball.x - boardCx, ball.y - boardCy);
        const dmg = glassScaledHurt(
          impact,
          boardDist,
          GLASS_BOARD_HURT_MAX,
          520,
          Math.max(g.visW, g.bh) * 0.75,
        );
        if (dmg > 0) {
          glassBoardHurtShot = true;
          hurtGlass(dmg, ball.x, ball.y);
        }
      }
    }
  }

  /** Collide with hoop support brace — swept so small/fast balls cannot tunnel. */
  function collideBrace(h: Hoop) {
    if (h.noBoard) return;
    const segs = braceColliders(h, world);
    const hitR = ball.r;
    const ax0 = prevBallX;
    const ay0 = prevBallY;
    const bx = ball.x;
    const by = ball.y;
    for (const s of segs) {
      const need = hitR + s.halfW;
      const hit = closestSegSeg(ax0, ay0, bx, by, s.x0, s.y0, s.x1, s.y1);
      if (hit.dist >= need) {
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
    if (superCancelsSolid(nx, ny)) return;
    const rest = isMaze() ? mazeRestitution(-vn, bounceRest("board")) : bounceRest("board");
    ball.vx -= (1 + rest) * vn * nx;
    ball.vy -= (1 + rest) * vn * ny;
    const tx = -ny;
    const ty = nx;
    const vt = ball.vx * tx + ball.vy * ty;
    const grip = isMaze() ? 0.015 : Math.min(0.92, 0.12 * pMul("boardFric"));
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
    // Maze Ball rolls across one continuous tilted plane: cross an edge and
    // re-enter from the opposite edge with the same momentum and height.
    if (isMaze() && (exitLeft || exitRight)) {
      ball.x = exitLeft ? world.w + r - 1 : -r + 1;
      ball.scored = false;
      resetShotFlags();
      resetTrail();
      prevBallX = ball.x;
      prevBallY = ball.y;
      syncChain();
      return;
    }
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
    if (
      isGlass() &&
      glassLand &&
      !glassFloorHurtShot &&
      phase === "playing"
    ) {
      const floorContact = world.floorY - ball.r;
      const fallH = Math.max(0, floorContact - glassPeakY);
      // Map fall height to [0, 10]: short hops barely hurt, near full-court drop maxes out.
      const heightRef = Math.max(140, world.h * 0.52);
      const dmg = Math.round(GLASS_LAND_HURT_MAX * clamp(fallH / heightRef, 0, 1));
      glassFloorHurtShot = true;
      glassLand = false;
      if (dmg > 0) hurtGlass(dmg, ball.x, ball.y - ball.r * 2.2);
    }
    if (incoming > 40) {
      const baseRest = bounceRest(incoming > 140 ? "floorHi" : "floorLo");
      const rest = isMaze() ? mazeRestitution(incoming, baseRest) : baseRest;
      const rebound = incoming * rest;
      if (rebound > 40) {
        if (phase !== "title") audio.bounce(Math.min(1, incoming / 900));
        ball.vy = -rebound;
        if (!isMaze()) ball.vx *= 1 - Math.min(0.2, 0.03 * pMul("roll"));
        ball.squash = incoming > 220 ? 0.92 : incoming > 130 ? 0.95 : 0.97;
      } else {
        ball.vy = 0;
        if (phase !== "title" && incoming > 120) {
          audio.bounce(Math.min(1, incoming / 900));
        }
      }
    } else if (incoming > 0) {
      ball.vy = 0;
    }
    // Resting deadzone. During accel and decel the per-step impulse sits near
    // this cutoff, so leave it open and let the ball start rolling. Cruise and
    // every other scene still rest.
    if (Math.abs(ball.vx) < 2.2 && trainPull() === 0) ball.vx = 0;
    ball.omega = ball.vx / Math.max(8, ball.r);
    if (scoredLock <= 0) {
      ball.scored = false;
      resetShotFlags();
    }
    if (incoming <= 40 && isVector()) vector.powered = false;
    if (incoming <= 40 && shotAirborne) {
      markShotMissed();
      shotAirborne = false;
    }
  }

  function checkScore() {
    if (phase !== "playing") return;
    if (anti2ReturnLocked()) return;
    if (ball.scored) return;
    const goingDown = ball.vy > 8;
    const goingUp = ball.vy < -8;
    const bothWays = legacyHole();

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
    if (!stageMod.canScore(h)) return false;
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
    forceSwish?: boolean;
    at?: { x: number; y: number; inner: number } | Hoop;
  }) {
    const ghost = opts?.ghost === true;
    // Clones cannot replace the real ball's final shot or extend its window.
    if (ghost && (buzzer || timeUp)) return;
    const clutch = !ghost && buzzer;
    const finalMinuteMake = clutch && isMinuteMode();
    const scoredHoop = opts?.at ?? hoop;
    if (!ghost) {
      if ("net" in scoredHoop) (scoredHoop as Hoop).comboScored = true;
      ball.scored = true;
      if (holeOn && isAnti2()) scoreAntiRecovery(antiRecovery);
      // Makes cannot perfect-cancel — clear before the same-frame swipe can fire.
      if (isSuper()) superBall.impact = null;
      scoreGateHoop = scoredHoop as Hoop;
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
      // Score on secondary hoop �?promote it so nextHoop freezes the right stand.
      if (other && scoredHoop === other) {
        const swap = hoop;
        hoop = other;
        other = swap;
        overRim = otherOverRim;
        otherOverRim = false;
      }
    }
    let swish = ghost || opts?.forceSwish === true ? true : !ball.hitRim && !ball.hitBoard;
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
    if (!ghost && isVector()) vectorMake(vector);
    if (!ghost && isBolt()) {
      boltChargeUnlocked = true;
      boltTickAcc = 0;
      boltIdleDrainAcc = 0;
      if (bank) boltCharge = Math.min(100, boltCharge + 8);
      else if (swish && !boltStorm) boltCharge = Math.min(100, boltCharge + 1);
    }
    const toilet = ghost ? false : rimHits >= 3;
    const lucky = ghost ? false : hitBoardTop;
    const depth = ghost ? false : wentOffTop && swish;
    const needle = ghost ? false : fromBelow;
    const prevStage = fireStage(heatN());
    const shackled = isPrison() && prisonMode === "shackle";
    const freed = isPrison() && prisonMode === "free";

    const bunshinGhost = ghost && bunshinActive() && !isNinja();
    const ninjaGhost = ghost && isNinja();

    if (!clutch && comboCounting) {
      const boost =
        bunshinGhost
          ? 1
          : isRogueMode() && rogueRun && rogueRun.buffComboLeft > 0
            ? (catalogOf("comboboost")?.comboBoostAdd ?? 3)
            : 1;
      streak += boost;
    } else if (!clutch) {
      streak = bunshinGhost
        ? 1
        : isRogueMode() && rogueRun && rogueRun.buffComboLeft > 0
          ? (catalogOf("comboboost")?.comboBoostAdd ?? 3)
          : 1;
    }
    comboCounting = true;
    comboClock = 0;
    if (!ghost) {
      // timer is game-time only, so this excludes pauses and developer-console time.
      // The first make starts the minute; every later make contributes a real gap.
      if (balanceSession && isMinuteMode()) {
        const wasArmed = timerArmed;
        const elapsed = wasArmed ? Math.max(0, timerMax - timer) : 0;
        if (wasArmed && balanceLastMakeAt !== null) {
          balanceMaxMakeGapSeconds = Math.max(balanceMaxMakeGapSeconds, elapsed - balanceLastMakeAt);
        }
        if (!wasArmed) balanceMisses = 0;
        balanceLastMakeAt = elapsed;
      }
      shotMade = true;
      shotMissed = false;
      comboRescue = "approach";
      shotAirborne = false;
    }
    combo = Math.max(combo, streak);
    // Use the live streak after this make, not the heat combo retained after a miss.
    if (!ghost && isAnti2() && holeOn && holeLeft > 0 && Math.random() < Math.min(1, streak * 0.04)) {
      holeLeft += 1;
      callouts.push({ text: "黑洞 +1s", x: holeX, y: holeY - holeR * 1.6, life: 0.85, max: 0.85, kind: "tag" });
    }
    if (!ghost && isQuantum()) {
      // Every make checks against the current combo count as a percentage.
      // 27 combo = 27%; 100 combo and above = guaranteed phase.
      const chance = Math.min(1, Math.max(0, combo) / 100);
      if (Math.random() < chance) {
        quantumTunnelLeft = 6;
        ball.blink = true;
        noteBalanceSkillEffect({ trigger: true });
        callouts.push({ text: "量子隧穿", x: ball.x, y: ball.y - ball.r * 2.2, life: 0.9, max: 0.9, kind: "tag" });
      }
    }

    madeCount += 1;
    if (trainBackdropOn()) startTrainScroll();
    if (!ghost) {
      // Dynamic hoop: +0.4% chance per make, cap 50%; scoring a mover raises speed hi.
      moveChance = Math.min(MOVE_CHANCE_MAX, moveChance + MOVE_CHANCE_STEP);
      if (hoop.moving) moveHits += 1;
    }
    if (madeCount === 1) {
      audio.playBgm();
      bgmOn = true;
      opener = 1.6;
      pushGraf("start");
    }

    if (!ghost && isAnti() && !holeOn) {
      if (!antiMatter && Math.random() < ANTI_SPAWN_CHANCE) spawnAntiMatter();
    }

    if (shackled && !clutch) {
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

    // 基础�?+ 连击得分；混乱药丸只改基础分，连击分与后续加成照常
    const streakPart = streak;
    let basePart = isGlass() ? glassBase : isMaze() ? mazeBaseBonus : 0;
    if (isRogueMode() && rogueRun && hasChaosBase(rogueRun) && !bunshinGhost && !ninjaGhost) {
      basePart = Math.floor(Math.random() * 26) - 10;
    }
    basePart += birdBaseBonus;
    const superShieldScore = !ghost && isSuper() && superBall.shield;
    if(!ghost && isSuper()) basePart+=superBaseBonus(superBall);
    let gain = bunshinGhost ? 1 + birdBaseBonus : ninjaGhost ? birdBaseBonus : basePart + streakPart;
    if (!bunshinGhost && !ninjaGhost) {
      if (trafficEnabled()) gain += traffic.nearMiss;
      if (isFrost()) gain += frostBonus;
      if (depth) gain += 30;
      else if (needle) gain += 20;
      else if (lucky) gain += 10;
      else if (swish) gain += 3;
    }
    if (!clutch && swish && prevStage >= 2 && prevStage < 4) {
      const next = prevStage === 2 ? STAGE_IGNITE : STAGE_BLAZE;
      if (combo < next) combo = next;
    }
    if (!clutch && recoverTo > 0) {
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
    const awakenAfterClutch = clutch && !finalMinuteMake && isHacker() && !hackerAwaken;
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
      buzzer = false;
      buzzerTimer = 0;
      timeUp = false;
    }
    if (champMode && !bunshinGhost && !ninjaGhost) gain *= CHAMP_SCORE_MULT;
    if (isAnti() && legacyHole()) gain = 0;
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
    if(!ghost && isSuper()) superScore(superBall,gain,superShieldScore);
    if (!ghost && balanceSession) {
      const plainCore = bunshinGhost || ninjaGhost ? 0 : basePart + streakPart + extra + (freed ? prisonBonus : 0) + (clutch && !ninjaGhost ? 5 : 0);
      balancePlainGainAcc += plainCore;
      if (balanceSkillOn && ballId !== balanceSession.baseline) {
        const skillSlice = Math.max(0, gain - plainCore);
        const skillActive =
          wasFrozen ||
          Boolean(boltStorm) ||
          quantumTunnelLeft > 0 ||
          holeOn ||
          champMode ||
          (isTime() && rewindActive) ||
          (vector.burst > 0 || vector.correction !== null) ||
          skillSlice > 0;
        if (skillActive) {
          noteBalanceSkillEffect({
            trigger: true,
            directMake: wasFrozen || Boolean(boltStorm) || quantumTunnelLeft > 0 || holeOn || champMode,
            directScore: skillSlice,
            rescue: quantumTunnelLeft > 0,
          });
        }
        if (skillSlice > 0 && !skillActive) {
          balanceUnattributedScore += skillSlice;
          balanceTriggers += 1;
          balanceSkillScore += skillSlice;
        }
      }
    }
    if (!ghost && isTime() && !clutch && timerMax > 0) {
      // Store 5% of the unused-clock fraction as Time Ball rewind energy.
      const earned = Math.max(0, Math.min(1, timer / timerMax)) * 5;
      timeEnergy = Math.min(TIME_ENERGY_MAX, timeEnergy + earned);
    }
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
          if (!clutch) streak += 1;
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
    const hideMakeScore = (isAnti() && legacyHole()) || (ninjaGhost && gain <= 0);
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
        text: `+${prisonBonus}`,
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
        text: `+${frostBonus}`,
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
    if (finalMinuteMake) {
      // Keep the scored basket and its net; never spawn a replacement stand.
      gameOver({ quiet: true });
      return;
    }
    if (!champMode) {
      refillShotClock();
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
      if (!stageMod.onScored(modifierHost())) {
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
    }
    syncNinjaGhosts();
    if (awakenAfterClutch) enterHackerAwaken();
    else emitHud();
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
      scored.moving = false;
      scored.baseX = scored.x;
      scored.baseY = scored.y;
      scored.targetX = scored.x;
    } else {
      scored.active = false;
      // Shattered stands are already dismissed (couple false).
      if (scored.couple) scored.hold = HOOP_HOLD;
    }

    if (frozenOther) {
      // Already two stands �?never spawn a third. Same-side spawn blocked by frozenOther.
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

    hoop = makeHoop(world, nextSide, false, madeCount, activeHoopYLimits());
    hoop.x = nextSide < 0 ? -90 : world.w + 90;
    applyRogueHoopScale(hoop);
    hoop.net = buildNet(hoop);
    if (Math.random() < Math.max(0, moveChance + (isRogueMode() && rogueRun ? rogueMoveChanceDelta(rogueRun) : 0))) {
      hoop.moving = true;
      hoop.moveDir = Math.random() < 0.5 ? 1 : -1;
      const pool: Array<0 | 1 | 2 | 3 | 4> = [0, 3, 4];
      if (score >= 1000) {
        pool.push(1, 2);
      }
      hoop.moveKind = pool[Math.floor(Math.random() * pool.length)]!;
      hoop.moveAmp = rollMoveSpeed();
      hoop.moveT = Math.random() * Math.PI * 2;
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
      const realTick = Math.max(0, Math.min(raw, 0.1));
      const tick = realTick * (buzzer && phase === "playing" ? BUZZER_SPEED : 1);
      if (!rewindActive) {
        if (bgmOn) cloudT += tick;
        stepClouds(tick);
      }
      if (!paused) {
        if (buzzer && phase === "playing") buzzerTimer = Math.max(0, buzzerTimer - realTick);
        const dt = tick;
        time += dt;

        acc += dt;
        const MAX_STEPS = 3;
        let steps = 0;
        while (acc >= STEP && steps < MAX_STEPS) {
          const vectorFast = superBall.dash !== null || superBall.pending !== null || vector.leakLeft > 0 || vector.burst > 0 || vector.correction !== null || (vector.pointer !== null && !vector.consumed && vector.energy >= VECTOR.burstMin);
          const slices = vectorFast ? Math.min(24, Math.max(1, Math.ceil(world.w * 5.5 * STEP / Math.max(2,ball.r*0.45)))) : 1;
          for (let i=0;i<slices;i++) physics(STEP/slices);
          applyDevStatLocks();
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
          const yardHud = stageMod.hud?.() ?? null;
          const clock01 = timerMax > 0 ? timer / timerMax : 0;
          // Prison bar ART swaps Yard / Lock / Infraction; FILL always follows street cool-down.
          // Background recess/curfew phase pauses on hunt; fill does not.
          const timer01 = phase === "over" ? 1 : hackerAwaken ? 1 - clock01 : clock01;
          let scoreOverride: string | null =
            isRogueMode() && rogueRun
              ? `${Number.isFinite(rogueRun.target) ? rogueRun.target : "?"}:${rogueRun.runScore + rogueRun.stageScore}`
              : null;
                    let scoreFlash = false;
          const barLabel = yardHud?.active ? yardHud.barLabel : null;
          const k = Number.isFinite(camShake) ? Math.min(1, Math.max(0, camShake) / 0.16) : 0;
          const amp = k > 0.002 ? 4.6 * k * k : 0;
          const chargeScale=vectorChargeScale(vector);
          const renderedBall=vector.anchor ? {...ball,r:ball.r*chargeScale,
            x:ball.x+Math.sin(time*110)*(1-chargeScale)*6,
            y:ball.y+Math.cos(time*137)*(1-chargeScale)*6} : isVector() && vector.leakLeft>0 ? {...ball,
            x:ball.x+Math.sin(vector.elapsed*113)*2.5,y:ball.y+Math.cos(vector.elapsed*91)*2.5} : ball;
          drawScene(
            ctx,
            world,
            hoop,
            other,
            renderedBall,
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
            buzzer ? "绝杀时刻" : opener > 0 && streak < 2 ? "好戏开始" : champMode ? "冠军时刻" : holeOn ? "黑洞时刻" : "",
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
            devOn && devScene === "void" ? "void" : getSceneId(),
            ballId,
            isGlass() ? glassBase : -1,
            chain && hasChain() ? chain : null,
            prisonHud(),
            ninjaClonesDraw(),
            isChamp() && !champMode ? champBank : -1,
            holeOn
              ? { x: holeX, y: holeY, r: holeR, left: holeLeft }
              : null,
            isMaze() ? mazeHoles : [],
            isAnti() ? antiCharge : -1,
            isAnti() ? antiMatter : null,
            scoreOverride,
            isBolt() ? boltCharge : -1,
            boltTrail,
            barLabel,
            scoreFlash,
            (c) => {
              const pack = getScene().traffic;
              if (trafficEnabled() && pack) drawTrafficWorld(c, traffic, world, pack.textures, time);
              stageMod.drawWorldBack?.(c, world, time);
              if (isSuper() && !birdOwnsBall(birds)) {
                drawSuperGhosts(c, superBall, ball.r, (x, y, radius, alpha) => {
                  c.save();
                  c.globalAlpha = alpha;
                  paintBallSprite(c, x, y, radius, ball.spin, ballId, time);
                  c.restore();
                });
                drawSuperGas(c, superBall, ball);
              }
            },
            phase === "playing" && isHacker() && hackerAwaken,
            (c) => {
              stageMod.drawWorld?.(c, world, time);
              if (trafficEnabled()) drawTrafficAlerts(c, traffic, world, ball);
              if (isSuper()) drawSuperAura(c, superBall, ball);
            },
            phase === "playing" && isHacker() && hackerAwaken ? { dir: hackerDir } : null,
            // The pad is only a touch-control indicator. Gyro steering stays invisible
            // so releasing a dragged stick always springs the knob back to center.
            phase === "playing" && isMaze()
              ? { gravity: mazePointerId === null ? { x: 0, y: 0 } : mazeGravity }
              : null,
            phase === "playing" && isTime() ? { energy: timeEnergy, active: rewindActive, disabled: timeRewindBlocked() } : null,
            trainBackdropOn() ? birds : null,
            birdBaseBonus,
          );
          if (phase === "playing" && isRocket()) drawRocket(ctx,world,rocket,ball,time);
          if (phase === "playing" && isVector()) drawVector(ctx, world, vector, paused || buzzer || timeUp);
          if (phase === "playing" && isSuper()) drawSuper(ctx,world,superBall);
          ctx.restore();
          stageMod.drawScreen?.(ctx, world);
          }
        }
      }
    } catch (err) {
      console.error("[tq] frame", err);
    }
    raf = requestAnimationFrame(frame);
  }

  function onVis() {
    if (document.visibilityState !== "visible") cancelVectorInput();
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
  canvas.addEventListener("pointermove", onMove, { passive: false });
  canvas.addEventListener("pointerup", onUp, { passive: false });
  canvas.addEventListener("pointercancel", onUp, { passive: false });
  canvas.addEventListener("lostpointercapture", onUp);
  window.addEventListener("blur", cancelVectorInput);
  window.addEventListener("keydown", onKey);
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("deviceorientation", onDeviceOrientation);
  window.addEventListener("deviceorientationabsolute", onDeviceOrientation);
  window.addEventListener("devicemotion", onDeviceMotion);

  const handle: GameHandle = {
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("lostpointercapture", onUp);
      window.removeEventListener("blur", cancelVectorInput);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("deviceorientation", onDeviceOrientation);
      window.removeEventListener("deviceorientationabsolute", onDeviceOrientation);
      window.removeEventListener("devicemotion", onDeviceMotion);
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
      // The normal "again" button must not discard a manually tested balance run.
      recordBalanceTrial("retry");
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
    setScene(id) {
      if (id !== "street" && id !== "prison" && id !== "overpass" && id !== "train") return;
      applyScenePack(id);
      if (devOn && devScene !== "void") {
        devScene = id;
      }
      bootStageModifier({ announce: phase === "playing" });
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
    dev(cmd) {
      applyDev(cmd);
    },
    resize,
  };

  (window as unknown as { __tq: unknown }).__tq = {
    snapshot() {
      return {
        phase,
        sceneId: getSceneId(),
        train: trainBackdropOn() ? getTrainScroll() : null,
        tunnel: trainBackdropOn() ? getTrainTunnel() : null,
        trainGantries: trainBackdropOn() ? getTrainGantries(world, getTrainScroll()) : [],
        trainWarnings: trainBackdropOn() ? getTrainGantryWarnings(world, getTrainScroll()) : [],
        birds: trainBackdropOn() ? structuredClone(birds) : null,
        birdBaseBonus,
        frostBonus, glassBase, quantumTunnelLeft, hackerAwaken,
        blackHole: holeOn ? { x: holeX, y: holeY, r: holeR, left: holeLeft } : null,
        antiRecovery: holeOn && isAnti2() ? { ...antiRecovery } : null,
        antiCharge,
        antiMatter: antiMatter ? { ...antiMatter } : null,
        traffic: trafficEnabled() ? {
          vehicles: traffic.vehicles.map(v => ({ ...v })),
          warnings: traffic.warnings.map(v => ({ ...v })),
          safeLeft: traffic.safeLeft, launched: traffic.launched,
          hits: traffic.hits, respawns: traffic.respawns, clock: traffic.clock,
        } : null,
        score,
        combo,
        timer,
        timerMax,
        timerArmed,
        buzzer,
        buzzerTimer,
        timeUp,
        madeCount,
        hoopInner: hoop.inner,
        timeEnergy,
        rewindActive,
        vector: { ...vector, renderScale:vectorChargeScale(vector), trail: undefined, button: vectorLayout(world.w,world.h,world.floorY) },
        boltCharge,
        boltChargeUnlocked,
        rocket: {...rocket, control:rocketLayout(world.w,world.h,world.floorY)},
        superBall: {...superBall,bar:superLayout(world)},
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
        ball: { sootLeft: ball.sootLeft, x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy, r: ball.r, scored: ball.scored, omega: ball.omega, spin: ball.spin },
        hoop: { sootLeft: hoop.sootLeft, x: hoop.x, y: hoop.y, side: hoop.side, inner: hoop.inner, moving: hoop.moving, moveKind: hoop.moveKind, moveDir: hoop.moveDir },
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
        world: { w: world.w, h: world.h, floorY: world.floorY, cssW: world.cssW, cssH: world.cssH, ox: world.ox, oy: world.oy },
        playMode,
        rogueStage: rogueRun?.stage ?? null,
        rogueEndless: rogueRun?.endless ?? null,
      };
    },
    tap: () => tapJump(),
    // Deterministic setup for reproducing low-rim and pickup collisions in the sandbox.
    antiScenario(options: { hoopY?: number; pickup?: { x: number; y: number; pct: number }; returning?: boolean; closeHole?: boolean }) {
      if (!devOn || !isAnti()) return false;
      if (options.closeHole) closeAntiHole();
      if (typeof options.hoopY === "number" && Number.isFinite(options.hoopY)) {
        hoop.y = hoop.baseY = Math.max(ball.r * 3, Math.min(world.floorY - ball.r * 3, options.hoopY));
        hoop.moving = false;
        hoop.net = buildNet(hoop);
      }
      if (options.pickup && !holeOn) {
        const { x, y, pct } = options.pickup;
        if ([x, y, pct].every(Number.isFinite)) antiMatter = { x, y, pct: Math.max(1, Math.min(15, pct)), r: Math.max(14, world.ballR * 0.7), age: 0 };
      }
      if (options.returning && holeOn && isAnti2()) antiRecovery = createAntiRecovery();
      return true;
    },
    spawnBirds(kind: BirdKind, count = 1) {
      if (!trainBackdropOn() || tunnelReserved() || !["silly", "dive", "eagle"].includes(kind) || birdOwnsBall(birds)) return false;
      birds.birds = [];
      return spawnBirdWave(birds, world, kind, Math.random, count, getTrainScroll().trainSpeed);
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
  // Fill the canvas. Wide desktops still get side bars so gameplay stays
  // portrait; tall phones use the full height — searchlights stay on wall UV.
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
    floorY: h * 0.765, // keep in sync with FLOOR_Y_FRAC (searchlight-layout)
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

function hoopYLimits(world: World, useTunnel = true) {
  const topLen = world.h * 0.182;
  const pad = Math.max(8, world.h * 0.012);
  const minY = Math.max(topLen + pad, useTunnel && getSceneId() === "train" ? tunnelHoopMin(world) : 0);
  const maxY = world.floorY - world.ballR * 6;
  return { minY, maxY: Math.max(minY + 8, maxY) };
}

function makeHoop(world: World, side: -1 | 1, first: boolean, made = 0, limits = hoopYLimits(world)): Hoop {
  const inner = world.hoopInner;
  const x = side < 0 ? inner + world.w * 0.1 : world.w - inner - world.w * 0.1;
  const { minY: lo, maxY: hi } = limits;
  const t = Math.min(1, made / 36);
  const minY = clamp(world.h * 0.3 + (lo - world.h * 0.3) * t, lo, hi);
  const maxY = clamp(world.floorY * 0.58 + (hi - world.floorY * 0.58) * t, minY, hi);
  const y = first ? (minY + maxY) * 0.52 : minY + Math.random() * Math.max(0, maxY - minY);
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
