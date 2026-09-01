export type SceneId = "street";
export type GrafKey = "start" | "score500" | "ignite" | "blaze" | "combo50";

export type ScenePack = {
  id: SceneId;
  index: number;
  name: string;
  wall: { src: string; fallback: string };
  court: { src: string; fallback: string };
  skyArt: { src: string; fallback: string };
  clouds: string[];
  timer: { base: string; fill: string };
  graffiti: Record<GrafKey, { src: string; fallback: string }>;
  /** Fraction of the full wall texture height that is open sky (above the copestone). */
  sky: { top: number; bottom: number };
  hoop: {
    pad: string;
    padHi: string;
    padLo: string;
    net: string;
    netChar: string;
    netHem: string;
    netHemChar: string;
    netHemFromRow: number;
  };
  sfx: {
    rim: string[];
    net: string[];
    bounce: string[];
    board: string[];
    bgm: string;
    over: string;
    buzzer: string;
    combo: string;
    combo2: string;
  };
};

const STREET: ScenePack = {
  id: "street",
  index: 1,
  name: "街头",
  wall: {
    src: "/game/scenes/street/wall.webp?v=3",
    fallback: "/game/scenes/street/wall.jpg?v=3",
  },
  court: {
    src: "/game/scenes/street/court.webp?v=2",
    fallback: "/game/scenes/street/court.jpg?v=2",
  },
  skyArt: {
    src: "/game/scenes/street/sky.webp?v=2",
    fallback: "/game/scenes/street/sky.jpg?v=2",
  },
  clouds: [
    "/game/scenes/street/clouds/cloud-1.png",
    "/game/scenes/street/clouds/cloud-2.png",
    "/game/scenes/street/clouds/cloud-3.png",
    "/game/scenes/street/clouds/cloud-4.png",
    "/game/scenes/street/clouds/cloud-5.png",
    "/game/scenes/street/clouds/cloud-6.png",
    "/game/scenes/street/clouds/cloud-7.png",
    "/game/scenes/street/clouds/cloud-8.png",
  ],
  timer: {
    base: "/game/scenes/street/timer-base.png?v=1",
    fill: "/game/scenes/street/timer-fill.png?v=1",
  },
  graffiti: {
    start: {
      src: "/game/scenes/street/graffiti-start.webp",
      fallback: "/game/scenes/street/graffiti-start.png",
    },
    score500: {
      src: "/game/scenes/street/graffiti-score.webp",
      fallback: "/game/scenes/street/graffiti-score.png",
    },
    ignite: {
      src: "/game/scenes/street/graffiti-ignite.webp?v=2",
      fallback: "/game/scenes/street/graffiti-ignite.png?v=2",
    },
    blaze: {
      src: "/game/scenes/street/graffiti-blaze.webp",
      fallback: "/game/scenes/street/graffiti-blaze.png",
    },
    combo50: {
      src: "/game/scenes/street/graffiti-combo30.webp",
      fallback: "/game/scenes/street/graffiti-combo30.png",
    },
  },
  sky: { top: 0, bottom: 0 },
  hoop: {
    pad: "#1b4e32",
    padHi: "#2d6d48",
    padLo: "#123826",
    net: "#ffffff",
    netChar: "#1a1714",
    netHem: "#d42c28",
    netHemChar: "#2a1614",
    netHemFromRow: 3,
  },
  sfx: {
    rim: [
      "/game/scenes/street/sfx/rim-1.mp3",
      "/game/scenes/street/sfx/rim-2.mp3",
      "/game/scenes/street/sfx/rim-3.mp3",
      "/game/scenes/street/sfx/rim-4.mp3",
      "/game/scenes/street/sfx/rim-5.mp3",
    ],
    net: [
      "/game/scenes/street/sfx/net-1.mp3?v=2",
      "/game/scenes/street/sfx/net-2.mp3?v=2",
      "/game/scenes/street/sfx/net-3.mp3?v=2",
    ],
    bounce: [
      "/game/scenes/street/sfx/bounce-1.mp3",
      "/game/scenes/street/sfx/bounce-2.mp3",
      "/game/scenes/street/sfx/bounce-3.mp3",
      "/game/scenes/street/sfx/bounce-4.mp3",
    ],
    board: ["/game/scenes/street/sfx/board.mp3"],
    bgm: "/game/scenes/street/sfx/bgm.mp3",
    over: "/game/scenes/street/sfx/over.wav",
    buzzer: "/game/scenes/street/sfx/buzzer.mp3",
    combo: "/game/scenes/street/sfx/combo.mp3",
    combo2: "/game/scenes/street/sfx/combo-2.mp3",
  },
};

export const SCENES: ScenePack[] = [STREET];

const BY_ID: Record<SceneId, ScenePack> = { street: STREET };

let current: SceneId = "street";

export function getScene(): ScenePack {
  return BY_ID[current];
}

export function setScene(id: SceneId) {
  current = id;
}
