import test from "node:test";
import assert from "node:assert/strict";
import { rimPassage } from "./rim-score.ts";

const rim = { x: 200, y: 200, inner: 28 };
test("grazing passages inside the opening count without extending into the supports", () => {
  for (const r of [5,10,20]) for (const side of [-1,1]) {
    const x=rim.x+side*(rim.inner-.5);
    assert.equal(rimPassage(rim,{x,y:201,r,vy:400},{x,y:199},false),"down");
    const outside=rim.x+side*(rim.inner+.1);
    assert.equal(rimPassage(rim,{x:outside,y:201,r,vy:400},{x:outside,y:199},false),null);
  }
});
test("a rim collision can turn the same step into a make, but a later sideways entry cannot", () => {
  const previous={x:229,y:199};
  assert.equal(rimPassage(rim,{x:229,y:203,r:20,vy:400},previous,false),null);
  assert.equal(rimPassage(rim,{x:210,y:210,r:20,vy:350},previous,false),"down");
  assert.equal(rimPassage(rim,{x:210,y:210,r:20,vy:350},{x:229,y:203},false),null);
});
test("an upward-moving rim counts a genuine relative downward passage", () => {
  assert.equal(rimPassage({...rim,y:190}, {x:200,y:196,r:10,vy:60}, {x:200,y:195}, false, rim), "down");
  // Even an upward-moving ball passes downward relative to a faster rising rim.
  assert.equal(rimPassage({...rim,y:190}, {x:200,y:193,r:10,vy:-120}, {x:200,y:195}, false, rim), "down");
});
test("a descending rim uses its old plane and cannot score a ball that stays below", () => {
  assert.equal(rimPassage({...rim,y:210}, {x:200,y:212,r:10,vy:780}, {x:200,y:199}, false, rim), "down");
  assert.equal(rimPassage({...rim,y:210}, {x:200,y:212,r:10,vy:420}, {x:200,y:205}, false, rim), null);
  assert.equal(rimPassage({...rim,y:210}, {x:200,y:209,r:10,vy:240}, {x:200,y:205}, false, rim), null);
});
test("horizontal motion uses the opening at the exact crossing time", () => {
  assert.equal(rimPassage({...rim,x:260}, {x:230,y:210,r:10,vy:1200}, {x:230,y:190}, false, rim), "down");
  assert.equal(rimPassage({...rim,x:260}, {x:260,y:210,r:10,vy:1200}, {x:260,y:190}, false, rim), null);
});
test("moving rings still require a fresh passage and explicit reverse-score permission", () => {
  assert.equal(rimPassage({...rim,y:210}, {x:200,y:209,r:10,vy:240}, {x:200,y:205}, true, rim), "up");
  assert.equal(rimPassage({...rim,y:210}, {x:200,y:209,r:10,vy:600}, {x:200,y:199}, false, rim), null);
  assert.equal(rimPassage(rim, {x:200,y:200,r:10,vy:0}, {x:200,y:200}, true), null);
});
test("small balls falling beside either support do not score", () => {
  for (const r of [5, 10, 20]) for (const side of [-1, 1]) {
    const x = rim.x + side * (rim.inner + 2);
    assert.equal(rimPassage(rim, {x, y: 201, vy: 80, r}, {x, y: 199}, false), null);
  }
});
test("sliding inward below the rim cannot reuse an earlier visit above it", () => {
  assert.equal(rimPassage(rim, {x: 220, y: 204, vy: 80, r: 10}, {x: 232, y: 202}, false), null);
});
test("fast and oblique makes use the crossing point, not the frame endpoint", () => {
  assert.equal(rimPassage(rim, {x: 240, y: 260, vy: 1500, r: 10}, {x: 180, y: 180}, false), "down");
  assert.equal(rimPassage(rim, {x: 200, y: 230, vy: 1500, r: 10}, {x: 240, y: 199}, false), null);
  for (const r of [5, 10, 20]) assert.equal(rimPassage(rim, {x: 200, y: 201, vy: 80, r}, {x: 200, y: 199}, false), "down");
});
test("reverse makes remain exclusive to the upward-scoring ability", () => {
  const ball = {x: 200, y: 199, vy: -80, r: 10};
  assert.equal(rimPassage(rim, ball, {x: 200, y: 201}, false), null);
  assert.equal(rimPassage(rim, ball, {x: 200, y: 201}, true), "up");
  assert.equal(rimPassage(rim, {...ball, x: 230}, {x: 230, y: 201}, true), null);
});
