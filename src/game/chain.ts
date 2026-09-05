/** Prison-ball drag chain: rest length = ball diameter, tip iron ball collider. */

export type ChainNode = {
  x: number;
  y: number;
  px: number;
  py: number;
};

export type Chain = {
  nodes: ChainNode[];
  link: number;
  /** Mid-link radius. */
  nodeR: number;
  /** Tip iron ball radius = basketball radius / 2. */
  tipR: number;
};

const SEGMENTS = 6;
/** Tip mass = 2/3 of the basketball. */
const TIP_MASS = 2 / 3;
const LINK_MASS = 0.12;
const BALL_MASS = 1;
/** Constraint passes — higher = less stretchy rope. */
const SOLVER_ITERS = 14;

export function chainLength(ballR: number) {
  // 1.5× basketball diameter
  return ballR * 2 * 1.5;
}

export function tipRadius(ballR: number) {
  return ballR * 0.5;
}

export function makeChain(ballX: number, ballY: number, ballR: number, side: -1 | 1): Chain {
  const total = chainLength(ballR);
  const tipR = tipRadius(ballR);
  const link = total / (SEGMENTS - 1);
  const nodeR = Math.max(2.2, ballR * 0.11);
  const ax = ballX - side * ballR * 0.72;
  const ay = ballY + ballR * 0.12;
  const nodes: ChainNode[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const t = i / (SEGMENTS - 1);
    const x = ax - side * total * t * 0.85;
    const y = ay + total * t * 0.35 + (i === SEGMENTS - 1 ? tipR * 0.15 : 0);
    nodes.push({ x, y, px: x, py: y });
  }
  return { nodes, link, nodeR, tipR };
}

export function resetChain(chain: Chain, ballX: number, ballY: number, ballR: number, side: -1 | 1) {
  const next = makeChain(ballX, ballY, ballR, side);
  chain.nodes = next.nodes;
  chain.link = next.link;
  chain.nodeR = next.nodeR;
  chain.tipR = next.tipR;
}

function attachPoint(ballX: number, ballY: number, ballR: number, vx: number, vy: number, side: -1 | 1) {
  const spd = Math.hypot(vx, vy);
  let bx: number;
  let by: number;
  if (spd > 40) {
    bx = -vx / spd;
    by = -vy / spd;
  } else {
    bx = -side;
    by = 0.35;
    const m = Math.hypot(bx, by) || 1;
    bx /= m;
    by /= m;
  }
  return {
    x: ballX + bx * ballR * 0.78,
    y: ballY + by * ballR * 0.78,
  };
}

function massAt(i: number, last: number) {
  if (i <= 0) return 0;
  if (i === last) return TIP_MASS;
  return LINK_MASS;
}

function radiusAt(chain: Chain, i: number) {
  return i === chain.nodes.length - 1 ? chain.tipR : chain.nodeR;
}

/** Inextensible rope: only pull together when longer than rest (no springy compression). */
function constrainRope(a: ChainNode, b: ChainNode, rest: number, massA: number, massB: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 0.0001;
  if (d <= rest) return;
  const invA = massA <= 0 ? 0 : 1 / massA;
  const invB = massB <= 0 ? 0 : 1 / massB;
  const invSum = invA + invB;
  if (invSum <= 0) return;
  const percent = (d - rest) / d;
  const sx = dx * percent;
  const sy = dy * percent;
  a.x += sx * (invA / invSum);
  a.y += sy * (invA / invSum);
  b.x -= sx * (invB / invSum);
  b.y -= sy * (invB / invSum);
}

type BallMotion = {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
};

/**
 * Steps the chain. Tip iron ball uses tipR collision and TIP_MASS (= basketball).
 * `gravity` is the prison basketball gravity; tip falls at 2× that.
 */
export function stepChain(
  chain: Chain,
  ball: BallMotion,
  side: -1 | 1,
  floorY: number,
  gravity: number,
  dt: number,
  collideSolid?: (nx: number, ny: number, nr: number) => { x: number; y: number } | null,
  yankScale = 1,
) {
  const nodes = chain.nodes;
  if (nodes.length < 2) return;
  const last = nodes.length - 1;
  const restSpan = chain.link * (nodes.length - 1);

  const attach = attachPoint(ball.x, ball.y, ball.r, ball.vx, ball.vy, side);
  const head = nodes[0]!;
  head.x = attach.x;
  head.y = attach.y;
  head.px = attach.x;
  head.py = attach.y;

  // Light damp — heavy damp makes links feel like rubber.
  const damp = Math.exp(-0.55 * dt);
  for (let i = 1; i < nodes.length; i++) {
    const n = nodes[i]!;
    const ox = n.x;
    const oy = n.y;
    const gScale = i === last ? 2 : 0.9;
    n.x += (n.x - n.px) * damp;
    n.y += (n.y - n.py) * damp + gravity * gScale * dt * dt;
    n.px = ox;
    n.py = oy;
  }

  for (let k = 0; k < SOLVER_ITERS; k++) {
    head.x = attach.x;
    head.y = attach.y;
    for (let i = 0; i < nodes.length - 1; i++) {
      constrainRope(nodes[i]!, nodes[i + 1]!, chain.link, massAt(i, last), massAt(i + 1, last));
    }
    // Pin tip-to-attach max length so the whole tether stays inextensible.
    const tip = nodes[last]!;
    constrainRope(head, tip, restSpan, 0, TIP_MASS);
    head.x = attach.x;
    head.y = attach.y;

    for (let i = 1; i < nodes.length; i++) {
      const n = nodes[i]!;
      const r = radiusAt(chain, i);
      const heavy = i === last;
      if (n.y + r > floorY) {
        n.y = floorY - r;
        const vyN = n.y - n.py;
        if (vyN > 0) n.py = n.y + vyN * (heavy ? 0.35 : 0.15);
        const vxN = n.x - n.px;
        n.px = n.x - vxN * (heavy ? 0.55 : 0.75);
      }
      if (collideSolid) {
        const push = collideSolid(n.x, n.y, r);
        if (push) {
          n.x = push.x;
          n.y = push.y;
        }
      }
    }
  }

  head.x = attach.x;
  head.y = attach.y;
  head.px = attach.x;
  head.py = attach.y;

  const tip = nodes[last]!;
  let ox = tip.x - attach.x;
  let oy = tip.y - attach.y;
  let span = Math.hypot(ox, oy) || 0.0001;
  let nx = ox / span;
  let ny = oy / span;
  const invDt = 1 / Math.max(dt, 1 / 240);
  const tipVx = (tip.x - tip.px) * invDt;
  const tipVy = (tip.y - tip.py) * invDt;
  const stiff = Math.max(0.25, yankScale);

  // Hard rope: if still over length, move the basketball (not a soft spring).
  const stretch = span - restSpan;
  if (stretch > 0.02) {
    const wBall = TIP_MASS / (TIP_MASS + BALL_MASS);
    const corr = stretch * wBall * stiff;
    ball.x += nx * corr;
    ball.y += ny * corr;
    ox = tip.x - (attach.x + nx * corr);
    oy = tip.y - (attach.y + ny * corr);
    span = Math.hypot(ox, oy) || 0.0001;
    nx = ox / span;
    ny = oy / span;
  }

  // Kill separating velocity along the tether when taut (inextensible).
  const taut = span >= restSpan * 0.96;
  if (taut) {
    const ballVn = ball.vx * nx + ball.vy * ny;
    const tipVn = tipVx * nx + tipVy * ny;
    const sep = tipVn - ballVn;
    if (sep > 0) {
      const j = (sep * stiff) / (1 / BALL_MASS + 1 / TIP_MASS);
      ball.vx += (j / BALL_MASS) * nx;
      ball.vy += (j / BALL_MASS) * ny;
    }
    const vRad = tipVx * nx + tipVy * ny;
    const vTanSq = Math.max(0, tipVx * tipVx + tipVy * tipVy - vRad * vRad);
    if (vTanSq > 80) {
      const centri = Math.min(1100, (TIP_MASS * vTanSq) / span);
      ball.vx += nx * ((centri * stiff) / BALL_MASS) * dt;
      ball.vy += ny * ((centri * stiff) / BALL_MASS) * dt;
    }
  }
}
