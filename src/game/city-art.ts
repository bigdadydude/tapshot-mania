/** Source-image delivery sizes; each complete image maps to its responsive world rectangle. */
export const CITY_ART_SPECS = {
  sky: { file: "sky.png", width: 1560, height: 2584 },
  buildings: { file: "buildings.png", width: 1560, height: 2584 },
  windows: { file: "windows.png", width: 1560, height: 2584 },
  road: { file: "road.png", width: 1560, height: 794 },
  bridge: { file: "bridge.png", width: 1560, height: 116 },
  pillar: { file: "pillar.png", width: 144, height: 1150 },
} as const;

/** Set a slot to its /game/scenes/city/... URL after adding the artwork. */
export const CITY_ART: Record<"sky" | "buildings" | "windows" | "road" | "bridge" | "pillar", string | null> = {
  sky: null,        // sky.png — 1560 × 2584
  buildings: null,  // buildings.png — 1560 × 2584, transparent sky
  windows: null,    // windows.png — 1560 × 2584, aligned transparent glass mask
  road: null,       // road.png — 1560 × 794
  bridge: null,     // bridge.png — 1560 × 116, top edge is wheel baseline
  pillar: null,     // pillar.png — 144 × 1150, transparent; reused twice
};

const images = new Map<string, HTMLImageElement>();
const glassMasks = new WeakMap<HTMLImageElement, HTMLCanvasElement>();

/** Glass RGB is irrelevant: alpha selects the windows; emit a restrained warm light. */
export function cityWindowLight(img: HTMLImageElement) {
  let mask = glassMasks.get(img);
  if (!mask) {
    mask = document.createElement("canvas");
    mask.width = img.naturalWidth; mask.height = img.naturalHeight;
    const c = mask.getContext("2d")!;
    c.drawImage(img, 0, 0);
    c.globalCompositeOperation = "source-in";
    c.fillStyle = "#daba7b";
    c.fillRect(0, 0, mask.width, mask.height);
    glassMasks.set(img, mask);
  }
  return mask;
}
export function cityImage(slot: keyof typeof CITY_ART) {
  const src = CITY_ART[slot];
  if (!src) return null;
  let img = images.get(src);
  if (!img) {
    img = new Image(); img.decoding = "async"; img.crossOrigin = "anonymous";
    img.src = src; images.set(src, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/** Darken only the texture pixels, leaving transparent holes untouched. */
export function drawCityTexture(ctx: CanvasRenderingContext2D, img: HTMLImageElement,
  x: number, y: number, w: number, h: number, night: number) {
  ctx.save();
  ctx.filter = `brightness(${1 - night * 0.52})`;
  ctx.drawImage(img, x, y, w, h);
  ctx.restore();
}
