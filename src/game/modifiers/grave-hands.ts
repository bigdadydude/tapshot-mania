/** Grave hands: a skeleton fist breaks the court, opens and closes, grabs, smashes the screen. */

import type { Ball, World } from "../types";
import type { ModifierHost, StageModifier } from "../modifiers";

type Act = "rise" | "live" | "grab" | "hurl" | "crack";
type HandPose = "open" | "closed";

const RISE = 0.72;
const GRAB = 0.26;
const HURL = 0.46;
const CRACK = 1.05;
/** Open ↔ closed frame holds (seconds). Swap art at these paths later. */
const OPEN_HOLD = 0.55;
const CLOSED_HOLD = 0.7;
const FRAME_SRC = {
  open: "/game/modifiers/grave-hand-open.svg",
  closed: "/game/modifiers/grave-hand-closed.svg",
} as const;

type Bit = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  s: number;
};

/** Same crack every smash — normalized around screen center. */
const RAYS: { a: number; len: number; bend: number; fork: number }[] = [
  { a: -1.42, len: 0.96, bend: 0.38, fork: 0.52 },
  { a: -0.62, len: 0.74, bend: -0.42, fork: 0.4 },
  { a: 0.12, len: 1, bend: 0.28, fork: 0.64 },
  { a: 0.68, len: 0.86, bend: -0.33, fork: 0.46 },
  { a: 1.28, len: 0.93, bend: 0.22, fork: 0.7 },
  { a: 2.05, len: 0.8, bend: -0.48, fork: 0.38 },
  { a: 2.62, len: 0.9, bend: 0.3, fork: 0.58 },
  { a: -2.35, len: 0.84, bend: 0.18, fork: 0.5 },
  { a: 3.02, len: 0.68, bend: -0.24, fork: 0.34 },
];

const frames: { open: HTMLImageElement | null; closed: HTMLImageElement | null } = {
  open: null,
  closed: null,
};

function loadFrame(pose: HandPose) {
  if (typeof Image === "undefined") return;
  if (frames[pose]) return;
  const img = new Image();
  img.decoding = "async";
  img.src = FRAME_SRC[pose];
  frames[pose] = img;
}

function smo(u: number) {
  const t = Math.max(0, Math.min(1, u));
  return t * t * (3 - 2 * t);
}

/** Palm just big enough to cup the ball. */
function handSize(ballR: number) {
  const w = ballR * 2.15;
  const h = ballR * 2.65;
  return { w, h, palmHalf: ballR * 1.05, fistR: ballR * 0.95 };
}

export function createGraveHands(): StageModifier {
  let act: Act = "rise";
  let t = 0;
  let cycleT = 0;
  let clock = 0;
  let hurt = 0;
  let grace = 0;
  let caughtR = 18;
  let caughtSpin = 0;
  let puffed = false;
  let bits: Bit[] = [];
  let paintBall: ModifierHost["paintBall"] = () => {};
  loadFrame("open");
  loadFrame("closed");

  function poseOf(): HandPose {
    if (act === "grab" || act === "hurl" || act === "crack") return "closed";
    if (act === "rise") return t < RISE * 0.55 ? "closed" : "open";
    const span = OPEN_HOLD + CLOSED_HOLD;
    const u = cycleT % span;
    return u < OPEN_HOLD ? "open" : "closed";
  }

  function pose(world: World) {
    const r = world.ballR;
    const x = world.w * 0.5 + Math.sin(clock * 1.35) * r * 0.08;
    let emerge = 1;
    if (act === "rise") emerge = smo(t / RISE);
    else if (act === "crack") emerge = 1 - 0.05 * Math.sin(Math.min(1, t / 0.14) * Math.PI);
    const hand = handSize(r);
    const palmY = world.floorY - hand.h * 0.42 * emerge;
    const fistCy = palmY - hand.h * 0.18;
    return { x, emerge, palmY, fistCy, r, ...hand, frame: poseOf() };
  }

  function puff(world: World, n: number) {
    const g = pose(world);
    for (let i = 0; i < n; i++) {
      const life = 0.38 + Math.random() * 0.42;
      const sp = 70 + Math.random() * 180;
      const side = Math.random() < 0.5 ? -1 : 1;
      bits.push({
        x: g.x + (Math.random() - 0.5) * g.w * 0.7,
        y: world.floorY + 2,
        vx: side * (20 + Math.random() * 90),
        vy: -sp * (0.35 + Math.random() * 0.65),
        life,
        max: life,
        s: g.r * (0.1 + Math.random() * 0.16),
      });
    }
  }

  function park(host: ModifierHost) {
    const b = host.getBallBody();
    b.vx = 0;
    b.vy = 0;
    b.x = -host.world.w * 4;
    b.y = host.world.floorY;
    host.notePrev();
  }

  function bounce(ball: Ball, cx: number, cy: number, rad: number) {
    const dx = ball.x - cx;
    const dy = ball.y - cy;
    const dist = Math.hypot(dx, dy) || 0.0001;
    const overlap = ball.r + rad - dist;
    if (overlap <= 0) return false;
    const nx = dx / dist;
    const ny = dy / dist;
    ball.x += nx * (overlap + 0.4);
    ball.y += ny * (overlap + 0.4);
    const vn = ball.vx * nx + ball.vy * ny;
    if (vn < 0) {
      ball.vx -= 1.55 * vn * nx;
      ball.vy -= 1.55 * vn * ny;
    } else if (Math.hypot(ball.vx, ball.vy) < 50) {
      ball.vx += nx * 90;
      ball.vy += ny * 36;
    }
    return true;
  }

  function drawHandSprite(ctx: CanvasRenderingContext2D, world: World, g: ReturnType<typeof pose>) {
    const img = frames[g.frame];
    const flash = hurt > 0.04;
    const dw = g.w * (0.55 + 0.45 * g.emerge);
    const dh = g.h * (0.55 + 0.45 * g.emerge);
    const cx = g.x;
    const cy = g.palmY;
    ctx.fillStyle = "rgba(18, 12, 8, 0.88)";
    ctx.beginPath();
    ctx.ellipse(cx, world.floorY + 2, dw * 0.42, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(cx, cy);
    if (flash) ctx.filter = "brightness(2.4) saturate(0.2)";
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, -dw * 0.5, -dh * 0.72, dw, dh);
    } else {
      ctx.fillStyle = flash ? "#fff" : "#efe4d2";
      ctx.strokeStyle = "#9a8570";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (g.frame === "open") {
        ctx.ellipse(0, 0, dw * 0.38, dh * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(i * dw * 0.12, -dh * 0.05);
          ctx.lineTo(i * dw * 0.16, -dh * 0.55);
          ctx.stroke();
        }
      } else {
        ctx.arc(0, -dh * 0.08, dw * 0.36, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  return {
    id: "grave-hands",
    begin(host) {
      paintBall = host.paintBall;
      act = "rise";
      t = 0;
      cycleT = 0;
      clock = 0;
      hurt = 0;
      grace = 0.35;
      puffed = false;
      bits = [];
      const body = host.getBallBody();
      caughtR = body.r;
      caughtSpin = body.spin;
      loadFrame("open");
      loadFrame("closed");
      puff(host.world, 12);
      puffed = true;
    },
    update(dt, host) {
      paintBall = host.paintBall;
      clock += dt;
      hurt = Math.max(0, hurt - dt);
      grace = Math.max(0, grace - dt);
      const grav = 980;
      for (const b of bits) {
        b.life -= dt;
        b.vy += grav * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      }
      bits = bits.filter((b) => b.life > 0);
      t += dt;
      if (act === "rise") {
        if (!puffed && t > 0.18) {
          puff(host.world, 8);
          puffed = true;
        }
        if (t >= RISE) {
          act = "live";
          t = 0;
          cycleT = 0;
        }
        return;
      }
      if (act === "live") {
        cycleT += dt;
        return;
      }
      if (act === "grab") {
        if (t >= GRAB) {
          act = "hurl";
          t = 0;
        }
        return;
      }
      if (act === "hurl") {
        if (t >= HURL) {
          act = "crack";
          t = 0;
          host.hit("glass");
        }
        return;
      }
      if (t >= CRACK) {
        act = "live";
        t = 0;
        cycleT = OPEN_HOLD;
        grace = 1.15;
        host.rollFromOpposite();
      }
    },
    holdsBall() {
      return act === "grab" || act === "hurl" || act === "crack";
    },
    touchBall(host) {
      if (act !== "live" && act !== "rise") return false;
      const world = host.world;
      const ball = host.getBallBody();
      const g = pose(world);
      if (g.emerge < 0.62) return false;

      const open = g.frame === "open" && grace <= 0 && act === "live";
      const tipY = g.palmY - g.h * 0.55;
      const overPalm = Math.abs(ball.x - g.x) < g.palmHalf + ball.r * 0.12;
      const intoHand = ball.y + ball.r > tipY && ball.y < g.palmY + ball.r * 0.15;
      if (open && overPalm && intoHand && ball.vy > 18) {
        caughtR = ball.r;
        caughtSpin = ball.spin;
        act = "grab";
        t = 0;
        park(host);
        host.hit("bone");
        return true;
      }

      if (g.frame === "closed") {
        if (bounce(ball, g.x, g.fistCy, g.fistR) && hurt <= 0) {
          hurt = 0.16;
          host.hit("bone");
        }
      }
      return false;
    },
    drawWorld(ctx, world) {
      const g = pose(world);
      ctx.save();
      for (const b of bits) {
        const a = Math.max(0, b.life / b.max);
        ctx.fillStyle = `rgba(58, 46, 36, ${0.8 * a})`;
        ctx.beginPath();
        ctx.ellipse(b.x, b.y, b.s, b.s * 0.65, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // Ball sits in the palm before fingers (closed frame) cover it.
      if (act === "grab") {
        paintBall(ctx, g.x, g.palmY - caughtR * 0.15, caughtR, caughtSpin);
      }
      drawHandSprite(ctx, world, g);
      if (hurt > 0.04) {
        ctx.strokeStyle = `rgba(255,255,255,${Math.min(1, hurt / 0.16)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(g.x, g.fistCy, g.fistR * 1.2, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    },
    drawScreen(ctx, world) {
      if (act !== "hurl" && act !== "crack") return;
      const g = pose(world);
      const x0 = world.ox + g.x;
      const y0 = world.oy + g.palmY - caughtR;
      const x1 = world.cssW * 0.5;
      const y1 = world.cssH * 0.42;
      if (act === "hurl") {
        const u = Math.min(1, t / HURL);
        const e = u * u;
        const x = x0 + (x1 - x0) * e;
        const y = y0 + (y1 - y0) * e;
        const endR = Math.max(caughtR * 3.4, Math.min(world.cssW, world.cssH) * 0.42);
        const rad = caughtR + (endR - caughtR) * e;
        ctx.save();
        ctx.globalAlpha = 0.28;
        paintBall(ctx, x0 + (x - x0) * 0.55, y0 + (y - y0) * 0.55, rad * 0.72, caughtSpin + t * 4);
        ctx.globalAlpha = 1;
        paintBall(ctx, x, y, rad, caughtSpin + t * 9);
        ctx.restore();
        return;
      }

      const u = Math.min(1, t / CRACK);
      const shoot = smo(Math.min(1, t / 0.16));
      const fade = u > 0.62 ? 1 - smo((u - 0.62) / 0.38) : 1;
      const cx = world.cssW * 0.5;
      const cy = world.cssH * 0.46;
      const reach = Math.hypot(world.cssW, world.cssH) * 0.62;
      ctx.save();
      ctx.fillStyle = `rgba(6, 8, 12, ${0.28 * fade})`;
      ctx.fillRect(0, 0, world.cssW, world.cssH);
      if (t < 0.12) {
        ctx.fillStyle = `rgba(255,255,255,${(1 - t / 0.12) * 0.72})`;
        ctx.fillRect(0, 0, world.cssW, world.cssH);
      }
      ctx.strokeStyle = `rgba(236, 244, 255, ${0.92 * fade})`;
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const ray of RAYS) {
        const len = reach * ray.len * shoot;
        const mx = cx + Math.cos(ray.a) * len * ray.fork;
        const my = cy + Math.sin(ray.a) * len * ray.fork;
        const bx = -Math.sin(ray.a) * len * 0.16 * ray.bend;
        const by = Math.cos(ray.a) * len * 0.16 * ray.bend;
        const ex = cx + Math.cos(ray.a + ray.bend * 0.35) * len;
        const ey = cy + Math.sin(ray.a + ray.bend * 0.35) * len;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.quadraticCurveTo(mx + bx, my + by, ex, ey);
        ctx.stroke();
        const fx = cx + Math.cos(ray.a) * len * ray.fork;
        const fy = cy + Math.sin(ray.a) * len * ray.fork;
        const fa = ray.a + (ray.bend > 0 ? 0.7 : -0.7);
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx + Math.cos(fa) * len * 0.28, fy + Math.sin(fa) * len * 0.28);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.85 * fade * shoot;
      const shard = [
        [-0.05, -0.02, 0.22, -0.28, 0.18, 0.05],
        [0.02, 0.04, 0.3, 0.16, 0.08, 0.32],
        [-0.04, 0.02, -0.28, 0.12, -0.12, -0.22],
      ];
      ctx.fillStyle = "rgba(210, 224, 236, 0.28)";
      for (const p of shard) {
        const k = 18 + 26 * shoot;
        ctx.beginPath();
        ctx.moveTo(cx + p[0]! * reach * 0.15 + p[0]! * k, cy + p[1]! * reach * 0.15);
        ctx.lineTo(cx + p[2]! * reach * 0.55, cy + p[3]! * reach * 0.55);
        ctx.lineTo(cx + p[4]! * reach * 0.55, cy + p[5]! * reach * 0.55);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    },
    skipBoard() {
      return false;
    },
    skipBrace() {
      return false;
    },
    onScored() {
      return false;
    },
    canScore() {
      return true;
    },
    end() {
      act = "live";
      t = 0;
      bits = [];
    },
  };
}
