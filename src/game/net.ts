import type { Ball, Hoop, NetNode, World } from "./types";

export const NET_COLS = 9;
export const NET_ROWS = 6;
export const NET_ROW_H = 0.234;
export const RIM_RY = 0.4;

const NET_DAMP = 0.955;
const NET_ITERS = 2;
const NET_ITERS_IDLE = 1;
const NET_SLACK = 1.26;
const NET_STIFF = 0.07;
const NET_STIFF_HIT = 0.035;
const PULSE_MAX = 0.7;
const NET_INHERIT = 0.78;
/** Bottom opening half-width ≈ basketball radius (`inner * 0.70`). */
const NET_OPEN_HALF = 0.7;

export function netIndex(r: number, c: number) {
  return r * NET_COLS + c;
}

export function netNode(h: Hoop, r: number, c: number): NetNode | undefined {
  return h.net[netIndex(r, c)];
}

export function netT(r: number, c: number) {
  return netTheta(r, c) / (Math.PI * 2);
}

/** Angle around the rim. Columns wrap 360° so front and back are one sleeve. */
export function netTheta(r: number, c: number) {
  const stagger = r % 2 === 0 ? 0.5 : 0;
  return ((c + stagger) / NET_COLS) * Math.PI * 2;
}

/** Inward-curving sides: 1 at the rim, tulip waist ~0.46, hem ~0.52. */
export function rowShrink(r: number) {
  if (r <= 0) return 1;
  const u = r / (NET_ROWS - 1);
  return 1 - 0.48 * u - 0.26 * Math.sin(u * Math.PI);
}

/**
 * One cinched ellipse per row. Row 0 is the rim; lower rows drop down.
 * sin(θ)>0 is the near wall, sin(θ)<0 is the far wall seen through the hoop.
 */
export function netRestPos(h: Pick<Hoop, "x" | "y" | "inner">, r: number, c: number) {
  const th = netTheta(r, c);
  const shrink = rowShrink(r);
  const rx = h.inner * shrink;
  const ry = h.inner * RIM_RY * shrink;
  const yCenter = h.y + r * h.inner * NET_ROW_H;
  return {
    x: h.x + Math.cos(th) * rx,
    y: yCenter + Math.sin(th) * ry,
  };
}

/** Same cloth — kept so the export bundle still resolves. */
export function netBackPos(
  h: Pick<Hoop, "x" | "y" | "inner">,
  r: number,
  c: number,
  n?: NetNode | null,
) {
  if (n) return { x: n.x, y: n.y };
  return netRestPos(h, r, c);
}

/** Diamond edges around the cylinder, including the wrap from last col → first. */
export function netDiagDown(r: number, c: number): [number, number][] {
  if (r >= NET_ROWS - 1) return [];
  return [
    [r + 1, c],
    [r + 1, (c + 1) % NET_COLS],
  ];
}

export function netRowBurn(char: number, r: number) {
  return char * NET_ROWS - (NET_ROWS - 1 - r);
}

export function netRowReleased(char: number, r: number) {
  return netRowBurn(char, r) >= 1;
}

export function netRestBottom(h: Pick<Hoop, "y" | "inner">) {
  return h.y + (NET_ROWS - 1) * h.inner * NET_ROW_H + h.inner * RIM_RY + h.inner * 0.12;
}

export function netShouldCollide(h: Hoop, ball: Ball) {
  if (h.burning && h.char > 0.45) return false;
  const top = h.y - h.inner * RIM_RY - ball.r * 0.12;
  const bot = netRestBottom(h);
  if (ball.y + ball.r < top) return false;
  if (ball.y - ball.r > bot) return false;
  if (Math.abs(ball.x - h.x) > h.inner + ball.r * 0.75) return false;
  return true;
}

export function netNearHoop(h: Hoop, ball: Ball) {
  return (
    Math.abs(ball.x - h.x) < h.inner + ball.r * 0.8 &&
    ball.y > h.y - h.inner * RIM_RY - ball.r * 0.2 &&
    ball.y < netRestBottom(h) + ball.r * 0.15
  );
}

/** Far wall of the sleeve is behind the ball; near hanging wall stays in front. */
export function netNodeInFront(
  _n: NetNode,
  _ball: Ball | null,
  c: number,
  _hoop?: Pick<Hoop, "x" | "y" | "inner"> | null,
) {
  return Math.sin((c / NET_COLS) * Math.PI * 2) >= 0.12;
}

export function buildNet(hoop: Pick<Hoop, "x" | "y" | "inner">): NetNode[] {
  const nodes: NetNode[] = [];
  for (let r = 0; r < NET_ROWS; r++) {
    for (let c = 0; c < NET_COLS; c++) {
      const p = netRestPos(hoop, r, c);
      nodes.push({ x: p.x, y: p.y, px: p.x, py: p.y, pinned: r === 0 });
    }
  }
  return nodes;
}

export function nudgeNet(h: Hoop, dx: number, dy: number) {
  if (!dx && !dy) return;
  for (const n of h.net) {
    n.x += dx;
    n.y += dy;
    n.px += dx;
    n.py += dy;
  }
}

export function pinNet(h: Hoop) {
  if (netRowReleased(h.char, 0)) return;
  for (let c = 0; c < NET_COLS; c++) {
    const n = h.net[c];
    if (!n) continue;
    const p = netRestPos(h, 0, c);
    n.x = p.x;
    n.y = p.y;
    n.px = p.x;
    n.py = p.y;
    n.pinned = true;
  }
}

function constrain(a: NetNode, b: NetNode, rest: number, stiffness: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 0.0001;
  const diff = ((d - rest) / d) * stiffness;
  if (a.pinned && b.pinned) return;
  if (a.pinned) {
    b.x -= dx * diff;
    b.y -= dy * diff;
    return;
  }
  if (b.pinned) {
    a.x += dx * diff;
    a.y += dy * diff;
    return;
  }
  a.x += dx * diff * 0.5;
  a.y += dy * diff * 0.5;
  b.x -= dx * diff * 0.5;
  b.y -= dy * diff * 0.5;
}

function constrainBottomHem(h: Hoop, wrapping: boolean) {
  const r = NET_ROWS - 1;
  if (netRowReleased(h.char, r)) return;
  const rounds = wrapping ? 5 : 4;
  const stiff = wrapping ? NET_STIFF_HIT : NET_STIFF * 1.1;
  const yCenter = h.y + r * h.inner * NET_ROW_H;
  const maxR = h.inner * NET_OPEN_HALF;
  for (let k = 0; k < rounds; k++) {
    for (let c = 0; c < NET_COLS; c++) {
      const a = netNode(h, r, c);
      const b = netNode(h, r, (c + 1) % NET_COLS);
      if (!a || !b) continue;
      const pa = netRestPos(h, r, c);
      const pb = netRestPos(h, r, (c + 1) % NET_COLS);
      const geom = Math.hypot(pb.x - pa.x, pb.y - pa.y);
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 0.0001;
      if (d > geom * NET_SLACK * 1.06) constrain(a, b, geom * NET_SLACK * 1.06, stiff);
    }
  }
  for (let c = 0; c < NET_COLS; c++) {
    const n = netNode(h, r, c);
    if (!n) continue;
    const dx = n.x - h.x;
    const dy = (n.y - yCenter) / RIM_RY;
    const rad = Math.hypot(dx, dy);
    if (rad > maxR && rad > 1e-4) {
      const k = maxR / rad;
      n.x = h.x + dx * k;
      n.y = yCenter + dy * k * RIM_RY;
    }
  }
}

function constrainDiamond(h: Hoop, wrapping: boolean) {
  const rounds = wrapping ? NET_ITERS : NET_ITERS_IDLE;
  const stiff = wrapping ? NET_STIFF_HIT : NET_STIFF;
  const compress = wrapping ? 0 : stiff * 0.55;
  for (let k = 0; k < rounds; k++) {
    for (let r = 0; r < NET_ROWS - 1; r++) {
      if (netRowReleased(h.char, r) || netRowReleased(h.char, r + 1)) continue;
      for (let c = 0; c < NET_COLS; c++) {
        const a = netNode(h, r, c);
        if (!a) continue;
        const pa = netRestPos(h, r, c);
        const relax = (rr: number, cc: number) => {
          const b = netNode(h, rr, cc);
          if (!b) return;
          const pb = netRestPos(h, rr, cc);
          const geom = Math.hypot(pb.x - pa.x, pb.y - pa.y);
          const d = Math.hypot(b.x - a.x, b.y - a.y) || 0.0001;
          if (d > geom * NET_SLACK) constrain(a, b, geom * NET_SLACK, stiff);
          else if (compress && d < geom * 0.86) constrain(a, b, geom * 0.86, compress);
        };
        relax(r + 1, c);
        relax(r + 1, (c + 1) % NET_COLS);
      }
    }
  }
}

export function clampNet(h: Hoop, wrapping: boolean) {
  if (h.burning && h.char > 0.4) return;
  const maxHang = (NET_ROWS - 1) * h.inner * NET_ROW_H + h.inner * RIM_RY + h.inner * 0.4;
  const maxSide = h.inner * (wrapping ? 1.15 : 1.02);
  const minY = h.y - h.inner * RIM_RY * (wrapping ? 1.35 : 1.05);
  for (let r = 0; r < NET_ROWS; r++) {
    if (netRowReleased(h.char, r)) continue;
    for (let c = 0; c < NET_COLS; c++) {
      const n = netNode(h, r, c);
      if (!n || n.pinned) continue;
      const rest = netRestPos(h, r, c);
      const dx = n.x - rest.x;
      const dy = n.y - rest.y;
      const dist = Math.hypot(dx, dy);
      const maxD = h.inner * (wrapping ? 1.6 + r * 0.16 : 0.22 + r * 0.08);
      if (dist > maxD) {
        n.x = rest.x + (dx / dist) * maxD;
        n.y = rest.y + (dy / dist) * maxD;
      }
      // Per-row ceiling so hanging rows cannot collapse onto one y
      // (that flattened the last diagonals into a stretching white hem).
      const rowCeil = wrapping
        ? rest.y + h.inner * (0.85 + r * 0.16)
        : rest.y + h.inner * NET_ROW_H * 0.45;
      if (n.y > rowCeil) {
        n.y = rowCeil;
        n.py = n.y;
      }
      if (n.y > h.y + maxHang) {
        n.y = h.y + maxHang;
        n.py = n.y;
      }
      if (n.y < minY) {
        n.y = minY;
        n.py = n.y;
      }
      if (Math.abs(n.x - h.x) > maxSide) {
        n.x = h.x + Math.sign(n.x - h.x) * maxSide;
      }
    }
  }
}

export function tugNet(h: Hoop) {
  h.netPulse = PULSE_MAX;
  for (let r = 1; r < NET_ROWS; r++) {
    if (netRowReleased(h.char, r)) continue;
    const u = r / (NET_ROWS - 1);
    const s = rowShrink(r) + (NET_OPEN_HALF - rowShrink(r)) * u * u;
    const yCenter = h.y + r * h.inner * NET_ROW_H;
    for (let c = 0; c < NET_COLS; c++) {
      const n = netNode(h, r, c);
      if (!n || n.pinned) continue;
      const th = netTheta(r, c);
      n.x = h.x + Math.cos(th) * h.inner * s;
      n.y = yCenter + Math.sin(th) * h.inner * RIM_RY * s + 2 + r * 1.4;
      n.px = n.x - Math.cos(th) * 2 * u;
      n.py = n.y - (6 + r * 2.2);
    }
  }
}

export function collapseNet(h: Hoop) {
  for (let r = 0; r < NET_ROWS; r++) {
    if (!netRowReleased(h.char, r)) continue;
    for (let c = 0; c < NET_COLS; c++) {
      const n = netNode(h, r, c);
      if (n) n.pinned = false;
    }
  }
}

function wrapNetPoint(
  n: NetNode,
  bx: number,
  by: number,
  contactR: number,
  ballVx: number,
  ballVy: number,
  dt: number,
) {
  if (n.pinned) return;
  const dx = n.x - bx;
  const dy = n.y - by;
  const d = Math.hypot(dx, dy) || 0.0001;
  if (d >= contactR) return;
  const nx = dx / d;
  const ny = dy / d;
  const push = contactR - d;
  n.x += nx * push;
  n.y += ny * push;
  n.px = n.x - ballVx * dt * NET_INHERIT;
  n.py = n.y - ballVy * dt * NET_INHERIT;
  const vx = n.x - n.px;
  const vy = n.y - n.py;
  const vn = vx * nx + vy * ny;
  if (vn < 0) {
    n.px = n.x - (vx - vn * nx);
    n.py = n.y - (vy - vn * ny);
  }
}

function wrapNetSwept(h: Hoop, ball: Ball, prevX: number, prevY: number, dt: number) {
  const restBot = netRestBottom(h);
  const contactR = ball.r * 1.04;
  const falling = ball.vy >= 0;
  const dist = Math.hypot(ball.x - prevX, ball.y - prevY);
  const samples = Math.max(1, Math.min(10, Math.ceil(dist / Math.max(3.2, ball.r * 0.26))));

  for (let s = 1; s <= samples; s++) {
    const t = s / samples;
    const bx = prevX + (ball.x - prevX) * t;
    const by = prevY + (ball.y - prevY) * t;
    if (falling && by - ball.r > restBot) break;
    for (let i = 0; i < h.net.length; i++) {
      const n = h.net[i]!;
      const r = Math.floor(i / NET_COLS);
      if (n.pinned || netRowReleased(h.char, r)) continue;
      wrapNetPoint(n, bx, by, contactR, ball.vx, ball.vy, dt);
    }
  }
}

function ballWrapping(h: Hoop, ball: Ball) {
  if (!netShouldCollide(h, ball)) return false;
  const contactR = ball.r * 1.04;
  for (let i = NET_COLS; i < h.net.length; i++) {
    const n = h.net[i]!;
    if (n.pinned) continue;
    if (Math.hypot(n.x - ball.x, n.y - ball.y) < contactR) return true;
  }
  return false;
}

export function stepNet(
  h: Hoop,
  ball: Ball,
  prevX: number,
  prevY: number,
  world: World,
  dt: number,
  time: number,
  near: boolean,
) {
  if (!h.net.length) return;
  if (h.netPulse > 0) h.netPulse = Math.max(0, h.netPulse - dt);
  const pulse = h.netPulse;
  const wrapping = ballWrapping(h, ball);
  const g = world.h * 0.12 * dt;
  const u = pulse > 0 ? 1 - pulse / PULSE_MAX : 1;
  for (let i = 0; i < h.net.length; i++) {
    const n = h.net[i]!;
    if (n.pinned) continue;
    const r = Math.floor(i / NET_COLS);
    const c = i % NET_COLS;
    const released = netRowReleased(h.char, r);
    const vx = (n.x - n.px) * NET_DAMP;
    const vy = (n.y - n.py) * NET_DAMP;
    n.px = n.x;
    n.py = n.y;
    const idle = released ? 0 : Math.max(0.35, 2.2 - r * 0.2);
    n.x += vx + Math.sin(time * 5.1 + c * 2.05 + r * 1.4) * dt * (idle + pulse * 12);
    n.y += vy + g * (released ? 1.55 : 1) + Math.sin(time * 8.8 + c * 1.3 + r * 0.7) * dt * pulse * 9;
    if (!wrapping && pulse <= 0 && !released) {
      const rest = netRestPos(h, r, c);
      const hold = dt * 2.4;
      n.x += (rest.x - n.x) * hold;
      n.y += (rest.y - n.y) * hold;
    } else if (pulse > 0 && !released) {
      if (u < 0.4) {
        const k = (0.4 - u) / 0.4;
        n.y += dt * (14 + r * 5) * k;
      } else {
        const rest = netRestPos(h, r, c);
        const k = dt * 4.6;
        n.x += (rest.x - n.x) * k;
        n.y += (rest.y - n.y) * k;
      }
    }
  }

  constrainDiamond(h, wrapping);
  constrainBottomHem(h, wrapping);
  pinNet(h);
  clampNet(h, wrapping);
  if (near && netShouldCollide(h, ball)) wrapNetSwept(h, ball, prevX, prevY, dt);
  constrainBottomHem(h, wrapping);
  pinNet(h);
}
