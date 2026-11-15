import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

// Test-only closure hooks, injected into Vite's response; never shipped with the game.
const hooks = `
 auditWorldSetup(mode='classic') {
   applyBall('rain'); playMode=mode; beginPlay();
   timer=timerMax=60; madeCount=1; timerArmed=true; hint=false;
   ball.x=world.w/2; ball.y=world.floorY-ball.r; ball.vx=ball.vy=0;
   paused=true;
 },
 auditWorldRead() { return {locked:hackerJumpLocked,awake:hackerAwaken,progress:{...hackerProgress},flight:hackerFlight?{...hackerFlight}:null,score,streak,timer,timerMax,bonus:hackerComboBonus(hackerProgress,hackerAwaken)}; },
 auditWorldSkill(n) {
   paused=false; hackerCharge.makes=n*5; hackerCharge.idleSeconds=0;
   beginHackerSpend(-12); stepChargeHold(hackerCharge,n*HACKER_CHARGE.layerDrainSeconds); endHackerSpend();
   paused=true; return this.auditWorldRead();
 },
 auditWorldMake(ghost=false) {
   if(hackerFlight?.kind==='rise') completeHackerRise();
   if(hackerFlight?.kind==='aim') confirmHackerLanding(hoop.x);
   ball.hitBoard=false;ball.hitRim=false;rimHits=0;hitBoardTop=false;fromBelow=false;
   registerScore({at:hoop,ghost,forceSwish:true}); if(!ghost)releaseHackerJump(); paused=true; return this.auditWorldRead();
 },
 auditWorldMiss() {if(hackerFlight?.kind==='rise')completeHackerRise();if(hackerFlight?.kind==='aim')confirmHackerLanding(hoop.x);ball.y=world.floorY;ball.vy=100;collideFloor();return this.auditWorldRead();},
 auditWorldLockTest() {
   this.auditWorldSetup();this.auditWorldSkill(1);paused=false;
   const riseBlocked=!tapJump(-33);completeHackerRise();confirmHackerLanding(hoop.x);
   const fallBlocked=!tapJump(-33);ball.vy=200;
   noteRainDropCombo(1);const realReward=hackerProgress.codeCombo;
   ball.y=world.floorY;collideFloor();const floorUnlocked=!hackerJumpLocked;
   this.auditWorldSetup();this.auditWorldSkill(2);completeHackerRise();ball.vy=200;
   const g=boardGeom(hoop,world);prevBallX=ball.x=g.visX;prevBallY=ball.y=g.visY+g.bh/2;
   touchHackerStand();const boardUnlocked=!hackerJumpLocked;
   this.auditWorldSetup();this.auditWorldSkill(3);this.auditWorldMake();noteRainDropCombo(3);
   const codeReward=hackerProgress.codeCombo;this.auditWorldSkill(3);
   const banked=hackerProgress.bankedCombo;
   return {riseBlocked,fallBlocked,floorUnlocked,boardUnlocked,realReward,codeReward,banked};
 },
 auditWorldBreak() {streak=0;comboCounting=false;return this.auditWorldRead();},
 snapshot() { return {`;
mkdirSync('screenshots/hacker-world',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 for(const [name,width,height] of [['desktop',1280,800],['mobile',390,844]]) {
  const page=await browser.newPage({viewport:{width,height}});const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.route('https://grok.com/grok-app-builder/extensions.js',r=>r.fulfill({status:200,contentType:'application/javascript',body:''}));
  await page.route('**/src/game/engine.ts*',async route=>{
   const response=await route.fetch();const source=await response.text();
   assert.match(source,/snapshot\(\) \{\s*return \{/);
   await route.fulfill({response,body:source.replace(/snapshot\(\) \{\s*return \{/,hooks)});
  });
  await page.goto('http://127.0.0.1:8080/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__tq?.auditWorldSetup);
  const result=await page.evaluate(()=>{
   const q=window.__tq;const lockTest=q.auditWorldLockTest();q.auditWorldSetup();
   const launch=q.auditWorldSkill(3),enter=q.auditWorldMake();
   const arrowLaunch=q.auditWorldSkill(1),arrow=q.auditWorldMake();
   const next=q.auditWorldMake();
   q.auditWorldBreak();const afterBreak=q.auditWorldMake();
   q.auditWorldSkill(2);const beforeDouble=q.auditWorldRead(),double=q.auditWorldMake();
   const exit=q.auditWorldSkill(3),exitMake=q.auditWorldMake();
   q.auditWorldBreak();const reality=q.auditWorldMake();
   q.auditWorldSkill(3);q.auditWorldMake();q.auditWorldSkill(1);q.auditWorldMake();
   const secondExit=q.auditWorldSkill(3);
   q.auditWorldSetup();q.auditWorldSkill(3);q.auditWorldMake();q.auditWorldSkill(1);
   const ghost=q.auditWorldMake(true),realAfterGhost=q.auditWorldMake();
   q.auditWorldSetup();q.auditWorldSkill(3);q.auditWorldMake();q.auditWorldSkill(1);q.auditWorldMiss();const missed=q.auditWorldMake();
   q.auditWorldSetup('minute');const minuteLaunch=q.auditWorldSkill(3),minuteEnter=q.auditWorldMake(),minuteExit=q.auditWorldSkill(3);
   return {lockTest,launch,enter,arrowLaunch,arrow,next,afterBreak,beforeDouble,double,exit,exitMake,reality,secondExit,ghost,realAfterGhost,missed,minuteLaunch,minuteEnter,minuteExit};
  });
  assert.deepEqual(result.lockTest,{riseBlocked:true,fallBlocked:true,floorUnlocked:true,boardUnlocked:true,realReward:0,codeReward:3,banked:3});
  assert.equal(result.launch.awake,false,'entry must wait for basket');
  assert.equal(result.enter.awake,true);
  assert.equal(result.enter.timer/result.enter.timerMax,.94);
  assert.equal(result.arrow.progress.codeCombo,1);
  assert.equal(result.next.streak-result.arrow.streak,2);
  assert.equal(result.afterBreak.streak,2,'persistent bonus survives combo break');
  assert.equal(result.double.score-result.beforeDouble.score,2*(result.double.streak+30),'lock doubles complete current basket');
  assert.equal(result.exit.awake,false);
  assert.equal(result.exit.progress.bankedCombo,1);
  assert.equal(result.exit.progress.codeCombo,0);
  assert.equal(result.exit.timer,result.exit.timerMax);
  assert.equal(result.reality.streak,2);
  assert.equal(result.secondExit.progress.bankedCombo,2);
  assert.equal(result.ghost.progress.codeCombo,0);
  assert.equal(result.realAfterGhost.progress.codeCombo,1);
  assert.equal(result.missed.progress.codeCombo,0);
  assert.equal(result.minuteEnter.timer,result.minuteLaunch.timer*.94);
  assert.ok(Math.abs(result.minuteExit.timer-result.minuteLaunch.timer)<1e-8);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:`screenshots/hacker-world/${name}.png`});
  console.log(name,'PASS',JSON.stringify(result));await page.close();
 }
} finally {await browser.close();}
