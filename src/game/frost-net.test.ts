import test from "node:test";
import assert from "node:assert/strict";
import { buildNet } from "./net.ts";
import { freezeNet, clearOfFrozenNet, touchesFrozenNet, shatterFrozenNet } from "./frost-net.ts";
import type { Hoop, Ball } from "./types";
function setup() {
  const h={x:200,y:200,inner:28,frost:1,frostLeft:4,net:[],netPulse:.7,jolt:1} as unknown as Hoop;
  h.net=buildNet(h);
  return h;
}
test("freezing preserves the current pose and removes all residual momentum",()=>{
  const h=setup();h.net[12]!.x+=9;h.net[12]!.depth=7;
  const positions=h.net.map(n=>[n.x,n.y,n.depth]);
  freezeNet(h,true);
  assert.deepEqual(h.net.map(n=>[n.x,n.y,n.depth]),positions);
  assert.ok(h.net.every(n=>n.px===n.x&&n.py===n.y&&n.depth===n.prevDepth));
  assert.equal(h.netPulse,0);assert.equal(h.jolt,1,"freezing cloth does not cancel stand vibration");
  assert.equal(shatterFrozenNet(h),false,"the triggering shot may clear the net");
});
test("a frozen net shatters once and does not respawn on refreeze",()=>{
  const h=setup();freezeNet(h,false);
  assert.equal(shatterFrozenNet(h),true);assert.equal(shatterFrozenNet(h),false);
  h.frostLeft=0;freezeNet(h,false);h.frostLeft=3;
  assert.equal(h.netShattered,true);assert.equal(shatterFrozenNet(h),false);
  const warm=setup();warm.frostLeft=0;assert.equal(shatterFrozenNet(warm),false);
});
test("clearance includes the whole ball and the frozen, possibly stretched shape",()=>{
  const h=setup();h.net.at(-1)!.y=400;
  assert.equal(clearOfFrozenNet(h,{x:h.net.at(-1)!.x,y:410,r:15} as Ball),false);
  assert.equal(clearOfFrozenNet(h,{x:200,y:430,r:15} as Ball),true);
});
test("fast contact detects strands while distant passes do not shatter the net",()=>{
  const h=setup(),n=h.net[15]!;
  const ball={x:n.x+60,y:n.y,r:5} as Ball;
  assert.equal(touchesFrozenNet(h,ball,n.x-60,n.y),true);
  assert.equal(touchesFrozenNet(h,{...ball,y:100},n.x-60,100),false);
});
