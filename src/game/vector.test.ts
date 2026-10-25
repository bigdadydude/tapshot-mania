import test from 'node:test';
import assert from 'node:assert/strict';
import {stepVectorLeak,vectorLeakRate,vectorLeakBounce} from './vector.ts';
import {createVector,vectorRecover,vectorMake,vectorRelease,vectorHold,vectorBurstSpeed,vectorLayout,vectorFinishBurst,vectorGaugeEnergy,vectorChargeScale,cancelVectorPress,VECTOR} from './vector.ts';
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
 const s=createVector();s.unlocked=true;s.energy=1500;s.pointer=1;vectorHold(s,1);vectorRelease(s);
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

test('holding caps charge without spending or automatically firing',()=>{
 const s=createVector();s.energy=1500;s.pointer=1;
 vectorHold(s,0.56);assert.equal(s.energy,1500);assert.equal(s.burst,0);
 assert.ok(Math.abs(vectorGaugeEnergy(s)-750)<1e-8);
 vectorHold(s,10);assert.equal(s.energy,1500);assert.equal(s.burst,0);assert.equal(s.held,1);
 assert.equal(vectorRelease(s),'burst');assert.equal(s.energy,0);assert.equal(s.spent,1500);assert.equal(s.injected,300);
 assert.equal(vectorRelease(s),'none');
});
test('partial release preserves remainder and does not start storage lock',()=>{
 const s=createVector();s.energy=1000;s.pointer=1;vectorHold(s,.56);
 assert.equal(vectorRelease(s),'burst');assert.ok(Math.abs(s.energy-500)<1e-8);assert.equal(s.fullRelease,false);
 assert.ok(Math.abs(s.injected-100)<1e-8);s.burst=0;assert.equal(vectorFinishBurst(s),true);assert.equal(s.storageCooldown,0);
 s.coast=0;s.unlocked=true;assert.ok(vectorRecover(s,1200,600,600,()=>1)>0);
});
test('full release of a partially filled tank starts lock only at burst end',()=>{
 const s=createVector();s.energy=300;s.pointer=1;vectorHold(s,1);vectorRelease(s);
 assert.equal(s.energy,0);assert.equal(s.fullRelease,true);assert.equal(s.storageCooldown,0);
 vectorMake(s);assert.equal(s.burst,55);s.burst=0;vectorFinishBurst(s);assert.equal(s.storageCooldown,10);
});
test('all charge levels have equal launch speed but proportional duration',()=>{
 const durations:number[]=[];
 for(const held of [.34,.56,1]) {
  const s=createVector();s.energy=1000;s.pointer=1;vectorHold(s,held);
  assert.equal(vectorRelease(s),'burst');
  assert.equal(vectorBurstSpeed(s,390),390*5.5);
  durations.push(s.burst/VECTOR.drain);
 }
 assert.ok(Math.abs(durations[1]/durations[0]-2)<1e-8);
 assert.ok(Math.abs(durations[2]/durations[1]-2)<1e-8);
});test('tap and insufficient charge do not spend or restore removed correction',()=>{
 const s=createVector();s.energy=1500;s.pointer=1;vectorHold(s,.1);
 assert.equal(vectorRelease(s),'none');assert.equal(s.energy,1500);
 s.energy=30;s.pointer=2;vectorHold(s,1);assert.equal(vectorRelease(s),'empty');assert.equal(s.energy,30);
 assert.equal(s.burst,0);assert.equal(s.storageCooldown,0);
});
test('cancelled charge preserves energy and never starts cooldown',()=>{
 const s=createVector();s.energy=1200;s.pointer=1;vectorHold(s,.8);cancelVectorPress(s);
 assert.equal(vectorRelease(s),'none');assert.equal(s.energy,1200);assert.equal(s.storageCooldown,0);
});
