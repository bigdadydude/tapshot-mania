import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const hooks=`
 auditBlueprintSetup(mode='classic') {applyScenePack('blueprint');playMode=mode;beginPlay();timer=timerMax=15;timerArmed=true;paused=true;hint=false;},
 auditBlueprintSeed(rewards) {const s=getBlueprintClock();restoreBlueprintClock({...s,rewards});},
 auditBlueprintMake(ghost=false) {ball.hitBoard=ball.hitRim=false;wentOffTop=fromBelow=hitBoardTop=false;rimHits=0;registerScore({at:hoop,ghost,forceSwish:true});return {score,streak,timer,budget:blueprintClockBudget(),rewards:getBlueprintRewards()};},
 snapshot() { return {`;
mkdirSync('screenshots/blueprint-colors',{recursive:true});
const b=await chromium.launch({channel:'msedge',headless:true});
try{for(const [name,width,height] of [['desktop',1280,800],['mobile',390,844]]){
 const p=await b.newPage({viewport:{width,height}});const errors=[];p.on('pageerror',e=>errors.push(String(e)));
 await p.route('https://grok.com/grok-app-builder/extensions.js',r=>r.fulfill({status:200,contentType:'application/javascript',body:''}));
 await p.route('**/src/game/engine.ts*',async route=>{const r=await route.fetch();const s=await r.text();assert.match(s,/snapshot\(\) \{\s*return \{/);await route.fulfill({response:r,body:s.replace(/snapshot\(\) \{\s*return \{/,hooks)});});
 await p.goto('http://127.0.0.1:8082/',{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.__tq?.auditBlueprintSetup);
 const result=await p.evaluate(async()=>{
  const q=window.__tq;q.auditBlueprintSetup();q.auditBlueprintSeed({base:2,combo:1,seconds:3});
  const first=q.auditBlueprintMake(),second=q.auditBlueprintMake();
  q.auditBlueprintSetup('minute');q.auditBlueprintSeed({base:2,combo:1,seconds:3});const minute=q.auditBlueprintMake();
  const m=await import('/src/game/blueprint.ts');const before=m.getBlueprintClock();
  const w=q.snapshot().world;const s={...before,staticCells:[{col:5,row:5,kind:'white'},{col:6,row:5,kind:'green'},{col:7,row:5,kind:'red'}],staticAge:1,lit:['5:5']};m.restoreBlueprintClock(s);
  return {first,second,minute,world:!!w};
 });
 assert.equal(result.first.streak,2);assert.equal(result.first.score,7);assert.equal(result.second.streak,4);assert.equal(result.second.score-result.first.score,9);
 assert.ok(result.first.budget>17);assert.ok(result.second.budget>17);assert.equal(result.minute.timer,15);
 await p.screenshot({path:`screenshots/blueprint-colors/${name}.png`});assert.deepEqual(errors,[]);console.log(name,'PASS',JSON.stringify(result));await p.close();
}}finally{await b.close();}
