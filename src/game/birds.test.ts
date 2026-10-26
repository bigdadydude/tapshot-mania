import { test } from "node:test";
import assert from "node:assert/strict";
import { createBirds, spawnBirdWave, stepBirds, rollBirdWave, collideBirds, collideBirdGantries, birdOwnsBall, birdBehindCloud, eagleWarningLit, type BirdKind } from "./birds.ts";
import type { TrainGantry } from "./train-gantry.ts";
import { hackerIntercept } from "./hacker.ts";
const world = { w: 390, h: 844, floorY: 646, ballR: 19.5 };
const body = () => ({ x: 190, y: 400, vx: 0, vy: 0, r: 19.5 });
test("wave odds start at 20/10/5 percent and each basket adds two percentage points", () => {
  const counts = (made: number) => {
    const result = { silly: 0, dive: 0, eagle: 0, none: 0 };
    for (let i = 0; i < 10000; i++) result[rollBirdWave(made, (i + 0.5) / 10000) ?? "none"]++;
    return result;
  };
  assert.deepEqual(counts(0), { silly: 2000, dive: 1000, eagle: 500, none: 6500 });
  assert.deepEqual(counts(1), { silly: 2200, dive: 1200, eagle: 700, none: 5900 });
  assert.deepEqual(counts(10), { silly: 4000, dive: 3000, eagle: 2500, none: 500 });
  const overflow = counts(11);
  assert.equal(overflow.none, 0);
  assert.ok(Math.abs(overflow.silly / overflow.dive - 0.42 / 0.32) < 0.001);
  assert.equal(counts(100).none, 0);
  assert.deepEqual(counts(0), counts(-10));
});
test("a quiet roll waits for the next interval instead of retrying every frame", () => {
  const s = createBirds(), ball = body(); let rolls = 0;
  const rng = () => { rolls++; return 0.9; };
  stepBirds(s, world, ball, 3, true, rng);
  assert.equal(s.birds.length, 0); assert.ok(s.nextWave >= 4);
  const after = rolls;
  stepBirds(s, world, ball, 1 / 60, true, rng);
  assert.equal(rolls, after);
  s.nextWave = 0;
  stepBirds(s, world, ball, 1 / 60, true, rng, 0, 10);
  assert.equal(s.birds[0]?.kind, "eagle");
});
function scene(kind: BirdKind) {
  const s = createBirds(); spawnBirdWave(s, world, kind, () => 0.3, 1);
  const b = s.birds[0]!;
  Object.assign(b, { x: 190, y: 350, px: 190, py: 350, baseY: kind === "eagle" ? b.baseY : 350 });
  return { s, b, ball: body() };
}

test("hacker interception success knocks down an eagle; failure preserves its catch", () => {
  for (const success of [false, true]) {
    const { s, b, ball } = scene("eagle");
    ball.x = b.x; ball.y = b.y; ball.vy = -200;
    const result = collideBirds(s, ball, b.x, b.y + 60, {
      hackerBlock: target => hackerIntercept(target, 1, 4, () => success ? 0.9 : 0.1),
    });
    assert.equal(result, success ? "knockdown" : "caught");
    assert.equal(s.carrier, success ? null : b.id);
  }
});
test("waves contain one species, at most two birds; eagles are solitary", () => {
  for (const kind of ["silly", "dive", "eagle"] as const) {
    const s = createBirds(); spawnBirdWave(s, world, kind, () => 0.1, 7);
    assert.equal(s.birds.length, kind === "eagle" ? 1 : 2);
    assert.ok(s.birds.every(b => b.kind === kind && b.r >= world.ballR * 0.85 && b.r <= world.ballR * 1.1));
    assert.equal(spawnBirdWave(s, world, "silly"), false);
  }
});
test("first bird wave waits for play eligibility; no simulation on zero delta", () => {
  const s = createBirds(), ball = body();
  stepBirds(s, world, ball, 10, false); assert.equal(s.birds.length, 0);
  stepBirds(s, world, ball, 3, true, () => 0.1); assert.equal(s.birds.length, 2);
  const old = structuredClone(s); stepBirds(s, world, ball, 0); assert.deepEqual(s, old);
});
test("silly bird flaps, flies slowly, then falls vertically after a swept impact", () => {
  const { s, b, ball } = scene("silly"), flap = b.flap;
  stepBirds(s, world, ball, 0.1, false);
  assert.notEqual(b.flap, flap); assert.ok(Math.abs(b.vx) < world.w * 0.25);
  ball.x = b.x; ball.y = b.y + 90; ball.vy = 1200;
  assert.equal(collideBirds(s, ball, b.x, b.y - 90), "knockdown");
  const x = b.x; stepBirds(s, world, ball, 0.5, false);
  assert.equal(b.x, x); assert.equal(b.vx, 0); assert.ok(b.vy > 30);
  assert.equal(birdOwnsBall(s), false);
});
test("fast moving dive bird hits the ball along its dive and is stunned without carrying", () => {
  const { s, b, ball } = scene("dive");
  Object.assign(b, { px: 90, py: 400, x: 290, y: 400 });
  const ratio = b.vy / b.vx;
  assert.equal(collideBirds(s, ball, ball.x, ball.y), "knockdown");
  assert.equal(s.carrier, null); assert.equal(s.kills, 1);
  assert.equal(b.mode, "stunned"); assert.ok(ball.vx > 500 && ball.vy > 0);
  assert.ok(Math.abs(ball.vy / ball.vx - ratio) < 1e-8);
  assert.equal(collideBirds(s, ball, ball.x, ball.y), null);
});
test("dive impact direction follows train-relative velocity for either heading", () => {
  for (const dir of [-1, 1]) {
    const { s, b, ball } = scene("dive");
    b.vx = dir * 600; b.flightVx = 540 + b.vx; b.vy = 300; s.trainSpeed = 540;
    Object.assign(ball, { x: b.x, y: b.y });
    assert.equal(collideBirds(s, ball, ball.x, ball.y), "knockdown");
    assert.ok(ball.vx * dir > 600); assert.ok(ball.vy > 300);
    assert.equal(b.flightVx, 0); assert.equal(b.vx, -540); assert.equal(b.vy, 0);
    assert.equal(birdOwnsBall(s), false); assert.equal(s.returns, 0);
  }
});
test("eagle warns for half a second, misses beyond the screen, then returns low and climbs", () => {
  const { s, b, ball } = scene("eagle");
  b.x = world.w * 0.15; b.y = b.baseY; b.attackIn = 0.6; b.dir = 1;
  ball.x = world.w - 20;
  const initialY = b.y;
  stepBirds(s, world, ball, 0.3, false); assert.ok(b.y > initialY);
  stepBirds(s, world, ball, 0.31, false); assert.equal(String(b.mode), "warning");
  assert.equal(eagleWarningLit(b), true);
  stepBirds(s, world, ball, 0.15, false); assert.equal(eagleWarningLit(b), false);
  stepBirds(s, world, ball, 0.34, false); assert.equal(String(b.mode), "warning");
  stepBirds(s, world, ball, 0.01, false); assert.equal(String(b.mode), "dive");
  let climbed = false, patrolled = false, leftScreen = false;
  for (let i = 0; i < 3000; i++) {
    stepBirds(s, world, ball, 1 / 120, false, () => 0.2);
    if (b.mode === "outside") {
      assert.ok(b.x < 0 || b.x > world.w || b.y > world.h);
      leftScreen = true;
    }
    if (b.mode === "climb" && !climbed) {
      assert.ok(leftScreen); assert.ok(b.y > world.floorY); climbed = true;
    }
    if (climbed && b.mode === "patrol") { patrolled = true; break; }
  }
  assert.ok(climbed && patrolled); assert.ok(b.y < world.h * 0.3);
});
test("patrolling eagle is stunned by a descending ball from above and otherwise catches", () => {
  const { s, b, ball } = scene("eagle");
  ball.x = b.x; ball.y = b.y - 10; ball.vy = 600;
  assert.equal(collideBirds(s, ball, b.x, b.y - 70), "knockdown");
  assert.equal(b.mode, "stunned"); assert.ok(ball.vy < 0); assert.equal(s.carrier, null);
  const other = scene("eagle"); other.ball.x = other.b.x; other.ball.y = other.b.y; other.ball.vy = -200;
  assert.equal(collideBirds(other.s, other.ball, other.b.x, other.b.y + 60), "caught");
});
test("eagle lifts its catch, stays immune, then waits exactly 1.5 seconds after exit", () => {
  const { s, b, ball } = scene("eagle");
  Object.assign(ball, { x: b.x, y: b.y }); collideBirds(s, ball, ball.x, ball.y);
  const y = b.y; stepBirds(s, world, ball, 0.2, false); assert.ok(b.y < y);
  b.x = world.w + 80; b.dir = 1;
  stepBirds(s, world, ball, 0.01, false);
  assert.equal(s.carrier, null); assert.equal(s.respawn?.left, 1.5); assert.ok(birdOwnsBall(s));
  stepBirds(s, world, ball, 1.49, false); assert.ok(birdOwnsBall(s));
  stepBirds(s, world, ball, 0.01, false); assert.equal(birdOwnsBall(s), false);
  assert.ok(ball.x >= ball.r * 2 && ball.x <= world.w - ball.r * 2);
  assert.ok(ball.y + ball.r < 0); assert.ok(ball.vy > 0); assert.equal(ball.vx, 0);
  assert.equal(s.enteringFromTop, true); assert.equal(s.returns, 1);
});

test("every eagle exit returns the entire ball above a random horizontal position after the delay", () => {
  const positions = [];
  for (const [edge, roll] of [["left", 0], ["right", 0.3], ["top", 0.7], ["bottom", 0.999]] as const) {
    const { s, b, ball } = scene("eagle");
    Object.assign(ball, { x: b.x, y: b.y }); collideBirds(s, ball, ball.x, ball.y);
    b.x = edge === "left" ? -100 : edge === "right" ? world.w + 100 : world.w / 2;
    b.y = edge === "top" ? -100 : edge === "bottom" ? world.h + 100 : world.h / 2;
    stepBirds(s, world, ball, 0.01, false, () => roll);
    assert.equal(s.respawn?.left, 1.5);
    const hidden = { x: ball.x, y: ball.y };
    stepBirds(s, world, ball, 1.49, false, () => roll);
    assert.deepEqual({ x: ball.x, y: ball.y }, hidden); assert.equal(s.enteringFromTop, false);
    assert.equal(stepBirds(s, world, ball, 0.01, false, () => roll), true);
    assert.ok(ball.y + ball.r < 0); assert.ok(ball.vy > 0); assert.equal(ball.vx, 0);
    assert.ok(ball.x >= ball.r * 2 && ball.x <= world.w - ball.r * 2);
    positions.push(ball.x);
  }
  assert.equal(new Set(positions).size, 4);
});
test("cloud cover is restricted to high patrol and never hides an attacking or carrying eagle", () => {
  const { b } = scene("eagle"); b.hiddenByCloud = true; b.y = 140;
  assert.equal(birdBehindCloud(b, world.h), true);
  for (const mode of ["warning", "dive", "outside", "climb", "carry", "stunned", "fall"] as const) {
    b.mode = mode; assert.equal(birdBehindCloud(b, world.h), false);
  }
});
test("patrol crosses from edge to edge without reversing or teleporting while visible", () => {
  for (const direction of [-1, 1]) {
    const { s, b, ball } = scene("eagle");
    b.dir = direction; b.flightVx = direction * 250;
    b.x = direction > 0 ? -b.r * 3 : world.w + b.r * 3; b.attackIn = 100;
    const entry = b.x;
    for (let i = 0; i < 400 && b.mode !== "outside"; i++) {
      const x = b.x; stepBirds(s, world, ball, 1 / 120, false);
      assert.ok((b.x - x) * direction >= 0); assert.equal(b.dir, direction);
    }
    assert.equal(b.mode, "outside");
    assert.ok(Math.abs(b.x - entry) > world.w);
    const old = { x: b.x, y: b.y }; stepBirds(s, world, ball, 0.5, false);
    assert.deepEqual({ x: b.x, y: b.y }, old);
    assert.equal(collideBirds(s, { ...ball, x: b.x, y: b.y }, b.x, b.y), null);
    stepBirds(s, world, ball, 0.16, false);
    assert.equal(String(b.mode), "patrol"); assert.ok(b.x < 0 || b.x > world.w);
    assert.equal(b.px, b.x); assert.equal(b.py, b.y);
  }
});
test("failed dives continue past the roof and return below it at the same exit boundary", () => {
  for (const edge of ["left", "right", "bottom"] as const) {
    const { s, b, ball } = scene("eagle");
    b.mode = "dive"; b.y = world.floorY - 5;
    b.x = edge === "left" ? 5 : edge === "right" ? world.w - 5 : world.w / 2;
    b.flightVx = edge === "left" ? -450 : edge === "right" ? 450 : 0; b.vy = 700;
    stepBirds(s, world, ball, 0.02, false); assert.equal(String(b.mode), "dive");
    for (let i = 0; i < 200 && String(b.mode) !== "outside"; i++) stepBirds(s, world, ball, 0.01, false);
    assert.equal(b.exitEdge, edge); assert.equal(String(b.mode), "outside");
    stepBirds(s, world, ball, 0.66, false);
    assert.equal(String(b.mode), "climb"); assert.ok(b.y > world.floorY);
    if (edge === "left") assert.ok(b.x < 0);
    else if (edge === "right") assert.ok(b.x > world.w);
    else assert.ok(b.y > world.h);
    assert.equal(b.x, b.px); assert.equal(b.y, b.py);
  }
});
test("silly and dive birds subtract train displacement; falling birds drift with the scenery", () => {
  for (const kind of ["silly", "dive"] as const) {
    const a = scene(kind), z = structuredClone(a);
    a.b.attackIn = 100; z.b = z.s.birds[0]!; z.b.attackIn = 100;
    stepBirds(a.s, world, a.ball, 0.1, false, () => 0.2, 0);
    stepBirds(z.s, world, z.ball, 0.1, false, () => 0.2, 100);
    assert.ok(Math.abs(a.b.x - z.b.x - 10) < 1e-8);
    assert.ok(Math.abs(a.b.vx - z.b.vx - 100) < 1e-8);
  }
  const { s, b, ball } = scene("silly"); b.mode = "fall";
  const x = b.x; stepBirds(s, world, ball, 0.1, false, Math.random, 540);
  assert.equal(b.x, x - 54); assert.equal(b.flightVx, 0);
});
test("silly spawn entry follows relative direction even when the train overtakes it", () => {
  const s = createBirds(); spawnBirdWave(s, world, "silly", () => 0.3, 1, 800);
  assert.ok(s.birds[0]!.x > world.w); assert.ok(s.birds[0]!.vx < 0);
});
test("dive birds enter diagonally on either side at every train speed and retain heading during acceleration", () => {
  for (const w of [world, { ...world, w: 320 }, { ...world, w: 450, h: 800 }]) {
    for (const speed of [0, 100, 300, 540]) for (const random of [0.3, 0.7]) {
      const s = createBirds(); spawnBirdWave(s, w, "dive", () => random, 1, speed);
      const b = s.birds[0]!;
      assert.ok(b.vx * b.dir > 0);
      assert.ok(b.vx > 0 ? b.x < 0 : b.x > w.w);
      for (const nextSpeed of [speed, 540]) {
        stepBirds(s, w, body(), 1 / 60, false, () => random, nextSpeed);
        assert.ok(b.vx * b.dir >= Math.abs(b.vy));
        assert.ok(Math.abs((b.x - b.px) / (b.y - b.py)) >= 0.999);
        assert.ok(Math.abs(b.vx - (b.flightVx - nextSpeed)) < 1e-8);
      }
    }
  }
});
test("low recovery matches train speed, then catching accelerates lift and preserves carry immunity", () => {
  const { s, b, ball } = scene("eagle");
  b.mode = "climb"; b.exitEdge = "left"; b.x = 80; b.y = world.floorY + 40;
  stepBirds(s, world, ball, 0.1, false, Math.random, 540);
  assert.ok(Math.abs(b.flightVx - 540) <= world.w * 0.18);
  assert.ok(Math.abs(b.vx) < 80); assert.ok(Math.abs(b.vy) < world.h * 0.1);
  Object.assign(ball, { x: b.x, y: b.y + b.r * 1.05 + ball.r, vy: -10 });
  assert.equal(collideBirds(s, ball, b.px, b.py + 100), "caught");
  const climbSpeed = Math.abs(b.vy);
  stepBirds(s, world, ball, 0.3, false, Math.random, 540);
  assert.ok(Math.abs(b.vy) > climbSpeed * 2); assert.ok(Math.abs(b.vx) > 100);
  assert.equal(collideBirds(s, ball, ball.x, ball.y), null);
  assert.equal(ball.x, b.x); assert.equal(ball.vx, b.vx);
});
test("eagle ignores balls behind its actual patrol movement in both directions", () => {
  for (const direction of [-1, 1]) {
    const { s, b, ball } = scene("eagle");
    b.dir = direction; b.flightVx = 300 + direction * 100; b.attackIn = 0;
    ball.x = b.x - direction * 80;
    for (let i = 0; i < 20; i++) {
      const x = b.x;
      stepBirds(s, world, ball, 0.01, false, Math.random, 300);
      assert.equal(b.mode, "patrol"); assert.ok((b.x - x) * direction > 0);
    }
  }
});
test("warning keeps flying for 0.5 seconds then dives only forward", () => {
  for (const direction of [-1, 1]) {
    const { s, b, ball } = scene("eagle");
    b.dir = direction; b.flightVx = direction * 100; b.attackIn = 0;
    ball.x = direction > 0 ? 370 : 20;
    stepBirds(s, world, ball, 0.01, false);
    assert.equal(String(b.mode), "warning");
    const x = b.x;
    for (let i = 0; i < 49; i++) {
      const before = b.x;
      stepBirds(s, world, ball, 0.01, false);
      assert.equal(String(b.mode), "warning"); assert.ok((b.x - before) * direction > 0);
    }
    stepBirds(s, world, ball, 0.01, false);
    assert.equal(String(b.mode), "dive"); assert.ok(b.vx * direction > 0);
    assert.ok(Math.abs(b.x - x - direction * 50) < 1e-7);
  }
});
test("a ball passing behind during the warning cancels the attack without stopping", () => {
  for (const direction of [-1, 1]) {
    const { s, b, ball } = scene("eagle");
    b.dir = direction; b.flightVx = direction * 100; b.attackIn = 0; ball.x = b.x + direction * 100;
    stepBirds(s, world, ball, 0.01, false);
    assert.equal(String(b.mode), "warning");
    ball.x = b.x - direction * 80; const x = b.x;
    stepBirds(s, world, ball, 0.3, false);
    assert.equal(String(b.mode), "patrol"); assert.ok((b.x - x) * direction > 0);
    assert.equal(b.flightVx, direction * 100);
  }
});
test("predicted target and later train acceleration cannot reverse a committed dive", () => {
  const { s, b, ball } = scene("eagle");
  b.flightVx = 100; b.attackIn = 0; ball.x = 320; ball.vx = -1200;
  stepBirds(s, world, ball, 0.01, false);
  stepBirds(s, world, ball, 0.5, false);
  assert.equal(b.mode, "dive"); assert.ok(b.vx > 0);
  const x = b.x; stepBirds(s, world, ball, 0.1, false, Math.random, 540);
  assert.ok(b.x > x); assert.ok(b.vx > 0); assert.equal(b.dir, 1);
});
test("warning passes out of the screen as a patrol instead of hovering or turning back", () => {
  const { s, b, ball } = scene("eagle");
  b.mode = "warning"; b.attackDir = 1; b.x = world.w - 1; b.flightVx = 500;
  stepBirds(s, world, ball, 0.2, false);
  assert.equal(b.mode, "outside"); assert.equal(b.reentry, "patrol");
  assert.ok(b.x > world.w); assert.ok(b.vx > 0);
});

test("eagle alternates edges along the same arc even at full train speed", () => {
  for (const trainSpeed of [0, 540, 800]) for (const initialDir of [-1, 1]) {
    const s = createBirds(), ball = body();
    spawnBirdWave(s, world, "eagle", () => initialDir > 0 ? 0.3 : 0.7, 1, trainSpeed);
    const b = s.birds[0]!;
    for (let pass = 0; pass < 4; pass++) {
      const direction = initialDir * (pass % 2 ? -1 : 1);
      b.attackIn = 100;
      assert.equal(Math.sign(b.vx), direction);
      assert.ok(direction > 0 ? b.x < 0 : b.x > world.w);
      for (let i = 0; i < 1200 && b.mode !== "outside"; i++) {
        const x = b.x;
        stepBirds(s, world, ball, 1 / 120, false, () => 0.3, trainSpeed);
        assert.ok((b.x - x) * direction > 0);
        if (b.x > 0 && b.x < world.w) {
          assert.ok(Math.abs(b.y - (b.baseY + world.h * 0.12 * Math.sin(b.x / world.w * Math.PI))) < 1e-8);
          assert.ok(b.y - b.r > 0 && b.y + b.r <= world.h * 0.25);
        }
      }
      assert.equal(b.mode, "outside");
      assert.equal(b.exitEdge, direction > 0 ? "right" : "left");
      stepBirds(s, world, ball, 0.66, false, () => 0.3, trainSpeed);
    }
  }
});

test("accelerating train cannot stall or reverse a patrolling eagle", () => {
  const { s, b, ball } = scene("eagle"); b.attackIn = 100;
  for (const speed of [100, 250, 253.5, 400, 540, 800]) {
    const x = b.x; stepBirds(s, world, ball, 0.01, false, () => 0.3, speed);
    assert.ok(b.x > x); assert.ok(b.vx > 0); assert.ok(Math.abs(b.vx - (b.flightVx - speed)) < 1e-8);
  }
});

test("recovering eagle catches only at its talons; head, wings and sides can be stunned", () => {
  for (const dir of [-1, 1]) {
    const { s, b, ball } = scene("eagle"); b.mode = "climb"; b.dir = dir;
    Object.assign(ball, { x: b.x, y: b.y + b.r * 1.08 + ball.r, vy: -200 });
    assert.equal(collideBirds(s, ball, b.x, b.y + 100), "caught");
    assert.equal(s.kills, 0); assert.equal(s.carrier, b.id);
    for (const [x, y, dx, dy] of [[-1.9, -0.65, -100, 0], [1.1, -0.25, 100, 0], [0, -1, 0, -100], [-1.3, 0.2, -100, 30]]) {
      const other = scene("eagle"); other.b.mode = "climb"; other.b.dir = dir;
      Object.assign(other.ball, { x: other.b.x + x! * other.b.r * dir, y: other.b.y + y! * other.b.r, vx: -dx! * dir, vy: -dy! });
      assert.equal(collideBirds(other.s, other.ball, other.b.x + dx! * dir, other.b.y + dy!), "knockdown");
      assert.equal(other.b.mode, "stunned"); assert.equal(other.s.carrier, null);
    }
  }
});

test("all birds flash before falling vertically in world space, and are rewarded only once", () => {
  for (const kind of ["silly", "dive", "eagle"] as const) {
    const { s, b, ball } = scene(kind); s.trainSpeed = 540;
    if (kind === "eagle") b.mode = "climb";
    Object.assign(ball, { x: b.x, y: b.y - 5, vy: 600 });
    assert.equal(collideBirds(s, ball, b.x, b.y - 80), "knockdown");
    const { x, y } = b;
    stepBirds(s, world, ball, 0.2, false, Math.random, 540);
    assert.equal(b.mode, "stunned"); assert.equal(b.y, y); assert.equal(b.x, x - 108);
    assert.equal(collideBirds(s, ball, b.x, b.y), null); assert.equal(s.kills, 1);
    stepBirds(s, world, ball, 0.21, false, Math.random, 540);
    assert.equal(b.mode, "fall"); assert.ok(b.y > y); assert.equal(b.flightVx, 0);
    assert.equal(birdOwnsBall(s), false);
    for (let i = 0; i < 30; i++) stepBirds(s, world, ball, 0.1, false, Math.random, 540);
    assert.equal(s.birds.length, 0); assert.equal(s.kills, 1);
  }
});

test("moving gantry beams, masts and signals stun birds with swept collision", () => {
  for (const kind of ["silly", "dive", "eagle"] as const) for (const part of ["beam", "mast", "signal"] as const) {
    const { s, b } = scene(kind); s.trainSpeed = 540;
    const gantry: TrainGantry = { id: 1, x: 100, y: 300, width: 20, rects: [{ x: 100, y: 300, w: 20, h: 100, kind: part }] };
    // The gantry moves from x=260 to x=100, passing through the bird this step.
    assert.equal(collideBirdGantries(s, [gantry], 160), 1);
    assert.equal(b.mode, "stunned"); assert.equal(s.kills, 1);
    assert.equal(collideBirdGantries(s, [gantry], 160), 0);
  }
});

test("gantries leave gaps clear and cannot stun a bird carrying the ball", () => {
  const { s, b, ball } = scene("eagle");
  const gantry: TrainGantry = { id: 1, x: 180, y: 200, width: 20, rects: [{ x: 180, y: 200, w: 20, h: 20, kind: "beam" }] };
  assert.equal(collideBirdGantries(s, [gantry], 0), 0);
  Object.assign(ball, { x: b.x, y: b.y });
  assert.equal(collideBirds(s, ball, ball.x, ball.y), "caught");
  gantry.rects[0]!.y = b.y;
  assert.equal(collideBirdGantries(s, [gantry], 0), 0);
  assert.equal(s.carrier, b.id); assert.equal(b.mode, "carry"); assert.equal(s.kills, 0);
});

test("silly bird is solid: ball rebounds from every side and overtaking never passes through", () => {
  for (const [nx, ny] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const { s, b, ball } = scene("silly"); b.vx = 0; b.vy = 0;
    Object.assign(ball, { x: b.x + nx! * 20, y: b.y + ny! * 20, vx: -nx! * 600, vy: -ny! * 600 });
    assert.equal(collideBirds(s, ball, b.x + nx! * 90, b.y + ny! * 90), "knockdown");
    assert.ok(ball.vx * nx! + ball.vy * ny! > 0);
    assert.ok(Math.hypot(ball.x - b.x, ball.y - b.y) > ball.r + b.r);
    assert.equal(b.mode, "stunned"); assert.equal(s.kills, 1);
  }
  const { s, b, ball } = scene("silly"); b.vx = 70; b.vy = 0;
  Object.assign(ball, { x: b.x - 20, y: b.y, vx: 100, vy: 0 });
  assert.equal(collideBirds(s, ball, b.x - 60, b.y), "knockdown");
  assert.ok(ball.vx < 0); assert.equal(b.flightVx, 0);
});

test("coincident centers still separate the basketball and stun a silly bird", () => {
  const { s, b, ball } = scene("silly");
  Object.assign(ball, { x: b.x, y: b.y, vx: 0, vy: 400 });
  assert.equal(collideBirds(s, ball, b.x, b.y), "knockdown");
  assert.ok(ball.vy < 0); assert.ok(Math.hypot(ball.x - b.x, ball.y - b.y) > ball.r + b.r);
  assert.equal(b.mode, "stunned");
});

test("random eagle altitudes stay in the top quarter and change only between passes", () => {
  for (const w of [world, { w: 450, h: 800, floorY: 610, ballR: 22.5 }]) {
    const altitudes: number[] = [];
    for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
      const s = createBirds(), ball = body(); spawnBirdWave(s, w, "eagle", () => roll);
      const b = s.birds[0]!; b.attackIn = 100;
      altitudes.push(b.baseY);
      const base = b.baseY;
      for (let i = 0; i < 500 && b.mode !== "outside"; i++) {
        stepBirds(s, w, ball, 1 / 120, false, () => 0.5);
        assert.equal(b.baseY, base);
        assert.ok(b.y - b.r * 1.6 >= -1e-8 && b.y + b.r <= w.h * 0.25 + 1e-8);
      }
      assert.equal(b.mode, "outside");
      stepBirds(s, w, ball, 0.66, false, () => 1 - roll);
      if (roll !== 0.5) assert.notEqual(b.baseY, base);
      assert.equal(String(b.mode), "patrol");
      assert.equal(b.y, b.py);
    }
    assert.equal(new Set(altitudes).size, altitudes.length);
  }
});
