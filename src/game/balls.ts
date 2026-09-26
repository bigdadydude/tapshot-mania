import type { DevPhys } from "./dev";

export type BallId =
  | "plain"
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
  | "quantum";

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
  /** Hacker ball: first clock empty awakens code-rain cruise. */
  codeRain?: boolean;
  /** Quantum ball: high-combo chance to phase through the basket rig. */
  quantum?: boolean;
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
    id: "bolt",
    name: "闪电球",
    skill: "首球后按滚速充电（每0.1秒最高8%）；空心+1%、擦板+8%；电量>90%打铁+1分并掉电1%；长按0.5秒连灌",
    heat: false,
    bolt: true,
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
    skill: "连击20起每10连击触发一次隧穿判定：10%起、最高50%；成功后6秒穿过篮架",
    heat: false,
    quantum: true,
    wrap: "ground",
    score: "normal",
  },
  {
    id: "vector",
    name: "矢量球",
    skill: "点击后沿45°斜上方飞行，最高点垂直下落；撞击后恢复普通物理",
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
  const id =
    v === "lava" ||
    v === "frost" ||
    v === "champ" ||
    v === "anti" ||
    v === "plain" ||
    v === "glass" ||
    v === "prison" ||
    v === "rubber" ||
    v === "ninja" ||
    v === "bolt" ||
    v === "rain" ||
    v === "vector" ||
    v === "maze" ||
    v === "quantum"
      ? v
      : DEFAULT_BALL;
  return isPlayableBall(id) ? id : DEFAULT_BALL;
}

export function getBall(id: BallId): BallKit {
  return BALLS.find((b) => b.id === id) ?? BALLS[0]!;
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
  maze: boolean;
  quantum: boolean;
  wrap: "ground" | "height";
  rScale: number;
  phys?: Partial<DevPhys>;
  src?: string;
  fallback?: string;
};

export function effectiveBall(primaryId: BallId, fuseId: BallId | null): EffectiveBall {
  const primary = getBall(primaryId);
  const fuse = fuseId && fuseId !== primaryId ? getBall(fuseId) : null;
  const heat = primary.heat || Boolean(fuse?.heat);
  const frost = Boolean(primary.frost) || Boolean(fuse?.frost);
  const champ = Boolean(primary.champ) || Boolean(fuse?.champ);
  const anti = Boolean(primary.anti) || Boolean(fuse?.anti);
  const bolt = Boolean(primary.bolt) || Boolean(fuse?.bolt);
  const chain = Boolean(primary.chain) || Boolean(fuse?.chain);
  const ninja = primaryId === "ninja" || fuseId === "ninja";
  const glass = primary.score === "glass" || fuse?.score === "glass";
  const codeRain = Boolean(primary.codeRain) || Boolean(fuse?.codeRain);
  const vector = Boolean(primary.vector) || Boolean(fuse?.vector);
  const maze = Boolean(primary.maze) || Boolean(fuse?.maze);
  const quantum = Boolean(primary.quantum) || Boolean(fuse?.quantum);
  const skill = fuse
    ? `${primary.skill} · 融${fuse.name}：${fuse.skill}`
    : primary.skill;
  const name = fuse ? `${primary.name}+${fuse.name}` : primary.name;
  return {
    id: primaryId,
    fuseId: fuse ? fuse.id : null,
    name,
    skill,
    heat,
    frost,
    champ,
    anti,
    bolt,
    chain,
    ninja,
    glass,
    codeRain,
    vector,
    maze,
    quantum,
    wrap: primary.wrap,
    rScale: (primary.rScale ?? 1) * (fuse?.rScale ?? 1),
    phys: primary.phys,
    src: primary.src,
    fallback: primary.fallback,
  };
}

/** Pause / settle loadout: `经典球 + 冰冻球` or just primary. */
export function ballFuseLabel(primaryId: BallId, fuseId: BallId | null): string {
  const primary = getBall(primaryId).name;
  if (!fuseId || fuseId === primaryId) return primary;
  return `${primary} + ${getBall(fuseId).name}`;
}
