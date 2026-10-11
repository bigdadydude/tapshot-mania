import test from 'node:test';
import assert from 'node:assert/strict';
import {createRocket,stepRocket,releaseRocket,refillRocket} from './rocket.ts';
const body=()=>({x:100,y:100,r:20,vx:0,vy:0});
test('hold adds lift and drag direction controls horizontal force',()=>{
 for(const steer of [-1,0,1]){const s=createRocket(),b=body();s.pointer=1;s.steer=steer;stepRocket(s,b,1000,0.1);
 assert.ok(b.vy<0);assert.equal(Math.sign(b.vx),steer);assert.equal(s.fuel,98.2);}
});
test('release recenters and removes all thrust even while ascending',()=>{
 const s=createRocket(),b=body();s.pointer=1;s.steer=1;stepRocket(s,b,1000,.1);releaseRocket(s,b);
 assert.equal(s.pointer,null);assert.equal(s.steer,0);assert.equal(s.firing,false);assert.equal(b.vy,0);
 const fuel=s.fuel,vx=b.vx;stepRocket(s,b,1000,1);assert.equal(s.fuel,fuel);assert.equal(b.vx,vx);
});
test('fuel exhaustion cuts lift and never runs below zero',()=>{
 const s=createRocket(),b=body();s.pointer=1;s.fuel=1;stepRocket(s,b,1000,1);
 assert.equal(s.fuel,0);assert.equal(s.firing,false);assert.equal(b.vy,0);
});
test('only supported resting refuels, never hovering or holding throttle',()=>{
 const s=createRocket();s.fuel=50;
 for(let i=0;i<60;i++)refillRocket(s,false,1/60);assert.equal(s.fuel,50);
 for(let i=0;i<60;i++)refillRocket(s,true,1/60);assert.ok(s.fuel>70);
 s.pointer=1;const fuel=s.fuel;refillRocket(s,true,1);assert.equal(s.fuel,fuel);
 s.pointer=null;for(let i=0;i<300;i++)refillRocket(s,true,1/60);assert.equal(s.fuel,100);
});
