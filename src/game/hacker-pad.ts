/** On-court D-pad for the hacker ball. */

export type HackerDir = "u" | "d" | "l" | "r";

export type HackerPadBtn = { x: number; y: number; w: number; h: number };

export type HackerPadLayout = {
  size: number;
  cx: number;
  cy: number;
  buttons: Record<HackerDir, HackerPadBtn>;
};

export function hackerPadLayout(world: {
  w: number;
  h: number;
  floorY: number;
}): HackerPadLayout {
  const size = Math.max(46, Math.min(64, world.w * 0.135));
  const gap = Math.max(10, size * 0.24);
  const cx = world.w * 0.5;
  const floorH = Math.max(size * 3.2, world.h - world.floorY);
  const cy = world.floorY + floorH * 0.52;
  const half = size * 0.5;
  return {
    size,
    cx,
    cy,
    buttons: {
      u: { x: cx - half, y: cy - size * 1.5 - gap, w: size, h: size },
      d: { x: cx - half, y: cy + half + gap, w: size, h: size },
      l: { x: cx - size * 1.5 - gap, y: cy - half, w: size, h: size },
      r: { x: cx + half + gap, y: cy - half, w: size, h: size },
    },
  };
}

export function hitHackerPad(
  x: number,
  y: number,
  layout: HackerPadLayout,
): HackerDir | null {
  const order: HackerDir[] = ["u", "d", "l", "r"];
  for (const dir of order) {
    const b = layout.buttons[dir];
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return dir;
  }
  return null;
}

const ARROWS: Record<HackerDir, string> = {
  u: "▲",
  d: "▼",
  l: "◀",
  r: "▶",
};

export function drawHackerPad(
  ctx: CanvasRenderingContext2D,
  layout: HackerPadLayout,
  active: HackerDir | null,
) {
  ctx.save();
  for (const dir of ["u", "d", "l", "r"] as HackerDir[]) {
    const b = layout.buttons[dir];
    const on = active === dir;
    const r = Math.max(6, layout.size * 0.18);
    roundPad(ctx, b.x, b.y, b.w, b.h, r);
    ctx.fillStyle = on ? "rgba(180, 255, 210, 0.92)" : "rgba(20, 60, 35, 0.82)";
    ctx.fill();
    ctx.strokeStyle = on ? "rgba(255,255,255,0.9)" : "rgba(120, 255, 170, 0.65)";
    ctx.lineWidth = on ? 2.4 : 1.6;
    ctx.stroke();
    ctx.fillStyle = on ? "rgba(8, 40, 20, 0.95)" : "rgba(160, 255, 200, 0.9)";
    ctx.font = `700 ${Math.max(14, Math.floor(layout.size * 0.42))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ARROWS[dir], b.x + b.w * 0.5, b.y + b.h * 0.52);
  }
  ctx.restore();
}

function roundPad(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
