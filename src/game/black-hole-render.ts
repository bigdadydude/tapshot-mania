let backdrop: HTMLCanvasElement | null = null;

/** Twist the already-painted world around a plain black mouth. */
export function drawBlackHole(ctx: CanvasRenderingContext2D, hole: { x: number; y: number; r: number }, time: number) {
  const { x, y, r } = hole;
  const reach = r * 3;
  const transform = ctx.getTransform();
  const pixelScale = Math.hypot(transform.a, transform.b);
  const size = Math.ceil(reach * 2 * pixelScale);
  backdrop ??= document.createElement("canvas");
  if (backdrop.width !== size || backdrop.height !== size) {
    backdrop.width = size;
    backdrop.height = size;
  }
  const copy = backdrop.getContext("2d")!;
  copy.clearRect(0, 0, size, size);
  const screenX = transform.a * x + transform.c * y + transform.e;
  const screenY = transform.b * x + transform.d * y + transform.f;
  copy.drawImage(ctx.canvas, screenX - reach * pixelScale, screenY - reach * pixelScale,
    reach * 2 * pixelScale, reach * 2 * pixelScale, 0, 0, size, size);
  ctx.save();
  ctx.translate(x, y);
  // Sample the original frame in narrow bands. Distortion fades to zero outside.
  const rings = 48;
  for (let i = rings - 1; i >= 0; i--) {
    const inner = r + (reach - r) * i / rings;
    const outer = r + (reach - r) * (i + 1) / rings;
    const depth = 1 - (i + 0.5) / rings;
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, outer + 0.5 / Math.max(1, pixelScale), 0, Math.PI * 2);
    ctx.arc(0, 0, inner, 0, Math.PI * 2, true);
    ctx.clip("evenodd");
    // Bounded shear stays smooth even when a hole opens late in a long run.
    ctx.rotate((2.2 + 0.8 * Math.sin(time * 0.9 - depth * 1.5)) * depth * depth);
    const stretch = 1 + 0.28 * depth * depth;
    ctx.scale(stretch, stretch);
    ctx.drawImage(backdrop, -reach, -reach, reach * 2, reach * 2);
    ctx.restore();
  }
  const shade = ctx.createRadialGradient(0, 0, r * 0.96, 0, 0, r * 1.6);
  shade.addColorStop(0, "rgba(0,0,0,1)");
  shade.addColorStop(0.25, "rgba(0,0,0,0.45)");
  shade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = shade;
  ctx.beginPath(); ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#000";
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
