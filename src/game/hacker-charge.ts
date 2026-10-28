/** Hacker-ball charge meter. Fair-weather makes fill it; a hold spends whole layers. */

export const HACKER_CHARGE_COLORS = ["#5CE1FF", "#00FF41", "#C77DFF"] as const;

export const HACKER_CHARGE = {
  layers: 3,
  makesPerLayer: 5,
  /**
   * Seconds to empty one full layer while held.
   * Not a locked spec value — only the 5-make layer size is locked.
   * Long enough that a release can land between layers.
   */
  layerDrainSeconds: 0.45,
  /** Rise speed in screen-heights per second. Scripted, so gravity cannot stall the fly. */
  flyLaunch: 2.2,
  /** Initial drop speed in screen-heights per second once a landing is chosen. */
  flyDrop: 0.85,
  /** Drain starts only after the press has lasted longer than this. Locked. */
  holdArmSeconds: 0.3,
  /** Arrow aim gives up and drops at the current X after this. Locked. */
  aimTimeoutSeconds: 3,
  /** Mid-layer release holds the ball still, then lets it fall. Locked. */
  failFreezeSeconds: 0.2,
  /** Court-widths per second. The 3s timeout stays locked. */
  arrowWidthsPerSecond: 1,
} as const;

export type ChargeEffect = "none" | "arrow" | "lock" | "rain";

export type HackerCharge = {
  /** Fair-weather makes stored, 0 … layers × makesPerLayer. */
  makes: number;
  holding: boolean;
  holdStart: number;
  drained: number;
};

export type HackerFlight =
  | { kind: "rise"; effect: "arrow" | "lock" }
  | { kind: "aim"; landX: number; dir: -1 | 1; age: number }
  | { kind: "fall"; effect: "arrow" | "lock" };

const SPEND_EPS = 1e-4;

export function chargeCap() {
  return HACKER_CHARGE.layers * HACKER_CHARGE.makesPerLayer;
}

export function createHackerCharge(): HackerCharge {
  return { makes: 0, holding: false, holdStart: 0, drained: 0 };
}

/** Snapshot form: never resume a finger-less hold after rewind. */
export function settledHackerCharge(s: HackerCharge): HackerCharge {
  if (!s.holding) return { makes: s.makes, holding: false, holdStart: 0, drained: 0 };
  return { makes: s.holdStart, holding: false, holdStart: 0, drained: 0 };
}

export function addHackerMake(s: HackerCharge) {
  if (s.holding || s.makes >= chargeCap()) return false;
  s.makes += 1;
  return true;
}

export function chargeDisplayMakes(s: HackerCharge) {
  if (!s.holding) return s.makes;
  return Math.max(0, s.holdStart - s.drained);
}

/** Fill ratio 0..1 for layer 1, layer 2, layer 3. */
export function chargeLayerRatios(makes: number): [number, number, number] {
  const per = HACKER_CHARGE.makesPerLayer;
  return [0, 1, 2].map((i) => {
    const raw = makes - i * per;
    return Math.max(0, Math.min(1, raw / per));
  }) as [number, number, number];
}

export function beginChargeHold(s: HackerCharge) {
  if (s.holding || s.makes <= 0) return false;
  s.holding = true;
  s.holdStart = s.makes;
  s.drained = 0;
  return true;
}

export function stepChargeHold(s: HackerCharge, dt: number) {
  if (!s.holding || dt <= 0) return;
  const rate = HACKER_CHARGE.makesPerLayer / HACKER_CHARGE.layerDrainSeconds;
  s.drained = Math.min(s.holdStart, s.drained + rate * dt);
}

/**
 * Only layers that were full at the press and fully emptied count.
 * The incomplete top layer, and any layer still in progress on release, are restored.
 * Fewer than 3 full layers cannot open the rain; holding to empty still yields at most lock.
 */
export function releaseChargeHold(s: HackerCharge): ChargeEffect {
  if (!s.holding) return "none";
  const per = HACKER_CHARGE.makesPerLayer;
  const start = s.holdStart;
  const drained = Math.min(start, s.drained);
  const fullLayers = Math.floor((start + SPEND_EPS) / per);
  const partial = start - fullLayers * per;
  const intoFull = Math.max(0, drained - partial);
  const wholeSpent = Math.min(fullLayers, Math.floor((intoFull + SPEND_EPS) / per));
  let effect: ChargeEffect = "none";
  if (wholeSpent >= 3 && fullLayers >= 3) effect = "rain";
  else if (wholeSpent >= 2) effect = "lock";
  else if (wholeSpent >= 1) effect = "arrow";
  const spentLayers = effect === "rain" ? 3 : effect === "lock" ? 2 : effect === "arrow" ? 1 : 0;
  s.makes = Math.max(0, start - spentLayers * per);
  s.holding = false;
  s.holdStart = 0;
  s.drained = 0;
  return effect;
}

export function chargeMeterLayout(world: { w: number }) {
  const w = Math.round(Math.max(112, Math.min(156, world.w * 0.3)));
  const h = 18;
  const x = 10;
  const y = 16;
  return { x, y, w, h };
}

/** True only after the press has lasted longer than 0.3s. */
export function chargeHoldArmed(elapsed: number) {
  return elapsed > HACKER_CHARGE.holdArmSeconds;
}

export function aimTimedOut(age: number) {
  return age >= HACKER_CHARGE.aimTimeoutSeconds;
}

/** Ping-pong the aim arrow. The player does not drag it. */
export function stepAimArrow(landX: number, dir: -1 | 1, dt: number, minX: number, maxX: number) {
  const span = Math.max(1, maxX - minX);
  let x = landX + dir * span * HACKER_CHARGE.arrowWidthsPerSecond * Math.max(0, dt);
  let next = dir;
  if (x >= maxX) { x = maxX; next = -1; }
  else if (x <= minX) { x = minX; next = 1; }
  return { landX: x, dir: next };
}

/** Display rect only. A press here must not start a spend. */
export function pointerOnChargeMeter(world: { w: number }, x: number, y: number) {
  const box = chargeMeterLayout(world);
  return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h + 18;
}

export function drawHackerCharge(
  ctx: CanvasRenderingContext2D,
  world: { w: number },
  s: HackerCharge,
  opts: { disabled: boolean; awake: boolean; aiming: boolean },
) {
  const box = chargeMeterLayout(world);
  const ratios = chargeLayerRatios(chargeDisplayMakes(s));
  ctx.save();
  ctx.globalAlpha = opts.disabled ? 0.5 : 1;
  ctx.fillStyle = "rgba(6, 12, 16, 0.88)";
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.w, box.h, 5);
  ctx.fill();
  ctx.stroke();
  const gap = 3;
  const pad = 3;
  const innerW = box.w - pad * 2;
  const segW = (innerW - gap * 2) / 3;
  const segH = box.h - pad * 2;
  const y0 = box.y + pad;
  for (let i = 0; i < 3; i++) {
    const x = box.x + pad + i * (segW + gap);
    const color = HACKER_CHARGE_COLORS[i]!;
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(x, y0, segW, segH);
    const fillW = segW * ratios[i]!;
    if (fillW > 0.4) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y0, fillW, segH);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.25;
    ctx.strokeRect(x + 0.5, y0 + 0.5, Math.max(0, segW - 1), Math.max(0, segH - 1));
    ctx.strokeStyle = "rgba(0,0,0,0.38)";
    ctx.lineWidth = 1;
    for (let t = 1; t < HACKER_CHARGE.makesPerLayer; t++) {
      const tx = x + (segW * t) / HACKER_CHARGE.makesPerLayer;
      ctx.beginPath();
      ctx.moveTo(tx, y0 + 1);
      ctx.lineTo(tx, y0 + segH - 1);
      ctx.stroke();
    }
  }
  ctx.font = "700 11px 'Noto Sans SC', sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(6, 12, 16, 0.9)";
  ctx.fillStyle = opts.awake ? HACKER_CHARGE_COLORS[1] : "#f4fbff";
  // Rain exit (phone ring / long-press) is not locked. This line is status, not a button.
  const label = opts.awake ? "矩阵 · 撤离未开放" : opts.aiming ? "点一下落下" : s.holding ? "松手结算" : "长按耗气";
  const labelY = box.y + box.h + 4;
  ctx.strokeText(label, box.x, labelY);
  ctx.fillText(label, box.x, labelY);
  ctx.restore();
}

/** Downward marker on the top edge. `x` is the landing column. */
export function drawLandingArrow(ctx: CanvasRenderingContext2D, x: number, y = 2) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = HACKER_CHARGE_COLORS[0];
  ctx.strokeStyle = "#062028";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 16);
  ctx.lineTo(-8, 5);
  ctx.lineTo(-3, 5);
  ctx.lineTo(-3, 0);
  ctx.lineTo(3, 0);
  ctx.lineTo(3, 5);
  ctx.lineTo(8, 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
