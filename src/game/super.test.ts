import test from 'node:test';
import assert from 'node:assert/strict';
import {createSuper,superSegments,superSwipe,superScore,superImpact,superToggle,superBaseBonus,stepSuper,superDashVelocity} from './super.ts';
const body=()=>({x:200,y:300,vx:0,vy:0,r:20});
test('actual basket points charge six segments and cap at 120',()=>{
 const s=createSuper();superScore(s,19);assert.equal(superSegments(s),0);superScore(s,1);assert.equal(superSegments(s),1);superScore(s,1000);assert.equal(s.energy,120);
});
test('all eight directions travel two diameters without leftover dash velocity',()=>{
 for(let i=0;i<8;i++){
  const s=createSuper(),b=body(),a=i*Math.PI/4;s.energy=20;superSwipe(s,b,Math.cos(a)*40,Math.sin(a)*40);
  stepSuper(s,b,0.12);
  for(let j=0;j<10;j++){superDashVelocity(s,b,0.01);b.x+=b.vx*0.01;b.y+=b.vy*0.01;}
  assert.ok(Math.abs(b.x-200-Math.cos(a)*80)<1e-7);assert.ok(Math.abs(b.y-300-Math.sin(a)*80)<1e-7);assert.equal(b.vx,0);assert.equal(b.vy,0);
 }
});
test('consecutive swipes cost 1/2/3, queue full dashes, reset after 0.2s',()=>{
 const s=createSuper(),b=body();s.energy=120;
 superSwipe(s,b,40,0);assert.equal(s.energy,100);stepSuper(s,b,0.05);
 superSwipe(s,b,40,0);assert.equal(s.energy,60);stepSuper(s,b,0.05);
 superSwipe(s,b,40,0);assert.equal(s.energy,0);
 for(let j=0;j<100;j++){stepSuper(s,b,0.005);superDashVelocity(s,b,0.005);b.x+=b.vx*0.005;b.y+=b.vy*0.005;}
 assert.ok(Math.abs(b.x-440)<1e-6);s.energy=20;assert.equal(superSwipe(s,b,40,0),'dash');assert.equal(s.energy,0);
});
test('settled swipe earns a single 10-point refund on the next goal',()=>{
 const s=createSuper(),b=body();s.energy=20;superSwipe(s,b,40,0);stepSuper(s,b,0.2);superScore(s,4);assert.equal(s.energy,14);superScore(s,4);assert.equal(s.energy,18);
 const early=createSuper();early.energy=20;superSwipe(early,b,40,0);stepSuper(early,b,0.1);superScore(early,4);assert.equal(early.energy,4);
});
test('swipe before impact cancels movement, refunds one segment and grants 3 seconds',()=>{
 const s=createSuper(),b=body();s.energy=40;superSwipe(s,b,40,0);stepSuper(s,b,0.05);
 assert.equal(superImpact(s,b),true);assert.equal(s.energy,40);assert.equal(s.invincible,3);assert.equal(s.pending,null);assert.equal(s.dash,null);assert.equal(b.x,200);
 assert.equal(superImpact(s,b),true);assert.equal(s.energy,40);stepSuper(s,b,3.01);assert.equal(superImpact(s,b),false);
});
test('swipe after impact restores pre-hit position/velocity; expired impacts cannot parry',()=>{
 const s=createSuper(),b=body();s.energy=20;assert.equal(superImpact(s,b),false);b.vx=2000;b.x=240;stepSuper(s,b,0.08);
 assert.equal(superSwipe(s,b,-40,0),'parry');assert.equal(b.x,200);assert.equal(b.vx,0);assert.equal(s.energy,20);
 const expired=createSuper();expired.energy=20;superImpact(expired,b);stepSuper(expired,b,0.13);assert.equal(superSwipe(expired,b,40,0),'dash');
});
test('shield blocks swipes and impacts, charges 4 per event and drains 0.5 per second',()=>{
 const s=createSuper(),b=body();s.energy=100;superToggle(s);assert.equal(superBaseBonus(s),10);assert.equal(superSwipe(s,b,40,0),'blocked');
 assert.equal(superImpact(s,b),true);assert.equal(s.energy,96);superScore(s,40);assert.equal(s.energy,92);stepSuper(s,b,2);assert.equal(s.energy,91);
 s.energy=0.1;stepSuper(s,b,0.3);assert.equal(s.energy,0);assert.equal(s.shield,false);
});
test('partial shield segment gives no goal bonus or extra score-event charge',()=>{
 const s=createSuper();s.energy=19;superToggle(s);assert.equal(superBaseBonus(s),0);superScore(s,20);assert.equal(s.energy,19);
});
