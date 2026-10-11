export const SUPER = { capacity:120, segment:20, chainWindow:0.2, parryWindow:0.12, dashTime:0.09, dashDiameters:4, swipeSlop:8 };
type Body={x:number;y:number;vx:number;vy:number;r:number};
export function createSuper() {
  return {energy:0,shield:false,invincible:0,clock:0,lastSwipe:-Infinity,lastAction:-Infinity,chain:0,refund:false,
    pointer:null as null|{id:number;x:number;y:number;used:boolean},
    pending:null as null|{dx:number;dy:number;wait:number},queue:[] as {dx:number;dy:number;wait:number}[],
    dash:null as null|{dx:number;dy:number;left:number;vx:number;vy:number},
    impact:null as null|{at:number;x:number;y:number;vx:number;vy:number},flash:0};
}
export type SuperState=ReturnType<typeof createSuper>;
export function superSegments(s:SuperState){return Math.floor((s.energy+1e-8)/20);}
function spend(s:SuperState,n:number){s.energy=Math.max(0,s.energy-n);if(s.energy<=0)s.shield=false;}
export function superToggle(s:SuperState){s.shield=!s.shield && s.energy>0;s.pending=null;s.queue=[];s.refund=false;s.lastAction=s.clock;}
function parry(s:SuperState){s.energy=Math.min(120,s.energy+20);s.invincible=3;s.pending=null;s.queue=[];s.dash=null;s.impact=null;s.refund=false;s.flash=0.4;}
export function superSwipe(s:SuperState,b:Body,dx:number,dy:number) {
  s.lastAction=s.clock;
  if(s.shield || Math.hypot(dx,dy)<1)return 'blocked';
  const chain=s.clock-s.lastSwipe<=0.2+1e-8?Math.min(3,s.chain+1):1;
  if(s.energy<chain*20){s.flash=Math.max(s.flash,0.2);return 'empty';}
  spend(s,chain*20);s.chain=chain;s.lastSwipe=s.clock;s.refund=true;
  if(s.impact && s.clock-s.impact.at<=SUPER.parryWindow){Object.assign(b,{x:s.impact.x,y:s.impact.y,vx:s.impact.vx,vy:s.impact.vy});parry(s);return 'parry';}
  const angle=Math.round(Math.atan2(dy,dx)/(Math.PI/4))*Math.PI/4;
  // Next step commits. parryWindow still forgives a swipe after a hit; it no longer holds the dash.
  const pending={dx:Math.cos(angle),dy:Math.sin(angle),wait:0};
  if(s.pending)s.queue.push(pending);else s.pending=pending;
  return 'dash';
}
/** True means the impact is consumed before it can overwrite velocity. */
export function superImpact(s:SuperState,b:Body) {
  if(s.invincible>0)return true;
  if(s.shield && s.energy>0){spend(s,4);s.flash=0.18;return true;}
  if(s.pending && s.clock-s.lastSwipe<=SUPER.parryWindow){
    if(s.dash){b.vx=s.dash.vx;b.vy=s.dash.vy;}parry(s);return true;
  }
  if(s.dash){b.vx=s.dash.vx;b.vy=s.dash.vy;}
  s.impact={at:s.clock,x:b.x,y:b.y,vx:b.vx,vy:b.vy};s.dash=null;
  return false;
}
export function superBaseBonus(s:SuperState){return s.shield?superSegments(s)*2:0;}
export function superScore(s:SuperState,score:number,wasShield=s.shield){
  if(wasShield){if(superSegments(s)>0)spend(s,4);s.refund=false;return;}
  const refund=s.refund && s.clock-s.lastAction>=0.2-1e-8?10:0;
  s.energy=Math.min(120,s.energy+Math.max(0,score)+refund);s.refund=false;
}
export function stepSuper(s:SuperState,b:Body,dt:number){
  s.clock+=dt;s.invincible=Math.max(0,s.invincible-dt);s.flash=Math.max(0,s.flash-dt);
  if(s.shield)spend(s,dt*0.5);
  if(s.impact && s.clock-s.impact.at>SUPER.parryWindow)s.impact=null;
  for(const queued of s.queue)queued.wait-=dt;
  if(s.pending){s.pending.wait-=dt;if(s.pending.wait<=1e-8 && !s.dash){s.dash={dx:s.pending.dx,dy:s.pending.dy,left:SUPER.dashTime,vx:b.vx,vy:b.vy};s.pending=s.queue.shift()??null;}}
}
/** Uses regular swept collision/score processing rather than teleporting through objects. */
export function superDashVelocity(s:SuperState,b:Body,dt:number){
  const d=s.dash;if(!d)return false;
  if(d.left<=1e-8){b.vx=d.vx;b.vy=d.vy;s.dash=null;return false;}
  const speed=b.r*2*SUPER.dashDiameters/SUPER.dashTime*Math.min(1,d.left/dt);
  b.vx=d.dx*speed;b.vy=d.dy*speed;d.left=Math.max(0,d.left-dt);return true;
}
export function superLayout(w:number){return {x:16,y:76,w:Math.min(168,w*0.43),h:28};}
export function drawSuper(ctx:CanvasRenderingContext2D,w:number,s:SuperState,b:Body){
  const p=superLayout(w),gap=4,seg=(p.w-gap*5)/6;
  ctx.save();
  if(s.shield || s.invincible>0 || s.flash>0){
    ctx.strokeStyle=s.invincible>0?'#fff':'#57dcf2';ctx.lineWidth=s.flash>0?4:2;
    ctx.globalAlpha=s.invincible>0?0.6+0.4*Math.sin(s.clock*28)**2:0.8;
    ctx.beginPath();ctx.arc(b.x,b.y,b.r+7,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
  }
  if(s.dash){ctx.strokeStyle='#6deafa';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-s.dash.dx*b.r*2,b.y-s.dash.dy*b.r*2);ctx.stroke();}
  for(let i=0;i<6;i++){
    const x=p.x+i*(seg+gap);ctx.save();ctx.beginPath();ctx.moveTo(x+6,p.y);ctx.lineTo(x+seg,p.y);ctx.lineTo(x+seg-6,p.y+p.h);ctx.lineTo(x,p.y+p.h);ctx.closePath();
    ctx.fillStyle='#f7f7f3';ctx.fill();ctx.save();ctx.clip();ctx.fillStyle=s.shield?'#70adff':'#61e6c2';
    ctx.fillRect(x,p.y,seg*Math.max(0,Math.min(1,(s.energy-i*20)/20)),p.h);ctx.restore();ctx.strokeStyle='#111';ctx.lineWidth=2;ctx.stroke();ctx.restore();
  }
  ctx.font='bold 11px sans-serif';ctx.textAlign='left';ctx.fillStyle='#111';ctx.strokeStyle='#fff';ctx.lineWidth=3;
  const text=s.shield?'护盾 · 点击关闭':'冲刺 · 点击护盾';ctx.strokeText(text,p.x,p.y+p.h+15);ctx.fillText(text,p.x,p.y+p.h+15);ctx.restore();
}
