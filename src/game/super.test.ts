import test from 'node:test';
import assert from 'node:assert/strict';
import {SUPER,createSuper,superSegments,superSwipe,superScore,superImpact,superToggle,superPulseShield,superBaseBonus,stepSuper,superDashVelocity} from './super.ts';
const body=()=>({x:200,y:300,vx:0,vy:0,r:20});
test('actual basket points charge six segments and cap at 120',()=>{
 const s=createSuper();superScore(s,19);assert.equal(superSegments(s),0);superScore(s,1);assert.equal(superSegments(s),1);superScore(s,1000);assert.equal(s.energy,120);
});
test('all eight directions glide five diameters, hang at the end, then release',()=>{
 const dist=20*2*SUPER.dashDiameters;
 for(let i=0;i<8;i++){
  const s=createSuper(),b=body(),a=i*Math.PI/4;s.energy=20;superSwipe(s,b,Math.cos(a)*40,Math.sin(a)*40);
  assert.ok(s.dash,'dash commits immediately');
  let hung=0;
  for(let j=0;j<200;j++){
   const hanging=(s.dash?.hang??0)>1e-8;
   if(!superDashVelocity(s,b,0.01)) break;
   if(hanging){hung+=0.01;assert.equal(b.vx,0);assert.equal(b.vy,0);}
   b.x+=b.vx*0.01;b.y+=b.vy*0.01;
  }
  assert.ok(Math.abs(hung-SUPER.hangTime)<1e-9);
  assert.ok(Math.abs(b.x-200-Math.cos(a)*dist)<1e-6);assert.ok(Math.abs(b.y-300-Math.sin(a)*dist)<1e-6);
  assert.equal(b.vx,0);assert.equal(b.vy,0);assert.equal(s.dash,null);
 }
});
test('the glide slows down before the hang and leaves ball ghosts',()=>{
 const s=createSuper(),b=body();s.energy=20;superSwipe(s,b,40,0);
 assert.ok(s.dash);
 superDashVelocity(s,b,0.05);const early=b.vx;
 for(let i=0;i<7;i++){b.x+=b.vx*0.05;superDashVelocity(s,b,0.05);stepSuper(s,b,0.05);}
 assert.ok(early>400);assert.ok(b.vx>0);assert.ok(b.vx<early*0.45);assert.ok(s.ghosts.length>=3);
});
test('consecutive swipes cost 1/2/3, queue full dashes, reset after 0.2s',()=>{
 const s=createSuper(),b=body();s.energy=120;
 superSwipe(s,b,40,0);assert.equal(s.energy,100);assert.ok(s.dash);
 superSwipe(s,b,40,0);assert.equal(s.energy,60);assert.ok(s.pending);
 superSwipe(s,b,40,0);assert.equal(s.energy,0);
 for(let j=0;j<800;j++){stepSuper(s,b,0.005);superDashVelocity(s,b,0.005);b.x+=b.vx*0.005;b.y+=b.vy*0.005;}
 assert.ok(Math.abs(b.x-200-3*20*2*SUPER.dashDiameters)<1e-6);s.energy=20;assert.equal(superSwipe(s,b,40,0),'dash');assert.equal(s.energy,0);
});
test('settled swipe earns a single 10-point refund on the next goal',()=>{
 const s=createSuper(),b=body();s.energy=20;superSwipe(s,b,40,0);stepSuper(s,b,0.2);superScore(s,4);assert.equal(s.energy,14);superScore(s,4);assert.equal(s.energy,18);
 const early=createSuper();early.energy=20;superSwipe(early,b,40,0);stepSuper(early,b,0.1);superScore(early,4);assert.equal(early.energy,4);
});
test('swipe starts dash immediately and only a post-hit swipe within 0.12s parries',()=>{
 const s=createSuper(),b=body();s.energy=40;superSwipe(s,b,40,0);assert.ok(s.dash);
 assert.equal(superImpact(s,b),false);assert.ok(s.impact);assert.equal(s.dash,null);assert.equal(s.energy,20);
 assert.equal(superSwipe(s,b,-40,0),'parry');assert.equal(s.energy,20);assert.equal(b.x,200);assert.ok(s.flash>0);
 assert.equal(superImpact(s,b),false);assert.ok(s.impact);
});
test('parry window includes the exact 0.12s boundary',()=>{
 const s=createSuper(),b=body();s.energy=20;superImpact(s,b);stepSuper(s,b,0.12);
 assert.equal(superSwipe(s,b,40,0),'parry');assert.ok(s.flash>0);
});
test('solid hits can record a parry window without spending the car shield',()=>{
 const s=createSuper(),b=body();s.energy=100;superToggle(s);
 assert.equal(superImpact(s,b,{shield:false}),false);assert.equal(s.energy,100);assert.ok(s.impact);
 assert.equal(superImpact(s,b),true);assert.equal(s.energy,96);
});
test('a swipe with no segment flashes and spends nothing',()=>{
 const s=createSuper(),b=body();assert.equal(superSwipe(s,b,40,0),'empty');assert.equal(s.energy,0);assert.ok(s.flash>0);assert.equal(s.pending,null);assert.equal(s.dash,null);
});
test('swipe after impact restores pre-hit position/velocity; expired impacts cannot parry',()=>{
 const s=createSuper(),b=body();s.energy=20;assert.equal(superImpact(s,b),false);b.vx=2000;b.x=240;stepSuper(s,b,0.08);
 assert.equal(superSwipe(s,b,-40,0),'parry');assert.equal(b.x,200);assert.equal(b.vx,0);assert.equal(s.energy,20);
 const expired=createSuper();expired.energy=20;superImpact(expired,b);stepSuper(expired,b,0.13);assert.equal(superSwipe(expired,b,40,0),'dash');assert.ok(expired.dash);
});
test('shield blocks swipes and impacts, charges 4 per event and drains 0.5 per second',()=>{
 const s=createSuper(),b=body();s.energy=100;superToggle(s);assert.equal(superBaseBonus(s),10);assert.equal(superSwipe(s,b,40,0),'blocked');
 assert.equal(superImpact(s,b),true);assert.equal(s.energy,96);superScore(s,40);assert.equal(s.energy,92);stepSuper(s,b,2);assert.equal(s.energy,91);
 s.energy=0.1;stepSuper(s,b,0.3);assert.equal(s.energy,0);assert.equal(s.shield,false);
});
test('emptying the shield bar returns to swipe mode',()=>{
 const s=createSuper(),b=body();s.energy=4;superToggle(s);superPulseShield(s);
 assert.equal(superImpact(s,b),true);assert.equal(s.energy,0);assert.equal(s.shield,false);assert.equal(s.wave,0);
 s.energy=20;assert.equal(superSwipe(s,b,40,0),'dash');
 const drip=createSuper();drip.energy=0.2;superToggle(drip);stepSuper(drip,body(),0.5);
 assert.equal(drip.energy,0);assert.equal(drip.shield,false);
});
test('partial shield segment gives no goal bonus or extra score-event charge',()=>{
 const s=createSuper();s.energy=19;superToggle(s);assert.equal(superBaseBonus(s),0);superScore(s,20);assert.equal(s.energy,19);
});
test('a court tap ripples the shield line; toggling the bar does not',()=>{
 const s=createSuper();s.energy=40;superPulseShield(s);assert.equal(s.wave,0);
 superToggle(s);superPulseShield(s);assert.equal(s.wave,1);
 stepSuper(s,body(),0.28);assert.ok(s.wave<1e-8);
 superPulseShield(s);superToggle(s);assert.equal(s.shield,false);assert.equal(s.wave,0);
});