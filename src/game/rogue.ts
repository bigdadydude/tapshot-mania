/** Roguelike run tables and pure helpers. */

import type { BallId } from "./balls";
import { rollStageModifier, type ModifierId } from "./modifiers";
import {
  activeCatalog,
  RARITY_WEIGHT,
  ROGUE_CATALOG_BY_ID,
  type RogueCatalogEntry,
  type RogueItemId,
  type RogueOrnamentId,
  type RogueRarity,
  type RogueShopKind,
  type RogueShotTag,
} from "./rogue-catalog";

export type {
  RogueItemId,
  RogueOrnamentId,
  RogueRarity,
  RogueShopKind,
  RogueShotTag,
} from "./rogue-catalog";

export type RogueOwnedOrnament = {
  id: RogueOrnamentId;
  /** Stack count — effects scale with stacks; no upgrades. */
  stacks: number;
};

export type RogueShopOffer = {
  uid: string;
  kind: RogueShopKind;
  id: RogueItemId | RogueOrnamentId;
  name: string;
  desc: string;
  cost: number;
  sold: boolean;
  rarity: RogueRarity;
};

export type RogueGoldBreakdown = {
  base: number;
  streak: number;
  special: number;
  over: number;
  total: number;
};

export type RogueRun = {
  stage: number;
  target: number;
  stageScore: number;
  runScore: number;
  gold: number;
  goldBefore: number;
  revives: number;
  ornaments: RogueOwnedOrnament[];
  items: Partial<Record<RogueItemId, number>>;
  peakStreak: number;
  specialMakes: number;
  lastGoldGain: number;
  lastBreakdown: RogueGoldBreakdown | null;
  shop: RogueShopOffer[];
  nextDecay: number | null;
  nextBonusClock: number;
  /** Protect next combo break once — armed / prompt flow. */
  streakSave: boolean;
  /** Inventory charges for 连击保护. */
  streakSaveCharges: number;
  /** Waiting for player to confirm streak save. */
  pendingStreakSave: boolean;
  /** Next N makes convert score → gold. */
  pointExchangeLeft: number;
  /** Inventory charges for 汇率转换 (before activating). */
  pointExchangeCharges: number;
  /** Pending gold-to-score protect charge. */
  moneyProtect: boolean;
  /** Glass safe landing charges. */
  glassSafe: number;
  /** Blackhole uses remaining this stage (from stacks). */
  blackholeCharges: number;
  /** Timed buffs (seconds left). */
  buffComboLeft: number;
  buffPowerLeft: number;
  buffBunshinLeft: number;
  /** Concurrent 分身术 uses → clone count while buff is active. */
  buffBunshinClones: number;
  buffFlameLeft: number;
  /** Ask to drink next 热火饮料 after current expires. */
  pendingFlameReuse: boolean;
  /** Acc for 迪克云 score events. */
  whatsThatAcc: number;
  endless: boolean;
  stagesCleared: number;
  peakGold: number;
  peakStreakAll: number;
  peakMake: number;
  /** Acc for jiahao floor gold. */
  rollGoldAcc: number;
  /** Secondary ball fused at run start (skills OR onto primary). */
  fuseBall: BallId | null;
  /** Whether the open-run fuse picker was dismissed (incl. 不融合). */
  fusePicked: boolean;
  /** Active stage modifier for this stage (shared with story later). */
  modifier: ModifierId;
};

export type RogueHud = {
  stage: number;
  target: number;
  stageScore: number;
  runScore: number;
  gold: number;
  goldBefore: number;
  revives: number;
  ornaments: RogueOwnedOrnament[];
  items: Partial<Record<RogueItemId, number>>;
  lastGoldGain: number;
  lastBreakdown: RogueGoldBreakdown | null;
  shop: RogueShopOffer[];
  infinite: boolean;
  endless: boolean;
  peakStreak: number;
  specialMakes: number;
  forceSwish: boolean;
  streakSave: boolean;
  streakSaveCharges: number;
  pendingStreakSave: boolean;
  stagesCleared: number;
  peakGold: number;
  peakStreakAll: number;
  peakMake: number;
  pointExchangeLeft: number;
  pointExchangeCharges: number;
  moneyProtect: boolean;
  blackholeCharges: number;
  buffComboLeft: number;
  buffPowerLeft: number;
  buffBunshinLeft: number;
  buffBunshinClones: number;
  buffFlameLeft: number;
  pendingFlameReuse: boolean;
  fuseBall: BallId | null;
  fusePicked: boolean;
  modifier: ModifierId;
};

/** Campaign length (v1). Fusion slots planned at clears of stages 3 and 6. */
export const ROGUE_CAMPAIGN_STAGES = 9;
/**
 * Per-stage score targets for campaign stages 1..9.
 * Curves up so the finale sits above 10k; endless keeps climbing after that.
 */
const STAGE_TARGETS = [
  0,
  400, // 1
  700, // 2
  1_100, // 3 — planned fusion gate
  1_700, // 4
  2_600, // 5
  4_000, // 6 — planned fusion gate
  6_000, // 7
  8_500, // 8
  11_000, // 9 finale
] as const;
/** Stage-1 target; kept for callers that still import STAGE_SCORE. */
const STAGE_SCORE = STAGE_TARGETS[1];
const REVIVE_CAP = 2;
const SOFT_DECAY = 0.988;

/** Convenience maps for UI labels (active entries only). */
export const ROGUE_ITEMS: Record<string, { name: string; desc: string; cost: number }> =
  Object.fromEntries(
    activeCatalog("item").map((e) => [e.id, { name: e.name, desc: e.desc, cost: e.cost }]),
  );

export const ROGUE_ORNAMENTS: Record<
  string,
  { name: string; desc: string; cost: number; stackCap: number }
> = Object.fromEntries(
  activeCatalog("ornament").map((e) => [
    e.id,
    { name: e.name, desc: e.desc, cost: e.cost, stackCap: e.stackCap },
  ]),
);

export function stageTarget(stage: number): number {
  const s = Math.max(1, Math.floor(stage));
  if (s <= ROGUE_CAMPAIGN_STAGES) return STAGE_TARGETS[s]!;
  // Endless: keep raising the bar after the campaign finale.
  const over = s - ROGUE_CAMPAIGN_STAGES;
  return Math.round(STAGE_TARGETS[ROGUE_CAMPAIGN_STAGES]! * Math.pow(1.22, over));
}

export function createRogueRun(): RogueRun {
  return {
    stage: 1,
    target: stageTarget(1),
    stageScore: 0,
    runScore: 0,
    gold: 0,
    goldBefore: 0,
    revives: 0,
    ornaments: [],
    items: {},
    peakStreak: 0,
    specialMakes: 0,
    lastGoldGain: 0,
    lastBreakdown: null,
    shop: [],
    nextDecay: null,
    nextBonusClock: 0,
    streakSave: false,
    streakSaveCharges: 0,
    pendingStreakSave: false,
    pointExchangeLeft: 0,
    pointExchangeCharges: 0,
    moneyProtect: false,
    glassSafe: 0,
    blackholeCharges: 0,
    buffComboLeft: 0,
    buffPowerLeft: 0,
    buffBunshinLeft: 0,
    buffBunshinClones: 0,
    buffFlameLeft: 0,
    pendingFlameReuse: false,
    whatsThatAcc: 0,
    endless: false,
    stagesCleared: 0,
    peakGold: 0,
    peakStreakAll: 0,
    peakMake: 0,
    rollGoldAcc: 0,
    fuseBall: null,
    fusePicked: false,
    modifier: rollStageModifier(1),
  };
}

export function ornamentStacks(run: RogueRun, id: RogueOrnamentId): number {
  return run.ornaments.find((o) => o.id === id)?.stacks ?? 0;
}

export function catalogOf(id: string): RogueCatalogEntry | undefined {
  return ROGUE_CATALOG_BY_ID[id];
}

export function calcStageGold(opts: {
  stageScore: number;
  target: number;
  peakStreak: number;
}): RogueGoldBreakdown {
  const base = Math.floor(opts.target / 10);
  const streak = opts.peakStreak;
  const special = 0;
  const over = Math.max(0, opts.stageScore - opts.target);
  const total = Math.max(0, base + streak + special + over);
  return { base, streak, special, over, total };
}

export function rogueDecayBase(run: RogueRun, stageDecay: number | null): number {
  if (stageDecay != null) return stageDecay;
  if (ornamentStacks(run, "softDecay") > 0) return SOFT_DECAY;
  return 0.972;
}

export type RogueMakeTags = {
  swish: boolean;
  bank: boolean;
  toilet: boolean;
  lucky: boolean;
  depth: boolean;
  needle: boolean;
  clutch: boolean;
  streak: number;
  holeOn: boolean;
};

/** Score / gold / mult mods from ornaments + active item convert. */
export function applyRogueMakeMods(
  gain: number,
  run: RogueRun,
  tags: RogueMakeTags,
): { gain: number; gold: number } {
  let g = gain;
  let gold = 0;
  const fired: RogueShotTag[] = ["streak"];
  if (tags.swish) fired.push("swish");
  if (tags.bank) fired.push("bank");
  if (tags.toilet) fired.push("toilet");
  if (tags.lucky) fired.push("lucky");
  if (tags.depth) fired.push("depth");
  if (tags.needle) fired.push("needle");
  if (tags.clutch) fired.push("clutch");

  for (const owned of run.ornaments) {
    const meta = catalogOf(owned.id);
    if (!meta || meta.kind !== "ornament") continue;
    const n = owned.stacks;
    if (meta.scoreOn) {
      for (const tag of fired) {
        const per = meta.scoreOn[tag];
        if (!per) continue;
        g += per * n;
      }
    }
    if (meta.goldOn) {
      for (const tag of fired) {
        if (tag === "streak") continue;
        const per = meta.goldOn[tag];
        if (per) gold += per * n;
      }
    }
  }

  let mult = 1;
  const sling = ornamentStacks(run, "slingshot");
  if (sling > 0 && tags.holeOn) {
    const meta = catalogOf("slingshot");
    mult *= (meta?.slingshotMult ?? 3) * sling;
  }
  g = Math.round(g * mult);

  if (run.pointExchangeLeft > 0 && g > 0) {
    gold += g;
    g = 0;
    run.pointExchangeLeft -= 1;
  }

  return { gain: g, gold };
}

export function roguePhysMul(
  run: RogueRun,
  key:
    | "rimFric"
    | "ball"
    | "jumpFwd"
    | "jumpUp"
    | "grav"
    | "air"
    | "roll"
    | "floor"
    | "hoop"
    | "boardFric",
): number {
  let v = 1;
  for (const owned of run.ornaments) {
    const meta = catalogOf(owned.id);
    if (!meta) continue;
    const n = owned.stacks;
    if (key === "rimFric" && meta.rimFricPer) v += meta.rimFricPer * n;
    if (key === "ball" && meta.ballBouncePer) v += meta.ballBouncePer * n;
    if (key === "jumpFwd" && meta.jumpFwdPer) v += meta.jumpFwdPer * n;
    if (key === "jumpUp" && meta.jumpUpPer) v += meta.jumpUpPer * n;
    if (key === "grav" && meta.gravPer) v += meta.gravPer * n;
    if (key === "air" && meta.airPer) v += meta.airPer * n;
    if (key === "roll" && meta.rollPer) v += meta.rollPer * n;
    if (key === "floor" && meta.floorPer) v += meta.floorPer * n;
    if (key === "hoop" && meta.hoopPer) v += meta.hoopPer * n;
    if (key === "boardFric" && meta.boardFricPer) v += meta.boardFricPer * n;
  }
  return Math.max(0.35, v);
}

export function rogueMoveChanceDelta(run: RogueRun): number {
  const n = run.items.tranquilizer ?? 0;
  if (n <= 0) return 0;
  return (catalogOf("tranquilizer")?.moveChancePer ?? -0.05) * n;
}

export function rogueBallRMul(run: RogueRun): number {
  if (ornamentStacks(run, "funsize") <= 0) return 1;
  return catalogOf("funsize")?.ballRScale ?? 0.5;
}

export function rogueHoopInnerMul(run: RogueRun): number {
  const n = ornamentStacks(run, "alice");
  if (n <= 0) return 1;
  return 1 + (catalogOf("alice")?.hoopInnerPer ?? 0.18) * n;
}

export function hasChaosBase(run: RogueRun): boolean {
  return ornamentStacks(run, "chaosdrug") > 0;
}

export function miniMeStacks(run: RogueRun): number {
  return ornamentStacks(run, "miniMe");
}

export function rogueComboWindowBonus(run: RogueRun): number {
  let add = 0;
  for (const owned of run.ornaments) {
    const meta = catalogOf(owned.id);
    if (meta?.comboWindowPer) add += meta.comboWindowPer * owned.stacks;
  }
  return add;
}

export function rogueStartStreak(run: RogueRun): number {
  let best = 0;
  for (const owned of run.ornaments) {
    const meta = catalogOf(owned.id);
    if (meta?.startStreak) best = Math.max(best, meta.startStreak * owned.stacks);
  }
  return best;
}

export function rogueBlackholeSec(run: RogueRun): number {
  const n = ornamentStacks(run, "blackhole");
  if (n <= 0) return 0;
  return (catalogOf("blackhole")?.blackholeSec ?? 4) * n;
}

export function hasHeroMoment(run: RogueRun): boolean {
  return ornamentStacks(run, "HeroMoment") > 0;
}

function pickWeighted<T>(items: T[], weight: (t: T) => number, rng: () => number): T | null {
  if (items.length === 0) return null;
  let sum = 0;
  const ws = items.map((t) => {
    const w = Math.max(0.01, weight(t));
    sum += w;
    return w;
  });
  let r = rng() * sum;
  for (let i = 0; i < items.length; i++) {
    r -= ws[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

let offerSeq = 0;
function offerUid(prefix: string) {
  offerSeq += 1;
  return `${prefix}-${offerSeq}`;
}

function offerFrom(entry: RogueCatalogEntry, run: RogueRun): RogueShopOffer {
  const owned =
    entry.kind === "ornament"
      ? run.ornaments.find((o) => o.id === entry.id)?.stacks ?? 0
      : 0;
  const hint = entry.kind === "ornament" && owned > 0 ? `（已持有 ×${owned}）` : "";
  return {
    uid: offerUid(entry.kind === "item" ? "item" : "orn"),
    kind: entry.kind,
    id: entry.id,
    name: entry.name,
    desc: `${entry.desc}${hint}`,
    cost: entry.cost,
    sold: false,
    rarity: entry.rarity,
  };
}

function itemSoldOut(run: RogueRun, id: RogueItemId): boolean {
  const meta = catalogOf(id);
  if (id === "rematch") return run.revives >= REVIVE_CAP;
  if (id === "warmup") return run.nextBonusClock > 0 || (run.items.warmup ?? 0) > 0;
  if (id === "streakSave") return run.streakSaveCharges >= 3;
  if (id === "pointexchanger") return run.pointExchangeCharges > 0 || run.pointExchangeLeft > 0;
  if (id === "moneyprotecter") return run.moneyProtect;
  if (meta?.manualUse || meta?.moveChancePer != null) {
    return (run.items[id] ?? 0) >= meta.stackCap;
  }
  return false;
}

function ornSoldOut(run: RogueRun, entry: RogueCatalogEntry): boolean {
  const owned = run.ornaments.find((o) => o.id === entry.id)?.stacks ?? 0;
  return owned >= entry.stackCap;
}

/** Up to 2 items + up to 2 ornaments, rarity-weighted. */
export function rollShopStock(
  run: RogueRun,
  opts?: { ballId?: string; rng?: () => number },
): RogueShopOffer[] {
  const rng = opts?.rng ?? Math.random;
  const ballId = opts?.ballId ?? "plain";

  const itemsPool = activeCatalog("item").filter((e) => !itemSoldOut(run, e.id as RogueItemId));
  const ornsPool = activeCatalog("ornament").filter((e) => {
    if (ornSoldOut(run, e)) return false;
    if (e.requirePlainBall && ballId !== "plain") return false;
    if (e.requireGlassBall && ballId !== "glass") return false;
    return true;
  });

  const items: RogueShopOffer[] = [];
  const itemBag = itemsPool.slice();
  for (let n = 0; n < 2 && itemBag.length > 0; n++) {
    const pick = pickWeighted(itemBag, (e) => RARITY_WEIGHT[e.rarity], rng);
    if (!pick) break;
    items.push(offerFrom(pick, run));
    const idx = itemBag.findIndex((e) => e.id === pick.id);
    if (idx >= 0) itemBag.splice(idx, 1);
  }

  const orns: RogueShopOffer[] = [];
  const ornBag = ornsPool.slice();
  for (let n = 0; n < 2 && ornBag.length > 0; n++) {
    const pick = pickWeighted(ornBag, (e) => RARITY_WEIGHT[e.rarity], rng);
    if (!pick) break;
    orns.push(offerFrom(pick, run));
    const idx = ornBag.findIndex((e) => e.id === pick.id);
    if (idx >= 0) ornBag.splice(idx, 1);
  }

  return [...items, ...orns];
}

export function tryBuyOffer(run: RogueRun, uid: string): { ok: boolean; reason?: string } {
  const offer = run.shop.find((o) => o.uid === uid);
  if (!offer || offer.sold) return { ok: false, reason: "已售罄" };
  if (run.gold < offer.cost) return { ok: false, reason: "金币不足" };
  const meta = catalogOf(offer.id);
  if (!meta) return { ok: false, reason: "未知物品" };

  if (offer.kind === "item") {
    const id = offer.id as RogueItemId;
    if (meta.revive) {
      if (run.revives >= REVIVE_CAP) return { ok: false, reason: "重生已满" };
      run.revives += 1;
    } else if (meta.nextBonusSec) {
      run.items.warmup = (run.items.warmup ?? 0) + 1;
      run.nextBonusClock = Math.max(run.nextBonusClock, meta.nextBonusSec);
    } else if (meta.streakSave) {
      run.streakSaveCharges += 1;
      run.items.streakSave = run.streakSaveCharges;
    } else if (meta.pointExchangeMakes) {
      run.pointExchangeCharges += 1;
      run.items.pointexchanger = run.pointExchangeCharges;
    } else if (meta.moneyProtect) {
      run.moneyProtect = true;
      run.items.moneyprotecter = 1;
    } else if (meta.manualUse || meta.moveChancePer != null) {
      const cur = run.items[id] ?? 0;
      if (cur >= meta.stackCap) return { ok: false, reason: "已达叠加上限" };
      run.items[id] = cur + 1;
    }
  } else {
    const id = offer.id as RogueOrnamentId;
    const owned = run.ornaments.find((o) => o.id === id);
    const stacks = owned?.stacks ?? 0;
    if (stacks >= meta.stackCap) return { ok: false, reason: "已达叠加上限" };
    if (owned) owned.stacks += 1;
    else run.ornaments.push({ id, stacks: 1 });
    if (meta.glassSafe) run.glassSafe += 1;
    if (id === "blackhole") {
      run.blackholeCharges = ornamentStacks(run, "blackhole");
    }
  }

  run.gold -= offer.cost;
  offer.sold = true;
  run.peakGold = Math.max(run.peakGold, run.gold);
  return { ok: true };
}

export function settleStagePayout(run: RogueRun): void {
  run.goldBefore = run.gold;
  const breakdown = calcStageGold({
    stageScore: run.stageScore,
    target: run.target,
    peakStreak: run.peakStreak,
  });
  run.lastBreakdown = breakdown;
  run.lastGoldGain = breakdown.total;
  run.gold += breakdown.total;
  run.runScore += run.stageScore;
  run.stagesCleared += 1;
  run.peakGold = Math.max(run.peakGold, run.gold);
  run.peakStreakAll = Math.max(run.peakStreakAll, run.peakStreak);
  run.shop = [];
}

export function ownedRogueCount(run: RogueRun, id: string): number {
  const meta = catalogOf(id);
  if (!meta) return 0;
  if (meta.kind === "ornament") return ornamentStacks(run, id as RogueOrnamentId);
  if (meta.revive) return run.revives;
  if (meta.streakSave) return run.streakSaveCharges;
  if (meta.pointExchangeMakes) return run.pointExchangeCharges;
  if (meta.moneyProtect) return run.moneyProtect ? 1 : 0;
  if (meta.nextBonusSec) return run.items.warmup ?? 0;
  return run.items[id as RogueItemId] ?? 0;
}

/** Dev: grant one stack free (no gold). */
export function devGrantRogue(
  run: RogueRun,
  id: string,
): { ok: boolean; reason?: string } {
  const meta = catalogOf(id);
  if (!meta || meta.status !== "active") return { ok: false, reason: "未知物品" };

  if (meta.kind === "item") {
    const itemId = id as RogueItemId;
    if (meta.revive) {
      if (run.revives >= REVIVE_CAP) return { ok: false, reason: "重生已满" };
      run.revives += 1;
    } else if (meta.nextBonusSec) {
      if ((run.items.warmup ?? 0) >= meta.stackCap) return { ok: false, reason: "已达叠加上限" };
      run.items.warmup = (run.items.warmup ?? 0) + 1;
      run.nextBonusClock = Math.max(run.nextBonusClock, meta.nextBonusSec);
    } else if (meta.streakSave) {
      if (run.streakSaveCharges >= 3) return { ok: false, reason: "已达叠加上限" };
      run.streakSaveCharges += 1;
      run.items.streakSave = run.streakSaveCharges;
    } else if (meta.pointExchangeMakes) {
      if (run.pointExchangeCharges > 0 || run.pointExchangeLeft > 0) {
        return { ok: false, reason: "已持有" };
      }
      run.pointExchangeCharges += 1;
      run.items.pointexchanger = run.pointExchangeCharges;
    } else if (meta.moneyProtect) {
      if (run.moneyProtect) return { ok: false, reason: "已持有" };
      run.moneyProtect = true;
      run.items.moneyprotecter = 1;
    } else if (meta.manualUse || meta.moveChancePer != null) {
      const cur = run.items[itemId] ?? 0;
      if (cur >= meta.stackCap) return { ok: false, reason: "已达叠加上限" };
      run.items[itemId] = cur + 1;
    } else {
      return { ok: false, reason: "无法添加" };
    }
  } else {
    const ornId = id as RogueOrnamentId;
    const owned = run.ornaments.find((o) => o.id === ornId);
    const stacks = owned?.stacks ?? 0;
    if (stacks >= meta.stackCap) return { ok: false, reason: "已达叠加上限" };
    if (owned) owned.stacks += 1;
    else run.ornaments.push({ id: ornId, stacks: 1 });
    if (meta.glassSafe) run.glassSafe += 1;
    if (ornId === "blackhole") {
      run.blackholeCharges = ornamentStacks(run, "blackhole");
    }
  }
  return { ok: true };
}

export function clearRogueLoadout(run: RogueRun) {
  run.ornaments = [];
  run.items = {};
  run.revives = 0;
  run.streakSave = false;
  run.streakSaveCharges = 0;
  run.pendingStreakSave = false;
  run.pointExchangeLeft = 0;
  run.pointExchangeCharges = 0;
  run.moneyProtect = false;
  run.glassSafe = 0;
  run.blackholeCharges = 0;
  run.buffComboLeft = 0;
  run.buffPowerLeft = 0;
  run.buffBunshinLeft = 0;
  run.buffBunshinClones = 0;
  run.buffFlameLeft = 0;
  run.pendingFlameReuse = false;
  run.whatsThatAcc = 0;
  run.nextDecay = null;
  run.nextBonusClock = 0;
  run.rollGoldAcc = 0;
}

/** Dev: remove one stack. */
export function devRevokeRogue(
  run: RogueRun,
  id: string,
): { ok: boolean; reason?: string } {
  const meta = catalogOf(id);
  if (!meta) return { ok: false, reason: "未知物品" };
  if (ownedRogueCount(run, id) <= 0) return { ok: false, reason: "未持有" };

  if (meta.kind === "item") {
    const itemId = id as RogueItemId;
    if (meta.revive) {
      run.revives = Math.max(0, run.revives - 1);
    } else if (meta.nextBonusSec) {
      run.items.warmup = Math.max(0, (run.items.warmup ?? 0) - 1);
      if ((run.items.warmup ?? 0) <= 0) run.nextBonusClock = 0;
    } else if (meta.streakSave) {
      run.streakSaveCharges = Math.max(0, run.streakSaveCharges - 1);
      run.items.streakSave = run.streakSaveCharges;
    } else if (meta.pointExchangeMakes) {
      run.pointExchangeCharges = Math.max(0, run.pointExchangeCharges - 1);
      run.items.pointexchanger = run.pointExchangeCharges;
    } else if (meta.moneyProtect) {
      run.moneyProtect = false;
      run.items.moneyprotecter = 0;
    } else if (meta.manualUse || meta.moveChancePer != null) {
      run.items[itemId] = Math.max(0, (run.items[itemId] ?? 0) - 1);
    } else {
      return { ok: false, reason: "无法移除" };
    }
  } else {
    const ornId = id as RogueOrnamentId;
    const owned = run.ornaments.find((o) => o.id === ornId);
    if (!owned) return { ok: false, reason: "未持有" };
    owned.stacks -= 1;
    if (owned.stacks <= 0) {
      run.ornaments = run.ornaments.filter((o) => o.id !== ornId);
    }
    if (meta.glassSafe) run.glassSafe = Math.max(0, run.glassSafe - 1);
    if (ornId === "blackhole") {
      run.blackholeCharges = ornamentStacks(run, "blackhole");
    }
  }
  return { ok: true };
}

export function openRogueShop(run: RogueRun, ballId?: string): void {
  run.shop = rollShopStock(run, { ballId });
}

/** Dev hub: no random stock — UI lists the full catalog. */
export function openDevRogueShop(run: RogueRun): void {
  run.shop = [];
}

export function advanceRogueStage(run: RogueRun): void {
  run.stage += 1;
  run.target = stageTarget(run.stage);
  run.stageScore = 0;
  run.peakStreak = 0;
  run.specialMakes = 0;
  run.lastGoldGain = 0;
  run.lastBreakdown = null;
  run.goldBefore = run.gold;
  run.shop = [];
  run.rollGoldAcc = 0;
  run.blackholeCharges = ornamentStacks(run, "blackhole");
  run.pendingStreakSave = false;
  run.buffComboLeft = 0;
  run.buffPowerLeft = 0;
  run.buffBunshinLeft = 0;
  run.buffBunshinClones = 0;
  run.buffFlameLeft = 0;
  run.pendingFlameReuse = false;
  run.whatsThatAcc = 0;
  run.modifier = rollStageModifier(run.stage);
}

export function toRogueHud(run: RogueRun | null): RogueHud | null {
  if (!run) return null;
  return {
    stage: run.stage,
    target: run.target,
    stageScore: run.stageScore,
    runScore: run.runScore,
    gold: run.gold,
    goldBefore: run.goldBefore,
    revives: run.revives,
    ornaments: run.ornaments.map((o) => ({ ...o })),
    items: { ...run.items },
    lastGoldGain: run.lastGoldGain,
    lastBreakdown: run.lastBreakdown ? { ...run.lastBreakdown } : null,
    shop: run.shop.map((o) => ({ ...o })),
    infinite: run.endless || run.stage > ROGUE_CAMPAIGN_STAGES,
    endless: run.endless,
    peakStreak: run.peakStreak,
    specialMakes: run.specialMakes,
    forceSwish: false,
    streakSave: run.streakSave,
    streakSaveCharges: run.streakSaveCharges,
    pendingStreakSave: run.pendingStreakSave,
    stagesCleared: run.stagesCleared,
    peakGold: run.peakGold,
    peakStreakAll: run.peakStreakAll,
    peakMake: run.peakMake,
    pointExchangeLeft: run.pointExchangeLeft,
    pointExchangeCharges: run.pointExchangeCharges,
    moneyProtect: run.moneyProtect,
    blackholeCharges: run.blackholeCharges,
    buffComboLeft: run.buffComboLeft,
    buffPowerLeft: run.buffPowerLeft,
    buffBunshinLeft: run.buffBunshinLeft,
    buffBunshinClones: run.buffBunshinClones,
    buffFlameLeft: run.buffFlameLeft,
    pendingFlameReuse: run.pendingFlameReuse,
    fuseBall: run.fuseBall,
    fusePicked: run.fusePicked,
    modifier: run.modifier,
  };
}

export function ornamentLabel(id: RogueOrnamentId, stacks: number): string {
  const name = catalogOf(id)?.name ?? id;
  return stacks > 1 ? `${name} ×${stacks}` : name;
}

export function itemLabel(id: RogueItemId): string {
  return catalogOf(id)?.name ?? id;
}

export { REVIVE_CAP, STAGE_SCORE, ROGUE_CATALOG_BY_ID, activeCatalog };
