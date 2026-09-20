/** Prison searchlight — edit left lamp only; right is a live horizontal mirror. */

export type SearchlightSide = "left" | "right";

export type SearchlightPlacement = {
  id: string;
  side: SearchlightSide;
  /** Mount pivot on the drawn wall quad (0–1). */
  x: number;
  y: number;
  /** Sprite width as fraction of world width. */
  scale: number;
  /** Body rotation in world radians. */
  angle: number;
  /** Rotation mount pivot inside the sprite (0–1 UV). */
  pivotU: number;
  pivotV: number;
  /** Ellipse glow center inside the sprite (0–1 UV). */
  emitU: number;
  emitV: number;
  /** Ellipse semi-axis X as fraction of sprite width. */
  emitRX: number;
  /** Ellipse semi-axis Y as fraction of sprite width. */
  emitRY: number;
  /** Ellipse rotation relative to the lamp body (radians). */
  emitRot: number;
  /**
   * Preferred beam side relative to body (radians). Actual world beam is the
   * perpendicular to the ellipse major axis closest to `angle + beamOffset`
   * (source sits inside the housing; aperture faces that direction).
   */
  beamOffset: number;
  /**
   * Cone half-angle at the internal source (radians). Smaller = source farther
   * behind the aperture = edges closer to parallel. Edges always pass through
   * the ellipse major-axis endpoints.
   */
  cone: number;
  /** Beam reach as fraction of world diagonal (gameplay / lock aim). */
  beamReach: number;
  /** Horizontal mirror (true for the auto-generated right lamp). */
  flipX: boolean;
};

export type SearchlightLayout = {
  version: 3;
  spriteSrc: string;
  /** Authored left lamp only. */
  light: SearchlightPlacement;
};

export type WallQuad = {
  ox: number;
  oy: number;
  dw: number;
  dh: number;
};

const KEY = "tq-prison-searchlights-v4";
const KEY_V3 = "tq-prison-searchlights-v3";
const KEY_V2 = "tq-prison-searchlights-v2";
const KEY_V1 = "tq-prison-searchlights-v1";

/** Layout from /public JSON once fetched; falls back to in-code defaults. */
let shippedLayout: SearchlightLayout | null = null;

export const SEARCHLIGHT_SPRITE_FALLBACK = "/game/modifiers/searchlight.png?v=1";
export const FLOOR_Y_FRAC = 0.765;
export const PRISON_WALL_W = 1792;
export const PRISON_WALL_H = 2432;
export const WALL_CROP = 0.962;
export const SEARCHLIGHT_ASPECT = 185 / 118;

const DEFAULT_REACH = 0.85;

export function wallQuad(
  world: { w: number; floorY: number },
  wallW = PRISON_WALL_W,
  wallH = PRISON_WALL_H,
): WallQuad {
  // Match render.ts wallLayout: fit width, then shrink to floorY, bottom-align.
  // UV (x,y) on this quad is resolution-independent — same tower seat on every phone.
  const sw = wallW > 0 ? wallW : PRISON_WALL_W;
  const sh = (wallH > 0 ? wallH : PRISON_WALL_H) * WALL_CROP;
  let scale = world.w / sw;
  if (sh * scale > world.floorY) scale = world.floorY / sh;
  const dw = sw * scale;
  const dh = sh * scale;
  return {
    ox: (world.w - dw) * 0.5,
    oy: world.floorY - dh,
    dw,
    dh,
  };
}

/** Sprite size scales with the wall quad so lamps stay glued to towers on all aspects. */
export function spriteSize(
  light: SearchlightPlacement,
  worldW: number,
  wallDw?: number,
) {
  const basis = wallDw && wallDw > 0 ? wallDw : worldW;
  const dw = light.scale * basis;
  return { dw, dh: dw / SEARCHLIGHT_ASPECT };
}

function leftTemplate(): SearchlightPlacement {
  return {
    id: "left",
    side: "left",
    x: 0.09611733607267993,
    y: 0.2561770653507554,
    scale: 0.16,
    angle: 0.7491390445104689,
    pivotU: 0.37071914021031327,
    pivotV: 0.8065719322526332,
    emitU: 0.6138473961411212,
    emitV: 0.4815138214420872,
    emitRX: 0.18929977728850222,
    emitRY: 0.1199511442680537,
    // Long axis across the aperture; beam (⊥ major) faces along the body toward court.
    emitRot: 1.500853318924632,
    beamOffset: -0.06994300787026453,
    cone: 0.09697279579996654,
    beamReach: DEFAULT_REACH,
    flipX: false,
  };
}

export function defaultSearchlightLayout(): SearchlightLayout {
  return {
    version: 3,
    spriteSrc: SEARCHLIGHT_SPRITE_FALLBACK,
    light: leftTemplate(),
  };
}

function clamp01(n: number, fallback: number) {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

function clampRange(n: number, a: number, b: number, fallback: number) {
  return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : fallback;
}

function parseLight(raw: Partial<SearchlightPlacement> & { emitR?: number; beamAngle?: number }, fallback: SearchlightPlacement): SearchlightPlacement {
  const emitRX =
    Number.isFinite(raw.emitRX as number)
      ? (raw.emitRX as number)
      : Number.isFinite(raw.emitR)
        ? (raw.emitR as number)
        : fallback.emitRX;
  const emitRY =
    Number.isFinite(raw.emitRY as number)
      ? (raw.emitRY as number)
      : Number.isFinite(raw.emitR)
        ? (raw.emitR as number) * 0.7
        : fallback.emitRY;
  const angle = Number.isFinite(raw.angle as number) ? (raw.angle as number) : fallback.angle;
  const beamOffset = Number.isFinite(raw.beamOffset as number)
    ? (raw.beamOffset as number)
    : Number.isFinite(raw.beamAngle as number)
      ? (raw.beamAngle as number) - angle
      : fallback.beamOffset;
  return {
    id: "left",
    side: "left",
    x: clamp01(raw.x as number, fallback.x),
    y: clamp01(raw.y as number, fallback.y),
    scale: clampRange(raw.scale as number, 0.04, 0.45, fallback.scale),
    angle,
    pivotU: clamp01(raw.pivotU as number, fallback.pivotU),
    pivotV: clamp01(raw.pivotV as number, fallback.pivotV),
    emitU: clamp01(raw.emitU as number, fallback.emitU),
    emitV: clamp01(raw.emitV as number, fallback.emitV),
    emitRX: clampRange(emitRX, 0.03, 0.7, fallback.emitRX),
    emitRY: clampRange(emitRY, 0.03, 0.7, fallback.emitRY),
    emitRot: Number.isFinite(raw.emitRot as number) ? (raw.emitRot as number) : fallback.emitRot,
    beamOffset,
    cone: clampRange(raw.cone as number, 0.035, 0.55, fallback.cone),
    beamReach: clampRange(raw.beamReach as number, 0.25, 1.4, fallback.beamReach),
    flipX: false,
  };
}

/** Horizontal mirror of the authored left lamp → right tower.
 *  Must be `angle → -angle` + `flipX`, NOT `π - angle` + flipX
 *  (the latter flips the housing upside-down). */
export function mirrorLeftToRight(src: SearchlightPlacement): SearchlightPlacement {
  return {
    ...src,
    id: "right",
    side: "right",
    x: 1 - src.x,
    y: src.y,
    angle: -src.angle,
    // Keep world beam as the horizontal mirror of the left beam:
    // leftBeam = angle + beamOffset → rightBeam = π - leftBeam = -angle + (π - beamOffset)
    beamOffset: Math.PI - src.beamOffset,
    emitRot: src.emitRot,
    flipX: true,
  };
}

/** Always [left, right] with right mirrored from left. */
export function expandedLights(layout: SearchlightLayout): SearchlightPlacement[] {
  const left = { ...layout.light, id: "left", side: "left" as const, flipX: false };
  return [left, mirrorLeftToRight(left)];
}

export function normalizeSearchlightLayout(raw: unknown): SearchlightLayout {
  const base = defaultSearchlightLayout();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Partial<SearchlightLayout> & {
    version?: number;
    lights?: Partial<SearchlightPlacement>[];
    light?: Partial<SearchlightPlacement>;
  };
  let srcLight: Partial<SearchlightPlacement> | undefined = o.light;
  if (!srcLight && Array.isArray(o.lights) && o.lights.length > 0) {
    srcLight = o.lights.find((l) => l.side !== "right") ?? o.lights[0];
  }
  const light = parseLight(srcLight ?? {}, base.light);
  const src =
    typeof o.spriteSrc === "string" && o.spriteSrc.startsWith("/")
      ? o.spriteSrc
      : base.spriteSrc;
  return {
    version: 3,
    spriteSrc: src.includes("searchlight.svg") ? base.spriteSrc : src,
    light,
  };
}

export function loadSearchlightLayout(_opts?: { allowLocal?: boolean }): SearchlightLayout {
  // Prefer editor draft in localStorage (same browser), else shipped JSON, else code defaults.
  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return normalizeSearchlightLayout(JSON.parse(raw));
    } catch {
      /* fall through */
    }
  }
  return shippedLayout ?? defaultSearchlightLayout();
}

/** Prefetch the repo layout so phones don't depend on desktop localStorage edits. */
export function primeSearchlightLayout() {
  if (typeof fetch === "undefined") return;
  void fetch("/game/modifiers/searchlight-layout.json?v=3")
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (j) shippedLayout = normalizeSearchlightLayout(j);
    })
    .catch(() => {});
}

export function saveSearchlightLayout(layout: SearchlightLayout): SearchlightLayout {
  const next = normalizeSearchlightLayout(layout);
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(KEY, JSON.stringify(next));
  }
  return next;
}

export function clearSearchlightLayout() {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(KEY);
    localStorage.removeItem(KEY_V3);
    localStorage.removeItem(KEY_V2);
    localStorage.removeItem(KEY_V1);
  }
}

export function placementPivot(
  world: { w: number; floorY: number },
  light: SearchlightPlacement,
  quad: WallQuad = wallQuad(world),
) {
  return {
    x: quad.ox + light.x * quad.dw,
    y: quad.oy + light.y * quad.dh,
  };
}

export function placementEmit(
  world: { w: number; floorY: number },
  light: SearchlightPlacement,
  bodyAngle = light.angle,
  quad: WallQuad = wallQuad(world),
) {
  const piv = placementPivot(world, light, quad);
  const { dw, dh } = spriteSize(light, world.w, quad.dw);
  let lx = (light.emitU - light.pivotU) * dw;
  const ly = (light.emitV - light.pivotV) * dh;
  if (light.flipX) lx = -lx;
  const c = Math.cos(bodyAngle);
  const s = Math.sin(bodyAngle);
  return {
    x: piv.x + lx * c - ly * s,
    y: piv.y + lx * s + ly * c,
  };
}

function angleDelta(a: number, b: number) {
  return ((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}

function closerAngle(preferred: number, a: number, b: number) {
  return Math.abs(angleDelta(preferred, a)) <= Math.abs(angleDelta(preferred, b)) ? a : b;
}

/** Prefer the direction with larger projection toward a target point. */
function facingScore(ang: number, from: { x: number; y: number }, to: { x: number; y: number }) {
  return Math.cos(ang) * (to.x - from.x) + Math.sin(ang) * (to.y - from.y);
}

/** Local major-axis angle of the emit ellipse relative to the lamp body. */
export function majorLocalAngle(light: SearchlightPlacement) {
  const localEmit = light.flipX ? -light.emitRot : light.emitRot;
  return light.emitRX >= light.emitRY ? localEmit : localEmit + Math.PI * 0.5;
}

/** Map-center aim point the idle beam should face (not the outer wall). */
function courtCenter(world: { w: number; floorY: number }) {
  return { x: world.w * 0.5, y: world.floorY * 0.62 };
}

/**
 * World beam direction: perpendicular to the ellipse major axis.
 * Idle: face court center. Hunt (`aim`): face the aim point (nearest perp).
 */
export function worldBeamAngle(
  light: SearchlightPlacement,
  bodyAngle = light.angle,
  world?: { w: number; floorY: number },
  quad?: WallQuad,
  aim?: { x: number; y: number },
) {
  const majorLocal = majorLocalAngle(light);
  const a = bodyAngle + majorLocal + Math.PI * 0.5;
  const b = bodyAngle + majorLocal - Math.PI * 0.5;
  if (!world) {
    return closerAngle(bodyAngle + light.beamOffset, a, b);
  }
  const q = quad ?? wallQuad(world);
  const emit = placementEmit(world, light, bodyAngle, q);
  if (aim) {
    const toAim = Math.atan2(aim.y - emit.y, aim.x - emit.x);
    return closerAngle(toAim, a, b);
  }
  const c = courtCenter(world);
  return facingScore(a, emit, c) >= facingScore(b, emit, c) ? a : b;
}

/** Beam angle relative to the lamp body (uses court-center facing when world is known). */
export function beamLocalOffset(
  light: SearchlightPlacement,
  world?: { w: number; floorY: number },
  bodyAngle = light.angle,
  quad?: WallQuad,
) {
  return worldBeamAngle(light, bodyAngle, world, quad) - bodyAngle;
}

export function emitEllipseAxes(
  world: { w: number },
  light: SearchlightPlacement,
  wallDw?: number,
) {
  const { dw } = spriteSize(light, world.w, wallDw);
  return {
    rx: Math.max(3, light.emitRX * dw),
    ry: Math.max(3, light.emitRY * dw),
  };
}

/** World rotation of the glow ellipse (body + local emitRot, flip-aware). */
export function worldEmitRot(light: SearchlightPlacement, bodyAngle = light.angle) {
  const local = light.flipX ? -light.emitRot : light.emitRot;
  return bodyAngle + local;
}

export function lightForSide(layout: SearchlightLayout, side: -1 | 1) {
  const lights = expandedLights(layout);
  return lights.find((l) => l.side === (side < 0 ? "left" : "right")) ?? null;
}

/** Long-axis endpoints of the emit ellipse in world space. */
export function emitMajorEnds(
  world: { w: number; floorY: number },
  light: SearchlightPlacement,
  bodyAngle = light.angle,
  quad: WallQuad = wallQuad(world),
) {
  const emit = placementEmit(world, light, bodyAngle, quad);
  const { rx, ry } = emitEllipseAxes(world, light, quad.dw);
  const rot = worldEmitRot(light, bodyAngle);
  const major = Math.max(rx, ry);
  const majorAng = rx >= ry ? rot : rot + Math.PI * 0.5;
  const c = Math.cos(majorAng);
  const s = Math.sin(majorAng);
  return {
    emit,
    major,
    majorAng,
    p1: { x: emit.x + c * major, y: emit.y + s * major },
    p2: { x: emit.x - c * major, y: emit.y - s * major },
  };
}

/**
 * Virtual internal apex (for edge construction only — not drawn).
 * Visible beam starts at the ellipse major lip (p1–p2) and goes outward;
 * edges stay collinear with apex→p1 / apex→p2 (tangent to the long ends).
 * `cone` sets how far behind the mouth the virtual source sits.
 */
export function coneGeometry(
  world: { w: number; floorY: number; h?: number },
  light: SearchlightPlacement,
  bodyAngle = light.angle,
  quad: WallQuad = wallQuad(world),
  aim?: { x: number; y: number },
) {
  const ends = emitMajorEnds(world, light, bodyAngle, quad);
  const { emit, major, p1, p2 } = ends;
  const beamAng = worldBeamAngle(light, bodyAngle, world, quad, aim);
  const half = Math.min(Math.max(light.cone, 0.035), 0.55);
  const back = Math.max(major / Math.tan(half), major * 1.05);
  const bx = Math.cos(beamAng);
  const by = Math.sin(beamAng);
  // Virtual source inside the housing (construction only).
  const apex = { x: emit.x - bx * back, y: emit.y - by * back };
  // Past every viewport corner so the far chord never reads as a hard cutoff.
  const bottom = world.h ?? world.floorY * 1.35;
  const reach = Math.max(
    Math.hypot(emit.x - 0, emit.y - 0),
    Math.hypot(emit.x - world.w, emit.y - 0),
    Math.hypot(emit.x - 0, emit.y - bottom),
    Math.hypot(emit.x - world.w, emit.y - bottom),
    Math.hypot(world.w, world.floorY),
  ) * 1.45;
  const d1x = p1.x - apex.x;
  const d1y = p1.y - apex.y;
  const d2x = p2.x - apex.x;
  const d2y = p2.y - apex.y;
  const n1 = Math.hypot(d1x, d1y) || 1;
  const n2 = Math.hypot(d2x, d2y) || 1;
  // Extend past the aperture along the tangent edges.
  const f1 = {
    x: apex.x + (d1x / n1) * (back + reach),
    y: apex.y + (d1y / n1) * (back + reach),
  };
  const f2 = {
    x: apex.x + (d2x / n2) * (back + reach),
    y: apex.y + (d2y / n2) * (back + reach),
  };
  return { apex, emit, p1, p2, f1, f2, beamAng, half, reach, back, major };
}

export function drawEmitEllipse(
  ctx: CanvasRenderingContext2D,
  world: { w: number; floorY: number },
  light: SearchlightPlacement,
  bodyAngle: number,
  quad: WallQuad,
  style?: { stroke?: string; fill?: boolean; cold?: boolean; alpha?: number },
) {
  const emit = placementEmit(world, light, bodyAngle, quad);
  const { rx, ry } = emitEllipseAxes(world, light, quad.dw);
  const rot = worldEmitRot(light, bodyAngle);
  const a = style?.alpha ?? 1;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(emit.x, emit.y);
  ctx.rotate(rot);
  if (style?.fill !== false) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(rx, ry));
    if (style?.cold) {
      g.addColorStop(0, "rgba(40,48,62,0.55)");
      g.addColorStop(0.45, "rgba(22,28,38,0.35)");
      g.addColorStop(1, "rgba(10,12,18,0)");
    } else {
      g.addColorStop(0, "rgba(255,245,200,0.9)");
      g.addColorStop(0.4, "rgba(255,220,120,0.45)");
      g.addColorStop(1, "rgba(255,200,80,0)");
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (style?.stroke) {
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Visible searchlight: glowing ellipse as the source, plus an outward beam
 * whose sides are tangent to the ellipse long-axis ends. Nothing is drawn
 * inside the lamp (virtual apex is construction-only).
 */
export function drawSearchlightBeam(
  ctx: CanvasRenderingContext2D,
  world: { w: number; floorY: number; h?: number },
  light: SearchlightPlacement,
  opts?: {
    dim?: boolean;
    locking?: boolean;
    bodyAngle?: number;
    quad?: WallQuad;
    /** Stopped: dark oval only, no beam. */
    disabled?: boolean;
    /** 0–1 beam strength (wake flicker). */
    pulse?: number;
    /** Hunt aim — keeps beam inside the lamp's semicircle. */
    aim?: { x: number; y: number };
  },
) {
  const bodyAng = opts?.bodyAngle ?? light.angle;
  const quad = opts?.quad ?? wallQuad(world);
  const geo = coneGeometry(world, light, bodyAng, quad, opts?.aim);
  const locking = Boolean(opts?.locking);
  const pulse = opts?.pulse ?? 1;

  if (opts?.dim) {
    ctx.save();
    ctx.fillStyle = "rgba(4, 8, 14, 0.42)";
    ctx.fillRect(0, 0, world.w, world.floorY + ((world.h ?? world.floorY * 1.35) - world.floorY) * 0.35);
    ctx.restore();
  }

  if (opts?.disabled || pulse <= 0.02) {
    drawEmitEllipse(ctx, world, light, bodyAng, quad, { fill: true, cold: true });
    return;
  }

  // Outward wedge from the ellipse lip — sides run off-canvas; soft falloff, no hard tip.
  ctx.save();
  ctx.globalAlpha = pulse;
  const fall = geo.reach;
  const g = ctx.createRadialGradient(
    geo.emit.x,
    geo.emit.y,
    Math.max(4, geo.major * 0.12),
    geo.emit.x + Math.cos(geo.beamAng) * fall * 0.22,
    geo.emit.y + Math.sin(geo.beamAng) * fall * 0.22,
    fall,
  );
  g.addColorStop(0, locking ? "rgba(255,230,150,0.5)" : "rgba(255,236,170,0.38)");
  g.addColorStop(0.18, locking ? "rgba(255,215,110,0.28)" : "rgba(255,225,150,0.2)");
  g.addColorStop(0.42, locking ? "rgba(255,210,100,0.1)" : "rgba(255,220,140,0.07)");
  g.addColorStop(0.72, "rgba(255,220,140,0.02)");
  g.addColorStop(1, "rgba(255,220,140,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(geo.p1.x, geo.p1.y);
  ctx.lineTo(geo.f1.x, geo.f1.y);
  ctx.lineTo(geo.f2.x, geo.f2.y);
  ctx.lineTo(geo.p2.x, geo.p2.y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  drawEmitEllipse(ctx, world, light, bodyAng, quad, { fill: true, alpha: pulse });
}
