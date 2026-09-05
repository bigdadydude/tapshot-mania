import type { DevPhys } from "./dev";

export type BallId = "plain" | "lava" | "glass" | "prison" | "rubber" | "ninja";

export type BallKit = {
  id: BallId;
  name: string;
  skill: string;
  heat: boolean;
  src?: string;
  fallback?: string;
  wrap: "ground" | "height";
  score: "normal" | "glass";
  /** Drag chain with collision (length = ball diameter). */
  chain?: boolean;
  /** Radius vs world.ballR (classic). Diameter of rubber = classic radius → 0.5. */
  rScale?: number;
  phys?: Partial<DevPhys>;
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
    id: "ninja",
    name: "忍者球",
    skill: "连击召唤轨迹分身，分身也计连击",
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
    id: "glass",
    name: "玻璃球",
    skill: "易碎品，别落地！",
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
    skill: "链拖铁球；释放如经典球",
    heat: false,
    wrap: "ground",
    score: "normal",
    chain: true,
    phys: {
      jumpUp: 0.95,
      jumpFwd: 0.95,
    },
  },
];

export const DEFAULT_BALL: BallId = "plain";

export function parseBall(v: unknown): BallId {
  return v === "lava" ||
    v === "plain" ||
    v === "glass" ||
    v === "prison" ||
    v === "rubber" ||
    v === "ninja"
    ? v
    : DEFAULT_BALL;
}

export function getBall(id: BallId): BallKit {
  return BALLS.find((b) => b.id === id) ?? BALLS[0]!;
}

/** Playable ball radius for a kit (classic world.ballR × rScale). */
export function ballRadius(worldBallR: number, id: BallId) {
  const scale = getBall(id).rScale ?? 1;
  return worldBallR * scale;
}
