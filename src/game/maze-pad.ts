/** On-court gravity joystick for the Maze Ball. */

export type MazePadLayout = { cx: number; cy: number; r: number; knobR: number };
export type MazeGravity = { x: number; y: number };

export function mazePadLayout(world: { w: number; h: number; floorY: number }): MazePadLayout {
  const r = Math.max(34, Math.min(52, world.w * 0.105));
  const floorH = Math.max(r * 2.5, world.h - world.floorY);
  return {
    cx: world.w * 0.5,
    cy: world.floorY + floorH * 0.53,
    r,
    knobR: r * 0.42,
  };
}

export function mazeGravityFromPoint(
  x: number,
  y: number,
  layout: MazePadLayout,
): MazeGravity | null {
  const dx = x - layout.cx;
  const dy = y - layout.cy;
  const dist = Math.hypot(dx, dy);
  const deadZone = layout.r * 0.18;
  if (dist <= deadZone) return { x: 0, y: 0 };
  const strength = Math.min(1, (dist - deadZone) / Math.max(1, layout.r - deadZone));
  return { x: (dx / dist) * strength, y: (dy / dist) * strength };
}


export function drawMazePad(
  ctx: CanvasRenderingContext2D,
  layout: MazePadLayout,
  gravity: MazeGravity,
) {
  const { cx, cy, r, knobR } = layout;
  const strength = Math.min(1, Math.hypot(gravity.x, gravity.y));
  const knobTravel = (r - knobR - 3) * strength;
  ctx.save();
  const base = ctx.createRadialGradient(cx - r * 0.28, cy - r * 0.34, r * 0.08, cx, cy, r);
  base.addColorStop(0, 'rgba(248,252,255,0.9)');
  base.addColorStop(0.4, 'rgba(116,129,143,0.9)');
  base.addColorStop(1, 'rgba(28,36,45,0.94)');
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(230,245,255,0.78)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(10,16,22,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  const kx = cx + gravity.x * knobTravel;
  const ky = cy + gravity.y * knobTravel;
  const knob = ctx.createRadialGradient(kx - knobR * 0.3, ky - knobR * 0.35, 1, kx, ky, knobR);
  knob.addColorStop(0, '#ffffff');
  knob.addColorStop(0.36, '#c9d1d8');
  knob.addColorStop(0.72, '#6c7781');
  knob.addColorStop(1, '#252d35');
  ctx.fillStyle = knob;
  ctx.beginPath();
  ctx.arc(kx, ky, knobR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.72)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();

}
