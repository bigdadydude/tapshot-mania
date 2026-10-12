import test from 'node:test';
import assert from 'node:assert/strict';
import {stepVectorLeak,vectorLeakRate,vectorLeakBounce} from './vector.ts';
import {createVector,vectorRecover,vectorMake,vectorRelease,vectorHold,vectorPulse,vectorLayout,vectorFinishBurst,vectorGaugeEnergy,vectorChargeScale,cancelVectorPress,stepVectorCorrection,VECTOR} from './vector.ts';
test('first make unlocks storage without awarding energy',()=>{
 const s=createVector();vectorRecover(s,1200,600,600,()=>1);assert.equal(s.energy,0);
 vectorMake(s);assert.equal(s.unlocked,true);assert.equal(s.energy,0);
 assert.equal(vectorRecover(s,1200,600,600,()=>0.5),0.5);assert.equal(s.energy,25);
});
test('random zero/full capture and capped impact storage',()=>{
 const s=createVector();s.unlocked=true;
 vectorRecover(s,1200,600,600,()=>0);assert.equal(s.energy,0);
 s.collisionCooldown=0;vectorRecover(s,1200,600,600,()=>1);assert.equal(s.energy,50);
 s.collisionCooldown=0;vectorRecover(s,2400,1200,600,()=>1);assert.equal(s.energy,250);
 s.collisionCooldown=0;vectorRecover(s,4800,0,600,()=>0.5);assert.equal(s.energy,650);
});
test('sustained/tiny contacts and burst cannot farm energy',()=>{
 const s=createVector();s.unlocked=true;vectorRecover(s,1200,600,600,()=>1);
 vectorRecover(s,1200,600,600,()=>1);assert.equal(s.energy,50);
 s.collisionCooldown=0;vectorRecover(s,10,600,600,()=>1);assert.equal(s.energy,50);
 s.burst=10;vectorRecover(s,3000,2000,600,()=>1);assert.equal(s.energy,50);
});
test('short has no red-zone gate and only needs its actual cost',()=>{
 const s=createVector();
 for(const energy of [0,249]) { s.energy=energy;s.pointer=1;assert.equal(vectorRelease(s),'empty');assert.equal(s.energy,energy); }
 s.energy=1001;s.pointer=1;vectorHold(s,0.1);
 assert.equal(vectorRelease(s),'correct');assert.equal(s.energy,751);assert.equal(s.spent,250);assert.equal(s.released,50);
 assert.equal(vectorRelease(s),'none');assert.equal(s.energy,751);
 s.energy=250;s.pointer=1;assert.equal(vectorRelease(s),'correct');assert.equal(s.energy,0);
});
test('long spends five stored units per output unit and spends all energy once',()=>{
 const s=createVector();s.energy=1000;s.pointer=1;
 assert.equal(vectorHold(s,0.99),false);assert.equal(s.energy,1000);
 assert.equal(vectorHold(s,0.01),true);assert.equal(s.energy,0);assert.equal(s.burst,1000*VECTOR.conversion);assert.equal(s.injected,s.burst);
 assert.equal(vectorHold(s,1),false);assert.equal(vectorRelease(s),'none');vectorMake(s);assert.equal(s.burst,1000*VECTOR.conversion-5);
});
test('insufficient long does not fall back to short',()=>{
 const s=createVector();s.energy=30;s.pointer=1;assert.equal(vectorHold(s,1),false);assert.equal(vectorRelease(s),'none');assert.equal(s.energy,30);
});
test('pulse below hoop targets screen center at hoop height',()=>{
 const p=vectorPulse({x:100,y:550,r:18},{x:320,y:300},390,150);
 assert.ok(Math.abs(p.vx/p.vy-95/(300-550))<1e-9);
 assert.equal(VECTOR.pulseSpeed,0.7);
 assert.ok(Math.abs((p.vx*p.vx+p.vy*p.vy)/(390*2.2*VECTOR.pulseSpeed)**2-VECTOR.correctionOutput/15)<1e-9);assert.equal(p.left,0.16);assert.equal(p.linger,VECTOR.pulseHold);
});
test('pulse holds still for 0.08s after the moving segment',()=>{
 assert.equal(VECTOR.pulseHold,0.08);
 const ball={vx:3,vy:-4};
 const c={vx:200,vy:-50,left:0.05,linger:VECTOR.pulseHold};
 assert.equal(stepVectorCorrection(ball,c,0.02),true);
 assert.ok(Math.abs(c.left-0.03)<1e-12);assert.equal(c.linger,0.08);assert.equal(ball.vx,200);assert.equal(ball.vy,-50);
 const remain=c.left;
 assert.equal(stepVectorCorrection(ball,c,0.04),true);
 assert.equal(c.left,0);assert.equal(c.linger,0.08);
 assert.ok(Math.abs(ball.vx-200*remain/0.04)<1e-9);assert.ok(Math.abs(ball.vy-(-50*remain/0.04))<1e-9);
 let held=0;
 while(c.linger>0){
  const dt=Math.min(0.02,c.linger);
  const on=stepVectorCorrection(ball,c,dt);
  held+=dt;
  assert.equal(ball.vx,0);assert.equal(ball.vy,0);assert.equal(on,c.linger>0);
 }
 assert.ok(Math.abs(held-0.08)<1e-9);
 assert.equal(stepVectorCorrection(ball,c,0.02),false);assert.equal(ball.vx,0);assert.equal(ball.vy,0);
});
test('above hoop aims two diameters above; above board takes horizontal priority',()=>{
 const p=vectorPulse({x:100,y:270,r:18},{x:320,y:300},390,150);
 assert.ok(Math.abs(p.vx/p.vy-220/(228-270))<1e-9);
 const h=vectorPulse({x:100,y:100,r:18},{x:320,y:300},390,150);
 assert.equal(h.vy,0);assert.ok(h.vx>0);
});
test('leak probability increases with played time, respects red zone and active skills',()=>{
 assert.ok(vectorLeakRate(120)>vectorLeakRate(30));assert.equal(vectorLeakRate(0),0);
 for(const patch of [{energy:1000},{unlocked:false},{burst:1},{anchor:{x:0,y:0,vx:0,vy:0}},{storageCooldown:1},{pointer:1}]) {
  const s=Object.assign(createVector(),{energy:1500,unlocked:true},patch);
  assert.equal(stepVectorLeak(s,0.01,()=>0),false);
 }
});
test('leak drains exactly 100–500 over three seconds and blocks storage',()=>{
 for(const random of [0,1]) {
  const s=createVector();s.energy=1500;s.unlocked=true;
  let calls=0;assert.equal(stepVectorLeak(s,0.01,()=>calls++===0?0:random),true);
  assert.equal(s.leakAmount,100+400*random);assert.equal(s.energy,1500);
  assert.equal(vectorRecover(s,2000,1000,600,()=>1),0);
  for(let i=0;i<30;i++) stepVectorLeak(s,0.1,()=>1);
  assert.ok(Math.abs(s.energy-(1500-s.leakAmount))<1e-7);assert.equal(s.leakLeft,0);
  assert.ok(vectorRecover(s,1200,600,600,()=>1)>0);
 }
});
test('leaked energy boosts a random outward rebound only once per contact',()=>{
 const s=createVector();s.leakLeft=3;s.leakKick=100;
 const b=vectorLeakBounce(s,{vx:0,vy:600},{vx:0,vy:-300},600,()=>0.8);
 assert.ok(b.vy<0);assert.ok(b.vx>0);assert.ok(Math.hypot(b.vx,b.vy)>300);assert.equal(s.leakKick,0);
 assert.deepEqual(vectorLeakBounce(s,{vx:0,vy:600},b,600),b);
});
test('single gauge is centered below the floor and stays on screen',()=>{
 const b=vectorLayout(390,844,645);assert.equal(b.x,195);assert.equal('storeX' in b,false);assert.ok(b.y+8-b.r*2.15>645);assert.ok(b.y+34<844);
});

test('capacity only absorbs available room and cannot destroy excess rebound energy',()=>{
 const s=createVector();s.unlocked=true;s.energy=1490;
 assert.equal(vectorRecover(s,1200,600,600,()=>1),0.2);assert.equal(s.energy,1500);assert.equal(s.stored,10);
 s.collisionCooldown=0;assert.equal(vectorRecover(s,1200,600,600,()=>1),0);assert.equal(s.energy,1500);
});
test('storage lock starts at burst end and cannot be reset repeatedly',()=>{
 const s=createVector();s.unlocked=true;s.energy=1500;s.pointer=1;vectorHold(s,1);
 assert.equal(s.burst,300);assert.equal(vectorFinishBurst(s),false);assert.equal(s.storageCooldown,0);
 s.burst=0;assert.equal(vectorFinishBurst(s),true);assert.equal(s.storageCooldown,10);
 assert.equal(vectorRecover(s,1200,600,600,()=>1),0);assert.equal(s.energy,0);
 s.storageCooldown=5;assert.equal(vectorFinishBurst(s),false);assert.equal(s.storageCooldown,5);
 s.storageCooldown=0;vectorRecover(s,1200,600,600,()=>1);assert.equal(s.energy,50);
});
test('gauge and ball share proportional charge progress without spending before release',()=>{
 const s=createVector();s.energy=1500;s.pointer=1;s.anchor={x:0,y:0,vx:0,vy:0};
 s.held=0.12;assert.equal(vectorGaugeEnergy(s),1500);assert.equal(vectorChargeScale(s),1);
 s.held=0.56;assert.ok(Math.abs(vectorGaugeEnergy(s)-750)<1e-9);assert.equal(vectorChargeScale(s),0.75);
 s.held=1;assert.equal(vectorGaugeEnergy(s),0);assert.equal(vectorChargeScale(s),0.5);assert.equal(s.energy,1500);
 cancelVectorPress(s);assert.equal(vectorGaugeEnergy(s),1500);assert.equal(s.energy,1500);
});
