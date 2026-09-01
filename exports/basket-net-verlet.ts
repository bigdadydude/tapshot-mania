/**
 * 投球 — 篮网：交错 6×9 质点 + 两组斜向松弛约束（Verlet，无刚体）
 *
 * 与 src/game/net.ts 同步。
 * 只画斜线1 point[y][x]→point[y+1][x] 和斜线2 point[y][x]→point[y+1][x+1]，
 * 无横线、竖线、质点。球穿过时网被顶开；进球自然伸缩。绝不改篮球速度。
 */
export {
  NET_COLS,
  NET_ROWS,
  NET_ROW_H,
  RIM_RY,
  buildNet,
  clampNet,
  collapseNet,
  netBackPos,
  netDiagDown,
  netNearHoop,
  netRestBottom,
  netRestPos,
  netRowReleased,
  netShouldCollide,
  netT,
  pinNet,
  stepNet,
  tugNet,
} from "../src/game/net";
