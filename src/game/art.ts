import { getScene, type GrafKey } from "./scenes";
import { BALLS, type BallId } from "./balls";

type ArtKey = "court" | "wall" | "sky" | "timerBase" | "timerFill";

type ArtSlot = {
  img: HTMLImageElement | null;
  ok: boolean;
  settled: boolean;
};

function sceneSrc(): Record<ArtKey, { src: string; fallback: string }> {
  const scene = getScene();
  return {
    court: scene.court,
    wall: scene.wall,
    sky: scene.skyArt,
    timerBase: { src: scene.timer.base, fallback: scene.timer.base },
    timerFill: { src: scene.timer.fill, fallback: scene.timer.fill },
  };
}

const slots: Record<ArtKey, ArtSlot> = {
  court: { img: null, ok: false, settled: false },
  wall: { img: null, ok: false, settled: false },
  sky: { img: null, ok: false, settled: false },
  timerBase: { img: null, ok: false, settled: false },
  timerFill: { img: null, ok: false, settled: false },
};

function markReady(key: ArtKey, img: HTMLImageElement) {
  slots[key].ok = img.naturalWidth > 0;
  slots[key].settled = true;
}

function loadArt(key: ArtKey, src: string, fallback?: string) {
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    markReady(key, img);
    void img.decode?.().then(() => markReady(key, img)).catch(() => {});
  };
  img.onerror = () => {
    if (fallback && fallback !== src) {
      loadArt(key, fallback);
      return;
    }
    slots[key].ok = false;
    slots[key].settled = true;
  };
  img.src = src;
  slots[key].img = img;
  if (img.complete && img.naturalWidth > 0) markReady(key, img);
}

export function primeArt() {
  if (typeof Image === "undefined") return;
  if (!primedAt && typeof performance !== "undefined") primedAt = performance.now();
  const SRC = sceneSrc();
  primeBalls();
  (Object.keys(SRC) as ArtKey[]).forEach((key) => {
    const slot = slots[key];
    if (slot.img) {
      if (slot.img.complete && slot.img.naturalWidth > 0) markReady(key, slot.img);
      return;
    }
    loadArt(key, SRC[key].src, SRC[key].fallback);
  });
  primeClouds();
  primeGraffiti();
}

export function artImage(key: ArtKey): HTMLImageElement | null {
  const slot = slots[key];
  if (slot.ok && slot.img && slot.img.naturalWidth > 0) return slot.img;
  if (slot.img && slot.img.complete && slot.img.naturalWidth > 0) {
    slot.ok = true;
    return slot.img;
  }
  return null;
}

const BOOT_KEYS: ArtKey[] = ["wall", "sky", "court", "timerBase", "timerFill"];

const ballSlots = Object.fromEntries(
  BALLS.map((kit) => [kit.id, { img: null, ok: false, settled: !kit.src }]),
) as Record<BallId, ArtSlot>;

function loadBall(id: BallId, src: string, fallback?: string) {
  const img = new Image();
  img.decoding = "async";
  const slot = ballSlots[id];
  img.onload = () => {
    slot.ok = img.naturalWidth > 0;
    slot.settled = true;
  };
  img.onerror = () => {
    if (fallback && fallback !== src) {
      loadBall(id, fallback);
      return;
    }
    slot.ok = false;
    slot.settled = true;
  };
  img.src = src;
  slot.img = img;
  if (img.complete && img.naturalWidth > 0) {
    slot.ok = true;
    slot.settled = true;
  }
}

function primeBalls() {
  for (const kit of BALLS) {
    if (!kit.src) {
      ballSlots[kit.id].settled = true;
      continue;
    }
    if (ballSlots[kit.id].img) continue;
    loadBall(kit.id, kit.src, kit.fallback);
  }
}

export function ballImage(id: BallId): HTMLImageElement | null {
  const slot = ballSlots[id];
  if (slot.ok && slot.img && slot.img.naturalWidth > 0) return slot.img;
  if (slot.img && slot.img.complete && slot.img.naturalWidth > 0) {
    slot.ok = true;
    return slot.img;
  }
  return null;
}

/** Don't hold the title menu for balls / graffiti / clouds. */
const BOOT_CAP_MS = 200;
let primedAt = 0;

export function artProgress() {
  const extras = cloudSlots.length + GRAF_KEYS.length + BALLS.length;
  const total = BOOT_KEYS.length + extras;
  let done = 0;
  for (const key of BOOT_KEYS) if (slots[key].settled) done += 1;
  for (const slot of cloudSlots) if (slot.settled) done += 1;
  for (const key of GRAF_KEYS) if (grafSlots[key].settled) done += 1;
  for (const kit of BALLS) if (ballSlots[kit.id].settled) done += 1;
  const sceneReady = BOOT_KEYS.every((key) => slots[key].settled);
  const elapsed =
    primedAt > 0 && typeof performance !== "undefined" ? performance.now() - primedAt : 0;
  const ready = total > 0 && (sceneReady || elapsed >= BOOT_CAP_MS);
  const pct = ready ? 1 : total <= 0 ? 1 : done / total;
  return { done, total, pct, ready };
}

export function artReady() {
  return artProgress().ready;
}

const cloudSlots: ArtSlot[] = [];

function primeClouds() {
  const list = getScene().clouds;
  list.forEach((src, i) => {
    if (cloudSlots[i]?.img) return;
    const img = new Image();
    img.decoding = "async";
    const slot: ArtSlot = { img, ok: false, settled: false };
    img.onload = () => {
      slot.ok = img.naturalWidth > 0;
      slot.settled = true;
    };
    img.onerror = () => {
      slot.ok = false;
      slot.settled = true;
    };
    img.src = src;
    if (img.complete && img.naturalWidth > 0) {
      slot.ok = true;
      slot.settled = true;
    }
    cloudSlots[i] = slot;
  });
}

export function cloudImages(): HTMLImageElement[] {
  const out: HTMLImageElement[] = [];
  for (const slot of cloudSlots) {
    if (slot.ok && slot.img && slot.img.naturalWidth > 0) out.push(slot.img);
    else if (slot.img && slot.img.complete && slot.img.naturalWidth > 0) {
      slot.ok = true;
      out.push(slot.img);
    }
  }
  return out;
}

const GRAF_KEYS: GrafKey[] = ["start", "score500", "ignite", "blaze", "combo50"];
const grafSlots: Record<GrafKey, ArtSlot> = {
  start: { img: null, ok: false, settled: false },
  score500: { img: null, ok: false, settled: false },
  ignite: { img: null, ok: false, settled: false },
  blaze: { img: null, ok: false, settled: false },
  combo50: { img: null, ok: false, settled: false },
};

function loadGraf(key: GrafKey, src: string, fallback?: string) {
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    grafSlots[key].ok = img.naturalWidth > 0;
    grafSlots[key].settled = true;
  };
  img.onerror = () => {
    if (fallback && fallback !== src) {
      loadGraf(key, fallback);
      return;
    }
    grafSlots[key].ok = false;
    grafSlots[key].settled = true;
  };
  img.src = src;
  grafSlots[key].img = img;
  if (img.complete && img.naturalWidth > 0) {
    grafSlots[key].ok = true;
    grafSlots[key].settled = true;
  }
}

function primeGraffiti() {
  const pack = getScene().graffiti;
  for (const key of GRAF_KEYS) {
    if (grafSlots[key].img) continue;
    loadGraf(key, pack[key].src, pack[key].fallback);
  }
}

export function graffitiImage(key: GrafKey): HTMLImageElement | null {
  const slot = grafSlots[key];
  if (slot.ok && slot.img && slot.img.naturalWidth > 0) return slot.img;
  if (slot.img && slot.img.complete && slot.img.naturalWidth > 0) {
    slot.ok = true;
    return slot.img;
  }
  return null;
}

if (typeof window !== "undefined") primeArt();
