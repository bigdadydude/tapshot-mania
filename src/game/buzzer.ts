export const BUZZER_WINDOW = 5;
export const BUZZER_SPEED = 0.6;

type Body = { x: number; y: number; vx: number; vy: number; r: number };
type Target = { x: number; y: number; inner: number; boardTop: number; boardX: number; movingPad: number };

/** Admission only: reaching the rim/backboard area is a chance, not a promised make.
 * Once admitted, natural ricochets get the whole bounded window. */
export function hasBuzzerChance(input: {
  ball: Body;
  targets: Target[];
  shotPending: boolean;
  floorY: number;
  width: number;
  wrapPad: number | null;
  gravity: number;
  air: number;
  buoy: number;
  fallBoost: boolean;
  straight: boolean;
}) {
  if (!input.shotPending || !input.targets.length) return false;
  const b = { ...input.ball };
  if (b.y + b.r >= input.floorY - 2 && b.vy >= -90) return false;
  const dt = 1 / 120;
  for (let t = 0; t <= BUZZER_WINDOW * BUZZER_SPEED; t += dt) {
    for (const h of input.targets) {
      // Include bank shots, board tops and rim bounces; exclude balls already
      // falling below the basket. Slight mover padding avoids brittle cutoffs.
      const left = Math.min(h.x - h.inner, h.boardX) - b.r - h.movingPad;
      const right = Math.max(h.x + h.inner, h.boardX) + b.r + h.movingPad;
      const near = b.x >= left && b.x <= right &&
        b.y >= h.boardTop - b.r - h.movingPad && b.y <= h.y + b.r * 0.25;
      const approaching = b.vx * (h.x - b.x) + b.vy * (h.y - b.y) > 0;
      const aboveOpening = Math.abs(b.x - h.x) < h.inner + b.r && b.y < h.y;
      if (near && (approaching || aboveOpening)) return true;
    }
    if (!input.straight) {
      b.vy += input.gravity * dt * ((input.fallBoost && b.vy > 20 ? 1.28 : 1) - input.buoy);
      b.vx *= 1 - 0.035 * input.air * dt;
      b.vy *= 1 - 0.025 * input.air * dt;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.y + b.r >= input.floorY && b.vy >= 0) break;
    if (input.wrapPad !== null) {
      if (b.x < -input.wrapPad) b.x = input.width + input.wrapPad;
      else if (b.x > input.width + input.wrapPad) b.x = -input.wrapPad;
    }
  }
  return false;
}
