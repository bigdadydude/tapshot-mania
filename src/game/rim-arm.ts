type ArmHoop = {x: number; y: number; inner: number; sear: number; burning: boolean; char: number; side: -1 | 1};
type Board = {innerEdge: number; armTop: number; armH: number; boardBotY: number};

export function boardHeat(h: Pick<ArmHoop, "sear" | "burning" | "char">) {
  const sear = h.sear >= 3 ? .9 : h.sear >= 2 ? .5 : 0;
  const burn = h.burning ? Math.min(.92, .48 + h.char * .46) : 0;
  return Math.max(sear, burn);
}

/** The orange connector's solid trapezoid, shared by drawing and collision. */
export function rimArmPoints(h: ArmHoop, g: Board) {
  const attach = h.x + h.side * h.inner * 1.02;
  const heat = boardHeat(h), sag = Math.max(0, heat - .4) * 10;
  return [
    {x: g.innerEdge, y: g.armTop + sag},
    {x: attach, y: g.armTop + sag},
    {x: attach, y: h.y + g.armH * .38 + sag},
    {x: g.innerEdge, y: g.boardBotY + sag},
  ];
}
