import test from 'node:test';
import assert from 'node:assert/strict';
import {createHackerPills,spawnHackerPill,pillPoint,stepHackerPill,hackerGlitchRate} from './hacker-pills.ts';
const world={w:450,h:800,floorY:650};
function setup(){const s=createHackerPills();s.pill={u:.5,v:.5,revealed:false,grace:0};return {s,p:pillPoint(s.pill,world)};}
test('red first pass reveals, staying cannot collect, return after leaving collects once',()=>{
 const {s,p}=setup(),b={...p,r:20};
 assert.equal(stepHackerPill(s,world,b,b,.01),false);assert.equal(s.pill?.redPass,'leaving');
 for(let i=0;i<20;i++)assert.equal(stepHackerPill(s,world,b,b,.01),false);
 const far={x:p.x+100,y:p.y,r:20};stepHackerPill(s,world,far,b,.01);
 assert.equal(s.pill?.redPass,'armed');
 assert.equal(stepHackerPill(s,world,b,far,.01),true);assert.equal(s.pill,null);
 assert.equal(stepHackerPill(s,world,b,b,.01),false);
});
test('second visit that misses the inner pickup region respawns hidden',()=>{
 const {s,p}=setup(),b={...p,r:20},far={x:p.x+100,y:p.y,r:20};
 stepHackerPill(s,world,b,b,.01);stepHackerPill(s,world,far,b,.01);
 const original=s.pill,edge={x:p.x+45,y:p.y,r:20};
 stepHackerPill(s,world,edge,far,.01);assert.equal(s.pill?.redPass,'approaching');
 assert.equal(stepHackerPill(s,world,far,edge,.01,false,()=>.1),false);
 assert.notEqual(s.pill,original);assert.equal(s.pill?.revealed,false);assert.equal(s.pill?.redPass,undefined);
});
test('moving elsewhere after reveal does not consume a second opportunity',()=>{
 const {s,p}=setup(),b={...p,r:20},far={x:p.x+100,y:p.y,r:20};
 stepHackerPill(s,world,b,b,.01);stepHackerPill(s,world,far,b,.01);
 const original=s.pill;stepHackerPill(s,world,{...far,y:far.y+50},far,.01);
 assert.equal(s.pill,original);assert.equal(s.pill?.redPass,'armed');
});
test('fast first crossing never collects; second crossing does, wraps do not reveal',()=>{
 const {s,p}=setup(),left={x:p.x-90,y:p.y,r:20},right={x:p.x+90,y:p.y,r:20};
 assert.equal(stepHackerPill(s,world,right,left,.01),false);assert.equal(s.pill?.redPass,'armed');
 assert.equal(stepHackerPill(s,world,left,right,.01),true);
 const fresh=setup();stepHackerPill(fresh.s,world,{x:-20,y:p.y,r:20},{x:470,y:p.y},.01);
 assert.equal(fresh.s.pill?.revealed,false);
});
test('awakening cannot collect or reveal world pills; exit belongs to the button',()=>{
 const {s,p}=setup(),near={x:p.x-70,y:p.y,r:20};
 stepHackerPill(s,world,near,near,.01,true);assert.equal(s.pill?.revealed,false);
 assert.equal(stepHackerPill(s,world,{...p,r:20},near,.01,true),false);
});
test('glitch gets faster closer to a hidden red pill, then stops on reveal',()=>{
 const {s,p}=setup(),near={x:p.x-70,y:p.y,r:20},far={x:p.x-190,y:p.y,r:20};
 assert.ok(hackerGlitchRate(s,world,near)>hackerGlitchRate(s,world,far));
 stepHackerPill(s,world,{...p,r:20},near,.01);assert.equal(hackerGlitchRate(s,world,near),0);
});
test('spawn covers the court and starts with a grace period',()=>{
 const b={x:225,y:325,r:20};
 const low=spawnHackerPill(world,b,()=>0),high=spawnHackerPill(world,b,()=>1);
 assert.ok(pillPoint(low,world).x<40 && pillPoint(low,world).y<60);
 assert.ok(pillPoint(high,world).x>410 && pillPoint(high,world).y>world.floorY-40);
 const s=createHackerPills();s.pill=low;const p=pillPoint(low,world);
 stepHackerPill(s,world,{...p,r:20},p,.01);assert.equal(s.pill?.revealed,false);
});
