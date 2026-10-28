/** Hacker-ball charge meter. Fair-weather makes fill it; a hold spends whole layers. */

export const HACKER_CHARGE_COLORS = ["#5CE1FF", "#00FF41", "#C77DFF"] as const;

export const HACKER_CHARGE = {
  layers: 3,
  makesPerLayer: 5,
  idleGraceSeconds: 3,
  idleLayersPerSecond: 0.2,
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
  idleSeconds: number;
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
  return { makes: 0, holding: false, holdStart: 0, drained: 0, idleSeconds: 0 };
}

/** Snapshot form: never resume a finger-less hold after rewind. */
export function settledHackerCharge(s: HackerCharge): HackerCharge {
  return { makes: s.makes, holding: false, holdStart: 0, drained: 0, idleSeconds: s.idleSeconds };
}

export function addHackerMake(s: HackerCharge, earnsCharge = true) {
  s.idleSeconds = 0;
  if (!earnsCharge || s.holding || s.makes >= chargeCap()) return false;
  s.makes = Math.min(chargeCap(), s.makes + 1);
  return true;
}

/** Game time only: a make renews the grace period, inputs never do. */
export function stepChargeDecay(s: HackerCharge, dt: number) {
  if (dt <= 0) return;
  const grace = HACKER_CHARGE.idleGraceSeconds;
  const before = Math.max(0, s.idleSeconds - grace);
  s.idleSeconds += dt;
  const active = Math.max(0, s.idleSeconds - grace) - before;
  const loss = active * HACKER_CHARGE.makesPerLayer * HACKER_CHARGE.idleLayersPerSecond;
  s.makes = Math.max(0, s.makes - loss);
  // Passive loss is separate from the refundable manual spend.
  if (s.holding) s.drained = Math.min(s.drained, s.makes);
}

export function chargeDisplayMakes(s: HackerCharge) {
  if (!s.holding) return s.makes;
  return Math.max(0, s.makes - s.drained);
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
  s.drained = Math.min(s.makes, s.drained + rate * dt);
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
  const wholeSpent = Math.min(fullLayers, Math.floor((intoFull + SPEND_EPS) / per), Math.floor((s.makes + SPEND_EPS) / per));
  let effect: ChargeEffect = "none";
  if (wholeSpent >= 3 && fullLayers >= 3) effect = "rain";
  else if (wholeSpent >= 2) effect = "lock";
  else if (wholeSpent >= 1) effect = "arrow";
  const spentLayers = effect === "rain" ? 3 : effect === "lock" ? 2 : effect === "arrow" ? 1 : 0;
  s.makes = Math.max(0, s.makes - spentLayers * per);
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

/** Glass-shock ripples for the spend freeze. Presentation only. */
export const HACKER_RIPPLE = {
  burstLife: 0.68,
  pulseLife: 0.46,
  pulseEvery: 0.7,
  rings: 3,
  ringLag: 0.07,
} as const;

export type HackerRipple = { x: number; y: number; age: number; kind: "burst" | "pulse" };

export function hackerRippleLife(kind: HackerRipple["kind"]) {
  return kind === "burst" ? HACKER_RIPPLE.burstLife : HACKER_RIPPLE.pulseLife;
}

export function stepHackerRipples(list: readonly HackerRipple[], dt: number): HackerRipple[] {
  const next: HackerRipple[] = [];
  for (const ripple of list) {
    const age = ripple.age + Math.max(0, dt);
    if (age < hackerRippleLife(ripple.kind)) next.push({ ...ripple, age });
  }
  return next;
}

export type LensBand = {
  x: number;
  y: number;
  radius: number;
  half: number;
  strength: number;
};

/** Expanding convex-lens bands. Strength is world pixels of radial refraction. */
export function hackerLensBands(ripple: HackerRipple, ballR: number): LensBand[] {
  const life = hackerRippleLife(ripple.kind);
  const reach = ripple.kind === "burst" ? 5.6 : 3.6;
  const peak = ballR * (ripple.kind === "burst" ? 0.62 : 0.32);
  const bands: LensBand[] = [];
  for (let i = 0; i < HACKER_RIPPLE.rings; i++) {
    const t = (ripple.age - i * HACKER_RIPPLE.ringLag) / life;
    if (t <= 0 || t >= 1) continue;
    bands.push({
      x: ripple.x,
      y: ripple.y,
      radius: ballR * (1.45 + t * reach),
      half: ballR * (0.38 + 0.22 * (1 - t)),
      strength: peak * Math.sin(t * Math.PI),
    });
  }
  return bands;
}

/**
 * Refract the already-drawn court through expanding convex bands.
 * Samples the live framebuffer; does not paint hollow rings.
 */
export function drawHackerLensWarps(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  space: { ox: number; oy: number; cssW: number; w: number; h: number },
  list: readonly HackerRipple[],
  ballR: number,
) {
  const bands: LensBand[] = [];
  for (const ripple of list) bands.push(...hackerLensBands(ripple, ballR));
  if (!bands.length || space.cssW < 8 || source.width < 8) return;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const band of bands) {
    const reach = band.radius + band.half + band.strength + 2;
    minX = Math.min(minX, band.x - reach);
    minY = Math.min(minY, band.y - reach);
    maxX = Math.max(maxX, band.x + reach);
    maxY = Math.max(maxY, band.y + reach);
  }
  minX = Math.max(0, Math.floor(minX));
  minY = Math.max(0, Math.floor(minY));
  maxX = Math.min(space.w, Math.ceil(maxX));
  maxY = Math.min(space.h, Math.ceil(maxY));
  const bw = maxX - minX;
  const bh = maxY - minY;
  if (bw < 2 || bh < 2 || bw * bh > 280000) return;
  const dpr = source.width / space.cssW;
  const sx0 = Math.max(0, Math.floor((space.ox + minX) * dpr));
  const sy0 = Math.max(0, Math.floor((space.oy + minY) * dpr));
  const sx1 = Math.min(source.width, Math.ceil((space.ox + maxX) * dpr));
  const sy1 = Math.min(source.height, Math.ceil((space.oy + maxY) * dpr));
  const sw = sx1 - sx0;
  const sh = sy1 - sy0;
  if (sw < 2 || sh < 2 || sw * sh > 420000) return;
  let src: ImageData;
  try {
    src = ctx.getImageData(sx0, sy0, sw, sh);
  } catch {
    return;
  }
  const dst = new ImageData(new Uint8ClampedArray(src.data), sw, sh);
  const s = src.data;
  const o = dst.data;
  const sample = (fx: number, fy: number, i: number) => {
    const x = Math.max(0, Math.min(sw - 1, fx));
    const y = Math.max(0, Math.min(sh - 1, fy));
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(sw - 1, x0 + 1);
    const y1 = Math.min(sh - 1, y0 + 1);
    const tx = x - x0;
    const ty = y - y0;
    const i00 = (y0 * sw + x0) * 4;
    const i10 = (y0 * sw + x1) * 4;
    const i01 = (y1 * sw + x0) * 4;
    const i11 = (y1 * sw + x1) * 4;
    const a = (1 - tx) * (1 - ty);
    const b = tx * (1 - ty);
    const c = (1 - tx) * ty;
    const d = tx * ty;
    o[i] = s[i00]! * a + s[i10]! * b + s[i01]! * c + s[i11]! * d;
    o[i + 1] = s[i00 + 1]! * a + s[i10 + 1]! * b + s[i01 + 1]! * c + s[i11 + 1]! * d;
    o[i + 2] = s[i00 + 2]! * a + s[i10 + 2]! * b + s[i01 + 2]! * c + s[i11 + 2]! * d;
  };
  for (let py = 0; py < sh; py++) {
    const wy = (sy0 + py + 0.5) / dpr - space.oy;
    for (let px = 0; px < sw; px++) {
      const wx = (sx0 + px + 0.5) / dpr - space.ox;
      let shiftX = 0;
      let shiftY = 0;
      for (const band of bands) {
        const dx = wx - band.x;
        const dy = wy - band.y;
        const dist = Math.hypot(dx, dy);
        const inner = band.radius - band.half;
        const outer = band.radius + band.half;
        if (dist <= inner || dist >= outer || dist < 0.001) continue;
        const u = (dist - inner) / (outer - inner);
        const push = band.strength * Math.sin(u * Math.PI);
        shiftX -= (dx / dist) * push;
        shiftY -= (dy / dist) * push;
      }
      if (shiftX === 0 && shiftY === 0) continue;
      sample(px + 0.5 + shiftX * dpr, py + 0.5 + shiftY * dpr, (py * sw + px) * 4);
    }
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.putImageData(dst, sx0, sy0);
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
