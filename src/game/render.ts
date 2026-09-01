import type { Ball, Callout, Gfx, Hoop, Particle, TrailPt, World } from "./types";
import { DEFAULT_GFX, fireStage } from "./types";
import { artImage, ballImage, cloudImages, graffitiImage } from "./art";
import type { BallId } from "./balls";
import { DEFAULT_BALL } from "./balls";
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
  backdrop: "void" | "street" = "street",
  ballId: BallId = DEFAULT_BALL,
  glassBase = -1,
) {
	ctx.save();
	ctx.translate(shakeX, shakeY);
	if (backdrop === "void") drawVoid(ctx, world);
	else {
		drawWall(ctx, world, cloudT, cloudSx, cloudSy, graf, gfx.clouds !== "off");
		drawCourt(ctx, world);
	}
	if (gfx.ballShadow) drawGroundShadow(ctx, ball, world);
	if (showHud) drawCountdown(ctx, world, timer01, buzzer);
	const distH = Math.hypot(ball.x - hoop.x, ball.y - hoop.y);
	const distO = other ? Math.hypot(ball.x - other.x, ball.y - other.y) : Infinity;
	const ballWithOther = Boolean(other && distO < distH);
	if (other) drawHoopStack(ctx, other, world, ballWithOther ? ball : null, combo, time, gfx.particles ? trail : [], gfx, ballId);
	drawHoopStack(ctx, hoop, world, ballWithOther ? null : ball, combo, time, gfx.particles ? trail : [], gfx, ballId);
	if (gfx.particles) for (const p of particles) drawParticle(ctx, p);
	drawScorePops(ctx, callouts, world);
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
	if (showHud) drawHud(ctx, world, score, comboHud < 0 ? combo : comboHud, timer01, buzzer, callouts, time, combo, comboBanner, glassBase);
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
	ctx.save();
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
	drawBackboard(ctx, hoop, world, time, combo);
	drawRim(ctx, hoop, "back", combo);
	drawNet(ctx, hoop, "back", ball, combo);
	if (ball && gfx.particles) {
		drawMotionTrail(ctx, trail, ball, combo, time);
		drawBall(ctx, ball, combo, world, time, gfx.ballShade, ballId);
	} else if (ball) {
		drawBall(ctx, ball, combo, world, time, gfx.ballShade, ballId);
	}
	drawNet(ctx, hoop, "front", ball, combo);
	drawRim(ctx, hoop, "front", combo);
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

let skyLayer: HTMLCanvasElement | null = null;
let wallLayer: HTMLCanvasElement | null = null;
let courtLayer: HTMLCanvasElement | null = null;
let skyLayerKey = "";
let wallLayerKey = "";
let courtLayerKey = "";

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
	const key = `${world.w | 0}x${world.floorY | 0}:${img.naturalWidth}:${grafShow || ""}`;
	if (wallLayer && wallLayerKey === key) return wallLayer;
	const c = layerCanvas(world.w, world.floorY);
	const x = c.getContext("2d");
	if (!x) return null;
	x.imageSmoothingEnabled = true;
	x.imageSmoothingQuality = "medium";
	x.drawImage(img, 0, 0, layout.sw, layout.sh, layout.ox, layout.oy, layout.dw, layout.dh);
	if (grafShow) {
		const spray = graffitiImage(grafShow);
		if (spray) x.drawImage(spray, 0, 0, layout.sw, layout.sh, layout.ox, layout.oy, layout.dw, layout.dh);
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
		const skyH = layout.skyBot - layout.skyTop;
		const sky = ensureSkyLayer(world, layout);
		if (sky && skyH > 1) ctx.drawImage(sky, 0, layout.skyTop, w, skyH);
		if (drawClouds) drawSkyClouds(ctx, world, time, layout.skyTop, layout.skyBot, cloudSx, cloudSy);
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
				ctx.save();
				clipSpray(ctx, layout.ox, layout.oy, layout.dw, layout.dh, graf.incoming.p, false);
				ctx.drawImage(spray, 0, 0, layout.sw, layout.sh, layout.ox, layout.oy, layout.dw, layout.dh);
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

  const board = mixHex("#ffffff", "#3a3632", Math.min(1, ch * 1.12));
  ctx.fillStyle = board;
  ctx.fillRect(visX, yy, visW, Math.max(1, padDrawY - yy));
  const scene = getScene();
  const green = mixHex(scene.hoop.pad, "#3a3632", Math.min(1, ch * 1.05));
  const greenHi = mixHex(scene.hoop.padHi, "#4a423c", Math.min(1, ch * 1.05));
  const greenLo = mixHex(scene.hoop.padLo, "#2a2624", Math.min(1, ch * 1.05));
  ctx.fillStyle = green;
  ctx.fillRect(visX - 0.5, padDrawY, visW + 1, padH);
  ctx.fillStyle = greenHi;
  ctx.fillRect(visX - 0.5, padDrawY, visW + 1, Math.max(1.6, padH * 0.16));
  ctx.fillStyle = greenLo;
  ctx.fillRect(visX - 0.5, padDrawY + padH - 2, visW + 1, 2);

  const orange = mixHex("#e24a28", "#4a4038", ch);
  const orangeHi = mixHex("#f07a4a", "#6a625c", ch);
  const orangeLo = mixHex("#b83218", "#3a3632", ch);
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
	const rx = inner;
	const ry = inner * RIM_RY;
	const tw = Math.max(3.2, tube * 1.18);
	ctx.save();
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	if (part === "back") {
		ctx.lineWidth = tw;
		ctx.strokeStyle = mixHex("#c43820", "#4a4038", ch);
		ctx.beginPath();
		ctx.ellipse(x, y, rx, ry, 0, Math.PI, Math.PI * 2);
		ctx.stroke();
	} else {
		ctx.lineWidth = tw;
		if (gecko) {
			ctx.strokeStyle = mixHex("#e84828", "#6a625c", ch);
		} else {
			const metal = ctx.createLinearGradient(x - rx, y, x + rx, y + ry);
			metal.addColorStop(0, mixHex("#a82818", "#4a4038", ch));
			metal.addColorStop(.32, mixHex("#f05632", "#8a8078", ch));
			metal.addColorStop(.62, mixHex("#e84828", "#6a625c", ch));
			metal.addColorStop(1, mixHex("#9a2416", "#3a3632", ch));
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

function drawBall(ctx: CanvasRenderingContext2D, ball: Ball, combo: number, _world: World, time = 0, lit = true, ballId: BallId = DEFAULT_BALL) {
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
function drawOrbitWisps(ctx: CanvasRenderingContext2D, ball: Ball, stage: number, time: number) {
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
		const rgb = wispColor(stage, u);
		const rad = r * (stage === 1 ? .2 : .26) * (.75 + .35 * hash01(i, 2));
		const a = stage === 1 ? .22 : .32;
		if (!gecko && stage >= 3 && u > .55) ctx.globalCompositeOperation = "lighter";
		else ctx.globalCompositeOperation = "source-over";
		drawWisp(ctx, px, py, rad, rgb[0], rgb[1], rgb[2], a, i + 11);
	}
	ctx.restore();
}
function drawMotionTrail(ctx: CanvasRenderingContext2D, trail: TrailPt[], ball: Ball, combo: number, time = 0) {
	const stage = fireStage(combo);
	if (stage < 1) return;
	if (Math.hypot(ball.vx, ball.vy) < 108) {
		drawOrbitWisps(ctx, ball, stage, time);
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
		if (stage === 1) {
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
		if (!gecko && stage >= 3 && u > 0.5) ctx.globalCompositeOperation = "lighter";
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
	ctx.fillStyle = p.hue >= 80 ? `rgba(239,236,230,${t})` : p.hue < 6 ? `rgba(42,38,34,${t})` : p.hue < 14 ? `rgba(138,134,128,${t})` : p.hue < 30 ? `rgba(240,162,74,${t})` : `rgba(232,93,18,${t})`;
	ctx.beginPath();
	ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
	ctx.fill();
}
function mixHex(a: string, b: string, t: number) {
	const tt = Math.max(0, Math.min(1, t));
	const pa = parseInt(a.slice(1), 16);
	const pb = parseInt(b.slice(1), 16);
	const ra = pa >> 16 & 255;
	const ga = pa >> 8 & 255;
	const ba = pa & 255;
	const rb = pb >> 16 & 255;
	const gb = pb >> 8 & 255;
	const bb = pb & 255;
	return `rgb(${Math.round(ra + (rb - ra) * tt)},${Math.round(ga + (gb - ga) * tt)},${Math.round(ba + (bb - ba) * tt)})`;
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

function drawCountdown(ctx: CanvasRenderingContext2D, world: World, timer01: number, buzzer: boolean) {
	const { w } = world;
	const g = hudGeom(world);
	const fill = Math.max(0, Math.min(1, timer01));
	const baseImg = artImage("timerBase");
	const fillImg = artImage("timerFill");
	if (baseImg && fillImg) {
		const dw = g.barW;
		const dh = g.barH;
		const bx = (w - dw) / 2;
		const by = g.barY;
		ctx.drawImage(baseImg, bx, by, dw, dh);
		if (fill > 0.004) {
			ctx.save();
			ctx.beginPath();
			ctx.rect(bx, by, dw * fill, dh);
			ctx.clip();
			const danger = buzzer ? 1 : fill >= 0.4 ? 0 : Math.min(1, Math.pow((0.4 - fill) / 0.2, 0.55));
			ctx.drawImage(fillImg, bx, by, dw, dh);
			if (danger > 0) {
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
		return;
	}
}
function drawHud(ctx: CanvasRenderingContext2D, world: World, score: number, combo: number, timer01: number, buzzer: boolean, callouts: Callout[], time = 0, heat = combo, comboBanner = "", glassBase = -1) {
	const { w } = world;
	const g = hudGeom(world);
	ctx.save();
	ctx.textAlign = "center";
	ctx.textBaseline = "top";
	ctx.font = `900 ${g.scoreSize}px 'Noto Sans SC', Impact, sans-serif`;
	ctx.lineWidth = Math.max(6, g.scoreSize * .12);
	ctx.strokeStyle = "rgba(18,22,30,0.55)";
	ctx.fillStyle = "#f7f4ef";
	const scoreText = String(score);
	ctx.strokeText(scoreText, w / 2, g.scoreY);
	ctx.fillText(scoreText, w / 2, g.scoreY);
	if (glassBase >= 0) {
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
	} else if (combo >= 2) {
		ctx.save();
		const stage = fireStage(heat);
		if (stage >= 3) {
			const mag = stage >= 4 ? 3.8 : 1.2;
			const freq = stage >= 4 ? 36 : 14;
			ctx.translate(Math.sin(time * freq) * mag, Math.cos(time * freq * 1.35) * mag * .72);
		}
		ctx.font = `800 ${g.comboSize}px 'Noto Sans SC', sans-serif`;
		ctx.textAlign = "center";
		ctx.lineWidth = 4;
		ctx.strokeStyle = "rgba(18,22,30,0.55)";
		ctx.fillStyle = stage >= 4 ? "#ff3b2e" : stage >= 3 ? "#ffd54a" : stage >= 2 ? "#c8c3bb" : "#f7f4ef";
		ctx.strokeText(`连击×${combo}`, w / 2, g.comboY);
		ctx.fillText(`连击×${combo}`, w / 2, g.comboY);
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
