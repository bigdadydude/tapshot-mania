import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
mkdirSync('screenshots/hacker-awakening', { recursive: true });
const browser = await chromium.launch({channel:'msedge',headless:true});
const hooks = `
 auditSetup(n=1,mode='classic'){
   playMode=mode;applyBall('rain');beginPlay();paused=false;madeCount=1;timerArmed=true;timerMax=10;timer=7;
   hackerPills.ready=true;enterHackerAwaken();hackerHoops=[];
   for(let i=0;i<n;i++){
     const h=makeHoop(world,i%2?-1:1,false,1,activeHoopYLimits());
     h.y=h.baseY=world.h*(i<2?.28:.66);h.net=buildNet(h);
     h.hacker={state:i===n-1?'normal':'pinned',pinned:i!==n-1,age:0,scored:false};hackerHoops.push(h);
   }
   hoop=hackerHoops[n-1];other=null;streak=combo=10;comboCounting=true;comboClock=0;score=0;paused=true;
   ball.x=world.w/2;ball.y=world.floorY-100;ball.vx=ball.vy=0;emitHud();
 },
 auditMake(index,random=.5){
   const h=hackerHoops[index],before={score,streak,timer,madeCount,count:hackerHoops.length};
   ball.hitRim=ball.hitBoard=false;const old=Math.random;Math.random=()=>random;
   try{registerScore({at:h});}finally{Math.random=old;}
   paused=true;emitHud();return {before,after:{score,streak,timer,madeCount,count:hackerHoops.length},h:{...h.hacker}};
 },
 auditRetire(index,age=0){retireHackerHoop(hackerHoops[index]);hackerHoops[index].hacker.pinned=true;hackerHoops[index].hacker.age=age;},
 auditCourt(dt){stepHackerCourt(dt);for(const h of [...hackerHoops,...hackerOutgoing])stepHoop(h,dt);stepHackerCourt(0);hackerOutgoing=hackerOutgoing.filter(h=>!hoopRetirementDone(h,world.w));},
 auditTap(){paused=false;tapLock=0;ball.x=world.w/2;ball.y=world.floorY-100;tapJump();paused=true;return Math.sign(ball.vx);},
 auditPrimary(index){hoop=hackerHoops[index];},
 auditSpawnEntry(side,steps=60){
   hackerShotSide=side<0?1:-1;
   hoop=makeHoop(world,hackerShotSide,false,1,activeHoopYLimits());
   hoop.hacker={state:'normal',pinned:false,age:0,scored:false};hackerHoops=[hoop];
   const old=Math.random;Math.random=()=>.5;
   try{registerScore({at:hoop});}finally{Math.random=old;}
   const incoming=hoop,ordinary=structuredClone(hoop);delete ordinary.hacker;
   const start={x:incoming.x,targetX:incoming.targetX,side:incoming.side,count:hackerHoops.length,combo:hackerComboCount(),netX:incoming.net[0].x};
   stepHackerCourt(0);
   const retained=hackerHoops.includes(incoming);
   const frames=[];
   for(let i=0;i<steps;i++){
     stepHoop(incoming,1/60);stepHoop(ordinary,1/60);
     if([0,3,14,59].includes(i))frames.push({x:incoming.x,ordinaryX:ordinary.x,combo:hackerComboCount(),netX:incoming.net[0].x});
   }
   return {start,retained,frames,width:world.w};
 },
 auditEntryAwaken(side){
   beginPlay();madeCount=1;
   hoop=makeHoop(world,side,false,1,activeHoopYLimits());hoop.x=side<0?-90:world.w+90;hoop.net=buildNet(hoop);
   const start=hoop.x,target=hoop.targetX;
   hackerPills.ready=true;enterHackerAwaken();const afterSwitch=hoop.x;
   for(let i=0;i<60;i++){stepHackerCourt(1/60);stepHoop(hoop,1/60);}
   paused=true;return {start,afterSwitch,target,after:hoop.x,count:hackerHoops.length};
 },
 auditWrap(){ball.x=world.w+world.ballR*10;ball.y=world.h/2;ball.vx=200;wrapX();return {side:Math.sign(ball.vx),approach:onApproachSide()};},
 auditPhysics(seconds){paused=false;for(let i=0;i<seconds*120;i++)physics(1/120);paused=true;},
 auditRetirementRestore(){
   rewindHistory=[];rewindSampleLeft=0;captureRewindSnapshot(.1);const snap=rewindHistory.at(-1);
   const before={side:hackerShotSide,hoops:hackerHoops.map(h=>({x:h.x,hold:h.hold})),outgoing:hackerOutgoing.map(h=>({x:h.x,hold:h.hold}))};
   hackerShotSide=hackerShotSide<0?1:-1;hackerHoops=[];hackerOutgoing=[];restoreRewindSnapshot(snap);
   return {before,after:{side:hackerShotSide,hoops:hackerHoops.map(h=>({x:h.x,hold:h.hold})),outgoing:hackerOutgoing.map(h=>({x:h.x,hold:h.hold}))}};
 },
 auditExit(){hackerExitPending=true;},
 auditSweep(){
   const a=hackerHoops[0],b=hackerHoops[1];b.x=b.baseX=b.targetX=a.x;b.y=b.baseY=a.y+100;
   a.hacker.scored=b.hacker.scored=false;hackerStepScores.clear();ball.scored=false;ball.vy=500;ball.x=prevBallX=a.x;prevBallY=a.y-10;ball.y=b.y+10;
   const old=Math.random;Math.random=()=>.5;try{checkScore();checkScore();}finally{Math.random=old;}
   paused=true;return {score,streak,madeCount};
 },
 auditPhysicalMake(){
   const h=hackerHoops[0];ball.x=prevBallX=h.x;ball.y=prevBallY=h.y-80;ball.vx=0;ball.vy=100;ball.scored=false;h.hacker.scored=false;scoredLock=0;paused=false;hint=false;
   for(let i=0;i<240 && madeCount===1;i++)physics(1/120);
   paused=true;return {madeCount,streak,score};
 },
 auditProjectiles(){
   const mod=createModifier('yard-lights'),host=modifierHost(),saved=mod.rewindState();
   const make=()=>({x:ball.x+50,y:ball.y,vx:-1,vy:0,elite:false,r:3,bounces:0,trail:[],falling:false,faceAng:0,fadeLeft:null});
   const results=[];const old=Math.random;
   try{for(const roll of [.1,.9]){
     saved.bolts=[make()];mod.restoreRewindState(saved);Math.random=()=>roll;mod.afterPhysics(.01,host);
     const first=mod.rewindState().bolts[0];Math.random=()=>.99;mod.afterPhysics(.01,host);
     results.push({first:first.falling,second:mod.rewindState().bolts[0].falling,attempt:first.hackerAttempt});
   }}finally{Math.random=old;}return results;
 },
 auditFreeze(){paused=true;},
 auditShow(){paused=false;emitHud();paused=true;},
 auditUnpause(){paused=false;emitHud();},
 auditExpire(){hackerExitPending=false;timer=0;timeUp=true;buzzer=true;registerScore({at:hoop});},
 auditRestore(){rewindHistory=[];rewindSampleLeft=0;captureRewindSnapshot(.1);const snap=rewindHistory.at(-1);hackerHoops=[];restoreRewindSnapshot(snap);return {same:hackerHoops.includes(hoop),count:hackerHoops.length};},
 snapshot(){return {`;
try {
 for(const [name,width,height] of [['desktop',1280,800],['mobile',390,844]]){
  const p=await browser.newPage({viewport:{width,height}});const errors=[];p.on('pageerror',e=>errors.push(String(e)));
  await p.route('https://grok.com/grok-app-builder/extensions.js',r=>r.fulfill({status:200,contentType:'application/javascript',body:''}));
  await p.route('**/src/game/engine.ts*',async route=>{const response=await route.fetch();const source=await response.text();assert.match(source,/snapshot\(\) \{\s*return \{/);await route.fulfill({response,body:source.replace(/snapshot\(\) \{\s*return \{/,hooks)});});
  await p.goto('http://127.0.0.1:8080/',{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window.__tq?.auditSetup);
  await p.getByRole('button',{name:'骇客球',exact:true}).click();await p.getByRole('button',{name:'开始',exact:true}).click();
  const results=await p.evaluate(()=>{
    const q=window.__tq;const samples=[];
    for(let n=1;n<=4;n++){q.auditSetup(n);samples.push(q.auditMake(n-1));}
    q.auditSetup(4);q.auditRetire(0);q.auditCourt(.02);const half=q.snapshot();const halfMake=q.auditMake(1);q.auditCourt(2);const gone=q.snapshot();
    q.auditSetup(2);const sweep=q.auditSweep();
    q.auditSetup(3);q.auditExit();const exiting=q.auditMake(2);const exit=q.snapshot();
    q.auditSetup(3,'minute');q.auditExit();q.auditMake(2);const minute=q.snapshot();
    q.auditSetup(4);const restored=q.auditRestore();
    q.auditSetup(2);q.auditExpire();const expired=q.snapshot();
    q.auditSetup(2);const physical=q.auditPhysicalMake();
    q.auditSetup(4);const projectiles=q.auditProjectiles();
    q.auditSetup(4);const firstDirection=q.auditTap();const taps=[firstDirection,q.auditTap()];
    for(let i=0;i<3;i++){q.auditMake(0);taps.push(q.auditTap(),q.auditTap());}
    const beforeReplacement=q.auditTap();q.auditPrimary(0);const afterReplacement=q.auditTap();const wrap=q.auditWrap();
    q.auditRetire(0);q.auditCourt(.2);const awakeRestore=q.auditRetirementRestore();
    q.auditExit();q.auditMake(1);const exitDirection=q.auditTap();const outgoingStart=q.snapshot();q.auditCourt(.2);const outgoingHold=q.snapshot();
    const outgoingRestore=q.auditRetirementRestore();q.auditCourt(.55);const outgoingSlide=q.snapshot();q.auditPhysics(2);const outgoingGone=q.snapshot();
    q.auditSetup(4);q.auditRetire(0);const animStart=q.snapshot();q.auditCourt(.3);const animHold=q.snapshot();q.auditCourt(.45);const animSlide=q.snapshot();q.auditCourt(1);const animGone=q.snapshot();
    q.auditSetup(3);q.auditRetire(0);q.auditCourt(.4);const exitHoldBefore=q.snapshot().hackerHoops[0].hold;q.auditExit();q.auditMake(0);const exitHoldAfter=q.snapshot().hold;
    const entries=[],switchEntries=[];for(const side of [-1,1]){q.auditSetup(1);entries.push(q.auditSpawnEntry(side));switchEntries.push(q.auditEntryAwaken(side));}
    return {samples,half,halfMake,gone,sweep,exiting,exit,minute,restored,expired,physical,projectiles,taps,firstDirection,beforeReplacement,afterReplacement,wrap,awakeRestore,exitDirection,outgoingStart,outgoingHold,outgoingRestore,outgoingSlide,outgoingGone,animStart,animHold,animSlide,animGone,exitHoldBefore,exitHoldAfter,entries,switchEntries};
  });
  for(let i=0;i<4;i++){const r=results.samples[i];assert.equal(r.after.streak-r.before.streak,i+1);assert.equal(r.after.score-r.before.score,results.samples[0].after.score);assert.equal(r.after.timer,7);assert.equal(r.after.madeCount-r.before.madeCount,1);assert.ok(r.after.count<=4);}
  assert.equal(results.samples[3].after.count,4);
  assert.equal(results.half.hackerHoops.length,4);assert.equal(results.halfMake.after.streak-results.halfMake.before.streak,4);
  assert.ok(results.gone.hackerHoops.every(h=>h.state!=='retiring'));
  assert.equal(results.sweep.madeCount,3); // Exactly two makes, second collision check cannot duplicate.
  assert.equal(results.exit.hackerAwaken,false);assert.equal(results.exit.hackerHoops.length,0);assert.equal(results.exit.timer,results.exit.timerMax);assert.ok(results.exit.timer>7);
  assert.equal(results.minute.timer,7);assert.equal(results.minute.hackerAwaken,false);
  assert.deepEqual(results.restored,{same:true,count:4});assert.equal(results.expired.phase,'over');
  assert.equal(results.physical.madeCount,2);assert.equal(results.physical.streak,12);
  assert.equal(results.projectiles[0].first,false);assert.equal(results.projectiles[0].second,false);assert.equal(results.projectiles[1].first,true);
  assert.deepEqual(results.taps,[1,1,-1,-1,1,1,-1,-1].map(n=>n*results.firstDirection));
  assert.equal(results.beforeReplacement,results.afterReplacement);assert.equal(results.wrap.side,results.afterReplacement);assert.equal(results.wrap.approach,true);
  assert.equal(results.exitDirection,-results.afterReplacement);assert.equal(results.outgoingStart.hoop.side,results.exitDirection);
  assert.equal(results.outgoingStart.hackerOutgoing.length,3);assert.equal(results.outgoingHold.hackerOutgoing.length,3);
  assert.deepEqual(results.outgoingStart.hackerOutgoing.map(h=>h.x),results.outgoingHold.hackerOutgoing.map(h=>h.x));
  assert.ok(results.outgoingSlide.hackerOutgoing.some((h,i)=>h.x!==results.outgoingHold.hackerOutgoing[i].x));
  assert.equal(results.outgoingGone.hackerOutgoing.length,0);assert.equal(results.outgoingGone.hackerAwaken,false);
  assert.deepEqual(results.awakeRestore.before,results.awakeRestore.after);assert.deepEqual(results.outgoingRestore.before,results.outgoingRestore.after);
  assert.equal(results.animStart.hackerHoops[0].x,results.animHold.hackerHoops[0].x);
  assert.ok(results.animSlide.hackerHoops[0].x>results.animHold.hackerHoops[0].x);assert.equal(results.animSlide.hackerHoops.length,4);
  assert.ok(results.animGone.hackerHoops.every(h=>h.state!=='retiring'));
  assert.equal(results.exitHoldBefore,results.exitHoldAfter);
  for(const e of results.entries){
    assert.equal(e.start.count,2);assert.equal(e.start.combo,1);assert.equal(e.retained,true);
    assert.equal(e.start.x,e.start.side<0?-90:e.width+90);
    const direction=-e.start.side;
    assert.ok((e.frames[0].x-e.start.x)*direction>0);assert.ok((e.start.targetX-e.frames[0].x)*direction>0);
    for(const f of e.frames){assert.equal(f.x,f.ordinaryX);assert.ok(Math.abs((f.netX-e.start.netX)-(f.x-e.start.x))<1e-6);}
    assert.ok(Math.abs(e.frames.at(-1).x-e.start.targetX)<1);assert.equal(e.frames.at(-1).combo,2);
  }
  for(const e of results.switchEntries){assert.equal(e.start,e.afterSwitch);assert.ok(Math.abs(e.after-e.target)<1);assert.equal(e.count,1);}
  await p.evaluate(()=>{window.__tq.auditSetup(4);window.__tq.auditUnpause();});
  await p.waitForTimeout(150);
  await p.evaluate(()=>window.__tq.auditFreeze());
  await p.screenshot({path:'screenshots/hacker-awakening/hacker-awakening-'+name+'.png'});
  await p.evaluate(()=>{window.__tq.auditSetup(4);window.__tq.auditRetire(0);window.__tq.auditExit();window.__tq.auditMake(1);window.__tq.auditShow();});
  await p.screenshot({path:'screenshots/hacker-awakening/hacker-exit-hold-'+name+'.png'});
  await p.evaluate(()=>window.__tq.auditCourt(.77));
  await p.screenshot({path:'screenshots/hacker-awakening/hacker-exit-slide-'+name+'.png'});
  await p.evaluate(()=>{window.__tq.auditSetup(1);window.__tq.auditSpawnEntry(-1,0);window.__tq.auditShow();});
  await p.screenshot({path:'screenshots/hacker-awakening/hacker-entry-start-'+name+'.png'});
  await p.evaluate(()=>window.__tq.auditCourt(4/60));
  await p.screenshot({path:'screenshots/hacker-awakening/hacker-entry-slide-'+name+'.png'});
  await p.evaluate(()=>window.__tq.auditCourt(.35));
  await p.screenshot({path:'screenshots/hacker-awakening/hacker-entry-end-'+name+'.png'});
  await p.evaluate(()=>window.__tq.auditSetup(2));
  const click=await p.evaluate(()=>{const s=window.__tq.snapshot(),w=s.world,p=s.hackerPills.button;window.__tq.auditUnpause();return {x:w.ox+p.x,y:w.oy+p.y};});
  // Canvas coordinates are projected through its bounding rect below.
  await p.waitForTimeout(100);
  const box=await p.locator('canvas').first().boundingBox();
  await p.mouse.click(box.x+click.x,box.y+click.y);
  await p.evaluate(()=>window.__tq.auditFreeze());
  const clicked=await p.evaluate(()=>window.__tq.snapshot());
  assert.equal(clicked.hackerExitPending,true);assert.equal(clicked.hackerAwaken,true);assert.ok(clicked.timer<=7);
  assert.deepEqual(errors,[]);console.log(name,'PASS',JSON.stringify({scores:results.samples.map(r=>r.after),sweep:results.sweep,exitTimer:results.exit.timer,button:true}));
  await p.close();
 }
}finally{await browser.close();}
