import type { Ball, Callout, Gfx, Hoop, NinjaCloneDraw, Particle, PrisonHud, TrailPt, World } from "./types";
import { DEFAULT_GFX, fireStage } from "./types";
import { artImage, ballImage, cloudImages, graffitiImage } from "./art";
import type { BallId } from "./balls";
import { DEFAULT_BALL } from "./balls";
import type { DoodleMark } from "./doodle";
import { DOODLE_FADE, DOODLE_SLOTS } from "./doodle";
import type { Chain } from "./chain";
import { gecko } from "./perf";
import { getScene, type GrafKey } from "./scenes";
import {
  NET_COLS,
  NET_ROWS,
  RIM_RY,
  netNode,
  netNodeInFront,
  netRowBurn,
  netRowReleased,
} from "./net";

export { NET_COLS, NET_ROWS, NET_ROW_H, RIM_RY } from "./net";

export function drawScene(
  ctx: CanvasRenderingContext2D,
  world: World,
  hoop: Hoop,
  other: Hoop | null,
  ball: Ball,
  particles: Particle[],
  callouts: Callout[],
  combo: number,
  score: number,
  timer01: number,
  buzzer: boolean,
  time: number,
  shakeX: number,
  shakeY: number,
  showHud: boolean,
  burnFlash = 0,
  trail: TrailPt[] = [],
  whiteFlash = 0,
  comboHud = -1,
  comboBanner = "",
  cloudT = 0,
  cloudSx = 1,
  cloudSy = 1,
  graf: { show: GrafKey | null; incoming: { key: GrafKey; p: number } | null } | null = null,
  gfx: Gfx = DEFAULT_GFX,
  backdrop: "void" | "street" | "prison" = "street",
  ballId: BallId = DEFAULT_BALL,
  glassBase = -1,
  chain: Chain | null = null,
  prison: PrisonHud | null = null,
  ninjaClones: NinjaCloneDraw[] = [],
  champBank = -1,
  hole: { x: number; y: number; r: number; left?: number } | null = null,
  antiCharge = -1,
  antimatter: { x: number; y: number; r: number; pct: number } | null = null,
  scoreOverride: string | null = null,
  boltCharge = -1,
  boltTrail: { x: number; y: number }[] = [],
  barLabel: string | null = null,
  scoreFlash = false,
  afterCourt?: ((ctx: CanvasRenderingContext2D) => void) | null,
  doodle: {
    paint: number;
    life: number | null;
    marks: DoodleMark[];
    live: { x: number; y: number }[] | null;
  } | null = null,
) {
	ctx.save();
	ctx.translate(shakeX, shakeY);
	if (backdrop === "void") drawVoid(ctx, world);
	else {
		drawWall(ctx, world, cloudT, cloudSx, cloudSy, graf, gfx.clouds !== "off");
		drawCourt(ctx, world);
	}
	afterCourt?.(ctx);
	if (hole) drawBlackHole(ctx, hole, time);
	if (antimatter) drawAntiMatter(ctx, antimatter, time);
	if (boltTrail.length > 1) drawBoltTrail(ctx, boltTrail, time);
	if (gfx.ballShadow) drawGroundShadow(ctx, ball, world);
	if (doodle) drawDoodleInk(ctx, world, doodle, ball.r);
	if (chain) drawChain(ctx, chain, true);
	if (showHud) drawCountdown(ctx, world, timer01, buzzer, barLabel);
	const distH = Math.hypot(ball.x - hoop.x, ball.y - hoop.y);
	const distO = other ? Math.hypot(ball.x - other.x, ball.y - other.y) : Infinity;
	const ballWithOther = Boolean(other && distO < distH);
	if (other) drawHoopStack(ctx, other, world, ballWithOther ? ball : null, combo, time, gfx.particles ? trail : [], gfx, ballId);
	drawHoopStack(ctx, hoop, world, ballWithOther ? null : ball, combo, time, gfx.particles ? trail : [], gfx, ballId);
	if (ballId === "bolt" && boltCharge > 90) drawBoltWhitePulse(ctx, ball, time);
	for (const c of ninjaClones) {
		drawNinjaBall(
			ctx,
			{
				x: c.x,
				y: c.y,
				r: c.r,
				vx: 0,
				vy: 0,
				spin: ball.spin * 0.85,
				omega: 0,
				squash: 1,
				scored: false,
				hitRim: false,
				hitBoard: false,
			},
			gfx.ballShade,
			c.alpha,
			"gray",
		);
	}
	if (chain) drawChain(ctx, chain, false);
	if (gfx.particles) for (const p of particles) drawParticle(ctx, p);
	const pops = prison?.mode === "shackle" ? callouts.filter((c) => c.kind === "tag") : callouts;
	drawScorePops(ctx, pops, world);
	if (buzzer && gfx.buzzerSpot) drawBuzzerSpot(ctx, world, ball);
	if (whiteFlash > 0 && gfx.flash) {
		ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.2, whiteFlash * 1.65)})`;
		ctx.fillRect(0, 0, world.w, world.h);
	}
	if (burnFlash > 0 && gfx.flash) {
		ctx.fillStyle = `rgba(255, 150, 40, ${Math.min(.42, burnFlash * 1.4)})`;
		ctx.fillRect(0, 0, world.w, world.h);
	}
	ctx.restore();
	if (showHud) {
		drawHud(
			ctx,
			world,
			score,
			comboHud < 0 ? combo : comboHud,
			timer01,
			buzzer,
			pops,
			time,
			combo,
			comboBanner,
			glassBase,
			prison,
			champBank,
			antiCharge,
			hole?.left ?? -1,
			scoreOverride,
			boltCharge,
			scoreFlash,
		);
	}
}

function drawChain(ctx: CanvasRenderingContext2D, chain: Chain, backPass: boolean) {
	const nodes = chain.nodes;
	if (nodes.length < 2) return;
	const last = nodes.length - 1;
	const mid = Math.floor(nodes.length * 0.45);
	ctx.save();
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	for (let i = 0; i < nodes.length - 1; i++) {
		const isBack = i < mid;
		if (backPass !== isBack) continue;
		const a = nodes[i]!;
		const b = nodes[i + 1]!;
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const len = Math.hypot(dx, dy) || 1;
		const nx = -dy / len;
		const ny = dx / len;
		const thick = Math.max(2.4, chain.nodeR * 1.55);
		// Stop the last segment at the tip ball surface
		let x1 = a.x;
		let y1 = a.y;
		let x2 = b.x;
		let y2 = b.y;
		if (i === last - 1) {
			const shrink = chain.tipR * 0.92;
			x2 = b.x - (dx / len) * shrink;
			y2 = b.y - (dy / len) * shrink;
		}
		ctx.strokeStyle = "#1a1c20";
		ctx.lineWidth = thick + 1.6;
		ctx.beginPath();
		ctx.moveTo(x1, y1);
		ctx.lineTo(x2, y2);
		ctx.stroke();
		ctx.strokeStyle = i % 2 === 0 ? "#6e737a" : "#4d5259";
		ctx.lineWidth = thick;
		ctx.beginPath();
		ctx.moveTo(x1, y1);
		ctx.lineTo(x2, y2);
		ctx.stroke();
		ctx.strokeStyle = "rgba(220, 225, 232, 0.35)";
		ctx.lineWidth = Math.max(1, thick * 0.28);
		ctx.beginPath();
		ctx.moveTo(x1 + nx * thick * 0.22, y1 + ny * thick * 0.22);
		ctx.lineTo(x2 + nx * thick * 0.22, y2 + ny * thick * 0.22);
		ctx.stroke();
	}
	if (!backPass) {
		for (let i = 1; i < last; i++) {
			const n = nodes[i]!;
			const rr = chain.nodeR * 0.92;
			const g = ctx.createRadialGradient(n.x - rr * 0.25, n.y - rr * 0.3, rr * 0.1, n.x, n.y, rr);
			g.addColorStop(0, "#9aa1aa");
			g.addColorStop(0.55, "#5c626a");
			g.addColorStop(1, "#2a2e34");
			ctx.fillStyle = g;
			ctx.beginPath();
			ctx.arc(n.x, n.y, rr, 0, Math.PI * 2);
			ctx.fill();
			ctx.strokeStyle = "rgba(0,0,0,0.45)";
			ctx.lineWidth = 1;
			ctx.stroke();
		}
		const tip = nodes[last]!;
		const tr = chain.tipR;
		const iron = ctx.createRadialGradient(tip.x - tr * 0.32, tip.y - tr * 0.38, tr * 0.08, tip.x, tip.y, tr);
		iron.addColorStop(0, "#3a3a3a");
		iron.addColorStop(0.35, "#1a1a1a");
		iron.addColorStop(0.75, "#0a0a0a");
		iron.addColorStop(1, "#000000");
		ctx.fillStyle = iron;
		ctx.beginPath();
		ctx.arc(tip.x, tip.y, tr, 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = "rgba(80, 80, 80, 0.7)";
		ctx.lineWidth = Math.max(1.2, tr * 0.06);
		ctx.stroke();
		const sheen = ctx.createRadialGradient(tip.x - tr * 0.35, tip.y - tr * 0.4, 0, tip.x - tr * 0.2, tip.y - tr * 0.25, tr * 0.55);
		sheen.addColorStop(0, "rgba(255,255,255,0.22)");
		sheen.addColorStop(0.4, "rgba(180,180,180,0.06)");
		sheen.addColorStop(1, "rgba(0,0,0,0)");
		ctx.fillStyle = sheen;
		ctx.beginPath();
		ctx.arc(tip.x, tip.y, tr, 0, Math.PI * 2);
		ctx.fill();

		const head = nodes[0]!;
		ctx.strokeStyle = "#3a3f46";
		ctx.lineWidth = Math.max(2.2, chain.nodeR * 0.9);
		ctx.beginPath();
		ctx.arc(head.x, head.y, chain.nodeR * 1.35, 0, Math.PI * 2);
		ctx.stroke();
		ctx.strokeStyle = "#8b929c";
		ctx.lineWidth = Math.max(1.4, chain.nodeR * 0.55);
		ctx.beginPath();
		ctx.arc(head.x, head.y, chain.nodeR * 1.35, 0, Math.PI * 2);
		ctx.stroke();
	}
	ctx.restore();
}

function drawBuzzerSpot(ctx: CanvasRenderingContext2D, world: World, ball: Ball) {
	const cx = Math.min(world.w, Math.max(0, ball.x));
	const cy = Math.min(world.h, Math.max(0, ball.y));
	const rad = ball.r * 5;
	ctx.save();
	ctx.beginPath();
	ctx.rect(0, 0, world.w, world.h);
	ctx.arc(cx, cy, rad, 0, Math.PI * 2, true);
	ctx.fillStyle = "rgba(4, 6, 12, 0.78)";
	ctx.fill("evenodd");
	ctx.restore();
}
function drawHoopStack(ctx: CanvasRenderingContext2D, hoop: Hoop, world: World, ball: Ball | null, combo: number, time: number, trail: TrailPt[] = [], gfx: Gfx = DEFAULT_GFX, ballId: BallId = DEFAULT_BALL) {
	const drawBallLayer = () => {
		if (!ball) return;
		if (gfx.particles) {
			drawMotionTrail(ctx, trail, ball, combo, time, ballId === "frost");
			drawBall(ctx, ball, combo, world, time, gfx.ballShade, ballId);
		} else {
			drawBall(ctx, ball, combo, world, time, gfx.ballShade, ballId);
		}
	};
	const alpha = hoop.fxAlpha ?? 1;
	if (alpha <= 0.02) {
		drawBallLayer();
		return;
	}
	const beginHoopFx = () => {
		ctx.save();
		const scale = hoop.fxScale ?? 1;
		if (scale !== 1) {
			ctx.translate(hoop.x, hoop.y);
			ctx.scale(scale, scale);
			ctx.translate(-hoop.x, -hoop.y);
		}
		if (alpha < 0.999) ctx.globalAlpha = alpha;
		if (hoop.jolt > 0 && hoop.active) {
			const p = bracePivot(hoop, world);
			const stage = fireStage(combo);
			const boost = stage >= 4 ? 1.7 : stage >= 3 ? 1.35 : 1;
			const elapsed = (1 - hoop.jolt) * 0.28;
			const ang =
				hoop.jolt *
				hoop.joltDir *
				-hoop.side *
				boost *
				0.024 *
				Math.sin(elapsed * Math.PI * 2 * 11);
			ctx.translate(p.x, p.y);
			ctx.rotate(ang);
			ctx.translate(-p.x, -p.y);
		}
	};
	beginHoopFx();
	if (!hoop.noBoard) drawBackboard(ctx, hoop, world, time, combo);
	drawRim(ctx, hoop, "back", combo);
	drawNet(ctx, hoop, "back", ball, combo);
	ctx.restore();
	// Ball stays in world space — hoop fade/scale must not suck it toward the rim.
	drawBallLayer();
	beginHoopFx();
	drawNet(ctx, hoop, "front", ball, combo);
	drawRim(ctx, hoop, "front", combo);
	if (hoop.frostLeft > 0) drawFrostVeil(ctx, hoop, world);
	ctx.restore();
}

function wallLayout(world: World, img: HTMLImageElement) {
	const { w, floorY } = world;
	const sw = img.naturalWidth;
	const sh = img.naturalHeight * 0.962;
	let scale = w / sw;
	if (sh * scale > floorY) scale = floorY / sh;
	const dw = sw * scale;
	const dh = sh * scale;
	const ox = (w - dw) * 0.5;
	const oy = floorY - dh;
	return {
		sw,
		sh,
		ox,
		oy,
		dw,
		dh,
		scale,
		skyTop: 0,
		skyBot: Math.max(0, oy),
	};
}

/** Street wall / graffiti sheet reference (1792×1634). Keep spray size+seat
 *  identical on taller prison walls instead of stretching to the full wall quad. */
const STREET_GRAF_W = 1792;
const STREET_GRAF_H = 1634;

function graffitiLayout(world: World) {
	const { w, floorY } = world;
	const sw = STREET_GRAF_W;
	const sh = STREET_GRAF_H * 0.962;
	let scale = w / sw;
	if (sh * scale > floorY) scale = floorY / sh;
	const dw = sw * scale;
	const dh = sh * scale;
	return {
		ox: (w - dw) * 0.5,
		oy: floorY - dh,
		dw,
		dh,
	};
}

let skyLayer: HTMLCanvasElement | null = null;
let wallLayer: HTMLCanvasElement | null = null;
let courtLayer: HTMLCanvasElement | null = null;
let skyLayerKey = "";
let wallLayerKey = "";
let courtLayerKey = "";

export function clearSceneLayers() {
	skyLayer = null;
	wallLayer = null;
	courtLayer = null;
	skyLayerKey = "";
	wallLayerKey = "";
	courtLayerKey = "";
}

function layerCanvas(w: number, h: number) {
	const c = document.createElement("canvas");
	c.width = Math.max(1, Math.ceil(w));
	c.height = Math.max(1, Math.ceil(h));
	return c;
}

function ensureSkyLayer(world: World, layout: ReturnType<typeof wallLayout>) {
	const sky = artImage("sky");
	const key = `${world.w | 0}x${layout.skyBot | 0}:${sky?.naturalWidth || 0}`;
	if (skyLayer && skyLayerKey === key) return skyLayer;
	const { w } = world;
	const skyH = layout.skyBot - layout.skyTop;
	const c = layerCanvas(w, Math.max(1, skyH));
	const x = c.getContext("2d");
	if (!x) return null;
	x.imageSmoothingEnabled = true;
	x.imageSmoothingQuality = "medium";
	if (skyH > 1) {
		if (sky) {
			const iw = sky.naturalWidth;
			const ih = sky.naturalHeight;
			const sc = Math.max(w / iw, skyH / ih);
			const dw = iw * sc;
			const dh = ih * sc;
			x.drawImage(sky, 0, 0, iw, ih, (w - dw) * 0.5, skyH - dh, dw, dh);
		} else {
			const g = x.createLinearGradient(0, 0, 0, skyH);
			g.addColorStop(0, "#3f81d1");
			g.addColorStop(1, "#b7ddfb");
			x.fillStyle = g;
			x.fillRect(0, 0, w, skyH);
		}
	}
	skyLayer = c;
	skyLayerKey = key;
	return c;
}

function ensureWallLayer(world: World, layout: ReturnType<typeof wallLayout>, grafShow: GrafKey | null) {
	const img = artImage("wall");
	if (!img) return null;
	const key = `${world.w | 0}x${world.floorY | 0}:${img.naturalWidth}x${img.naturalHeight}:${grafShow || ""}`;
	if (wallLayer && wallLayerKey === key) return wallLayer;
	const c = layerCanvas(world.w, world.floorY);
	const x = c.getContext("2d");
	if (!x) return null;
	x.imageSmoothingEnabled = true;
	x.imageSmoothingQuality = "medium";
	x.drawImage(img, 0, 0, layout.sw, layout.sh, layout.ox, layout.oy, layout.dw, layout.dh);
	if (grafShow) {
		const spray = graffitiImage(grafShow);
		if (spray) {
			const g = graffitiLayout(world);
			const gsw = spray.naturalWidth;
			const gsh = spray.naturalHeight * 0.962;
			x.drawImage(spray, 0, 0, gsw, gsh, g.ox, g.oy, g.dw, g.dh);
		}
	}
	wallLayer = c;
	wallLayerKey = key;
	return c;
}

function ensureCourtLayer(world: World) {
	const img = artImage("court");
	if (!img) return null;
	const depth = world.h - world.floorY;
	const key = `${world.w | 0}x${depth | 0}:${img.naturalWidth}`;
	if (courtLayer && courtLayerKey === key) return courtLayer;
	const c = layerCanvas(world.w, Math.max(1, depth));
	const x = c.getContext("2d");
	if (!x) return null;
	x.imageSmoothingEnabled = true;
	x.imageSmoothingQuality = "medium";
	x.drawImage(img, 0, 0, world.w, depth);
	courtLayer = c;
	courtLayerKey = key;
	return c;
}

let fillRed: HTMLCanvasElement | null = null;
let fillRedId = "";

const YARD_TIMER_BASE = "/game/scenes/prison/timer-yard-base.png?v=6";
const YARD_TIMER_FILL = "/game/scenes/prison/timer-yard-fill.png?v=6";
const LOCK_TIMER_BASE = "/game/scenes/prison/timer-lockdown-base.png?v=1";
const LOCK_TIMER_FILL = "/game/scenes/prison/timer-lockdown-fill.png?v=1";
const INFRACTION_TIMER_BASE = "/game/scenes/prison/timer-Infraction-base.png?v=1";
const INFRACTION_TIMER_FILL = "/game/scenes/prison/timer-Infraction-fill.png?v=1";
const prisonTimerImgs: Record<string, HTMLImageElement | null> = {};

function ensurePrisonTimer(src: string) {
	const cached = prisonTimerImgs[src];
	if (cached && cached.complete && cached.naturalWidth > 0) return cached;
	if (!cached) {
		const img = new Image();
		img.decoding = "async";
		img.src = src;
		prisonTimerImgs[src] = img;
	}
	const img = prisonTimerImgs[src];
	return img && img.complete && img.naturalWidth > 0 ? img : null;
}

/** Preload all three pairs so art swaps stay seamless. */
function primePrisonTimers() {
	ensurePrisonTimer(YARD_TIMER_BASE);
	ensurePrisonTimer(YARD_TIMER_FILL);
	ensurePrisonTimer(LOCK_TIMER_BASE);
	ensurePrisonTimer(LOCK_TIMER_FILL);
	ensurePrisonTimer(INFRACTION_TIMER_BASE);
	ensurePrisonTimer(INFRACTION_TIMER_FILL);
}

function prisonBarPair(label: string | null): {
	base: string;
	fill: string;
} | null {
	if (label === "Yard Time") return { base: YARD_TIMER_BASE, fill: YARD_TIMER_FILL };
	if (label === "Lock Down") return { base: LOCK_TIMER_BASE, fill: LOCK_TIMER_FILL };
	if (label === "Infraction") return { base: INFRACTION_TIMER_BASE, fill: INFRACTION_TIMER_FILL };
	return null;
}

function timerFillRed() {
	const img = artImage("timerFill");
	if (!img) return null;
	const id = `${img.naturalWidth}x${img.naturalHeight}`;
	if (fillRed && fillRedId === id) return fillRed;
	const c = document.createElement("canvas");
	c.width = img.naturalWidth;
	c.height = img.naturalHeight;
	const x = c.getContext("2d");
	if (!x) return null;
	x.filter = "hue-rotate(172deg) saturate(1.85)";
	x.drawImage(img, 0, 0);
	x.filter = "none";
	fillRed = c;
	fillRedId = id;
	return c;
}

const CLOUD_LAYERS = [
	{ speed: 0.4, size0: 0.2, size1: 0.36, y0: -0.22, y1: 0.22, n: 2 },
	{ speed: 0.68, size0: 0.28, size1: 0.46, y0: 0.22, y1: 0.52, n: 2 },
	{ speed: 1, size0: 0.44, size1: 0.68, y0: 0.9, y1: 1.14, n: 2 },
];

type SkyInst = {
	layer: number;
	kind: number;
	x: number;
	y01: number;
	h01: number;
};

let skyInsts: SkyInst[] | null = null;
let skyShiftPrev = 0;
let skyWorldW = 0;

function pickCloudKind(n: number) {
	const weights = Array.from({ length: n }, (_, i) => (i === 0 ? 0.28 : 1));
	let t = Math.random() * weights.reduce((a, b) => a + b, 0);
	for (let i = 0; i < n; i++) {
		t -= weights[i]!;
		if (t <= 0) return i;
	}
	return n - 1;
}

function rollInst(layer: number, nKind: number): Omit<SkyInst, "x"> {
	const L = CLOUD_LAYERS[layer]!;
	return {
		layer,
		kind: pickCloudKind(nKind),
		y01: L.y0 + Math.random() * (L.y1 - L.y0),
		h01: L.size0 + Math.random() * (L.size1 - L.size0),
	};
}

function cloudSize(img: HTMLImageElement, band: number, h01: number) {
	const dh = band * h01;
	const aspect = img.naturalWidth / Math.max(1, img.naturalHeight);
	return { dw: dh * aspect, dh };
}

function drawSkyClouds(
	ctx: CanvasRenderingContext2D,
	world: World,
	cloudShift: number,
	skyTop: number,
	skyBot: number,
	sx = 1,
	sy = 1,
) {
	const band = skyBot - skyTop;
	if (band < 10) return;
	const imgs = cloudImages();
	if (imgs.length === 0) return;
	const reset = !skyInsts || skyWorldW !== world.w || cloudShift + 80 < skyShiftPrev || skyInsts.some((c) => c.kind >= imgs.length);
	if (reset) {
		skyInsts = [];
		skyWorldW = world.w;
		skyShiftPrev = cloudShift;
		CLOUD_LAYERS.forEach((L, layer) => {
			for (let i = 0; i < L.n; i++) {
				const inst = { ...rollInst(layer, imgs.length), x: 0 };
				const img = imgs[inst.kind] ?? imgs[0]!;
				const { dw } = cloudSize(img, band, inst.h01);
				inst.x = Math.random() * (world.w + dw) - dw * 0.5;
				skyInsts!.push(inst);
			}
		});
	}
	const dx = cloudShift - skyShiftPrev;
	skyShiftPrev = cloudShift;
	ctx.save();
	ctx.imageSmoothingEnabled = false;
	const ordered = skyInsts!.slice().sort((a, b) => a.layer - b.layer);
	for (const inst of ordered) {
		const img = imgs[inst.kind] ?? imgs[0]!;
		let { dw, dh } = cloudSize(img, band, inst.h01);
		inst.x += dx * CLOUD_LAYERS[inst.layer]!.speed;
		if (inst.x > world.w + dw * 0.5) {
			Object.assign(inst, rollInst(inst.layer, imgs.length));
			const next = imgs[inst.kind] ?? imgs[0]!;
			({ dw, dh } = cloudSize(next, band, inst.h01));
			inst.x = -dw * 0.62;
		}
		const drawImg = imgs[inst.kind] ?? imgs[0]!;
		({ dw, dh } = cloudSize(drawImg, band, inst.h01));
		if (Math.abs(sx - 1) > 0.004 || Math.abs(sy - 1) > 0.004) {
			ctx.save();
			ctx.translate(inst.x + dw * 0.5, skyTop + band * inst.y01);
			ctx.scale(sx, sy);
			ctx.drawImage(drawImg, -dw * 0.5, -dh * 0.5, dw, dh);
			ctx.restore();
		} else {
			ctx.drawImage(drawImg, inst.x, skyTop + band * inst.y01 - dh * 0.5, dw, dh);
		}
	}
	ctx.restore();
}

function clipSpray(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	p: number,
	erase: boolean,
) {
	const rows = 14;
	const rh = h / rows;
	ctx.beginPath();
	if (!erase) {
		for (let i = 0; i < rows; i++) {
			const local = Math.max(0, Math.min(1, (p - i / rows) * rows));
			if (local <= 0) continue;
			if (i % 2 === 0) ctx.rect(x, y + i * rh, w * local, rh + 0.8);
			else ctx.rect(x + w * (1 - local), y + i * rh, w * local, rh + 0.8);
		}
	} else {
		for (let i = 0; i < rows; i++) {
			const fromBottom = rows - 1 - i;
			const localE = Math.max(0, Math.min(1, (p - fromBottom / rows) * rows));
			const vis = 1 - localE;
			if (vis <= 0) continue;
			if (i % 2 === 0) ctx.rect(x, y + i * rh, w * vis, rh + 0.8);
			else ctx.rect(x + w * (1 - vis), y + i * rh, w * vis, rh + 0.8);
		}
	}
	ctx.clip();
}

function drawVoid(ctx: CanvasRenderingContext2D, world: World) {
	const { w, h, floorY } = world;
	ctx.fillStyle = "#e8e4db";
	ctx.fillRect(0, 0, w, floorY);
	ctx.fillStyle = "#d2ccc2";
	ctx.fillRect(0, floorY, w, h - floorY);
	ctx.save();
	ctx.strokeStyle = "rgba(40, 44, 50, 0.1)";
	ctx.lineWidth = 1;
	ctx.beginPath();
	const step = 36;
	for (let x = 0; x <= w; x += step) {
		ctx.moveTo(x + 0.5, 0);
		ctx.lineTo(x + 0.5, h);
	}
	for (let y = 0; y <= h; y += step) {
		ctx.moveTo(0, y + 0.5);
		ctx.lineTo(w, y + 0.5);
	}
	ctx.stroke();
	ctx.beginPath();
	ctx.strokeStyle = "rgba(40, 44, 50, 0.35)";
	ctx.lineWidth = 2;
	ctx.moveTo(0, floorY);
	ctx.lineTo(w, floorY);
	ctx.stroke();
	ctx.restore();
}

function drawWall(
	ctx: CanvasRenderingContext2D,
	world: World,
	time = 0,
	cloudSx = 1,
	cloudSy = 1,
	graf: { show: GrafKey | null; incoming: { key: GrafKey; p: number } | null } | null = null,
	drawClouds = true,
) {
	const { w, floorY } = world;
	ctx.fillStyle = "#6a7380";
	ctx.fillRect(0, 0, w, floorY);
	const img = artImage("wall");
	if (img) {
		ctx.save();
		ctx.beginPath();
		ctx.rect(0, 0, w, floorY);
		ctx.clip();
		const layout = wallLayout(world, img);
		// Sky fills behind the full wall quad so PNG alpha (open sky + glass) shows through.
		const behind = {
			...layout,
			skyTop: 0,
			skyBot: Math.max(layout.skyBot, layout.oy + layout.dh),
		};
		const skyH = behind.skyBot - behind.skyTop;
		const sky = ensureSkyLayer(world, behind);
		if (sky && skyH > 1) ctx.drawImage(sky, 0, behind.skyTop, w, skyH);
		// Drift clouds through the open sky + tower window band (opaque masonry covers the rest).
		const cloudBot = Math.max(layout.skyBot, layout.oy + layout.dh * 0.32);
		if (drawClouds) drawSkyClouds(ctx, world, time, layout.skyTop, cloudBot, cloudSx, cloudSy);
		const wall = ensureWallLayer(world, layout, graf?.show ?? null);
		if (wall) ctx.drawImage(wall, 0, 0, w, floorY);
		else {
			ctx.imageSmoothingEnabled = true;
			ctx.imageSmoothingQuality = "medium";
			ctx.drawImage(img, 0, 0, layout.sw, layout.sh, layout.ox, layout.oy, layout.dw, layout.dh);
		}
		if (graf?.incoming) {
			const spray = graffitiImage(graf.incoming.key);
			if (spray) {
				const g = graffitiLayout(world);
				ctx.save();
				clipSpray(ctx, g.ox, g.oy, g.dw, g.dh, graf.incoming.p, false);
				const gsw = spray.naturalWidth;
				const gsh = spray.naturalHeight * 0.962;
				ctx.drawImage(spray, 0, 0, gsw, gsh, g.ox, g.oy, g.dw, g.dh);
				ctx.restore();
			}
		}
		ctx.restore();
		return;
	}
	ctx.fillStyle = "#2f6a4a";
	ctx.fillRect(0, Math.max(0, floorY * 0.28), w, floorY);
}
function drawCourt(ctx: CanvasRenderingContext2D, world: World) {
	const { w, h, floorY } = world;
	const depth = h - floorY;
	ctx.fillStyle = "#7d8b94";
	ctx.fillRect(0, floorY, w, depth);
	const cached = ensureCourtLayer(world);
	if (cached) {
		ctx.drawImage(cached, 0, floorY, w, depth);
	} else {
		const img = artImage("court");
		ctx.save();
		ctx.beginPath();
		ctx.rect(0, floorY, w, depth);
		ctx.clip();
		if (img) {
			ctx.imageSmoothingEnabled = true;
			ctx.imageSmoothingQuality = "medium";
			ctx.drawImage(img, 0, floorY, w, depth);
		}
		ctx.restore();
	}
	ctx.fillStyle = "rgba(28, 32, 38, 0.42)";
	ctx.fillRect(0, floorY, w, 2);
}

function drawCourtLines(
	ctx: CanvasRenderingContext2D,
	dx: number,
	dy: number,
	dw: number,
	dh: number,
) {
	const map = (u: number, v: number) => ({ x: dx + u * dw, y: dy + v * dh, v });
	const widthAt = (v: number) => dh * (0.038 + 0.1 * Math.max(0, Math.min(1, v)) ** 1.35);
	const fillRibbon = (pts: { x: number; y: number; v: number }[], closed: boolean) => {
		const n = pts.length;
		if (n < 2) return;
		const L: { x: number; y: number }[] = [];
		const R: { x: number; y: number }[] = [];
		for (let i = 0; i < n; i++) {
			const b = pts[i]!;
			const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)]!;
			const c = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)]!;
			let tx = c.x - a.x;
			let ty = c.y - a.y;
			if (!closed && i === 0) {
				tx = c.x - b.x;
				ty = c.y - b.y;
			} else if (!closed && i === n - 1) {
				tx = b.x - a.x;
				ty = b.y - a.y;
			}
			const len = Math.hypot(tx, ty) || 1;
			const nx = -ty / len;
			const ny = tx / len;
			const half = widthAt(b.v) * 0.5;
			L.push({ x: b.x + nx * half, y: b.y + ny * half });
			R.push({ x: b.x - nx * half, y: b.y - ny * half });
		}
		ctx.beginPath();
		ctx.moveTo(L[0]!.x, L[0]!.y);
		for (let i = 1; i < n; i++) ctx.lineTo(L[i]!.x, L[i]!.y);
		for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i]!.x, R[i]!.y);
		ctx.closePath();
		ctx.fill();
	};
	ctx.save();
	ctx.fillStyle = "#f4f6f8";
	for (const v of [0.055, 0.175, 0.455, 0.605, 0.965]) {
		fillRibbon([map(-0.04, v), map(0.5, v), map(1.04, v)], false);
	}
	const ellipse = (cx: number, cy: number, rx: number, ry: number) => {
		const pts: { x: number; y: number; v: number }[] = [];
		const segs = 72;
		for (let i = 0; i < segs; i++) {
			const t = (i / segs) * Math.PI * 2;
			const u = cx + Math.cos(t) * rx;
			const v = cy + Math.sin(t) * ry;
			pts.push(map(u, v));
		}
		fillRibbon(pts, true);
	};
	ellipse(0.5, 0.5, 0.498, 0.385);
	ellipse(0.5, 0.455, 0.3, 0.25);
	ctx.restore();
}

function doodleSpeckle(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, count: number) {
	ctx.save();
	ctx.fillStyle = color;
	for (let i = 0; i < count; i++) {
		const px = x + (i * 131 + 17) % 997 / 997 * w;
		const py = y + (i * 179 + 31) % 991 / 991 * h;
		const s = 1 + i % 3;
		ctx.globalAlpha = .045 + i % 5 * .012;
		ctx.fillRect(px, py, s * 4, s);
	}
	ctx.restore();
}
function boardGeom(hoop: Hoop, world: World) {
  const visW = Math.max(10, world.w * 0.052 * (2 / 3));
  const gap = Math.max(10, hoop.inner * 0.48);
  const innerEdge =
    hoop.side < 0 ? hoop.x - hoop.inner - gap : hoop.x + hoop.inner + gap;
  const topLen = world.h * 0.182;
  const visY = hoop.y - topLen;
  const armH = Math.max(10, hoop.tube * 2.1);
  const armTop = hoop.y - armH * 0.42;
  const boardBotY = hoop.y + armH * 0.62;
  const above = Math.max(8, armH * 0.55);
  const below = Math.max(5, armH * 0.28);
  const padY = armTop - above;
  const padH = boardBotY + below - padY;
  const bh = padY + padH - visY;
  return {
    bh,
    visW,
    visX: hoop.side < 0 ? innerEdge - visW : innerEdge,
    visY,
    innerEdge,
    gap,
    padH,
    padY,
    topLen,
    armH,
    armTop,
    boardBotY,
  };
}
export { boardGeom };

/** Support brace + wall bar — matches drawBackboard geometry for collision. */
export function braceColliders(hoop: Hoop, world: World) {
  const g = boardGeom(hoop, world);
  const left = hoop.side < 0;
  const boardBack = left ? g.visX : g.visX + g.visW;
  const wallX = left ? -Math.max(90, world.w * 0.42) : world.w + Math.max(90, world.w * 0.42);
  const halfW = Math.max(3.6, g.visW * 0.42) * 0.5;
  const braceY = g.visY + g.bh * 0.14;
  return [
    { x0: boardBack, y0: braceY, x1: wallX, y1: braceY, halfW },
    { x0: boardBack, y0: hoop.y + 2, x1: wallX, y1: hoop.y + g.padH * 0.85, halfW },
  ] as const;
}

function bracePivot(hoop: Hoop, world: World) {
  const g = boardGeom(hoop, world);
  const left = hoop.side < 0;
  const boardBack = left ? g.visX : g.visX + g.visW;
  const wallX = left ? -Math.max(90, world.w * 0.42) : world.w + Math.max(90, world.w * 0.42);
  const x0 = boardBack;
  const y0 = hoop.y + 2;
  const x1 = wallX;
  const y1 = hoop.y + g.padH * 0.85;
  const edge = left ? 0 : world.w;
  const dx = x1 - x0;
  const t = Math.abs(dx) < 0.0001 ? 0 : (edge - x0) / dx;
  return { x: edge, y: y0 + (y1 - y0) * t };
}
function drawBackboard(ctx: CanvasRenderingContext2D, hoop: Hoop, world: World, _time: number, _combo: number) {
  const ch = boardHeat(hoop);
  const fr = hoop.frostLeft > 0 ? Math.min(0.92, 0.4 + hoop.frost * 0.16) : 0;
  const { bh, visW, visX, visY, padH, padY, armH, armTop, boardBotY } = boardGeom(hoop, world);
  const yy = visY + (ch > 0.4 ? (ch - 0.4) * 10 : 0);
  const padDrawY = padY + (ch > 0.4 ? (ch - 0.4) * 10 : 0);
  const left = hoop.side < 0;
  const boardFace = left ? visX + visW : visX;
  const boardBack = left ? visX : visX + visW;
  const steel = mixHex("#1e242c", "#3a3632", ch);
  const steelHi = mixHex("#3a4450", "#4a443e", ch);

  const braceW = Math.max(3.6, visW * 0.42);
  const wallX = left ? -Math.max(90, world.w * 0.42) : world.w + Math.max(90, world.w * 0.42);
  const braceY = yy + bh * 0.14;
  const barLeft = Math.min(boardBack, wallX);
  const barW = Math.abs(wallX - boardBack);
  ctx.fillStyle = steel;
  ctx.fillRect(barLeft, braceY - braceW * 0.5, barW, braceW);
  ctx.fillStyle = steelHi;
  ctx.fillRect(barLeft, braceY - braceW * 0.5, barW, Math.max(1.4, braceW * 0.35));
  const drawBrace = (x0: number, y0: number, x1: number, y1: number) => {
    const dx = x1 - x0;
    const dyb = y1 - y0;
    const len = Math.hypot(dx, dyb) || 1;
    const nx = (-dyb / len) * (braceW * 0.5);
    const ny = (dx / len) * (braceW * 0.5);
    ctx.beginPath();
    ctx.moveTo(x0 + nx, y0 + ny);
    ctx.lineTo(x1 + nx, y1 + ny);
    ctx.lineTo(x1 - nx, y1 - ny);
    ctx.lineTo(x0 - nx, y0 - ny);
    ctx.closePath();
    ctx.fillStyle = steel;
    ctx.fill();
    ctx.fillStyle = steelHi;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1 + nx * 0.15, y1 + ny * 0.15);
    ctx.lineTo(x1 - nx * 0.35, y1 - ny * 0.35);
    ctx.closePath();
    ctx.fill();
  };
  drawBrace(
    boardBack,
    hoop.y + 2,
    wallX,
    hoop.y + padH * 0.85,
  );

  const boardBase = mixHex("#ffffff", "#3a3632", Math.min(1, ch * 1.12));
  const board = fr > 0 ? mixHex(rgbToHex(boardBase), "#7ec8ff", fr) : boardBase;
  ctx.fillStyle = board;
  ctx.fillRect(visX, yy, visW, Math.max(1, padDrawY - yy));
  const scene = getScene();
  const greenBase = mixHex(scene.hoop.pad, "#3a3632", Math.min(1, ch * 1.05));
  const greenHiBase = mixHex(scene.hoop.padHi, "#4a423c", Math.min(1, ch * 1.05));
  const greenLoBase = mixHex(scene.hoop.padLo, "#2a2624", Math.min(1, ch * 1.05));
  const green = fr > 0 ? mixHex(rgbToHex(greenBase), "#5aa8e8", fr * 0.7) : greenBase;
  const greenHi = fr > 0 ? mixHex(rgbToHex(greenHiBase), "#9ad4ff", fr * 0.65) : greenHiBase;
  const greenLo = fr > 0 ? mixHex(rgbToHex(greenLoBase), "#3a7ab0", fr * 0.7) : greenLoBase;
  ctx.fillStyle = green;
  ctx.fillRect(visX - 0.5, padDrawY, visW + 1, padH);
  ctx.fillStyle = greenHi;
  ctx.fillRect(visX - 0.5, padDrawY, visW + 1, Math.max(1.6, padH * 0.16));
  ctx.fillStyle = greenLo;
  ctx.fillRect(visX - 0.5, padDrawY + padH - 2, visW + 1, 2);

  const orangeBase = mixHex(scene.hoop.rim, "#4a4038", ch);
  const orangeHiBase = mixHex(scene.hoop.rimHi, "#6a625c", ch);
  const orangeLoBase = mixHex(scene.hoop.rimLo, "#3a3632", ch);
  const orange = fr > 0 ? mixHex(rgbToHex(orangeBase), "#6eb0e8", fr * 0.85) : orangeBase;
  const orangeHi = fr > 0 ? mixHex(rgbToHex(orangeHiBase), "#a8d8ff", fr * 0.8) : orangeHiBase;
  const orangeLo = fr > 0 ? mixHex(rgbToHex(orangeLoBase), "#3a6a98", fr * 0.85) : orangeLoBase;
  const attach = left ? hoop.x - hoop.inner * 1.02 : hoop.x + hoop.inner * 1.02;
  const rimBotY = hoop.y + armH * 0.38;
  const dy = ch > 0.4 ? (ch - 0.4) * 10 : 0;
  ctx.beginPath();
  ctx.moveTo(boardFace, armTop + dy);
  ctx.lineTo(attach, armTop + dy);
  ctx.lineTo(attach, rimBotY + dy);
  ctx.lineTo(boardFace, boardBotY + dy);
  ctx.closePath();
  ctx.fillStyle = orange;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(boardFace, armTop + dy);
  ctx.lineTo(attach, armTop + dy);
  ctx.lineTo(attach, armTop + dy + Math.max(2.2, hoop.tube * 0.4));
  ctx.lineTo(boardFace, armTop + dy + Math.max(2.2, hoop.tube * 0.4));
  ctx.closePath();
  ctx.fillStyle = orangeHi;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(boardFace, boardBotY + dy - 2);
  ctx.lineTo(attach, rimBotY + dy - 1.4);
  ctx.lineTo(attach, rimBotY + dy);
  ctx.lineTo(boardFace, boardBotY + dy);
  ctx.closePath();
  ctx.fillStyle = orangeLo;
  ctx.fill();

  if (ch > 0.04 && ch < 0.62) {
    ctx.fillStyle = `rgba(255, 110, 24, ${(0.62 - ch) * 0.42})`;
    ctx.fillRect(visX, yy, visW, Math.max(0, padDrawY - yy));
  }
  if (ch > 0.5) {
    ctx.fillStyle = `rgba(40,38,36,${(ch - 0.5) * 0.55})`;
    for (let i = 0; i < 5; i++)
      ctx.fillRect(
        visX + ((i * 37) % Math.max(4, visW - 4)),
        yy + 8 + ((i * 53) % Math.max(8, padDrawY - yy - 16)),
        2.2,
        5 + (i % 3),
      );
  }
}
function drawRim(ctx: CanvasRenderingContext2D, hoop: Hoop, part: "back" | "front", combo: number) {
	const { x, y, inner, tube } = hoop;
	const ch = hoopHeat(hoop, combo);
	const fr = hoop.frostLeft > 0 ? Math.min(0.9, 0.45 + hoop.frost * 0.14) : 0;
	const rx = inner;
	const ry = inner * RIM_RY;
	const tw = Math.max(3.2, tube * 1.18);
	const look = getScene().hoop;
	ctx.save();
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	if (part === "back") {
		ctx.lineWidth = tw;
		const rimBack = mixHex(look.rimBack, "#4a4038", ch);
		ctx.strokeStyle = fr > 0 ? mixHex(rgbToHex(rimBack), "#7ec8ff", fr) : rimBack;
		ctx.beginPath();
		ctx.ellipse(x, y, rx, ry, 0, Math.PI, Math.PI * 2);
		ctx.stroke();
	} else {
		ctx.lineWidth = tw;
		if (gecko) {
			const rimG = mixHex(look.rimHi, "#6a625c", ch);
			ctx.strokeStyle = fr > 0 ? mixHex(rgbToHex(rimG), "#9ad4ff", fr) : rimG;
		} else {
			const metal = ctx.createLinearGradient(x - rx, y, x + rx, y + ry);
			const c0 = mixHex(look.rimLo, "#4a4038", ch);
			const c1 = mixHex(look.rimHi, "#8a8078", ch);
			const c2 = mixHex(look.rim, "#6a625c", ch);
			const c3 = mixHex(look.rimBack, "#3a3632", ch);
			metal.addColorStop(0, fr > 0 ? mixHex(rgbToHex(c0), "#5a9ad0", fr) : c0);
			metal.addColorStop(.32, fr > 0 ? mixHex(rgbToHex(c1), "#b8e0ff", fr) : c1);
			metal.addColorStop(.62, fr > 0 ? mixHex(rgbToHex(c2), "#7ec8ff", fr) : c2);
			metal.addColorStop(1, fr > 0 ? mixHex(rgbToHex(c3), "#3a6a98", fr) : c3);
			ctx.strokeStyle = metal;
		}
		ctx.beginPath();
		ctx.ellipse(x, y, rx, ry, 0, -.12, Math.PI + .12, false);
		ctx.stroke();
	}
	ctx.restore();
}
function drawNet(ctx: CanvasRenderingContext2D, hoop: Hoop, layer: "back" | "front", ball: Ball | null, combo: number) {
	if (hoop.net.length === 0) return;
	const ch = hoop.char;
	if (ch >= .98) return;
	const points = [];
	for (let y = 0; y < 6; y++) {
		const row = [];
		for (let x = 0; x < 9; x++) row.push(netRowReleased(ch, y) ? void 0 : netNode(hoop, y, x));
		points.push(row);
	}
	const heat = hoopHeat(hoop, combo);
	const look = getScene().hoop;
	ctx.save();
	ctx.lineCap = "butt";
	ctx.lineJoin = "miter";
	for (let y = 0; y < 6; y++) {
		const burn = netRowBurn(ch, y);
		if (burn >= 1) continue;
		const fade = burn > 0 ? Math.max(.08, 1 - burn) : 1;
		const lower = y >= look.netHemFromRow;
		const white = mixHex(look.net, look.netChar, Math.min(1, Math.max(heat, ch, burn) * 1.08));
		const hem = mixHex(look.netHem, look.netHemChar, Math.min(1, Math.max(heat, ch, burn) * 1.08));
		ctx.strokeStyle = lower ? hem : white;
		ctx.globalAlpha = (ch > .5 ? Math.max(.12, 1 - (ch - .5) / .5) : 1) * fade;
		ctx.lineWidth = 1.2;
		ctx.beginPath();
		for (let x = 0; x < 9; x++) {
			const p = points[y][x];
			if (!p) continue;
			const add = (
				p2: NonNullable<ReturnType<typeof netNode>>,
				c0: number,
				c1: number,
			) => {
				const aFront = netNodeInFront(p, ball, c0, hoop);
				const bFront = netNodeInFront(p2, ball, c1, hoop);
				const frontEdge = aFront && bFront;
				if (layer === "front") {
					if (!frontEdge) return;
				} else if (frontEdge) return;
				if (Math.abs(p2.y - p.y) < .7) return;
				ctx.moveTo(p.x, p.y);
				ctx.lineTo(p2.x, p2.y);
			};
			if (y + 1 < 6 && points[y + 1]![x]) add(points[y + 1]![x]!, x, x);
			const x2 = (x + 1) % 9;
			if (y + 1 < 6 && points[y + 1]![x2]) add(points[y + 1]![x2]!, x, x2);
		}
		ctx.stroke();
	}
	ctx.restore();
}
function drawGroundShadow(ctx: CanvasRenderingContext2D, ball: Ball, world: World) {
	const lift = Math.max(0, world.floorY - (ball.y + ball.r));
	const t = Math.max(.12, Math.min(1, 1 - lift / (world.h * .62)));
	const sy = world.floorY + 4;
	ctx.save();
	ctx.fillStyle = `rgba(6, 10, 18, ${.16 + .5 * t * t})`;
	ctx.beginPath();
	ctx.ellipse(ball.x, sy, ball.r * (0.55 + 0.45 * t), ball.r * (0.12 + 0.14 * t), 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}
function drawGlassBall(ctx: CanvasRenderingContext2D, ball: Ball) {
	const { x, y, r, squash } = ball;
	ctx.save();
	ctx.translate(x, y + (squash < 1 ? r * (1 - squash) : 0));
	ctx.scale(1 / squash, squash);
	ctx.beginPath();
	ctx.arc(0, 0, r, 0, Math.PI * 2);
	ctx.clip();
	const body = ctx.createRadialGradient(-r * 0.22, -r * 0.3, r * 0.06, r * 0.08, r * 0.16, r);
	body.addColorStop(0, "rgba(245, 252, 255, 0.72)");
	body.addColorStop(0.28, "rgba(170, 214, 230, 0.32)");
	body.addColorStop(0.7, "rgba(90, 150, 175, 0.28)");
	body.addColorStop(1, "rgba(36, 78, 96, 0.5)");
	ctx.fillStyle = body;
	ctx.fillRect(-r - 1, -r - 1, r * 2 + 2, r * 2 + 2);
	const rim = ctx.createRadialGradient(0, 0, r * 0.72, 0, 0, r);
	rim.addColorStop(0, "rgba(255,255,255,0)");
	rim.addColorStop(0.65, "rgba(220, 240, 250, 0.08)");
	rim.addColorStop(1, "rgba(20, 50, 70, 0.42)");
	ctx.fillStyle = rim;
	ctx.beginPath();
	ctx.arc(0, 0, r, 0, Math.PI * 2);
	ctx.fill();
	const spec = ctx.createRadialGradient(-r * 0.34, -r * 0.42, 0, -r * 0.28, -r * 0.34, r * 0.48);
	spec.addColorStop(0, "rgba(255, 255, 255, 0.9)");
	spec.addColorStop(0.16, "rgba(255, 255, 255, 0.35)");
	spec.addColorStop(0.42, "rgba(180, 220, 240, 0.08)");
	spec.addColorStop(1, "rgba(255, 255, 255, 0)");
	ctx.fillStyle = spec;
	ctx.beginPath();
	ctx.arc(0, 0, r, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
	ctx.save();
	ctx.strokeStyle = "rgba(210, 235, 245, 0.55)";
	ctx.lineWidth = Math.max(1.2, r * 0.06);
	ctx.beginPath();
	ctx.arc(x, y, r - 0.6, 0, Math.PI * 2);
	ctx.stroke();
	ctx.restore();
}

function drawPrisonBall(ctx: CanvasRenderingContext2D, ball: Ball, lit: boolean) {
	const { x, y, r, spin, squash } = ball;
	ctx.save();
	ctx.translate(x, y + (squash < 1 ? r * (1 - squash) : 0));
	ctx.scale(1 / squash, squash);
	ctx.beginPath();
	ctx.arc(0, 0, r, 0, Math.PI * 2);
	ctx.clip();

	ctx.save();
	ctx.rotate(spin);
	const stripes = 10;
	for (let i = 0; i < stripes; i++) {
		const t0 = (i / stripes) * Math.PI * 2 - Math.PI;
		const t1 = ((i + 1) / stripes) * Math.PI * 2 - Math.PI;
		ctx.beginPath();
		ctx.moveTo(0, 0);
		ctx.arc(0, 0, r + 1, t0, t1);
		ctx.closePath();
		ctx.fillStyle = i % 2 === 0 ? "#f2f2f0" : "#141618";
		ctx.fill();
	}
	ctx.strokeStyle = "rgba(0,0,0,0.35)";
	ctx.lineWidth = Math.max(1, r * 0.045);
	ctx.beginPath();
	ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
	ctx.stroke();
	ctx.beginPath();
	ctx.moveTo(-r, 0);
	ctx.lineTo(r, 0);
	ctx.moveTo(0, -r);
	ctx.lineTo(0, r);
	ctx.stroke();
	ctx.restore();

	// Hannibal-style muzzle stays camera-facing
	const mw = r * 1.05;
	const mh = r * 0.78;
	const my = r * 0.06;
	ctx.fillStyle = "#5a4030";
	ctx.beginPath();
	ctx.moveTo(-mw * 0.48, my - mh * 0.2);
	ctx.lineTo(mw * 0.48, my - mh * 0.2);
	ctx.lineTo(mw * 0.42, my + mh * 0.48);
	ctx.quadraticCurveTo(0, my + mh * 0.62, -mw * 0.42, my + mh * 0.48);
	ctx.closePath();
	ctx.fill();
	ctx.strokeStyle = "#2a1c14";
	ctx.lineWidth = Math.max(1.2, r * 0.05);
	ctx.stroke();

	ctx.fillStyle = "#3d2a1e";
	ctx.fillRect(-mw * 0.34, my - mh * 0.08, mw * 0.68, mh * 0.42);
	ctx.strokeStyle = "#1c120c";
	ctx.strokeRect(-mw * 0.34, my - mh * 0.08, mw * 0.68, mh * 0.42);

	const bars = 5;
	for (let i = 0; i < bars; i++) {
		const bx = -mw * 0.28 + (i / (bars - 1)) * mw * 0.56;
		ctx.strokeStyle = "#c5ccd4";
		ctx.lineWidth = Math.max(1.4, r * 0.055);
		ctx.beginPath();
		ctx.moveTo(bx, my - mh * 0.02);
		ctx.lineTo(bx, my + mh * 0.3);
		ctx.stroke();
		ctx.strokeStyle = "rgba(255,255,255,0.35)";
		ctx.lineWidth = Math.max(0.6, r * 0.02);
		ctx.beginPath();
		ctx.moveTo(bx - r * 0.015, my);
		ctx.lineTo(bx - r * 0.015, my + mh * 0.26);
		ctx.stroke();
	}

	ctx.strokeStyle = "#6b4a36";
	ctx.lineWidth = Math.max(1.5, r * 0.06);
	ctx.beginPath();
	ctx.moveTo(-mw * 0.5, my - mh * 0.05);
	ctx.quadraticCurveTo(-r * 0.95, -r * 0.15, -r * 0.72, -r * 0.55);
	ctx.moveTo(mw * 0.5, my - mh * 0.05);
	ctx.quadraticCurveTo(r * 0.95, -r * 0.15, r * 0.72, -r * 0.55);
	ctx.stroke();

	for (const sx of [-mw * 0.4, mw * 0.4]) {
		ctx.fillStyle = "#9aa3ad";
		ctx.beginPath();
		ctx.arc(sx, my - mh * 0.12, r * 0.07, 0, Math.PI * 2);
		ctx.fill();
	}

	if (lit) {
		const shade = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r);
		shade.addColorStop(0, "rgba(0,0,0,0)");
		shade.addColorStop(1, "rgba(0,0,0,0.38)");
		ctx.fillStyle = shade;
		ctx.beginPath();
		ctx.arc(0, 0, r, 0, Math.PI * 2);
		ctx.fill();
		const spec = ctx.createRadialGradient(-r * 0.3, -r * 0.4, 0, -r * 0.2, -r * 0.3, r * 0.5);
		spec.addColorStop(0, "rgba(255,255,255,0.28)");
		spec.addColorStop(1, "rgba(255,255,255,0)");
		ctx.fillStyle = spec;
		ctx.beginPath();
		ctx.arc(0, 0, r, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.restore();
}

function drawNinjaBall(
	ctx: CanvasRenderingContext2D,
	ball: Ball,
	lit: boolean,
	alpha = 1,
	tone: "purple" | "gray" = "purple",
) {
	const { x, y, r, spin, squash } = ball;
	const gray = tone === "gray";
	ctx.save();
	ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
	ctx.translate(x, y + (squash < 1 ? r * (1 - squash) : 0));
	ctx.scale(1 / squash, squash);
	ctx.beginPath();
	ctx.arc(0, 0, r, 0, Math.PI * 2);
	ctx.clip();
	ctx.save();
	ctx.rotate(spin);
	const skin = ctx.createRadialGradient(-r * 0.28, -r * 0.34, r * 0.08, r * 0.12, r * 0.18, r * 1.08);
	if (gray) {
		skin.addColorStop(0, "#d4d4d8");
		skin.addColorStop(0.4, "#9a9aa2");
		skin.addColorStop(1, "#4a4a52");
	} else {
		skin.addColorStop(0, "#c9b6ff");
		skin.addColorStop(0.4, "#7c4dff");
		skin.addColorStop(1, "#3b1a9e");
	}
	ctx.fillStyle = skin;
	ctx.fillRect(-r - 1, -r - 1, r * 2 + 2, r * 2 + 2);
	ctx.strokeStyle = gray ? "rgba(24,24,28,0.55)" : "rgba(20,8,48,0.55)";
	ctx.lineWidth = Math.max(1.2, r * 0.06);
	ctx.beginPath();
	ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
	ctx.stroke();
	ctx.beginPath();
	ctx.moveTo(-r, 0);
	ctx.lineTo(r, 0);
	ctx.moveTo(0, -r);
	ctx.lineTo(0, r);
	ctx.stroke();
	ctx.restore();
	if (lit) {
		const shade = ctx.createRadialGradient(0, 0, r * 0.48, 0, 0, r);
		shade.addColorStop(0, "rgba(0,0,0,0)");
		shade.addColorStop(1, gray ? "rgba(12,12,16,0.42)" : "rgba(20,8,50,0.4)");
		ctx.fillStyle = shade;
		ctx.beginPath();
		ctx.arc(0, 0, r, 0, Math.PI * 2);
		ctx.fill();
		const spec = ctx.createRadialGradient(-r * 0.3, -r * 0.38, 0, -r * 0.2, -r * 0.28, r * 0.48);
		spec.addColorStop(0, "rgba(255,255,255,0.4)");
		spec.addColorStop(1, "rgba(255,255,255,0)");
		ctx.fillStyle = spec;
		ctx.beginPath();
		ctx.arc(0, 0, r, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.restore();
}

function drawFrostVeil(ctx: CanvasRenderingContext2D, hoop: Hoop, world: World) {
	const g = boardGeom(hoop, world);
	const a = Math.min(0.42, 0.18 + hoop.frost * 0.07);
	ctx.save();
	ctx.fillStyle = `rgba(120, 190, 255, ${a})`;
	ctx.fillRect(g.visX - 1, g.visY - 2, g.visW + 2, g.padY + g.padH - g.visY + 6);
	const glow = ctx.createRadialGradient(hoop.x, hoop.y, hoop.inner * 0.2, hoop.x, hoop.y, hoop.inner * 2.2);
	glow.addColorStop(0, `rgba(180, 220, 255, ${a * 0.55})`);
	glow.addColorStop(1, "rgba(120, 190, 255, 0)");
	ctx.fillStyle = glow;
	ctx.beginPath();
	ctx.arc(hoop.x, hoop.y, hoop.inner * 2.2, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

function drawIceBall(ctx: CanvasRenderingContext2D, ball: Ball, lit: boolean) {
	const { x, y, r, spin, squash } = ball;
	ctx.save();
	ctx.translate(x, y + (squash < 1 ? r * (1 - squash) : 0));
	ctx.scale(1 / squash, squash);
	ctx.beginPath();
	ctx.arc(0, 0, r, 0, Math.PI * 2);
	ctx.clip();
	ctx.save();
	ctx.rotate(spin);
	const skin = ctx.createRadialGradient(-r * 0.28, -r * 0.34, r * 0.08, r * 0.12, r * 0.18, r * 1.08);
	skin.addColorStop(0, "#e8f6ff");
	skin.addColorStop(0.4, "#7ec8ff");
	skin.addColorStop(1, "#2a6a9e");
	ctx.fillStyle = skin;
	ctx.fillRect(-r - 1, -r - 1, r * 2 + 2, r * 2 + 2);
	ctx.strokeStyle = "rgba(20, 50, 80, 0.45)";
	ctx.lineWidth = Math.max(1.2, r * 0.06);
	ctx.beginPath();
	ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
	ctx.stroke();
	ctx.beginPath();
	ctx.moveTo(-r, 0);
	ctx.lineTo(r, 0);
	ctx.moveTo(0, -r);
	ctx.lineTo(0, r);
	ctx.stroke();
	ctx.restore();
	if (lit) {
		const shade = ctx.createRadialGradient(0, 0, r * 0.48, 0, 0, r);
		shade.addColorStop(0, "rgba(0,0,0,0)");
		shade.addColorStop(1, "rgba(10, 40, 70, 0.38)");
		ctx.fillStyle = shade;
		ctx.beginPath();
		ctx.arc(0, 0, r, 0, Math.PI * 2);
		ctx.fill();
		const spec = ctx.createRadialGradient(-r * 0.3, -r * 0.38, 0, -r * 0.2, -r * 0.28, r * 0.48);
		spec.addColorStop(0, "rgba(255,255,255,0.55)");
		spec.addColorStop(1, "rgba(255,255,255,0)");
		ctx.fillStyle = spec;
		ctx.beginPath();
		ctx.arc(0, 0, r, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.restore();
}

function drawChampBall(ctx: CanvasRenderingContext2D, ball: Ball, lit: boolean) {
	const { x, y, r, spin, squash } = ball;
	ctx.save();
	ctx.translate(x, y + (squash < 1 ? r * (1 - squash) : 0));
	ctx.scale(1 / squash, squash);
	ctx.beginPath();
	ctx.arc(0, 0, r, 0, Math.PI * 2);
	ctx.clip();
	ctx.save();
	ctx.rotate(spin);
	ctx.fillStyle = "#c62828";
	ctx.fillRect(-r - 1, -r - 1, r + 1, r * 2 + 2);
	ctx.fillStyle = "#1565c0";
	ctx.fillRect(0, -r - 1, r + 1, r * 2 + 2);
	const seam = ctx.createRadialGradient(-r * 0.2, -r * 0.28, r * 0.1, 0, 0, r * 1.05);
	seam.addColorStop(0, "rgba(255,255,255,0.22)");
	seam.addColorStop(0.55, "rgba(0,0,0,0)");
	seam.addColorStop(1, "rgba(0,0,0,0.28)");
	ctx.fillStyle = seam;
	ctx.fillRect(-r - 1, -r - 1, r * 2 + 2, r * 2 + 2);
	ctx.strokeStyle = "rgba(255, 236, 180, 0.85)";
	ctx.lineWidth = Math.max(1.4, r * 0.07);
	ctx.beginPath();
	ctx.moveTo(0, -r);
	ctx.lineTo(0, r);
	ctx.stroke();
	ctx.beginPath();
	ctx.arc(0, 0, r * 0.55, -Math.PI * 0.55, Math.PI * 0.55);
	ctx.stroke();
	ctx.beginPath();
	ctx.arc(0, 0, r * 0.55, Math.PI * 0.45, Math.PI * 1.55);
	ctx.stroke();
	ctx.restore();
	if (lit) {
		const shade = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r);
		shade.addColorStop(0, "rgba(0,0,0,0)");
		shade.addColorStop(1, "rgba(8, 12, 28, 0.42)");
		ctx.fillStyle = shade;
		ctx.beginPath();
		ctx.arc(0, 0, r, 0, Math.PI * 2);
		ctx.fill();
		const spec = ctx.createRadialGradient(-r * 0.32, -r * 0.4, 0, -r * 0.22, -r * 0.3, r * 0.5);
		spec.addColorStop(0, "rgba(255,255,255,0.55)");
		spec.addColorStop(1, "rgba(255,255,255,0)");
		ctx.fillStyle = spec;
		ctx.beginPath();
		ctx.arc(0, 0, r, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.restore();
}

function drawAntiBall(ctx: CanvasRenderingContext2D, ball: Ball, lit: boolean, time = 0) {
	const { x, y, r, spin, squash } = ball;
	ctx.save();
	ctx.translate(x, y + (squash < 1 ? r * (1 - squash) : 0));
	ctx.scale(1 / squash, squash);
	ctx.beginPath();
	ctx.arc(0, 0, r, 0, Math.PI * 2);
	ctx.clip();
	ctx.save();
	ctx.rotate(spin);
	const skin = ctx.createRadialGradient(-r * 0.25, -r * 0.3, r * 0.06, r * 0.1, r * 0.15, r * 1.1);
	skin.addColorStop(0, "#b8f0ff");
	skin.addColorStop(0.35, "#5a7dff");
	skin.addColorStop(0.7, "#2a1a6e");
	skin.addColorStop(1, "#0a0618");
	ctx.fillStyle = skin;
	ctx.fillRect(-r - 1, -r - 1, r * 2 + 2, r * 2 + 2);
	ctx.strokeStyle = "rgba(180, 255, 255, 0.55)";
	ctx.lineWidth = Math.max(1.2, r * 0.06);
	ctx.beginPath();
	ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
	ctx.stroke();
	ctx.beginPath();
	ctx.ellipse(0, 0, r * 0.72, r * 0.28, time * 0.9, 0, Math.PI * 2);
	ctx.stroke();
	ctx.restore();
	if (lit) {
		const shade = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r);
		shade.addColorStop(0, "rgba(0,0,0,0)");
		shade.addColorStop(1, "rgba(4, 2, 20, 0.5)");
		ctx.fillStyle = shade;
		ctx.beginPath();
		ctx.arc(0, 0, r, 0, Math.PI * 2);
		ctx.fill();
		const spec = ctx.createRadialGradient(-r * 0.3, -r * 0.38, 0, -r * 0.2, -r * 0.28, r * 0.45);
		spec.addColorStop(0, "rgba(220, 255, 255, 0.55)");
		spec.addColorStop(1, "rgba(255,255,255,0)");
		ctx.fillStyle = spec;
		ctx.beginPath();
		ctx.arc(0, 0, r, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.restore();
}

function drawAntiMatter(
	ctx: CanvasRenderingContext2D,
	m: { x: number; y: number; r: number; pct: number },
	time: number,
) {
	const { x, y, r, pct } = m;
	ctx.save();
	const pulse = 1 + Math.sin(time * 5.5) * 0.08;
	const rr = r * pulse;
	const glow = ctx.createRadialGradient(x, y, rr * 0.15, x, y, rr * 1.8);
	glow.addColorStop(0, "rgba(200, 120, 255, 0.55)");
	glow.addColorStop(0.5, "rgba(80, 40, 160, 0.28)");
	glow.addColorStop(1, "rgba(0,0,0,0)");
	ctx.fillStyle = glow;
	ctx.beginPath();
	ctx.arc(x, y, rr * 1.8, 0, Math.PI * 2);
	ctx.fill();
	const core = ctx.createRadialGradient(x - rr * 0.2, y - rr * 0.25, 0, x, y, rr);
	core.addColorStop(0, "#f0e6ff");
	core.addColorStop(0.45, "#a56bff");
	core.addColorStop(1, "#2a1058");
	ctx.fillStyle = core;
	ctx.beginPath();
	ctx.arc(x, y, rr, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = "rgba(255,255,255,0.92)";
	ctx.font = `800 ${Math.max(11, Math.floor(rr * 0.85))}px 'Noto Sans SC', sans-serif`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(`${pct}%`, x, y + 0.5);
	ctx.restore();
}

function drawBlackHole(
	ctx: CanvasRenderingContext2D,
	hole: { x: number; y: number; r: number },
	time: number,
) {
	const { x, y, r } = hole;
	ctx.save();
	const glow = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 2.4);
	glow.addColorStop(0, "rgba(40, 20, 80, 0.55)");
	glow.addColorStop(0.45, "rgba(20, 10, 40, 0.28)");
	glow.addColorStop(1, "rgba(0,0,0,0)");
	ctx.fillStyle = glow;
	ctx.beginPath();
	ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
	ctx.fill();
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(time * 0.55);
	ctx.strokeStyle = "rgba(160, 120, 255, 0.55)";
	ctx.lineWidth = Math.max(2, r * 0.12);
	ctx.beginPath();
	ctx.ellipse(0, 0, r * 1.55, r * 0.55, 0, 0, Math.PI * 2);
	ctx.stroke();
	ctx.strokeStyle = "rgba(100, 220, 255, 0.35)";
	ctx.beginPath();
	ctx.ellipse(0, 0, r * 1.25, r * 0.4, 0.7, 0, Math.PI * 2);
	ctx.stroke();
	ctx.restore();
	const core = ctx.createRadialGradient(x, y, 0, x, y, r);
	core.addColorStop(0, "#000000");
	core.addColorStop(0.55, "#0a0614");
	core.addColorStop(0.85, "#1a1040");
	core.addColorStop(1, "rgba(10, 6, 20, 0)");
	ctx.fillStyle = core;
	ctx.beginPath();
	ctx.arc(x, y, r, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

function drawYellowBall(ctx: CanvasRenderingContext2D, ball: Ball, lit: boolean) {
	const { x, y, r, squash } = ball;
	ctx.save();
	ctx.translate(x, y + (squash < 1 ? r * (1 - squash) : 0));
	ctx.scale(1 / squash, squash);
	const skin = ctx.createRadialGradient(-r * 0.28, -r * 0.32, r * 0.06, r * 0.1, r * 0.15, r * 1.05);
	skin.addColorStop(0, "#ffe566");
	skin.addColorStop(0.45, "#ffd000");
	skin.addColorStop(1, "#e6a800");
	ctx.fillStyle = skin;
	ctx.beginPath();
	ctx.arc(0, 0, r, 0, Math.PI * 2);
	ctx.fill();
	if (lit) {
		const shade = ctx.createRadialGradient(0, 0, r * 0.45, 0, 0, r);
		shade.addColorStop(0, "rgba(0,0,0,0)");
		shade.addColorStop(1, "rgba(120,70,0,0.28)");
		ctx.fillStyle = shade;
		ctx.beginPath();
		ctx.arc(0, 0, r, 0, Math.PI * 2);
		ctx.fill();
		const spec = ctx.createRadialGradient(-r * 0.32, -r * 0.38, 0, -r * 0.22, -r * 0.28, r * 0.5);
		spec.addColorStop(0, "rgba(255,255,255,0.55)");
		spec.addColorStop(0.35, "rgba(255,255,220,0.12)");
		spec.addColorStop(1, "rgba(255,255,255,0)");
		ctx.fillStyle = spec;
		ctx.beginPath();
		ctx.arc(0, 0, r, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.restore();
}

function boltFillColor(pct: number) {
	if (pct >= 70) return "#2ee66a";
	if (pct >= 35) return "#f5d000";
	return "#e53935";
}

function drawBoltBattery(ctx: CanvasRenderingContext2D, world: World, charge: number) {
	const pct = Math.max(0, Math.min(100, charge));
	const g = hudGeom(world);
	const x = Math.max(12, Math.floor(world.w * 0.035));
	const y = g.scoreY + 6;
	const bw = Math.max(78, Math.floor(world.w * 0.22));
	const bh = Math.max(22, Math.floor(world.h * 0.028));
	const r = Math.max(5, bh * 0.35);
	const tip = Math.max(5, Math.floor(bh * 0.34));
	ctx.save();
	// Battery body fill by level
	const fillW = Math.max(0, (bw - 4) * (pct / 100));
	ctx.beginPath();
	ctx.roundRect(x, y, bw, bh, r);
	ctx.clip();
	ctx.fillStyle = "rgba(12,14,18,0.45)";
	ctx.fillRect(x, y, bw, bh);
	ctx.fillStyle = boltFillColor(pct);
	ctx.fillRect(x + 2, y + 2, fillW, bh - 4);
	ctx.restore();

	ctx.save();
	ctx.strokeStyle = "#ffffff";
	ctx.lineWidth = Math.max(2, bh * 0.12);
	ctx.beginPath();
	ctx.roundRect(x, y, bw, bh, r);
	ctx.stroke();
	// Positive tip
	ctx.fillStyle = "#ffffff";
	ctx.beginPath();
	ctx.roundRect(x + bw + 1, y + bh * 0.28, tip, bh * 0.44, Math.max(2, tip * 0.35));
	ctx.fill();
	// Centered white %
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.font = `800 ${Math.max(12, Math.floor(bh * 0.72))}px 'Noto Sans SC', Impact, sans-serif`;
	ctx.lineWidth = Math.max(3, bh * 0.14);
	ctx.strokeStyle = "rgba(18,22,30,0.55)";
	ctx.fillStyle = "#ffffff";
	const label = `${Math.floor(pct)}%`;
	ctx.strokeText(label, x + bw * 0.5, y + bh * 0.52);
	ctx.fillText(label, x + bw * 0.5, y + bh * 0.52);
	ctx.restore();
}

function drawBoltTrail(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], time: number) {
	if (pts.length < 2) return;
	ctx.save();
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	ctx.strokeStyle = "rgba(180, 230, 255, 0.35)";
	ctx.lineWidth = 10;
	ctx.beginPath();
	ctx.moveTo(pts[0]!.x, pts[0]!.y);
	for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
	ctx.stroke();
	ctx.strokeStyle = `rgba(255, 255, 120, ${0.75 + 0.2 * Math.sin(time * 40)})`;
	ctx.lineWidth = 3.2;
	ctx.beginPath();
	ctx.moveTo(pts[0]!.x, pts[0]!.y);
	for (let i = 1; i < pts.length; i++) {
		const p = pts[i]!;
		const wobble = (i % 2 === 0 ? 1 : -1) * (4 + (i % 3));
		ctx.lineTo(p.x + wobble, p.y);
	}
	ctx.stroke();
	ctx.strokeStyle = "#ffffff";
	ctx.lineWidth = 1.2;
	ctx.stroke();
	ctx.restore();
}

function drawBoltWhitePulse(ctx: CanvasRenderingContext2D, ball: Ball, time: number) {
	const pulse = 0.5 + 0.5 * Math.sin(time * 2.2);
	ctx.save();
	ctx.translate(ball.x, ball.y + (ball.squash < 1 ? ball.r * (1 - ball.squash) : 0));
	ctx.scale(1 / ball.squash, ball.squash);
	ctx.globalCompositeOperation = "screen";
	ctx.fillStyle = `rgba(255,255,255,${0.08 + pulse * 0.34})`;
	ctx.shadowColor = "rgba(255,255,255,0.9)";
	ctx.shadowBlur = ball.r * (0.25 + pulse * 0.55);
	ctx.beginPath();
	ctx.arc(0, 0, ball.r * 1.02, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}
function drawBoltBall(ctx: CanvasRenderingContext2D, ball: Ball, lit: boolean, time: number) {
	const { x, y, r, squash } = ball;
	ctx.save();
	ctx.translate(x, y + (squash < 1 ? r * (1 - squash) : 0));
	ctx.scale(1 / squash, squash);
	if (lit) {
		const glow = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.7);
		glow.addColorStop(0, "rgba(255,240,120,0.35)");
		glow.addColorStop(0.55, "rgba(80,180,255,0.12)");
		glow.addColorStop(1, "rgba(40,80,255,0)");
		ctx.fillStyle = glow;
		ctx.beginPath();
		ctx.arc(0, 0, r * 1.7, 0, Math.PI * 2);
		ctx.fill();
	}
	const skin = ctx.createRadialGradient(-r * 0.28, -r * 0.32, r * 0.06, r * 0.1, r * 0.15, r * 1.05);
	skin.addColorStop(0, "#fff7a8");
	skin.addColorStop(0.4, "#ffe14a");
	skin.addColorStop(0.75, "#5ad0ff");
	skin.addColorStop(1, "#2a6dff");
	ctx.fillStyle = skin;
	ctx.beginPath();
	ctx.arc(0, 0, r, 0, Math.PI * 2);
	ctx.fill();
	ctx.strokeStyle = `rgba(255,255,255,${0.55 + 0.25 * Math.sin(time * 18)})`;
	ctx.lineWidth = Math.max(1.2, r * 0.08);
	ctx.beginPath();
	ctx.moveTo(-r * 0.15, -r * 0.55);
	ctx.lineTo(r * 0.05, -r * 0.1);
	ctx.lineTo(-r * 0.12, -r * 0.05);
	ctx.lineTo(r * 0.22, r * 0.55);
	ctx.stroke();
	ctx.restore();
}

/** Draw the active ball kit at an arbitrary point (cinematics / overlays). */
export function paintBallSprite(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	r: number,
	spin: number,
	ballId: BallId,
	time = 0,
) {
	drawBall(
		ctx,
		{
			x,
			y,
			r,
			vx: 0,
			vy: 0,
			spin,
			omega: 0,
			squash: 1,
			scored: false,
			hitRim: false,
			hitBoard: false,
		},
		0,
		{ w: 1, h: 1, ox: 0, oy: 0, cssW: 1, cssH: 1, floorY: 1, ballR: r, hoopInner: r, tube: 1 },
		time,
		true,
		ballId,
	);
}

function drawDoodleBall(ctx: CanvasRenderingContext2D, ball: Ball, lit: boolean) {
	const { x, y, r, spin, squash } = ball;
	ctx.save();
	ctx.translate(x, y + (squash < 1 ? r * (1 - squash) : 0));
	ctx.scale(1 / squash, squash);
	ctx.beginPath();
	ctx.arc(0, 0, r, 0, Math.PI * 2);
	ctx.clip();
	ctx.save();
	ctx.rotate(spin);
	const skin = ctx.createRadialGradient(-r * 0.3, -r * 0.36, r * 0.08, r * 0.1, r * 0.16, r * 1.1);
	skin.addColorStop(0, "#fff6e4");
	skin.addColorStop(0.5, "#f0d3a4");
	skin.addColorStop(1, "#b88858");
	ctx.fillStyle = skin;
	ctx.fillRect(-r - 1, -r - 1, r * 2 + 2, r * 2 + 2);
	ctx.lineCap = "round";
	ctx.lineWidth = Math.max(1.4, r * 0.07);
	ctx.strokeStyle = "rgba(232, 84, 138, 0.9)";
	ctx.beginPath();
	ctx.arc(-r * 0.22, -r * 0.08, r * 0.28, 0.4, 4.2);
	ctx.stroke();
	ctx.strokeStyle = "rgba(64, 168, 214, 0.9)";
	ctx.beginPath();
	ctx.moveTo(r * 0.05, -r * 0.42);
	ctx.quadraticCurveTo(r * 0.42, -r * 0.1, r * 0.18, r * 0.36);
	ctx.stroke();
	ctx.strokeStyle = "rgba(92, 78, 64, 0.75)";
	ctx.beginPath();
	ctx.moveTo(-r * 0.48, r * 0.22);
	ctx.lineTo(r * 0.1, r * 0.08);
	ctx.lineTo(r * 0.46, r * 0.28);
	ctx.stroke();
	ctx.restore();
	if (lit) {
		const shade = ctx.createRadialGradient(0, 0, r * 0.45, 0, 0, r);
		shade.addColorStop(0, "rgba(0,0,0,0)");
		shade.addColorStop(1, "rgba(40,24,8,0.38)");
		ctx.fillStyle = shade;
		ctx.beginPath();
		ctx.arc(0, 0, r, 0, Math.PI * 2);
		ctx.fill();
		const spec = ctx.createRadialGradient(-r * 0.32, -r * 0.38, 0, -r * 0.18, -r * 0.28, r * 0.46);
		spec.addColorStop(0, "rgba(255,255,255,0.55)");
		spec.addColorStop(1, "rgba(255,255,255,0)");
		ctx.fillStyle = spec;
		ctx.beginPath();
		ctx.arc(0, 0, r, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.restore();
}

function drawDoodleInk(
	ctx: CanvasRenderingContext2D,
	world: World,
	doodle: {
		paint: number;
		life: number | null;
		marks: DoodleMark[];
		live: { x: number; y: number }[] | null;
	},
	ballR: number,
) {
	const fade = doodle.life === null ? 1 : Math.max(0.15, doodle.life / DOODLE_FADE);
	const brush = Math.max(5, ballR * 0.5);
	ctx.save();
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	ctx.lineWidth = brush;
	for (const mark of doodle.marks) {
		if (mark.kind === "shit" && mark.lump) {
			ctx.fillStyle = `rgba(92, 64, 42, ${0.9 * fade})`;
			ctx.beginPath();
			ctx.arc(mark.lump.x, mark.lump.y, mark.lump.r, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = `rgba(255, 248, 236, ${fade})`;
			ctx.font = `700 ${Math.max(13, Math.floor(world.w * 0.038))}px 'Noto Sans SC', sans-serif`;
			ctx.textAlign = "center";
			ctx.fillText("你画了一坨屎", mark.lump.x, mark.lump.y - mark.lump.r - 8);
			continue;
		}
		ctx.strokeStyle = `rgba(236, 230, 210, ${0.95 * fade})`;
		ctx.beginPath();
		let started = false;
		for (const p of mark.pts) {
			if (!p.on) {
				started = false;
				continue;
			}
			if (!started) {
				ctx.moveTo(p.x, p.y);
				started = true;
			} else ctx.lineTo(p.x, p.y);
		}
		ctx.stroke();
	}
	if (doodle.live && doodle.live.length > 1) {
		ctx.strokeStyle = "rgba(236, 230, 210, 0.65)";
		ctx.beginPath();
		ctx.moveTo(doodle.live[0]!.x, doodle.live[0]!.y);
		for (const p of doodle.live) ctx.lineTo(p.x, p.y);
		ctx.stroke();
	}
	const g = hudGeom(world);
	const x = Math.max(12, Math.floor(world.w * 0.035));
	const y = g.barY;
	const bw = Math.min(150, world.w * 0.38);
	const bh = 12;
	ctx.fillStyle = "rgba(18,22,30,0.45)";
	ctx.fillRect(x, y, bw, bh);
	ctx.fillStyle = "#e2b15a";
	ctx.fillRect(x, y, bw * (doodle.paint / DOODLE_SLOTS), bh);
	ctx.strokeStyle = "rgba(255,255,255,0.4)";
	ctx.lineWidth = 1;
	for (let i = 1; i < DOODLE_SLOTS; i++) {
		const sx = x + (bw * i) / DOODLE_SLOTS;
		ctx.beginPath();
		ctx.moveTo(sx, y);
		ctx.lineTo(sx, y + bh);
		ctx.stroke();
	}
	ctx.fillStyle = "#f4f0e6";
	ctx.font = `600 ${Math.max(11, Math.floor(world.w * 0.03))}px 'Noto Sans SC', sans-serif`;
	ctx.textAlign = "left";
	ctx.textBaseline = "middle";
	ctx.fillText("颜料", x + bw + 6, y + bh / 2);
	if (doodle.life !== null) {
		ctx.textAlign = "right";
		ctx.fillText(`${Math.max(0, doodle.life).toFixed(1)}s`, world.w - 12, y + bh / 2);
	}
	ctx.restore();
}

function drawBall(ctx: CanvasRenderingContext2D, ball: Ball, combo: number, _world: World, time = 0, lit = true, ballId: BallId = DEFAULT_BALL) {
	if (ballId === "prison") {
		drawPrisonBall(ctx, ball, lit);
		return;
	}
	if (ballId === "ninja") {
		drawNinjaBall(ctx, ball, lit, 1);
		return;
	}
	if (ballId === "rubber") {
		drawYellowBall(ctx, ball, lit);
		return;
	}
	if (ballId === "frost") {
		drawIceBall(ctx, ball, lit);
		return;
	}
	if (ballId === "bolt") {
		drawBoltBall(ctx, ball, lit, time);
		return;
	}
	if (ballId === "champ") {
		drawChampBall(ctx, ball, lit);
		return;
	}
	if (ballId === "anti") {
		drawAntiBall(ctx, ball, lit, time);
		return;
	}
	if (ballId === "doodle") {
		drawDoodleBall(ctx, ball, lit);
		return;
	}
	if (ballId === "glass") {
		const img = ballImage("glass");
		if (!img) {
			drawGlassBall(ctx, ball);
			return;
		}
		const { x, y, r, spin, squash } = ball;
		ctx.save();
		ctx.translate(x, y + (squash < 1 ? r * (1 - squash) : 0));
		ctx.scale(1 / squash, squash);
		ctx.beginPath();
		ctx.arc(0, 0, r, 0, Math.PI * 2);
		ctx.clip();
		ctx.rotate(spin);
		ctx.drawImage(img, -r, -r, r * 2, r * 2);
		ctx.restore();
		return;
	}
	const { x, y, r, spin, squash } = ball;
	const stage = fireStage(combo);
	if (lit && stage === 3) {
		const glowR = r * 1.7;
		const glow = ctx.createRadialGradient(x, y, r * .2, x, y, glowR);
		glow.addColorStop(0, "rgba(255,170,40,0.22)");
		glow.addColorStop(1, "rgba(255,80,0,0)");
		ctx.fillStyle = glow;
		ctx.beginPath();
		ctx.arc(x, y, glowR, 0, Math.PI * 2);
		ctx.fill();
		drawSparks(ctx, x, y, r, time);
	}
	ctx.save();
	ctx.translate(x, y + (squash < 1 ? r * (1 - squash) : 0));
	ctx.scale(1 / squash, squash);
	ctx.beginPath();
	ctx.arc(0, 0, r, 0, Math.PI * 2);
	ctx.clip();
	const ballImg = ballImage(ballId);
	if (ballImg) {
		ctx.save();
		ctx.rotate(spin);
		ctx.drawImage(ballImg, -r, -r, r * 2, r * 2);
		ctx.restore();
	} else {
		const skin = ctx.createRadialGradient(-r * .32, -r * .4, r * .08, r * .1, r * .2, r * 1.15);
		skin.addColorStop(0, "#d4783a");
		skin.addColorStop(.45, "#b4541c");
		skin.addColorStop(1, "#6a2a0c");
		ctx.fillStyle = skin;
		ctx.fillRect(-r - 1, -r - 1, r * 2 + 2, r * 2 + 2);
	}
	if (stage >= 4) {
		ctx.fillStyle = "rgba(10, 6, 4, 0.58)";
		ctx.fillRect(-r - 1, -r - 1, r * 2 + 2, r * 2 + 2);
	}
	if (lit) {
		const form = ctx.createRadialGradient(r * .22, r * .38, r * .05, r * .1, r * .22, r * 1.05);
		form.addColorStop(0, ballImg ? "rgba(40, 12, 4, 0.16)" : "rgba(40, 12, 4, 0.38)");
		form.addColorStop(.55, "rgba(40, 12, 4, 0.05)");
		form.addColorStop(1, "rgba(40, 12, 4, 0)");
		ctx.fillStyle = form;
		ctx.fillRect(-r - 1, -r - 1, r * 2 + 2, r * 2 + 2);
		const shade = ctx.createRadialGradient(0, 0, r * .62, 0, 0, r);
		shade.addColorStop(0, "rgba(0,0,0,0)");
		shade.addColorStop(.72, "rgba(50, 18, 6, 0.03)");
		shade.addColorStop(1, ballImg ? "rgba(28, 10, 4, 0.28)" : "rgba(28, 10, 4, 0.5)");
		ctx.fillStyle = shade;
		ctx.beginPath();
		ctx.arc(0, 0, r, 0, Math.PI * 2);
		ctx.fill();
		const spec = ctx.createRadialGradient(-r * .34, -r * .44, 0, -r * .28, -r * .36, r * .52);
		spec.addColorStop(0, ballImg ? "rgba(255, 255, 255, 0.32)" : "rgba(255, 255, 255, 0.62)");
		spec.addColorStop(.18, "rgba(255, 236, 210, 0.16)");
		spec.addColorStop(.45, "rgba(255, 200, 140, 0.04)");
		spec.addColorStop(1, "rgba(255, 180, 100, 0)");
		ctx.fillStyle = spec;
		ctx.beginPath();
		ctx.arc(0, 0, r, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.restore();
	if (lit && stage === 3) {
		ctx.save();
		ctx.strokeStyle = "rgba(255, 210, 80, 0.95)";
		ctx.lineWidth = 3.1;
		ctx.shadowColor = "rgba(255, 150, 30, 0.95)";
		ctx.shadowBlur = 16;
		ctx.beginPath();
		ctx.arc(x, y, r + 1.4, 0, Math.PI * 2);
		ctx.stroke();
		ctx.restore();
	} else if (lit && stage >= 4) {
		ctx.save();
		ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
		ctx.lineWidth = 2.8;
		ctx.shadowColor = "rgba(255, 255, 255, 0.8)";
		ctx.shadowBlur = 11;
		ctx.beginPath();
		ctx.arc(x, y, r + 1.5, 0, Math.PI * 2);
		ctx.stroke();
		ctx.restore();
	}
}
function clipTrail(pts: TrailPt[], maxLen: number) {
	if (pts.length < 2) return pts;
	const out = [pts[pts.length - 1]];
	let acc = 0;
	for (let i = pts.length - 2; i >= 0; i--) {
		const a = out[0];
		const b = pts[i];
		const d = Math.hypot(a.x - b.x, a.y - b.y);
		if (acc + d >= maxLen) {
			const t = Math.max(0, (maxLen - acc) / (d || 1));
			out.unshift({
				x: a.x + (b.x - a.x) * t,
				y: a.y + (b.y - a.y) * t
			});
			break;
		}
		acc += d;
		out.unshift(b);
	}
	return out;
}
function hash01(i: number, k: number) {
	const n = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
	return n - Math.floor(n);
}
function catmull(p0: TrailPt, p1: TrailPt, p2: TrailPt, p3: TrailPt, t: number) {
	const t2 = t * t;
	const t3 = t2 * t;
	return {
		x: .5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
		y: .5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
	};
}
function igniteRgb(u: number): [number, number, number] {
	const stops: [number, [number, number, number]][] = [
		[0, [
			16,
			14,
			12
		]],
		[.22, [
			150,
			28,
			12
		]],
		[.48, [
			255,
			48,
			16
		]],
		[.72, [
			255,
			210,
			60
		]],
		[1, [
			255,
			252,
			240
		]]
	];
	for (let i = 0; i < stops.length - 1; i++) {
		const a = stops[i];
		const b = stops[i + 1];
		if (u >= a[0] && u <= b[0]) {
			const t = (u - a[0]) / (b[0] - a[0] || 1);
			return [
				a[1][0] + (b[1][0] - a[1][0]) * t,
				a[1][1] + (b[1][1] - a[1][1]) * t,
				a[1][2] + (b[1][2] - a[1][2]) * t
			];
		}
	}
	return stops[stops.length - 1]![1];
}
function blazeRgb(u: number): [number, number, number] {
	const stops: [number, [number, number, number]][] = [
		[0, [
			220,
			28,
			14
		]],
		[.3, [
			255,
			86,
			22
		]],
		[.55, [
			255,
			196,
			64
		]],
		[.8, [
			255,
			244,
			196
		]],
		[1, [
			255,
			255,
			252
		]]
	];
	for (let i = 0; i < stops.length - 1; i++) {
		const a = stops[i];
		const b = stops[i + 1];
		if (u >= a[0] && u <= b[0]) {
			const t = (u - a[0]) / (b[0] - a[0] || 1);
			return [
				a[1][0] + (b[1][0] - a[1][0]) * t,
				a[1][1] + (b[1][1] - a[1][1]) * t,
				a[1][2] + (b[1][2] - a[1][2]) * t
			];
		}
	}
	return stops[stops.length - 1]![1];
}
function wispColor(stage: number, u: number): [number, number, number] {
	if (stage <= 1) return [
		236,
		232,
		224
	];
	if (stage === 2) return [
		28,
		26,
		24
	];
	if (stage === 3) return igniteRgb(u);
	return blazeRgb(u);
}
const blobCache = new Map<string, HTMLCanvasElement>();

function softBlob(cr: number, cg: number, cb: number, fuzzy = false) {
	const key = `${cr | 0},${cg | 0},${cb | 0}:${fuzzy ? 1 : 0}`;
	const hit = blobCache.get(key);
	if (hit) return hit;
	const c = document.createElement("canvas");
	c.width = 64;
	c.height = 64;
	const x = c.getContext("2d");
	if (!x) return c;
	const inner = fuzzy ? 1 : 3;
	const mid = fuzzy ? 0.22 : 0.4;
	const g = x.createRadialGradient(32, 32, inner, 32, 32, 30);
	g.addColorStop(0, `rgba(${cr | 0},${cg | 0},${cb | 0},1)`);
	g.addColorStop(mid, `rgba(${cr | 0},${cg | 0},${cb | 0},${fuzzy ? 0.22 : 0.42})`);
	g.addColorStop(1, `rgba(${cr | 0},${cg | 0},${cb | 0},0)`);
	x.fillStyle = g;
	x.beginPath();
	x.arc(32, 32, 30, 0, Math.PI * 2);
	x.fill();
	blobCache.set(key, c);
	return c;
}

function stampBlob(ctx: CanvasRenderingContext2D, x: number, y: number, rad: number, cr: number, cg: number, cb: number, alpha: number, fuzzy = false) {
	ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
	const img = softBlob(cr, cg, cb, fuzzy);
	const s = rad * 2;
	ctx.drawImage(img, x - rad, y - rad, s, s);
	ctx.globalAlpha = 1;
}

function drawWisp(ctx: CanvasRenderingContext2D, x: number, y: number, rad: number, cr: number, cg: number, cb: number, alpha: number, _grain: number) {
	stampBlob(ctx, x, y, rad, cr, cg, cb, alpha);
}
function drawOrbitWisps(ctx: CanvasRenderingContext2D, ball: Ball, stage: number, time: number, icy = false) {
	const n = stage === 1 ? 3 : stage === 2 ? 4 : 5;
	const { x, y, r } = ball;
	ctx.save();
	for (let i = 0; i < n; i++) {
		const wob = Math.sin(time * (1.4 + i * .21) + i * 1.7);
		const ang = time * (.85 + i * .13) + i * 2.15 + wob * .4;
		const d = r * (.55 + .7 * (.5 + .5 * Math.sin(time * 1.6 + i * 1.1)));
		const px = x + Math.cos(ang) * d;
		const py = y + Math.sin(ang) * d * .78;
		const u = .35 + .5 * (.5 + .5 * Math.sin(time * 2.2 + i));
		const rgb = icy
			? ([180 + u * 50, 210 + u * 30, 255] as [number, number, number])
			: wispColor(stage, u);
		const rad = r * (stage === 1 ? .2 : .26) * (.75 + .35 * hash01(i, 2));
		const a = stage === 1 ? .22 : .32;
		if (!gecko && stage >= 3 && u > .55 && !icy) ctx.globalCompositeOperation = "lighter";
		else ctx.globalCompositeOperation = "source-over";
		drawWisp(ctx, px, py, rad, rgb[0], rgb[1], rgb[2], a, i + 11);
	}
	ctx.restore();
}
function drawMotionTrail(ctx: CanvasRenderingContext2D, trail: TrailPt[], ball: Ball, combo: number, time = 0, icy = false) {
	const stage = fireStage(combo);
	if (stage < 1) return;
	if (Math.hypot(ball.vx, ball.vy) < 108) {
		drawOrbitWisps(ctx, ball, stage, time, icy);
		return;
	}
	const r = ball.r;
	const maxMul = stage === 1 ? 1.35 : stage === 2 ? 2.2 : stage === 3 ? 2.8 : 3.55;
	const pts = clipTrail(trail.concat({ x: ball.x, y: ball.y }), r * 2 * maxMul);
	if (pts.length < 2) return;
	const n = pts.length;
	const stamps: { x: number; y: number; u: number }[] = [];
	for (let i = 0; i < n - 1; i++) {
		const p0 = pts[Math.max(0, i - 1)]!;
		const p1 = pts[i]!;
		const p2 = pts[i + 1]!;
		const p3 = pts[Math.min(n - 1, i + 2)]!;
		const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
		const steps = Math.max(1, Math.min(4, Math.ceil(dist / (r * 0.32))));
		for (let s = 0; s < steps; s++) {
			const t = s / steps;
			const p = catmull(p0, p1, p2, p3, t);
			if (Math.hypot(p.x - ball.x, p.y - ball.y) < r * 0.22) continue;
			stamps.push({ x: p.x, y: p.y, u: (i + t) / (n - 1) });
		}
	}
	const tailW = stage === 1 ? 0.42 : stage === 2 ? 0.5 : stage === 3 ? 0.72 : 0.78;
	const headW = stage === 1 ? 0.72 : stage === 2 ? 0.78 : 1;
	ctx.save();
	for (let i = 0; i < stamps.length; i++) {
		const p = stamps[i]!;
		const u = p.u;
		const fuzzy = u < 0.62;
		const bloom = 1 + (1 - u) * (stage >= 4 ? 0.55 : stage >= 3 ? 0.42 : 0.22);
		const rad = r * (tailW + u * (headW - tailW)) * bloom;
		const a0 = (stage >= 3 ? 0.035 : 0.08) + u * (stage >= 3 ? 0.26 : 0.28);
		let cr: number;
		let cg: number;
		let cb: number;
		if (icy) {
			if (stage === 1) {
				cr = 236;
				cg = 244;
				cb = 255;
			} else if (stage === 2) {
				cr = 200;
				cg = 220;
				cb = 240;
			} else if (stage === 3) {
				cr = 170 + u * 40;
				cg = 210 + u * 20;
				cb = 255;
			} else {
				cr = 140 + u * 50;
				cg = 190 + u * 30;
				cb = 255;
			}
		} else if (stage === 1) {
			cr = 236;
			cg = 232;
			cb = 224;
		} else if (stage === 2) {
			cr = 28;
			cg = 26;
			cb = 24;
		} else if (stage === 3) {
			const rgb = igniteRgb(u);
			cr = rgb[0];
			cg = rgb[1];
			cb = rgb[2];
		} else {
			const rgb = blazeRgb(u);
			cr = rgb[0];
			cg = rgb[1];
			cb = rgb[2];
		}
		if (!gecko && stage >= 3 && u > 0.5 && !icy) ctx.globalCompositeOperation = "lighter";
		else ctx.globalCompositeOperation = "source-over";
		stampBlob(ctx, p.x, p.y, rad, cr, cg, cb, a0, fuzzy);
	}
	ctx.restore();
}
function hoopHeat(h: Hoop, _combo?: number) {
	const sear = h.sear >= 3 ? .9 : h.sear >= 2 ? .55 : h.sear >= 1 ? .32 : 0;
	const burn = h.burning ? Math.min(.92, .48 + h.char * .46) : 0;
	return Math.max(sear, burn);
}
function boardHeat(h: Hoop) {
	const sear = h.sear >= 3 ? .9 : h.sear >= 2 ? .5 : 0;
	const burn = h.burning ? Math.min(.92, .48 + h.char * .46) : 0;
	return Math.max(sear, burn);
}
function drawSparks(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, time: number) {
	for (let i = 0; i < 5; i++) {
		const a = time * 5.5 + i * 1.3;
		const d = r * (.85 + .35 * Math.sin(time * 9 + i));
		ctx.save();
		ctx.globalAlpha = .45 + .35 * Math.sin(time * 13 + i);
		ctx.fillStyle = i % 2 === 0 ? "#ffd27a" : "#ff9a3a";
		ctx.beginPath();
		ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * .7, 1.4 + i % 3 * .5, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	}
}
function drawParticle(ctx: CanvasRenderingContext2D, p: Particle) {
	const t = p.life / p.max;
	ctx.fillStyle = p.hue >= 80 ? `rgba(220,235,255,${t * 0.85})` : p.hue < 6 ? `rgba(42,38,34,${t})` : p.hue < 14 ? `rgba(138,134,128,${t})` : p.hue < 30 ? `rgba(240,162,74,${t})` : `rgba(232,93,18,${t})`;
	ctx.beginPath();
	ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
	ctx.fill();
}
function mixHex(a: string, b: string, t: number) {
	const tt = Math.max(0, Math.min(1, t));
	const pa = parseColor(a);
	const pb = parseColor(b);
	return `rgb(${Math.round(pa[0] + (pb[0] - pa[0]) * tt)},${Math.round(pa[1] + (pb[1] - pa[1]) * tt)},${Math.round(pa[2] + (pb[2] - pa[2]) * tt)})`;
}

function parseColor(c: string): [number, number, number] {
	if (c.startsWith("#")) {
		const n = parseInt(c.slice(1), 16);
		if (Number.isFinite(n)) return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
	}
	const m = c.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
	if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
	return [0, 0, 0];
}

function rgbToHex(c: string) {
	const [r, g, b] = parseColor(c);
	const h = (n: number) => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, "0");
	return `#${h(r)}${h(g)}${h(b)}`;
}
function drawScorePops(ctx: CanvasRenderingContext2D, callouts: Callout[], world: World) {
	for (const c of callouts) {
		if (c.kind !== "score" && c.kind !== "base") continue;
		const p = 1 - c.life / c.max;
		let a;
		if (p < .2) a = p / .2;
		else if (p < .62) a = 1;
		else a = Math.max(0, 1 - (p - .62) / .38);
		const ease = 1 - (1 - p) * (1 - p);
		const size = Math.max(22, Math.floor(world.w * .072));
		const cap = c.capY ?? 8;
		const travel = Math.min(36, Math.max(12, c.y - cap - size));
		const y = Math.max(cap + size * .55, c.y - travel * ease);
		ctx.save();
		ctx.globalAlpha = a;
		ctx.font = `800 ${size}px 'Noto Sans SC', Impact, sans-serif`;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.lineWidth = Math.max(5, size * .18);
		ctx.strokeStyle = "rgba(18,22,30,0.55)";
		ctx.fillStyle = c.kind === "base" ? "#e11d2e" : "#ffffff";
		ctx.strokeText(c.text, c.x, y);
		ctx.fillText(c.text, c.x, y);
		ctx.restore();
	}
}
function hudGeom(world: World) {
	const scoreSize = Math.floor(world.w * .15);
	const scoreY = 14;
	const comboSlot = Math.max(34, Math.floor(world.w * .09));
	const comboSize = Math.max(16, Math.floor(world.w * .048));
	const comboY = scoreY + scoreSize + Math.floor((comboSlot - comboSize) / 2);
	const barW = Math.floor(world.w * 0.64);
	const barH = Math.floor(barW * 367 / 1817);
	const barY = scoreY + scoreSize + comboSlot + 2;
	return {
		scoreSize,
		scoreY,
		comboSlot,
		comboSize,
		comboY,
		barH,
		barY,
		barW,
		tagY: barY + barH + 8
	};
}

function drawCountdown(
	ctx: CanvasRenderingContext2D,
	world: World,
	timer01: number,
	buzzer: boolean,
	barLabel: string | null = null,
) {
	const { w } = world;
	const g = hudGeom(world);
	const fill = Math.max(0, Math.min(1, timer01));
	const pair = prisonBarPair(barLabel);
	if (pair) primePrisonTimers();
	const baseImg = pair
		? ensurePrisonTimer(pair.base) || artImage("timerBase")
		: artImage("timerBase");
	const fillImg = pair
		? ensurePrisonTimer(pair.fill) || artImage("timerFill")
		: artImage("timerFill");
	// Prison letter bars already spell the label — no extra text.
	const drawTextLabel = Boolean(barLabel) && !pair;
	if (baseImg && fillImg) {
		const dw = g.barW;
		// Same plate size for Yard / Lock / Infraction so art swaps don't jump.
		const dh = pair ? Math.floor(dw * (367 / 1817)) : g.barH;
		const bx = (w - dw) / 2;
		const by = g.barY;
		// Full base always on; only the fill is clipped by remaining cool-down.
		// Art swaps share timer01 (street cool-down) → time stays continuous.
		ctx.drawImage(baseImg, bx, by, dw, dh);
		if (fill > 0.004) {
			ctx.save();
			ctx.beginPath();
			ctx.rect(bx, by, dw * fill, dh);
			ctx.clip();
			const danger = buzzer ? 1 : fill >= 0.4 ? 0 : Math.min(1, Math.pow((0.4 - fill) / 0.2, 0.55));
			ctx.drawImage(fillImg, bx, by, dw, dh);
			if (danger > 0 && !pair) {
				const red = timerFillRed();
				if (red) {
					ctx.globalAlpha = danger;
					ctx.drawImage(red, bx, by, dw, dh);
					ctx.globalAlpha = 1;
				} else if (!gecko) {
					ctx.filter = `hue-rotate(${Math.round(danger * 172)}deg) saturate(${(1 + danger * 0.85).toFixed(2)})`;
					ctx.drawImage(fillImg, bx, by, dw, dh);
					ctx.filter = "none";
				}
			}
			ctx.restore();
		}
		if (drawTextLabel && barLabel) {
			const labelSize = Math.max(11, Math.floor(w * 0.028));
			ctx.save();
			ctx.font = `800 ${labelSize}px 'Segoe UI', 'Noto Sans SC', sans-serif`;
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.lineWidth = Math.max(3, labelSize * 0.2);
			ctx.strokeStyle = "rgba(18,22,30,0.55)";
			ctx.fillStyle = "#f7f4ef";
			ctx.strokeText(barLabel, w / 2, by + dh * 0.52);
			ctx.fillText(barLabel, w / 2, by + dh * 0.52);
			ctx.restore();
		}
		return;
	}
}
function drawHud(
	ctx: CanvasRenderingContext2D,
	world: World,
	score: number,
	combo: number,
	timer01: number,
	buzzer: boolean,
	callouts: Callout[],
	time = 0,
	heat = combo,
	comboBanner = "",
	glassBase = -1,
	prison: PrisonHud | null = null,
	champBank = -1,
	antiCharge = -1,
	antiHoleLeft = -1,
	scoreOverride: string | null = null,
	boltCharge = -1,
	scoreFlash = false,
) {
	const { w } = world;
	const g = hudGeom(world);
	const shackled = prison?.mode === "shackle";
	ctx.save();
	ctx.textAlign = "center";
	ctx.textBaseline = "top";
	const scoreFont = scoreOverride
		? Math.max(26, Math.floor(g.scoreSize * (scoreOverride.length > 8 ? 0.42 : 0.58)))
		: g.scoreSize;
	ctx.font = `900 ${scoreFont}px 'Noto Sans SC', Impact, sans-serif`;
	ctx.lineWidth = Math.max(6, scoreFont * 0.12);
	ctx.strokeStyle = "rgba(18,22,30,0.55)";
	ctx.fillStyle = "#f7f4ef";
	if (!shackled) {
		const scoreText = scoreOverride ?? String(score);
		const flashA =
			scoreFlash && scoreOverride
				? 0.42 + 0.58 * (0.5 + 0.5 * Math.sin(time * 9.5))
				: 1;
		ctx.save();
		ctx.globalAlpha = flashA;
		ctx.strokeText(scoreText, w / 2, g.scoreY);
		ctx.fillText(scoreText, w / 2, g.scoreY);
		ctx.restore();
	}
	if (prison) {
		const label = Math.max(11, Math.floor(w * 0.032));
		const num = Math.max(22, Math.floor(w * 0.068));
		const x = Math.max(12, Math.floor(w * 0.035));
		if (shackled) {
			ctx.save();
			ctx.textAlign = "left";
			ctx.textBaseline = "top";
			ctx.strokeStyle = "rgba(18,22,30,0.55)";
			ctx.fillStyle = "#d8dde6";
			ctx.font = `700 ${label}px 'Noto Sans SC', sans-serif`;
			ctx.lineWidth = Math.max(3, label * 0.18);
			ctx.strokeText("目标", x, g.scoreY + 4);
			ctx.fillText("目标", x, g.scoreY + 4);
			ctx.font = `900 ${num}px 'Noto Sans SC', Impact, sans-serif`;
			ctx.lineWidth = Math.max(4, num * 0.12);
			ctx.fillStyle = "#f7f4ef";
			const val = String(prison.target);
			ctx.strokeText(val, x, g.scoreY + 4 + label + 1);
			ctx.fillText(val, x, g.scoreY + 4 + label + 1);
			ctx.restore();
		}
	} else if (glassBase >= 0) {
		const label = Math.max(11, Math.floor(w * 0.032));
		const num = Math.max(22, Math.floor(w * 0.068));
		const x = Math.max(12, Math.floor(w * 0.035));
		ctx.save();
		ctx.textAlign = "left";
		ctx.textBaseline = "top";
		ctx.strokeStyle = "rgba(18,22,30,0.55)";
		ctx.fillStyle = "#e11d2e";
		ctx.font = `700 ${label}px 'Noto Sans SC', sans-serif`;
		ctx.lineWidth = Math.max(3, label * 0.18);
		ctx.strokeText("基础", x, g.scoreY + 4);
		ctx.fillText("基础", x, g.scoreY + 4);
		ctx.font = `900 ${num}px 'Noto Sans SC', Impact, sans-serif`;
		ctx.lineWidth = Math.max(4, num * 0.12);
		ctx.strokeText(String(glassBase), x, g.scoreY + 4 + label + 1);
		ctx.fillText(String(glassBase), x, g.scoreY + 4 + label + 1);
		ctx.restore();
	} else if (champBank >= 0) {
		const label = Math.max(11, Math.floor(w * 0.032));
		const num = Math.max(22, Math.floor(w * 0.068));
		const x = Math.max(12, Math.floor(w * 0.035));
		ctx.save();
		ctx.textAlign = "left";
		ctx.textBaseline = "top";
		ctx.strokeStyle = "rgba(18,22,30,0.55)";
		ctx.fillStyle = "#90caf9";
		ctx.font = `700 ${label}px 'Noto Sans SC', sans-serif`;
		ctx.lineWidth = Math.max(3, label * 0.18);
		ctx.strokeText("存时", x, g.scoreY + 4);
		ctx.fillText("存时", x, g.scoreY + 4);
		ctx.font = `900 ${num}px 'Noto Sans SC', Impact, sans-serif`;
		ctx.lineWidth = Math.max(4, num * 0.12);
		ctx.fillStyle = "#ff8a80";
		const bankText = `${champBank.toFixed(1)}s`;
		ctx.strokeText(bankText, x, g.scoreY + 4 + label + 1);
		ctx.fillText(bankText, x, g.scoreY + 4 + label + 1);
		ctx.restore();
	} else if (antiHoleLeft >= 0) {
		const label = Math.max(11, Math.floor(w * 0.032));
		const num = Math.max(22, Math.floor(w * 0.068));
		const x = Math.max(12, Math.floor(w * 0.035));
		ctx.save();
		ctx.textAlign = "left";
		ctx.textBaseline = "top";
		ctx.strokeStyle = "rgba(18,22,30,0.55)";
		ctx.fillStyle = "#ce93ff";
		ctx.font = `700 ${label}px 'Noto Sans SC', sans-serif`;
		ctx.lineWidth = Math.max(3, label * 0.18);
		ctx.strokeText("黑洞", x, g.scoreY + 4);
		ctx.fillText("黑洞", x, g.scoreY + 4);
		ctx.font = `900 ${num}px 'Noto Sans SC', Impact, sans-serif`;
		ctx.lineWidth = Math.max(4, num * 0.12);
		ctx.fillStyle = "#f3e5f5";
		const t = `${Math.ceil(antiHoleLeft)}s`;
		ctx.strokeText(t, x, g.scoreY + 4 + label + 1);
		ctx.fillText(t, x, g.scoreY + 4 + label + 1);
		ctx.restore();
	} else if (antiCharge >= 0) {
		const label = Math.max(11, Math.floor(w * 0.032));
		const num = Math.max(22, Math.floor(w * 0.068));
		const x = Math.max(12, Math.floor(w * 0.035));
		ctx.save();
		ctx.textAlign = "left";
		ctx.textBaseline = "top";
		ctx.strokeStyle = "rgba(18,22,30,0.55)";
		ctx.fillStyle = "#b39ddb";
		ctx.font = `700 ${label}px 'Noto Sans SC', sans-serif`;
		ctx.lineWidth = Math.max(3, label * 0.18);
		ctx.strokeText("反能", x, g.scoreY + 4);
		ctx.fillText("反能", x, g.scoreY + 4);
		ctx.font = `900 ${num}px 'Noto Sans SC', Impact, sans-serif`;
		ctx.lineWidth = Math.max(4, num * 0.12);
		ctx.fillStyle = "#e1bee7";
		const pct = `${Math.floor(antiCharge)}%`;
		ctx.strokeText(pct, x, g.scoreY + 4 + label + 1);
		ctx.fillText(pct, x, g.scoreY + 4 + label + 1);
		ctx.restore();
	} else if (boltCharge >= 0) {
		drawBoltBattery(ctx, world, boltCharge);
	}
	let tag = null;
	for (const c of callouts) if (c.kind === "tag") tag = c;
	if (comboBanner) {
		ctx.save();
		ctx.font = `800 ${g.comboSize}px 'Noto Sans SC', sans-serif`;
		ctx.textAlign = "center";
		ctx.lineWidth = 4;
		ctx.strokeStyle = "rgba(18,22,30,0.55)";
		ctx.fillStyle = "#f7f4ef";
		ctx.strokeText(comboBanner, w / 2, g.comboY);
		ctx.fillText(comboBanner, w / 2, g.comboY);
		ctx.restore();
	} else if (combo >= 1 && (shackled || combo >= 2)) {
		ctx.save();
		const stage = fireStage(heat);
		if (!shackled && stage >= 3) {
			const mag = stage >= 4 ? 3.8 : 1.2;
			const freq = stage >= 4 ? 36 : 14;
			ctx.translate(Math.sin(time * freq) * mag, Math.cos(time * freq * 1.35) * mag * .72);
		}
		const comboSize = shackled ? g.scoreSize : g.comboSize;
		const comboY = shackled ? g.scoreY : g.comboY;
		ctx.font = `800 ${comboSize}px 'Noto Sans SC', ${shackled ? "Impact, " : ""}sans-serif`;
		ctx.textAlign = "center";
		ctx.lineWidth = shackled ? Math.max(6, comboSize * 0.12) : 4;
		ctx.strokeStyle = "rgba(18,22,30,0.55)";
		ctx.fillStyle = shackled
			? "#f7f4ef"
			: stage >= 4
				? "#ff3b2e"
				: stage >= 3
					? "#ffd54a"
					: stage >= 2
						? "#c8c3bb"
						: "#f7f4ef";
		ctx.strokeText(`连击×${combo}`, w / 2, comboY);
		ctx.fillText(`连击×${combo}`, w / 2, comboY);
		ctx.restore();
	}
	if (tag) {
		const t = tag.life / tag.max;
		const isBreak = tag.text.includes("中断");
		const tagSize = isBreak ? Math.max(16, Math.floor(w * .048)) : Math.min(g.scoreSize - 2, Math.max(26, Math.floor(w * .112)));
		ctx.save();
		ctx.globalAlpha = Math.min(1, t * 1.8);
		ctx.font = `800 ${tagSize}px 'Noto Sans SC', Impact, sans-serif`;
		ctx.textAlign = "center";
		ctx.textBaseline = "top";
		ctx.lineWidth = 5;
		ctx.strokeStyle = "rgba(20,24,32,0.55)";
		ctx.fillStyle = isBreak ? "#f7f4ef" : "#ffe082";
		ctx.strokeText(tag.text, w / 2, g.tagY);
		ctx.fillText(tag.text, w / 2, g.tagY);
		ctx.restore();
	}
	ctx.restore();
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
	const rr = Math.min(r, w / 2, h / 2);
	ctx.beginPath();
	ctx.moveTo(x + rr, y);
	ctx.arcTo(x + w, y, x + w, y + h, rr);
	ctx.arcTo(x + w, y + h, x, y + h, rr);
	ctx.arcTo(x, y + h, x, y, rr);
	ctx.arcTo(x, y, x + w, y, rr);
	ctx.closePath();
}

export function drawBoot(ctx: CanvasRenderingContext2D, cssW: number, cssH: number, pct: number) {
	const p = Math.max(0, Math.min(1, pct));
	ctx.fillStyle = "#1b2430";
	ctx.fillRect(0, 0, cssW, cssH);
	ctx.save();
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	const title = Math.max(36, Math.floor(cssW * 0.12));
	ctx.font = `900 ${title}px 'Noto Sans SC', Impact, sans-serif`;
	ctx.fillStyle = "#f7f4ef";
	ctx.fillText("投球", cssW / 2, cssH * 0.42);
	const barW = Math.min(320, cssW * 0.64);
	const barH = 16;
	const bx = (cssW - barW) / 2;
	const by = cssH * 0.52;
	roundRect(ctx, bx, by, barW, barH, barH / 2);
	ctx.fillStyle = "rgba(12, 16, 22, 0.85)";
	ctx.fill();
	const fw = Math.max(barH, barW * p);
	if (p > 0) {
		roundRect(ctx, bx, by, fw, barH, barH / 2);
		ctx.fillStyle = "#3c8fe0";
		ctx.fill();
	}
	ctx.font = `800 ${Math.max(14, Math.floor(cssW * 0.045))}px 'Noto Sans SC', sans-serif`;
	ctx.fillStyle = "#f7f4ef";
	ctx.fillText(`${Math.floor(p * 100)}%`, cssW / 2, by + barH + 22);
	ctx.restore();
}
