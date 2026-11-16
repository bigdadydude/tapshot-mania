/** 现有地面法向恢复系数；供地面与玻璃球蓝图凸块共用，不改变地面参数。 */
export type FloorRestKind = "floorHi" | "floorLo";

export function floorRestitution(kind: FloorRestKind, ballK: number, floorK: number) {
  const raw = (kind === "floorHi" ? 0.7 : 0.64) * ballK * floorK;
  // Floor must stay < ~0.88 or fallBoost pumps energy each bounce.
  return Math.max(0, Math.min(0.84, raw));
}

/** 包含地面的低速静止阈值。返回沿接触法线向外的速度，不规定法线方向。 */
export function floorReboundSpeed(
  incoming: number,
  restitution: (kind: FloorRestKind) => number,
  correction?: (impact: number, base: number) => number,
) {
  if (!(incoming > 40)) return 0;
  const base = restitution(incoming > 140 ? "floorHi" : "floorLo");
  const rebound = incoming * (correction ? correction(incoming, base) : base);
  return rebound > 40 ? rebound : 0;
}
