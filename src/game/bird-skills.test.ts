import test from "node:test";
import assert from "node:assert/strict";
import { createBirds, spawnBirdWave, stepBirds, collideBirds, collideFrozenBirds, releaseBirdCarrier, birdOwnsBall, type BirdKind } from "./birds.ts";
import { createSuper, superBirdImpact, superSwipe, stepSuper, superImpact } from "./super.ts";
import { createVector, vectorRelease } from "./vector.ts";
import { getTrainGantries, collideTrainGantries } from "./train-gantry.ts";
const world = { w: 390, h: 844, floorY: 646, ballR: 19.5 };
function setup(kind: BirdKind = "eagle") {
  const s = createBirds(); spawnBirdWave(s, world, kind, () => 0.3, 1);
  const b = s.birds[0]!;
  Object.assign(b, { x: 190, y: 300, px: 190, py: 300, baseY: 300 });
  const ball = { x: 205, y: 300, vx: 100, vy: 80, r: 19.5 };
  return { s, b, ball };
}
test("super shield blocks ordinary birds without changing trajectory", () => {
  for (const kind of ["silly", "dive"] as const) {
    const { s, b, ball } = setup(kind), shield = createSuper(); shield.energy = 60; shield.shield = true;
    const before = { ...ball };
    assert.equal(collideBirds(s, ball, ball.x, ball.y, { block: (catching,nx,ny) => superBirdImpact(shield,ball,catching,nx,ny) }), "knockdown");
    assert.deepEqual(ball, before); assert.equal(shield.energy, 56); assert.equal(b.mode, "stunned");
  }
});
test("super shield spends exactly two full segments for eagle grip; insufficient energy still gets caught", () => {
  for (const energy of [39.9, 40, 60]) {
    const { s, ball } = setup(), shield = createSuper(); shield.energy = energy; shield.shield = true;
    const before = { ...ball };
    const result = collideBirds(s, ball, ball.x, ball.y, { block: (catching,nx,ny) => superBirdImpact(shield,ball,catching,nx,ny) });
    assert.equal(result, energy < 40 ? "caught" : "knockdown");
    assert.equal(shield.energy, energy < 40 ? energy : energy - 40);
    if (energy >= 40) assert.deepEqual(ball, before);
  }
});
test("perfect cancel can stun a grabbing eagle once, and expires while carried", () => {
  const { s, b, ball } = setup(), power = createSuper();
  assert.equal(collideBirds(s, ball, ball.x, ball.y, { block: (catching,nx,ny) => superBirdImpact(power,ball,catching,nx,ny) }), "caught");
  stepSuper(power, ball, 0.03);
  assert.equal(superSwipe(power,ball,50,0), "parry");
  assert.equal(releaseBirdCarrier(s), true); assert.equal(b.mode, "stunned"); assert.equal(s.kills, 1);
  assert.equal(releaseBirdCarrier(s), false); assert.equal(s.kills, 1); assert.equal(birdOwnsBall(s), false);
  const late = createSuper(); superImpact(late,ball); stepSuper(late,ball,0.08);
  assert.notEqual(superSwipe(late,ball,50,0), "parry");
});
test("gantry collisions arm the existing perfect-cancel window", () => {
  const route = { near: 1500, started: true, stationAt: 0, nextStationAt: 28080 };
  const beam = getTrainGantries(world,route)[0]!.rects[0]!;
  const ball = { x: beam.x + beam.w / 2, y: beam.y + 50, vx: 0, vy: 1000, r: 10 };
  const power = createSuper();
  assert.equal(collideTrainGantries(world,route,ball,ball.x,beam.y-50,0,0.1,()=>superImpact(power,ball,{shield:false})), true);
  assert.equal(superSwipe(power,ball,50,0), "parry"); assert.equal(ball.vx,0); assert.equal(ball.vy,0);
});
test("discharging and awakened balls stun instead of being grabbed and retain motion", () => {
  for (const kind of ["eagle", "silly", "dive"] as const) {
    const { s, ball } = setup(kind), before = { ...ball };
    assert.equal(collideBirds(s,ball,ball.x,ball.y,{lethal:true}), "knockdown");
    assert.deepEqual(ball,before); assert.equal(s.carrier,null);
  }
});
test("burning balls blacken the bird and award a single stun", () => {
  const { s, b, ball } = setup();
  assert.equal(collideBirds(s,ball,ball.x,ball.y,{burn:true}), "knockdown");
  assert.equal(b.burnt,true); assert.equal(b.mode,"stunned"); assert.equal(s.kills,1);
  assert.equal(collideBirds(s,ball,ball.x,ball.y,{burn:true}),null);
});
test("quantum invisibility prevents observation, cancels a tell, and prevents physical grabbing", () => {
  const { s, b, ball } = setup();
  Object.assign(b,{x:100,px:100,y:60,py:60,baseY:40,attackIn:0,dir:1,flightVx:200});
  ball.x=260; ball.y=450;
  stepBirds(s,world,ball,0.1,false,()=>0.3,0,0,{unobservable:true}); assert.equal(b.mode,"patrol");
  stepBirds(s,world,ball,0.1,false,()=>0.3); assert.equal(b.mode,"warning");
  stepBirds(s,world,ball,0.1,false,()=>0.3,0,0,{unobservable:true}); assert.equal(b.mode,"patrol");
  ball.x=b.x;ball.y=b.y;
  assert.equal(collideBirds(s,ball,ball.x,ball.y,{unobservable:true}),null);
});
test("freezing rolls the supplied hoop probability, awards no stun, then shatters once", () => {
  const { s, b, ball } = setup();
  assert.equal(collideBirds(s,ball,ball.x,ball.y,{frostChance:0.4},()=>0.39),"frozen");
  assert.equal(s.kills,0);assert.equal(s.iceBreaks,0);assert.equal(s.carrier,null);
  stepBirds(s,world,ball,0.1,false);
  assert.ok(b.y>b.py); assert.equal(b.mode,"frozen");
  b.py=world.floorY-100;b.y=world.floorY+50;
  collideFrozenBirds(s,[{x:0,y:world.floorY,w:world.w,h:100}]);
  assert.equal(b.mode,"shattered");assert.equal(s.iceBreaks,1);assert.equal(s.kills,0);
  collideFrozenBirds(s,[{x:0,y:world.floorY,w:world.w,h:100}]);assert.equal(s.iceBreaks,1);
  const missed=setup();
  assert.equal(collideBirds(missed.s,missed.ball,missed.ball.x,missed.ball.y,{frostChance:0.4},()=>0.4),"caught");
});
test("frozen birds can shatter against basketballs, moving signals and diagonal braces", () => {
  for (const target of ["ball","signal","brace"]) {
    const { s,b,ball }=setup(); b.mode="frozen";b.modeTime=0.1;
    if(target==="ball") assert.equal(collideBirds(s,ball,ball.x,ball.y),"shattered");
    else if(target==="signal") collideFrozenBirds(s,[{x:180,y:280,w:20,h:40,shift:10}]);
    else collideFrozenBirds(s,[],[{x0:100,y0:210,x1:250,y1:360,halfW:3}]);
    assert.equal(s.iceBreaks,1);assert.equal(s.kills,0);
  }
});
test("non-stun contacts report relative impact for glass damage even when the ball is stationary", () => {
  const {s,b,ball}=setup(); b.mode="frozen"; b.vx=700; b.vy=0;
  ball.x=b.x+20; ball.y=b.y; ball.vx=0; ball.vy=0;
  let impact=0;
  assert.equal(collideBirds(s,ball,ball.x,ball.y,{contact:n=>{impact=n}}),"shattered");
  assert.equal(impact,700);assert.equal(s.kills,0);
});
test("black hole counts each absorbed bird once, including birds stunned before the hole opened", () => {
  for (const rewarded of [false,true]) {
    const {s,b,ball}=setup();b.rewarded=rewarded;
    for(let i=0;i<120;i++)stepBirds(s,world,ball,1/60,false,()=>0.3,0,0,{hole:{x:250,y:500,r:30}});
    assert.equal(s.birds.length,0);assert.equal(s.absorbed,1);assert.equal(s.kills,0);
  }
});
test("black hole suppresses bird impacts and grabs immediately, even before suction steps", () => {
  for (const kind of ["eagle", "silly", "dive"] as const) {
    const {s,b,ball}=setup(kind), before={...ball};
    const mode=b.mode;
    assert.equal(collideBirds(s,ball,ball.x,ball.y,{hole:{x:250,y:500,r:30},burn:true,lethal:true}),null);
    assert.deepEqual(ball,before);assert.equal(s.kills,0);assert.equal(s.carrier,null);assert.equal(b.mode,mode);
    assert.notEqual(collideBirds(s,ball,ball.x,ball.y),null,"ordinary contacts resume after the hole closes");
  }
});
test("vector short press pays its existing cost and releases/stuns the carrier", () => {
  const {s,ball}=setup();collideBirds(s,ball,ball.x,ball.y);
  const v=createVector();v.energy=250;v.pointer=1;v.held=0.1;
  assert.equal(vectorRelease(v),"correct");assert.equal(v.energy,0);
  assert.equal(releaseBirdCarrier(s),true);assert.equal(s.kills,1);assert.equal(s.carrier,null);
});
test("rewinding a frozen interaction restores the object and makes its next shatter a single reward", () => {
  const {s,b}=setup();b.mode="frozen";b.modeTime=0.2;
  const saved=structuredClone(s);
  collideFrozenBirds(s,[{x:180,y:290,w:30,h:30}]);assert.equal(s.iceBreaks,1);
  Object.assign(s,structuredClone(saved));assert.equal(s.iceBreaks,0);assert.equal(s.birds[0]!.mode,"frozen");
  collideFrozenBirds(s,[{x:180,y:290,w:30,h:30}]);assert.equal(s.iceBreaks,1);
});
