export type SceneId = "street" | "prison";
export type GrafKey = "start" | "score500" | "ignite" | "blaze" | "combo50";

export type ScenePack = {
  id: SceneId;
  index: number;
  name: string;
  /** When set, this scene always boots with that stage modifier. */
  defaultModifier?: "none" | "ghost-rings" | "grave-hands" | "yard-lights";
  wall: { src: string; fallback: string };
  court: { src: string; fallback: string };
  skyArt: { src: string; fallback: string };
  /** Optional full-frame corner props; drawn above sky/clouds when set. */
  towers?: { src: string; fallback: string };
  clouds: string[];
  timer: { base: string; fill: string };
  graffiti: Record<GrafKey, { src: string; fallback: string }>;
  /** Fraction of the full wall texture height that is open sky (above the copestone). */
  sky: { top: number; bottom: number };
  hoop: {
    pad: string;
    padHi: string;
    padLo: string;
    /** Rim tube / arm metal. */
    rim: string;
    rimHi: string;
    rimLo: string;
    rimBack: string;
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

const STREET_SFX: ScenePack["sfx"] = {
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
};

const STREET_GRAF: ScenePack["graffiti"] = {
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
  graffiti: STREET_GRAF,
  sky: { top: 0, bottom: 0 },
  hoop: {
    pad: "#1b4e32",
    padHi: "#2d6d48",
    padLo: "#123826",
    rim: "#e24a28",
    rimHi: "#f07a4a",
    rimLo: "#b83218",
    rimBack: "#c43820",
    net: "#ffffff",
    netChar: "#1a1714",
    netHem: "#d42c28",
    netHemChar: "#2a1614",
    netHemFromRow: 3,
  },
  sfx: STREET_SFX,
};

/** Same wall/court layout as street; sky/clouds reuse street pack. */
const PRISON: ScenePack = {
  id: "prison",
  index: 2,
  name: "监狱",
  defaultModifier: "yard-lights",
  wall: {
    src: "/game/scenes/prison/wall.png?v=6",
    fallback: "/game/scenes/prison/wall.png?v=6",
  },
  court: {
    src: "/game/scenes/prison/court.jpg?v=2",
    fallback: "/game/scenes/prison/court.jpg?v=2",
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
    base: "/game/scenes/prison/timer-yard-base.png?v=6",
    fill: "/game/scenes/prison/timer-yard-fill.png?v=6",
  },
  graffiti: STREET_GRAF,
  sky: { top: 0, bottom: 0 },
  hoop: {
    pad: "#2a3038",
    padHi: "#3d4652",
    padLo: "#1a1e24",
    rim: "#1a1a1a",
    rimHi: "#2e2e2e",
    rimLo: "#0a0a0a",
    rimBack: "#141414",
    net: "#ffffff",
    netChar: "#1a1714",
    netHem: "#0a0a0a",
    netHemChar: "#050505",
    netHemFromRow: 3,
  },
  sfx: STREET_SFX,
};

export const SCENES: ScenePack[] = [STREET, PRISON];

const BY_ID: Record<SceneId, ScenePack> = { street: STREET, prison: PRISON };

let current: SceneId = "street";

export function getScene(): ScenePack {
  return BY_ID[current];
}

export function getSceneId(): SceneId {
  return current;
}

export function setScene(id: SceneId) {
  if (!BY_ID[id]) return;
  current = id;
}

export const SCENE_LABELS: { id: SceneId; name: string }[] = SCENES.map((s) => ({
  id: s.id,
  name: s.name,
}));
