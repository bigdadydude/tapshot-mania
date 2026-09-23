/** Rogue shop catalog — source of truth imported from 饰品道具表.xlsx */

export type RogueRarity = "common" | "rare" | "epic" | "legendary";
export type RogueShopKind = "item" | "ornament";
export type RogueShotTag =
  | "swish"
  | "bank"
  | "toilet"
  | "lucky"
  | "needle"
  | "depth"
  | "clutch"
  | "streak";

export type RogueItemId =
  | "rematch"
  | "warmup"
  | "streakSave"
  | "pointexchanger"
  | "moneyprotecter"
  | "comboboost"
  | "ineedpower"
  | "Bunshin"
  | "flameON"
  | "tranquilizer";

export type RogueOrnamentId =
  | "swishPlus"
  | "streakPlus"
  | "softDecay"
  | "rimGrip"
  | "ballBounce"
  | "toiletcleaner"
  | "toiletcoin"
  | "HeroMoment"
  | "blackhole"
  | "slingshot"
  | "swishmoney"
  | "luckyshot"
  | "luckyshotmoney"
  | "bankshot"
  | "bankshotmoney"
  | "througNeedle"
  | "NeedleCoin"
  | "smallshoe"
  | "jumphigher"
  | "biggershoe"
  | "jumplower"
  | "easycombo"
  | "startearlier"
  | "jiahao"
  | "safepackage"
  | "deepbomb"
  | "deepbombcoin"
  | "chaosdrug"
  | "gravitywell"
  | "airglide"
  | "headwind"
  | "waxfloor"
  | "brakes"
  | "springfloor"
  | "softiron"
  | "sandpaper"
  | "WhatsThat"
  | "miniMe"
  | "funsize"
  | "alice";

export type RogueCatalogEntry = {
  id: RogueItemId | RogueOrnamentId;
  kind: RogueShopKind;
  name: string;
  desc: string;
  cost: number;
  rarity: RogueRarity;
  stackable: boolean;
  /** Max stacks; always >= 1. */
  stackCap: number;
  status: "active" | "draft" | "off";
  note?: string;
  /** Score added per stack when matching tags fire. */
  scoreOn?: Partial<Record<RogueShotTag, number>>;
  /** Gold added per stack when matching tags fire. */
  goldOn?: Partial<Record<RogueShotTag, number>>;
  /** Phys / systems. */
  softDecay?: boolean;
  rimFricPer?: number;
  ballBouncePer?: number;
  jumpFwdPer?: number;
  jumpUpPer?: number;
  airPer?: number;
  rollPer?: number;
  floorPer?: number;
  hoopPer?: number;
  boardFricPer?: number;
  comboWindowPer?: number;
  startStreak?: number;
  blackholeSec?: number;
  slingshotMult?: number;
  heroMoment?: boolean;
  glassSafe?: boolean;
  rollGoldEvery?: number;
  /** Item-only. */
  revive?: boolean;
  nextBonusSec?: number;
  streakSave?: boolean;
  pointExchangeMakes?: number;
  moneyProtect?: boolean;
  /** Pause / inventory activate. */
  manualUse?: boolean;
  comboBoostAdd?: number;
  comboBoostSec?: number;
  powerBoostAdd?: number;
  powerBoostSec?: number;
  bunshinSec?: number;
  bunshinClones?: number;
  flameSec?: number;
  moveChancePer?: number;
  /** Ornament systems (batch 2). */
  chaosBase?: boolean;
  gravPer?: number;
  dickCloudScore?: number;
  miniMe?: boolean;
  ballRScale?: number;
  hoopInnerPer?: number;
  /** Shop filter notes. */
  requirePlainBall?: boolean;
  requireGlassBall?: boolean;
};

const RARITY_CN: Record<string, RogueRarity> = {
  普通: "common",
  稀有: "rare",
  史诗: "epic",
  传说: "legendary",
};

export const RARITY_WEIGHT: Record<RogueRarity, number> = {
  common: 4,
  rare: 2.2,
  epic: 1,
  legendary: 0.4,
};

export const RARITY_LABEL: Record<RogueRarity, string> = {
  common: "普通",
  rare: "稀有",
  epic: "史诗",
  legendary: "传说",
};

const DEFAULT_STACK = 5;

function orn(
  partial: Omit<RogueCatalogEntry, "kind" | "status" | "stackCap"> & {
    stackCap?: number | "-";
    status?: RogueCatalogEntry["status"];
  },
): RogueCatalogEntry {
  const stackable = partial.stackable;
  const raw = partial.stackCap as number | "-" | "" | undefined;
  const stackCap =
    !stackable
      ? 1
      : raw == null || raw === "" || raw === "-"
        ? DEFAULT_STACK
        : Number(raw);
  return {
    ...partial,
    kind: "ornament",
    status: partial.status ?? "active",
    stackCap: Math.max(1, stackCap),
  };
}

function item(
  partial: Omit<RogueCatalogEntry, "kind" | "status" | "stackCap" | "stackable"> & {
    stackable?: boolean;
    stackCap?: number | "-" | "";
    status?: RogueCatalogEntry["status"];
  },
): RogueCatalogEntry {
  const stackable = partial.stackable ?? false;
  const raw = partial.stackCap as number | "-" | "" | undefined;
  const stackCap =
    !stackable
      ? 1
      : raw == null || raw === "" || raw === "-"
        ? DEFAULT_STACK
        : Number(raw);
  return {
    ...partial,
    kind: "item",
    stackable,
    status: partial.status ?? "active",
    stackCap: Math.max(1, stackCap),
  };
}

/** Full catalog from 饰品道具表.xlsx */
export const ROGUE_CATALOG: RogueCatalogEntry[] = [
  item({
    id: "rematch",
    name: "重赛",
    desc: "立刻获得 1 次重生（上限 2）",
    cost: 25,
    rarity: "rare",
    stackable: true,
    stackCap: 2,
    revive: true,
    note: "加到 revives",
  }),
  item({
    id: "warmup",
    name: "热身赛",
    desc: "下一关开局倒计时获得额外5秒",
    cost: 10,
    rarity: "common",
    stackable: false,
    nextBonusSec: 5,
  }),
  item({
    id: "streakSave",
    name: "连击保护",
    desc: "下次断连击时保住连击一次",
    cost: 25,
    rarity: "rare",
    stackable: false,
    streakSave: true,
  }),
  orn({
    id: "swishPlus",
    name: "空心暴击",
    desc: "空心球得分+1",
    cost: 10,
    rarity: "common",
    stackable: true,
    scoreOn: { swish: 1 },
  }),
  orn({
    id: "streakPlus",
    name: "连击暴击",
    desc: "连击得分+1",
    cost: 30,
    rarity: "rare",
    stackable: true,
    scoreOn: { streak: 1 },
  }),
  orn({
    id: "softDecay",
    name: "缓慢计时",
    desc: "整局时钟衰减略缓",
    cost: 45,
    rarity: "epic",
    stackable: true,
    softDecay: true,
  }),
  orn({
    id: "rimGrip",
    name: "粗糙篮筐",
    desc: "篮筐摩擦略增，更易打铁偏转",
    cost: 20,
    rarity: "common",
    stackable: true,
    rimFricPer: 0.06,
  }),
  orn({
    id: "ballBounce",
    name: "打气筒",
    desc: "篮球弹性略增",
    cost: 10,
    rarity: "common",
    stackable: true,
    ballBouncePer: 0.05,
  }),
  orn({
    id: "toiletcleaner",
    name: "马桶清洁",
    desc: "刷马桶进球得分+1",
    cost: 10,
    rarity: "common",
    stackable: true,
    scoreOn: { toilet: 1 },
  }),
  orn({
    id: "toiletcoin",
    name: "马桶币",
    desc: "刷马桶进球+1金币",
    cost: 10,
    rarity: "common",
    stackable: true,
    goldOn: { toilet: 1 },
  }),
  orn({
    id: "HeroMoment",
    name: "绝杀时刻",
    desc: "绝杀时刻可以操控篮球",
    cost: 50,
    rarity: "legendary",
    stackable: false,
    heroMoment: true,
  }),
  orn({
    id: "blackhole",
    name: "黑洞",
    desc: "开局获得一个持续4s的黑洞",
    cost: 50,
    rarity: "legendary",
    stackable: true,
    blackholeSec: 4,
  }),
  orn({
    id: "slingshot",
    name: "引力弹弓",
    desc: "黑洞存在时所有进球为三倍得分",
    cost: 55,
    rarity: "legendary",
    stackable: true,
    slingshotMult: 3,
  }),
  orn({
    id: "swishmoney",
    name: "空心货币",
    desc: "空心球获得金币+1",
    cost: 20,
    rarity: "rare",
    stackable: true,
    goldOn: { swish: 1 },
  }),
  orn({
    id: "luckyshot",
    name: "幸运暴击",
    desc: "幸运弹球得分+5",
    cost: 15,
    rarity: "rare",
    stackable: true,
    scoreOn: { lucky: 5 },
  }),
  orn({
    id: "luckyshotmoney",
    name: "幸运暴金币",
    desc: "幸运弹球获得金币+5",
    cost: 15,
    rarity: "rare",
    stackable: true,
    goldOn: { lucky: 5 },
  }),
  orn({
    id: "bankshot",
    name: "擦板暴击",
    desc: "擦板球得分+1",
    cost: 10,
    rarity: "common",
    stackable: true,
    scoreOn: { bank: 1 },
  }),
  orn({
    id: "bankshotmoney",
    name: "擦板暴金币",
    desc: "擦板球获得金币+1",
    cost: 15,
    rarity: "rare",
    stackable: true,
    goldOn: { bank: 1 },
  }),
  orn({
    id: "througNeedle",
    name: "穿针暴击",
    desc: "穿针引线得分+5",
    cost: 10,
    rarity: "common",
    stackable: true,
    scoreOn: { needle: 5 },
  }),
  orn({
    id: "NeedleCoin",
    name: "针穿金币",
    desc: "穿针引线获得金币+5",
    cost: 15,
    rarity: "rare",
    stackable: true,
    goldOn: { needle: 5 },
  }),
  orn({
    id: "smallshoe",
    name: "穿小鞋",
    desc: "篮球前进距离减少",
    cost: 25,
    rarity: "rare",
    stackable: true,
    jumpFwdPer: -0.08,
  }),
  orn({
    id: "jumphigher",
    name: "弹力鞋",
    desc: "篮球上升距离增加",
    cost: 25,
    rarity: "rare",
    stackable: true,
    jumpUpPer: 0.08,
  }),
  orn({
    id: "biggershoe",
    name: "大号球鞋",
    desc: "篮球前进距离增加",
    cost: 25,
    rarity: "rare",
    stackable: true,
    jumpFwdPer: 0.08,
  }),
  orn({
    id: "jumplower",
    name: "小跳",
    desc: "篮球上升距离减少",
    cost: 25,
    rarity: "rare",
    stackable: true,
    jumpUpPer: -0.08,
  }),
  orn({
    id: "easycombo",
    name: "简易连招",
    desc: "连击冷却时间+1s",
    cost: 40,
    rarity: "epic",
    stackable: true,
    comboWindowPer: 1,
  }),
  item({
    id: "pointexchanger",
    name: "汇率转换",
    desc: "使用该道具后的5次进球得分数转换为金币",
    cost: 40,
    rarity: "epic",
    stackable: false,
    pointExchangeMakes: 5,
  }),
  item({
    id: "moneyprotecter",
    name: "金币护身符",
    desc: "没达到关卡目标分数时，将剩余金币转化为得分",
    cost: 40,
    rarity: "epic",
    stackable: false,
    moneyProtect: true,
    note: "转化后达目标则过关结算",
  }),
  orn({
    id: "startearlier",
    name: "提前启动",
    desc: "开局获得连击5",
    cost: 35,
    rarity: "epic",
    stackable: true,
    startStreak: 5,
    requirePlainBall: true,
    note: "球种有基础球才会出现",
  }),
  orn({
    id: "jiahao",
    name: "自在极意豪",
    desc: "接触地面0.5秒获得1金币",
    cost: 50,
    rarity: "legendary",
    stackable: true,
    rollGoldEvery: 0.5,
  }),
  orn({
    id: "safepackage",
    name: "安全包装",
    desc: "玻璃球下次落地时不扣基础分且游戏不结束",
    cost: 30,
    rarity: "epic",
    stackable: false,
    glassSafe: true,
    requireGlassBall: true,
    note: "球种有玻璃球才会出现",
  }),
  orn({
    id: "deepbomb",
    name: "深水暴击",
    desc: "深水炸弹得分+10",
    cost: 20,
    rarity: "common",
    stackable: true,
    scoreOn: { depth: 10 },
  }),
  orn({
    id: "deepbombcoin",
    name: "大水币",
    desc: "深水炸弹获得金币+10",
    cost: 30,
    rarity: "rare",
    stackable: true,
    goldOn: { depth: 10 },
  }),
  // —— 第二批：饰品道具表2.xlsx ——
  item({
    id: "comboboost",
    name: "连击兴奋剂",
    desc: "使用后每次连击数+3，持续5s",
    cost: 30,
    rarity: "rare",
    stackable: true,
    manualUse: true,
    comboBoostAdd: 3,
    comboBoostSec: 5,
    note: "手动打开",
  }),
  item({
    id: "ineedpower",
    name: "大力丸",
    desc: "使用后每次进球得分+20，持续4s",
    cost: 30,
    rarity: "rare",
    stackable: true,
    manualUse: true,
    powerBoostAdd: 20,
    powerBoostSec: 4,
    note: "手动打开",
  }),
  orn({
    id: "chaosdrug",
    name: "混乱药丸",
    desc: "每次进球的基础得分为[-10,15]的随机数（不影响连击分与其他加成）",
    cost: 30,
    rarity: "rare",
    stackable: false,
    chaosBase: true,
  }),
  orn({
    id: "gravitywell",
    name: "重力井",
    desc: "球的重力增加",
    cost: 20,
    rarity: "common",
    stackable: true,
    gravPer: 0.12,
  }),
  orn({
    id: "airglide",
    name: "顺风",
    desc: "空中阻力减小，弧线更飘",
    cost: 25,
    rarity: "rare",
    stackable: true,
    airPer: -0.08,
  }),
  orn({
    id: "headwind",
    name: "逆风",
    desc: "空中阻力增大，弧线更短",
    cost: 20,
    rarity: "common",
    stackable: true,
    airPer: 0.08,
  }),
  orn({
    id: "waxfloor",
    name: "打蜡",
    desc: "地面更滑，滚动更久",
    cost: 22,
    rarity: "rare",
    stackable: true,
    rollPer: -0.1,
  }),
  orn({
    id: "brakes",
    name: "刹车",
    desc: "贴地更快停住",
    cost: 18,
    rarity: "common",
    stackable: true,
    rollPer: 0.1,
  }),
  orn({
    id: "springfloor",
    name: "弹簧地",
    desc: "砸地回弹更高",
    cost: 22,
    rarity: "rare",
    stackable: true,
    floorPer: 0.08,
  }),
  orn({
    id: "softiron",
    name: "软筐",
    desc: "打铁、打板更弹",
    cost: 18,
    rarity: "common",
    stackable: true,
    hoopPer: 0.08,
  }),
  orn({
    id: "sandpaper",
    name: "砂纸板",
    desc: "擦板更吃横向速度",
    cost: 20,
    rarity: "common",
    stackable: true,
    boardFricPer: 0.08,
  }),
  orn({
    id: "WhatsThat",
    name: "迪克云",
    desc: "天空中出现迪克云时获得20分",
    cost: 55,
    rarity: "legendary",
    stackable: true,
    dickCloudScore: 20,
  }),
  item({
    id: "Bunshin",
    name: "分身术",
    desc: "使用后获得1个影子分身，持续10秒。可叠用增加分身数；分身加连击，进球固定1分。",
    cost: 40,
    rarity: "epic",
    stackable: true,
    manualUse: true,
    bunshinSec: 10,
    bunshinClones: 1,
    note: "手动打开；同时生效的使用次数=分身数量",
  }),
  orn({
    id: "miniMe",
    name: "小小我",
    desc: "获得一个迷你分身",
    cost: 55,
    rarity: "legendary",
    stackable: true,
    miniMe: true,
    note: "迷你分身可以增加连击数，所有得分是本体的一半（四舍五入）。迷你分身的空心球概率更高",
  }),
  item({
    id: "flameON",
    name: "热火饮料",
    desc: "使用后进入烈焰状态，持续10s",
    cost: 35,
    rarity: "epic",
    stackable: true,
    manualUse: true,
    flameSec: 10,
    note: "手动打开，当前道具用完如果剩余不等于0则弹窗询问是否使用下一个",
  }),
  orn({
    id: "funsize",
    name: "儿童装",
    desc: "篮球半径缩小为当前一半",
    cost: 40,
    rarity: "epic",
    stackable: false,
    ballRScale: 0.5,
    note: "叠在球种尺寸上：普通球≈弹力球大小；弹力球再缩一半。其他数值不变，空心更容易",
  }),
  orn({
    id: "alice",
    name: "梦游仙境",
    desc: "篮筐变大",
    cost: 50,
    rarity: "legendary",
    stackable: true,
    hoopInnerPer: 0.18,
    note: "篮筐变大，但是篮架其余部分尺寸不变",
  }),
  item({
    id: "tranquilizer",
    name: "镇静剂",
    desc: "动态篮架的出现概率-5%",
    cost: 40,
    rarity: "epic",
    stackable: true,
    moveChancePer: -0.05,
  }),
];

export const ROGUE_CATALOG_BY_ID: Record<string, RogueCatalogEntry> = Object.fromEntries(
  ROGUE_CATALOG.map((e) => [e.id, e]),
);

export function activeCatalog(kind?: RogueShopKind): RogueCatalogEntry[] {
  return ROGUE_CATALOG.filter(
    (e) => e.status === "active" && (kind == null || e.kind === kind),
  );
}

export function parseRarityCn(s: string): RogueRarity {
  return RARITY_CN[s] ?? "common";
}
