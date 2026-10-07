import type { World } from "./types";
import { nightAmount } from "./daylight";

function mix(a: number[], b: number[], p: number) {
  return `rgb(${a.map((v, i) => Math.round(v + (b[i]! - v) * p)).join(",")})`;
}
function noise(n: number) { const v = Math.sin(n * 127.1 + 31.7) * 43758.5453; return v - Math.floor(v); }

/** Quiet, layered skyline; all road depth edges share one vanishing point. */
export function drawCity(ctx: CanvasRenderingContext2D, world: World, time: number) {
  const { w, h, floorY } = world, u = w / 390, night = nightAmount(time);
  ctx.save();
  const sky = ctx.createLinearGradient(0, 0, 0, floorY);
  sky.addColorStop(0, mix([117, 163, 184], [19, 30, 48], night));
  sky.addColorStop(1, mix([219, 215, 193], [58, 66, 78], night));
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = `rgba(210,218,221,${night * 0.35})`;
  for (let i = 0; i < 24; i++) ctx.fillRect(noise(i) * w, noise(i + 50) * floorY * 0.25, u, u);

  for (let layer = 0; layer < 3; layer++) {
    const count = layer === 0 ? 12 : 7;
    for (let i = -1; i < count; i++) {
      const seed = (i + 2) * 13 + layer * 91;
      const bw = w / count * (0.85 + noise(seed) * 0.4);
      const x = i * w / count + (layer % 2) * w / count * 0.32;
      const bh = floorY * (0.29 + noise(seed + 1) * 0.36 + (layer === 2 ? 0.08 : 0));
      const bottom = floorY - (2 - layer) * 22 * u, y = bottom - bh;
      const tint = noise(seed + 2) * 14;
      ctx.fillStyle = mix([153 - layer * 18 + tint, 170 - layer * 18 + tint, 172 - layer * 16 + tint],
        [42 - layer * 5 + tint * 0.4, 54 - layer * 5 + tint * 0.4, 67 - layer * 4 + tint * 0.4], night);
      ctx.fillRect(x, y, bw, bh);
      // Side plane, restrained roof caps, mechanical penthouses.
      ctx.fillStyle = `rgba(13,27,39,${0.13 + layer * 0.03})`;
      ctx.fillRect(x + bw * 0.8, y, bw * 0.2, bh);
      ctx.fillRect(x + bw * 0.2, y - 6 * u, bw * 0.48, 6 * u);
      ctx.fillStyle = "rgba(220,230,227,0.14)";
      ctx.fillRect(x, y, bw, 2 * u);
      const cols = Math.max(3, Math.floor(bw / (10 * u))), rows = Math.floor(bh / (15 * u));
      for (let row = 0; row < rows; row++) for (let col = 0; col < cols - 1; col++) {
        const wx = x + (col + 0.6) * bw * 0.8 / cols, wy = y + 9 * u + row * 15 * u;
        const ww = bw * 0.8 / cols * 0.48, wh = 6 * u;
        ctx.fillStyle = mix([112 - layer * 9, 139 - layer * 10, 146 - layer * 8], [22, 36, 49], night);
        ctx.fillRect(wx, wy, ww, wh);
        const occupancy = noise(seed * 97 + row * 17 + col * 3);
        if (occupancy > 0.44) {
          const fade = Math.max(0, Math.min(1, (night - occupancy * 0.42) / 0.55));
          ctx.fillStyle = `rgba(218,186,123,${fade * (0.24 + occupancy * 0.2)})`;
          ctx.fillRect(wx, wy, ww, wh);
        }
      }
      if (layer === 2) {
        ctx.fillStyle = mix([91, 109, 113], [24, 35, 43], night);
        ctx.fillRect(x + 4 * u, bottom - 27 * u, bw - 8 * u, 24 * u);
        ctx.fillStyle = "rgba(170,190,194,0.15)";
        ctx.fillRect(x + 5 * u, bottom - 29 * u, bw - 10 * u, 2 * u);
      }
    }
  }
  const depth = h - floorY, vpX = w * 0.5, vpY = floorY * 0.55;
  ctx.fillStyle = mix([94, 104, 108], [36, 44, 54], night);
  ctx.fillRect(0, floorY, w, depth);
  const road = ctx.createLinearGradient(0, floorY, 0, h);
  road.addColorStop(0, "rgba(0,0,0,0.17)"); road.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = road; ctx.fillRect(0, floorY, w, depth);
  // Project short lane stripes from a single point; traffic runs horizontally.
  const projectX = (x: number, y: number) => vpX + (x - vpX) * (y - vpY) / (floorY - vpY);
  const stripeY = floorY + depth * 0.47;
  ctx.fillStyle = mix([196, 183, 140], [113, 110, 92], night);
  for (let x = -w; x < w * 2; x += 72 * u) {
    ctx.beginPath(); ctx.moveTo(projectX(x, stripeY), stripeY);
    ctx.lineTo(projectX(x + 35 * u, stripeY), stripeY);
    ctx.lineTo(projectX(x + 35 * u, stripeY + 3 * u), stripeY + 3 * u);
    ctx.lineTo(projectX(x, stripeY + 3 * u), stripeY + 3 * u); ctx.fill();
  }
  for (const y of [floorY + 3 * u, h - depth * 0.12]) {
    ctx.fillStyle = mix([159, 164, 159], [74, 83, 90], night);
    ctx.fillRect(0, y, w, 2 * u);
  }
  const sidewalkY = h - depth * 0.1;
  ctx.fillStyle = mix([135, 143, 143], [51, 61, 71], night);
  ctx.fillRect(0, sidewalkY, w, h - sidewalkY);
  ctx.strokeStyle = "rgba(20,31,41,0.2)"; ctx.lineWidth = u;
  for (let x = -w; x < w * 2; x += 45 * u) {
    ctx.beginPath(); ctx.moveTo(projectX(x, sidewalkY), sidewalkY); ctx.lineTo(projectX(x, h), h); ctx.stroke();
  }
  ctx.restore();
}
