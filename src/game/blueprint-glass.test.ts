import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { getBall } from "./balls.ts";
import { floorRestitution, floorReboundSpeed } from "./floor-response.ts";
import {
  BLUEPRINT_BOUNCE, BLUEPRINT_RAISE, blueprintBlocks, collideBlueprint,
  getBlueprintClock, resetBlueprint, type BlueprintBlockKind,
} from "./blueprint.ts";

const world = { w: 390, h: 844, floorY: 844 * 0.765, ballR: 19.5, hoopInner: 27.69 };
const glassBallK = getBall("glass").phys!.ball!;
const glassFloorK = getBall("glass").phys?.floor ?? 1;
const rebound = (incoming: number, ballK = glassBallK, floorK = glassFloorK) => (
  floorReboundSpeed(incoming, (kind) => floorRestitution(kind, ballK, floorK))
);

function fixture(dynamic: boolean, kind: BlueprintBlockKind) {
  resetBlueprint(39);
  const cells = [{ col: 5, row: 9, kind }];
  const clock = {
    ...getBlueprintClock(), goals: 30,
    cells: dynamic ? [] : cells, staticCells: dynamic ? [] : cells,
    staticAge: 1,
    dynamic: dynamic ? {
      cells, pending: [], dir: 0 as const, phase: "hold" as const,
      age: 0, stepSpan: 10, raise: BLUEPRINT_RAISE,
    } : null,
  };
  const block = blueprintBlocks(world, clock)[0]!;
  assert.ok(block?.solid);
  return { clock, box: block.solid! };
}

function hit(
  dynamic: boolean, kind: BlueprintBlockKind, speed: number,
  face: "top" | "side" | "corner", response?: (incoming: number) => number,
  tangent = 17,
) {
  const { clock, box } = fixture(dynamic, kind);
  const diagonal = -Math.SQRT1_2;
  const [nx, ny] = face === "top" ? [0, -1] : face === "side" ? [-1, 0] : [diagonal, diagonal];
  const tx = -ny, ty = nx;
  const contact = face === "top" ? { x: box.x + box.w / 2, y: box.y }
    : face === "side" ? { x: box.x, y: box.y + box.h / 2 }
    : { x: box.x, y: box.y };
  const previous = { x: contact.x + nx * 7, y: contact.y + ny * 7 };
  const ball = {
    x: contact.x + nx * 2, y: contact.y + ny * 2, r: 3,
    vx: -speed * nx + tangent * tx, vy: -speed * ny + tangent * ty,
  };
  assert.equal(collideBlueprint(world, ball, previous.x, previous.y, undefined, clock, response), true);
  const outgoing = ball.vx * nx + ball.vy * ny;
  const outgoingTangent = ball.vx * tx + ball.vy * ty;
  return { ball, outgoing, outgoingTangent };
}

function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
}

test("现有玻璃地面参数：ball=0、floor=1，包含低速静止修正；公式与阈值不变", (t) => {
  assert.equal(glassBallK, 0);
  assert.equal(glassFloorK, 1);
  const inputs = [20, 40, 50, 100, 140, 141, 500];
  assert.deepEqual(inputs.map((v) => rebound(v)), [0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(inputs.map((v) => rebound(v, 1, 1)), [0, 0, 0, 64, 89.60000000000001, 98.69999999999999, 350]);
  assert.equal(rebound(62.5, 1, 1), 0, "incoming*.64 == 40 still settles");
  assert.equal(floorRestitution("floorHi", 2, 2), 0.84);
  assert.equal(floorRestitution("floorLo", 2, 2), 0.84);
  t.diagnostic(JSON.stringify({ incoming: inputs, glassFloor: inputs.map((v) => rebound(v)), effectiveBallOne: inputs.map((v) => rebound(v, 1, 1)) }));
});

test("玻璃地面与静态/动态、所有色凸块同入射法向速度反弹一致", () => {
  for (const dynamic of [false, true]) {
    for (const kind of ["white", "green", "red", "black"] as const) {
      for (const incoming of [20, 40, 50, 100, 140, 141, 500]) {
        for (const face of ["top", "side", "corner"] as const) {
          const result = hit(dynamic, kind, incoming, face, rebound);
          near(result.outgoing, rebound(incoming));
          near(result.outgoingTangent, 17);
        }
      }
    }
  }
});

test("玻璃使用当前有效地面参数而非写死 0；侧面/斜角沿真实法线，切向及分离不变", () => {
  for (const dynamic of [false, true]) {
    for (const face of ["top", "side", "corner"] as const) {
      for (const incoming of [20, 50, 100, 140, 141, 500]) {
        for (const [ballK, floorK] of [[1, 1], [0.5, 1.3], [2, 2]]) {
          const response = (speed: number) => rebound(speed, ballK, floorK);
          const actual = hit(dynamic, "white", incoming, face, response);
          near(actual.outgoing, response(incoming));
          near(actual.outgoingTangent, 17);
          const ordinary = hit(dynamic, "white", incoming, face);
          near(actual.ball.x, ordinary.ball.x);
          near(actual.ball.y, ordinary.ball.y);
        }
      }
    }
  }
});

test("普通球缺省凸块弹力不变：侧撞仍为 0.65，低速顶撞仍有原最小弹起", () => {
  assert.equal(BLUEPRINT_BOUNCE, 1.65);
  for (const dynamic of [false, true]) {
    const side = hit(dynamic, "white", 500, "side");
    near(side.outgoing, 325);
    near(side.outgoingTangent, 17);
    const top = hit(dynamic, "white", 20, "top", undefined, 0);
    assert.ok(top.outgoing > 20 * 0.65, "ordinary anti-sticking lift remains");
    assert.ok(Math.abs(top.ball.vx) >= 80, "ordinary top-slide assist remains");
    const glass = hit(dynamic, "white", 20, "top", rebound, 0);
    near(glass.outgoing, 0);
    near(glass.ball.vx, 0);
  }
});

test("地面既有额外恢复修正也可复用，未改变其它球的地面公式", () => {
  const mazeCorrection = (incoming: number) => Math.max(0.68, Math.min(0.92, 0.68 + Math.min(0.24, incoming / 1500)));
  for (const incoming of [20, 50, 100, 500]) {
    const base = (kind: "floorHi" | "floorLo") => floorRestitution(kind, 1, 1);
    const response = (speed: number) => floorReboundSpeed(speed, base, mazeCorrection);
    const oldRebound = incoming > 40 ? incoming * mazeCorrection(incoming) : 0;
    near(response(incoming), oldRebound > 40 ? oldRebound : 0);
    near(hit(false, "white", incoming, "side", response).outgoing, response(incoming));
  }
});

test("实际 engine 接线：玻璃才传地面响应，floor 与凸块共用有效倍率/阈值/修正", () => {
  const source = readFileSync(new URL("./engine.ts", import.meta.url), "utf8");
  const dev = readFileSync(new URL("./dev.ts", import.meta.url), "utf8");
  assert.match(dev, /k === "ball" \|\| k === "rimFric"/);
  assert.match(dev, /Math.max\(0, Math.min\(2, n\)\)/, "ball clamp preserves the glass zero");
  assert.match(source, /clampPhysKey\(k, devOn \? devPhys\[k\] : kitPhys\(k\)\)/);
  assert.match(source, /import \{ floorRestitution, floorReboundSpeed \} from "\.\/floor-response"/);
  assert.match(source, /const ballK = pMul\("ball"\);[\s\S]*?const floorK = pMul\("floor"\);/);
  assert.match(source, /return floorRestitution\(kind, ballK, floorK\)/);
  assert.match(source, /function floorRebound\(incoming: number\) \{\s*return floorReboundSpeed\(incoming, bounceRest, isMaze\(\) \? mazeRestitution : undefined\)/);
  const dispatch = source.slice(source.indexOf("if (collideBlueprint("), source.indexOf("showBlueprintRewards();", source.indexOf("if (collideBlueprint(")));
  assert.match(dispatch, /world, ball, prevBallX, prevBallY/);
  assert.match(dispatch, /isSuper\(\) \? \(nx, ny\) => superCancelsSolid\(nx, ny\) : undefined/);
  assert.match(dispatch, /undefined,\s*isGlass\(\) \? floorRebound : undefined,/);
  const floor = source.slice(source.indexOf("  function collideFloor()"), source.indexOf("  function checkScore("));
  assert.match(floor, /const rebound = floorRebound\(incoming\)/);
  assert.match(floor, /ball.vy = -rebound/);
  assert.match(floor, /glassFloorHurtShot = true/);
  assert.match(floor, /hurtGlass\(dmg,/);
});


test("玻璃嵌入凸块仍沿原法线分离，不被普通最小弹起再次加速", () => {
  for (const dynamic of [false, true]) {
    const { clock, box } = fixture(dynamic, "black");
    const ball = { x: box.x + 1, y: box.y + box.h / 2, vx: 100, vy: 9, r: 3 };
    assert.equal(collideBlueprint(world, ball, ball.x, ball.y, undefined, clock, rebound), true);
    near(ball.vx, 0);
    near(ball.vy, 9);
    assert.ok(ball.x + ball.r <= box.x, "original left-side separation remains");
  }
});


test("共享提取前后地面响应逐值一致，不改变其它球地面弹力", () => {
  for (const ballK of [0, 0.35, 0.8, 1, 2]) {
    for (const floorK of [0.5, 1, 1.3, 2]) {
      for (const incoming of [-20, 0, 20, 40, 50, 62.5, 100, 140, 141, 500, 2000]) {
        const raw = incoming > 140 ? 0.7 * ballK * floorK : 0.64 * ballK * floorK;
        const previousRest = Math.max(0, Math.min(0.84, raw));
        const previousRebound = incoming * previousRest;
        const expected = incoming > 40 && previousRebound > 40 ? previousRebound : 0;
        assert.equal(rebound(incoming, ballK, floorK), expected);
      }
    }
  }
});
