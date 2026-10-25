import type { Ball, Hoop } from "./types";
import { NET2_EDGES } from "./net2.ts";
import { sweepSupport } from "./support-collision.ts";

export function freezeNet(h: Hoop, ignoreBall: boolean) {
  h.frostNetIgnoreBall = ignoreBall;
  h.netPulse = 0;
  for (const n of h.net) {
    n.px = n.x; n.py = n.y; n.prevDepth = n.depth;
    delete n.netState;
  }
}

export function clearOfFrozenNet(h: Hoop, ball: Ball) {
  if (!h.net.length) return true;
  const xs = h.net.map(n => n.x), ys = h.net.map(n => n.y);
  return ball.x + ball.r < Math.min(...xs) || ball.x - ball.r > Math.max(...xs) ||
    ball.y + ball.r < Math.min(...ys) || ball.y - ball.r > Math.max(...ys);
}

/** Hit only actual visible strands, not the net's bounding box. No ball force. */
export function touchesFrozenNet(h: Hoop, ball: Ball, prevX: number, prevY: number) {
  for (const edge of NET2_EDGES) {
    const a = h.net[edge.a], b = h.net[edge.b];
    if (!a || !b) continue;
    if (sweepSupport({x:prevX,y:prevY}, ball, ball.r, {
      x0:a.x,y0:a.y,x1:b.x,y1:b.y,halfW:1,
    })) return true;
  }
  return false;
}

export function shatterFrozenNet(h: Hoop) {
  if (h.frostLeft <= 0 || !h.frost || h.netShattered || h.frostNetIgnoreBall || !h.net.length) return false;
  h.netShattered = true;
  h.netPulse = 0;
  return true;
}
