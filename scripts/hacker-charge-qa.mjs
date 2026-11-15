import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

mkdirSync('screenshots/hacker-charge', { recursive: true });
const hooks = `
 auditChargeSetup(makes=15) {
   applyBall('rain'); beginPlay(); timer=timerMax=60; madeCount=1; timerArmed=true;
   hackerCharge.makes=makes; hackerCharge.idleSeconds=0;
   ball.x=world.w/2; ball.y=world.floorY-ball.r; ball.vx=ball.vy=0;
   hint=false; paused=false; emitHud(); paused=true;
 },
 auditChargeTime(seconds, stayPaused=false) {
   paused=stayPaused;
   for(let i=0;i<Math.round(seconds*120);i++) physics(1/120);
   paused=true; return {...hackerCharge};
 },
 auditChargeMake() {registerScore({at:hoop}); return {...hackerCharge};},
 snapshot() { return {`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const [name, width, height] of [['desktop',1280,800], ['mobile',390,844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.route('https://grok.com/grok-app-builder/extensions.js', r => r.fulfill({status:200,contentType:'application/javascript',body:''}));
    await page.route('**/src/game/engine.ts*', async route => {
      const response = await route.fetch();
      const source = await response.text();
      assert.match(source, /snapshot\(\) \{\s*return \{/);
      await route.fulfill({response,body:source.replace(/snapshot\(\) \{\s*return \{/,hooks)});
    });
    await page.goto('http://127.0.0.1:8080/', {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => window.__tq?.auditChargeSetup);
    await page.getByRole('button',{name:'骇客球',exact:true}).click();
    await page.getByRole('button',{name:'开始',exact:true}).click();
    const results = await page.evaluate(() => {
      const q=window.__tq;
      q.auditChargeSetup();
      const grace=q.auditChargeTime(3), decay=q.auditChargeTime(1), pause=q.auditChargeTime(2,true);
      const goal=q.auditChargeMake(), renewed=q.auditChargeTime(3), next=q.auditChargeTime(1);
      return {grace,decay,pause,goal,renewed,next};
    });
    for (const key of ['grace','goal','renewed']) assert.ok(Math.abs(results[key].makes-15)<1e-8, key);
    for (const key of ['decay','pause','next']) assert.ok(Math.abs(results[key].makes-14)<1e-8, key);
    assert.equal(results.pause.idleSeconds,results.decay.idleSeconds);
    assert.equal(results.goal.idleSeconds,0);
    await page.evaluate(() => window.__tq.auditChargeSetup(12.5));
    await page.screenshot({path:`screenshots/hacker-charge/${name}.png`});
    assert.deepEqual(errors,[]);
    console.log(name,'PASS',JSON.stringify(results));
    await page.close();
  }
} finally { await browser.close(); }
