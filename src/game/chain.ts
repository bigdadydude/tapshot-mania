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
  /** Tip iron ball radius = basketball radius / 2 (diameter half of the ball). */
  tipR: number;
};

const SEGMENTS = 7;
/** Tip mass matches the basketball; mid links are light. */
const TIP_MASS = 1;
const LINK_MASS = 0.08;

export function chainLength(ballR: number) {
  return ballR * 2;
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

function constrainMass(a: ChainNode, b: ChainNode, rest: number, massA: number, massB: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 0.0001;
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
 * Returns nothing; mutates ball.vx/vy when the heavy tip yanks the tether.
 */
export function stepChain(
  chain: Chain,
  ball: BallMotion,
  side: -1 | 1,
  floorY: number,
  gravity: number,
  dt: number,
  collideSolid?: (nx: number, ny: number, nr: number) => { x: number; y: number } | null,
) {
  const nodes = chain.nodes;
  if (nodes.length < 2) return;
  const last = nodes.length - 1;

  const attach = attachPoint(ball.x, ball.y, ball.r, ball.vx, ball.vy, side);
  const head = nodes[0]!;
  head.x = attach.x;
  head.y = attach.y;
  head.px = attach.x;
  head.py = attach.y;

  const damp = Math.exp(-1.6 * dt);
  for (let i = 1; i < nodes.length; i++) {
    const n = nodes[i]!;
    const ox = n.x;
    const oy = n.y;
    // Tip iron ball: 2× basketball gravity; mid-links slightly lighter.
    const gScale = i === last ? 2 : 0.85;
    n.x += (n.x - n.px) * damp;
    n.y += (n.y - n.py) * damp + gravity * gScale * dt * dt;
    n.px = ox;
    n.py = oy;
  }

  const iters = 5;
  for (let k = 0; k < iters; k++) {
    head.x = attach.x;
    head.y = attach.y;
    for (let i = 0; i < nodes.length - 1; i++) {
      constrainMass(nodes[i]!, nodes[i + 1]!, chain.link, massAt(i, last), massAt(i + 1, last));
    }
    head.x = attach.x;
    head.y = attach.y;

    for (let i = 1; i < nodes.length; i++) {
      const n = nodes[i]!;
      const r = radiusAt(chain, i);
      const heavy = i === last;
      if (n.y + r > floorY) {
        n.y = floorY - r;
        const vyN = n.y - n.py;
        if (vyN > 0) n.py = n.y + vyN * (heavy ? 0.55 : 0.2);
        const vxN = n.x - n.px;
        n.px = n.x - vxN * (heavy ? 0.7 : 0.82);
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

  // Heavy tip yanks the basketball through the tether (equal mass).
  const n1 = nodes[1]!;
  const dx = n1.x - attach.x;
  const dy = n1.y - attach.y;
  const d = Math.hypot(dx, dy) || 0.0001;
  const stretch = d - chain.link;
  if (stretch > 0.5) {
    const pull = Math.min(420, stretch * 55);
    const inv = 1 / d;
    ball.vx += dx * inv * pull * dt;
    ball.vy += dy * inv * pull * dt;
  }
}
