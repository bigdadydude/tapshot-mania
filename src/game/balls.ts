import type { DevPhys } from "./dev";

export type BallId =
  | "plain"
  | "super"
  | "rocket"
  | "lava"
  | "frost"
  | "champ"
  | "anti"
  | "glass"
  | "prison"
  | "rubber"
  | "ninja"
  | "bolt"
  | "rain"
  | "vector"
  | "maze"
  | "quantum"
  | "time";

export type BallKit = {
  id: BallId;
  name: string;
  skill: string;
  heat: boolean;
  /** Ice ball: freeze hoops at high combo, white-smoke FX. */
  frost?: boolean;
  /** Champion ball: bank leftover timer → champion moment. */
  champ?: boolean;
  /** Anti ball: collect antimatter → timed black hole. */
  anti?: boolean;
  /** Lightning ball: charge on roll/bank, long-press chain swish. */
  bolt?: boolean;
  /** Maze ball: a floor joystick redirects gravity. */
  maze?: boolean;
  /** Vector ball: 45° ascent followed by a vertical drop until an impact. */
  vector?: boolean;
  rocket?: boolean;
  super?: boolean;
  /** Hacker ball: first clock empty awakens code-rain cruise. */
  codeRain?: boolean;
  /** Quantum ball: high-combo chance to phase through the basket rig. */
  quantum?: boolean;
  /** Time ball: stores unused clock as rewind energy. */
  time?: boolean;
  src?: string;
  fallback?: string;
  wrap: "ground" | "height";
  score: "normal" | "glass";
  /** Drag chain with collision (length = ball diameter). */
  chain?: boolean;
  /** Radius vs world.ballR (classic). Diameter of rubber = classic radius → 0.5. */
  rScale?: number;
  phys?: Partial<DevPhys>;
  /** false = kept in data but hidden from pickers / remapped by parseBall. */
  playable?: boolean;
};

export const BALLS: BallKit[] = [
  {
    id: "super", name: "超能球", heat: false, super: true,
    skill: "进球得分充能，每20分一段，最多6段。滑动八向慢速冲刺五个球直径，抵达顶端停滞0.3秒再下落；连续冲刺消耗1/2/3段，停手0.2秒后进球返10能量。受击瞬间滑动抵消冲击、返1段并无敌3秒。点击能量条切换护盾：抵御车与子弹，每球基础加满段数×2；每次抵御或加分耗4能量，每秒耗0.5，护盾进球不充能",
    src: "/game/balls/plain.webp?v=5", fallback: "/game/balls/plain.png?v=5",
    wrap: "ground", score: "normal", phys: {jumpUp:0.95,jumpFwd:0.95},
  },
  {
    id: "plain",
    name: "经典球",
    skill: "别人都靠技能，而我…就很…",
    heat: false,
    src: "/game/balls/plain.webp?v=5",
    fallback: "/game/balls/plain.png?v=5",
    wrap: "ground",
    score: "normal",
    phys: {
      jumpUp: 0.95,
      jumpFwd: 0.95,
    },
  },
  {
    id: "rocket", name: "火箭球", heat: false, rocket: true,
    playable: false,
    skill: "按住底部红点起飞，左右拖动控制推力；松手复位下落。飞行消耗燃料，停留在地面或平台上恢复燃料",
    src: "/game/balls/plain.webp?v=5", fallback: "/game/balls/plain.png?v=5",
    wrap: "ground", score: "normal", rScale: 1,
    phys: { jumpUp: 0.95, jumpFwd: 0.95, ball: 0.35 },
  },
  {
    id: "bolt",
    name: "闪电球",
    skill: "首球后按滚速充电（每0.1秒最高8%）；空心+1%、擦板+8%；电量>90%打铁+1分并掉电1%；长按0.5秒连灌",
    heat: false,
    bolt: true,
    src: "/game/balls/lightning.png?v=1",
    fallback: "/game/balls/lightning.png?v=1",
    wrap: "ground",
    score: "normal",
    phys: {
      jumpUp: 0.95,
      jumpFwd: 0.95,
    },
  },
  {
    id: "ninja",
    name: "忍者球",
    skill: "连击10/26/47各获一个影分身；分身只加连击，不计分",
    heat: false,
    src: "/game/balls/ninja1.png?v=1",
    fallback: "/game/balls/ninja1.png?v=1",
    wrap: "ground",
    score: "normal",
    phys: {
      jumpUp: 1,
      jumpFwd: 1.2,
      grav: 0.9,
      hoop: 0.8,
      boardFric: 0.7,
    },
  },
  {
    id: "rubber",
    name: "弹力球",
    skill: "高弹小号球，穿边朝筐出现",
    heat: false,
    wrap: "height",
    score: "normal",
    rScale: 0.5,
    phys: {
      jumpUp: 1,
      jumpFwd: 0.8,
      grav: 1,
      ball: 2,
    },
  },
  {
    id: "maze",
    playable: false,
    name: "迷宫球",
    skill: "拖动地面摇杆改变重力方向；中立时停力，保留惯性",
    heat: false,
    maze: true,
    wrap: "ground",
    score: "normal",
    phys: {
      ball: 0.92,
      air: 0.86,
      roll: 0.72,
    },
  },
  {
    id: "quantum",
    name: "量子球",
    skill: "每次进球按当前连击数进行隧穿判定：1连=1%、100连及以上必定触发；成功后6秒穿过篮架",
    heat: false,
    quantum: true,
    src: "/game/balls/quantum0.png?v=1",
    fallback: "/game/balls/quantum0.png?v=1",
    wrap: "ground",
    score: "normal",
  },
  {
    id: "time",
    name: "时间球",
    skill: "进球按剩余倒计时比例充能；长按地面快退键倒放，最多回退5秒；绝杀时禁用",
    heat: false,
    time: true,
    src: "/game/balls/time.png?v=1",
    fallback: "/game/balls/time.png?v=1",
    wrap: "ground",
    score: "normal",
  },
  {
    id: "vector",
    name: "矢量球",
    skill: "首球后自动储能，上限1500；短按消耗250，按球与篮筐的位置调整方向；长按1秒全部爆发（至少40），消耗为释放的5倍，大招后10秒无法储能。超过1000指针摇晃，随游戏时间增加泄漏风险：3秒流失100–500能量，期间无法储能，能量转成随机回弹",
    heat: false,
    vector: true,
    wrap: "ground",
    score: "normal",
    phys: {
      jumpUp: 1,
      jumpFwd: 1,
    },
  },
  {
    id: "rain",
    name: "骇客球",
    skill: "倒计时首次耗尽先进入绝杀，随后觉醒：绿滤镜巡航，沿篮圈滑行；进球加速",
    heat: false,
    codeRain: true,
    wrap: "ground",
    score: "normal",
    phys: {
      jumpUp: 1,
      jumpFwd: 1,
      grav: 0.98,
      ball: 1.04,
      air: 0.96,
    },
  },
  {
    id: "lava",
    name: "燃烧球",
    skill: "什么味道？你闻到了吗？",
    heat: true,
    src: "/game/balls/lava.webp?v=5",
    fallback: "/game/balls/lava.png?v=5",
    wrap: "ground",
    score: "normal",
  },
  {
    id: "frost",
    name: "冰冻球",
    skill: "连击提高冻筐概率；首次冻4秒，续冻3秒，灌冻筐叠基础分",
    heat: false,
    frost: true,
    src: "/game/balls/frost.png?v=1",
    fallback: "/game/balls/frost.png?v=1",
    wrap: "ground",
    score: "normal",
  },
  {
    id: "champ",
    name: "冠军球",
    skill: "存剩余时间的两成，耗尽后开启双倍冠军时刻（不可用于1分钟）",
    heat: false,
    champ: true,
    wrap: "ground",
    score: "normal",
    phys: {
      jumpUp: 0.95,
      jumpFwd: 0.95,
      grav: 0.95,
      ball: 0.9,
      hoop: 0.9,
      rimFric: 1.1,
      boardFric: 1.1,
    },
  },
  {
    id: "anti",
    name: "反重力球",
    skill: "收集反物质开黑洞；洞时长20秒起，场上留存越久洞越短（不低于10秒）",
    heat: false,
    anti: true,
    wrap: "ground",
    score: "normal",
    phys: {
      jumpUp: 0.95,
      jumpFwd: 0.95,
      ball: 0.8,
    },
  },
  {
    id: "glass",
    name: "玻璃球",
    skill: "基础分从30起；打铁/打板按冲击扣0–2/0–1，落地按下落高度扣0–10，空心+4，上限50",
    heat: false,
    src: "/game/balls/glass.webp?v=5",
    fallback: "/game/balls/glass.png?v=5",
    wrap: "height",
    score: "glass",
    phys: {
      grav: 1.4,
      jumpUp: 0.9,
      jumpFwd: 0.8,
      ball: 0,
    },
  },
  {
    id: "prison",
    name: "监狱球",
    skill: "链拖铁球；释放如经典球（暂未开放）",
    heat: false,
    wrap: "ground",
    score: "normal",
    chain: true,
    playable: false,
    phys: {
      jumpUp: 0.95,
      jumpFwd: 0.95,
    },
  },
];

export const DEFAULT_BALL: BallId = "plain";

export function isPlayableBall(id: BallId): boolean {
  return getBall(id).playable !== false;
}

export function playableBalls(): BallKit[] {
  return BALLS.filter((b) => b.playable !== false);
}

export function parseBall(v: unknown): BallId {
  if(v === "inflatable") return DEFAULT_BALL;
  const id =
    v === "lava" ||
    v === "frost" ||
    v === "champ" ||
    v === "anti" ||
    v === "plain" ||
    v === "super" ||
    v === "rocket" ||
    v === "glass" ||
    v === "prison" ||
    v === "rubber" ||
    v === "ninja" ||
    v === "bolt" ||
    v === "rain" ||
    v === "vector" ||
    v === "maze" ||
    v === "quantum" ||
    v === "time"
      ? v
      : DEFAULT_BALL;
  return isPlayableBall(id) ? id : DEFAULT_BALL;
}

export function getBall(id: BallId): BallKit {
  return BALLS.find((b) => b.id === id) ?? BALLS.find((b) => b.id === DEFAULT_BALL)!;
}

/** Playable ball radius for a kit (classic world.ballR × rScale). */
export function ballRadius(worldBallR: number, id: BallId) {
  const scale = getBall(id).rScale ?? 1;
  return worldBallR * scale;
}

/**
 * Rogue fusion: look / wrap / phys stay on primary;
 * skill flags OR from fused secondary; rScale multiplies (e.g. 弹力球副球缩小).
 */
export type EffectiveBall = {
  id: BallId;
  fuseId: BallId | null;
  name: string;
  skill: string;
  heat: boolean;
  frost: boolean;
  champ: boolean;
  anti: boolean;
  bolt: boolean;
  chain: boolean;
  ninja: boolean;
  glass: boolean;
  codeRain: boolean;
  vector: boolean;
  rocket: boolean;
  super: boolean;
  maze: boolean;
  quantum: boolean;
  time: boolean;
  wrap: "ground" | "height";
  rScale: number;
  phys?: Partial<DevPhys>;
  src?: string;
  fallback?: string;
};

export function effectiveBall(primaryId: BallId, fuseId: BallId | BallId[] | null): EffectiveBall {
  const primary = getBall(primaryId);
  const ids = (Array.isArray(fuseId) ? fuseId : fuseId ? [fuseId] : []).filter((id) => id !== primaryId);
  const fuses = ids.map(getBall);
  const any = <K extends keyof BallKit>(key: K) => Boolean(primary[key]) || fuses.some((fuse) => Boolean(fuse[key]));
  const heat = any("heat");
  const frost = any("frost");
  const champ = any("champ");
  const anti = any("anti");
  const bolt = any("bolt");
  const chain = any("chain");
  const ninja = primaryId === "ninja" || ids.includes("ninja");
  const glass = primary.score === "glass" || fuses.some((fuse) => fuse.score === "glass");
  const codeRain = any("codeRain");
  const vector = any("vector");
  const rocket = any("rocket");
  const maze = any("maze");
  const quantum = any("quantum");
  const time = any("time");
  const skill = fuses.length ? `${primary.skill} · ${fuses.map((fuse) => `融${fuse.name}?${fuse.skill}`).join(" · ")}` : primary.skill;
  const name = fuses.length ? `${primary.name}+${fuses.map((fuse) => fuse.name).join("+")}` : primary.name;
  return {
    id: primaryId,
    fuseId: fuses[0]?.id ?? null,
    name, skill, heat, frost, champ, anti, bolt, chain, ninja, glass, codeRain, vector, rocket, maze, quantum, time, super:any("super"),
    wrap: primary.wrap,
    rScale: (primary.rScale ?? 1) * fuses.reduce((scale, fuse) => scale * (fuse.rScale ?? 1), 1),
    phys: primary.phys,
    src: primary.src,
    fallback: primary.fallback,
  };
}

export function ballFuseLabel(primaryId: BallId, fuseId: BallId | BallId[] | null): string {
  const primary = getBall(primaryId).name;
  const ids = (Array.isArray(fuseId) ? fuseId : fuseId ? [fuseId] : []).filter((id) => id !== primaryId);
  return ids.length ? `${primary} + ${ids.map((id) => getBall(id).name).join(" + ")}` : primary;
}

/** Pause / settle loadout: `经典球 + 冰冻球` or just primary. */
