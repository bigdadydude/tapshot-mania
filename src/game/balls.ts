import type { DevPhys } from "./dev";

export type BallId = "plain" | "lava" | "glass" | "prison";

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
    skill: "枷锁攒条，解放爆发；断连回铐",
    heat: false,
    wrap: "ground",
    score: "normal",
    chain: true,
    phys: {
      jumpUp: 0.9,
      jumpFwd: 0.88,
      roll: 1.15,
      grav: 1.08,
    },
  },
];

export const DEFAULT_BALL: BallId = "plain";

export function parseBall(v: unknown): BallId {
  return v === "lava" || v === "plain" || v === "glass" || v === "prison" ? v : DEFAULT_BALL;
}

export function getBall(id: BallId): BallKit {
  return BALLS.find((b) => b.id === id) ?? BALLS[0]!;
}
