export const SUPER = { capacity:120, segment:20, chainWindow:0.2, parryWindow:0.12, dashTime:0.5, hangTime:0.2, dashDiameters:5, swipeSlop:8 };
type Body={x:number;y:number;vx:number;vy:number;r:number};
export function createSuper() {
  return {energy:0,shield:false,invincible:0,clock:0,lastSwipe:-Infinity,lastAction:-Infinity,chain:0,refund:false,
    pointer:null as null|{id:number;x:number;y:number;used:boolean},
    pending:null as null|{dx:number;dy:number;wait:number},queue:[] as {dx:number;dy:number;wait:number}[],
    dash:null as null|{dx:number;dy:number;left:number;hang:number;vx:number;vy:number},
    ghosts:[] as {x:number;y:number;life:number}[],
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
function glideDistance(elapsed:number,distance:number){
  const f=Math.min(1,Math.max(0,elapsed/SUPER.dashTime));
  return distance*(1-(1-f)*(1-f));
}
function trailGhost(s:SuperState,b:Body){
  const prev=s.ghosts[s.ghosts.length-1];
  if(prev && Math.hypot(b.x-prev.x,b.y-prev.y)<b.r*1.55) return;
  s.ghosts.push({x:b.x,y:b.y,life:0.48});
  if(s.ghosts.length>5) s.ghosts.shift();
}
export function stepSuper(s:SuperState,b:Body,dt:number){
  s.clock+=dt;s.invincible=Math.max(0,s.invincible-dt);s.flash=Math.max(0,s.flash-dt);
  if(s.shield)spend(s,dt*0.5);
  if(s.impact && s.clock-s.impact.at>SUPER.parryWindow)s.impact=null;
  let kept=0;
  for(const ghost of s.ghosts){ghost.life-=dt;if(ghost.life>0)s.ghosts[kept++]=ghost;}
  s.ghosts.length=kept;
  for(const queued of s.queue)queued.wait-=dt;
  if(s.pending){s.pending.wait-=dt;if(s.pending.wait<=1e-8 && !s.dash){s.dash={dx:s.pending.dx,dy:s.pending.dy,left:SUPER.dashTime,hang:0,vx:b.vx,vy:b.vy};s.pending=s.queue.shift()??null;}}
}
/** Linear slowdown over five diameters, then a still hang. Swept collision stays on. */
export function superDashVelocity(s:SuperState,b:Body,dt:number){
  const d=s.dash;if(!d)return false;
  if(d.left>1e-8){
    const dist=b.r*2*SUPER.dashDiameters;
    const prev=SUPER.dashTime-d.left;
    d.left=Math.max(0,d.left-dt);
    const step=glideDistance(SUPER.dashTime-d.left,dist)-glideDistance(prev,dist);
    const speed=dt>1e-8?step/dt:0;
    b.vx=d.dx*speed;b.vy=d.dy*speed;
    trailGhost(s,b);
    if(d.left<=1e-8)d.hang=SUPER.hangTime;
    return true;
  }
  if(d.hang>1e-8){b.vx=0;b.vy=0;d.hang=Math.max(0,d.hang-dt);return true;}
  b.vx=0;b.vy=0;s.dash=null;return false;
}
export function superLayout(w:number){return {x:16,y:76,w:Math.min(168,w*0.43),h:28};}
function strokeWave(ctx:CanvasRenderingContext2D,x:number,y:number,radius:number,time:number,waves:number,amp:number,color:string,width:number,alpha:number){
  ctx.beginPath();
  const n=64;
  for(let i=0;i<=n;i++){
    const a=i/n*Math.PI*2;
    const rr=radius+Math.sin(a*waves+time)*amp+Math.sin(a*(waves*0.5)-time*0.7)*amp*0.35;
    const px=x+Math.cos(a)*rr,py=y+Math.sin(a)*rr;
    if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
  }
  ctx.closePath();
  ctx.strokeStyle=color;ctx.globalAlpha=alpha;ctx.lineWidth=width;ctx.stroke();ctx.globalAlpha=1;
}
/** Fading copies of the ball, drawn behind it. */
export function drawSuperGhosts(ctx:CanvasRenderingContext2D,s:SuperState,radius:number,paint:(x:number,y:number,r:number,alpha:number)=>void){
  const ghosts=s.ghosts,n=ghosts.length;if(!n)return;
  ctx.save();
  for(let i=0;i<n;i++){
    const ghost=ghosts[i]!,fade=(i+1)/n;
    const alpha=(0.14+0.48*fade*fade)*Math.min(1,ghost.life/0.22);
    paint(ghost.x,ghost.y,radius*(0.8+0.2*fade),alpha);
  }
  ctx.restore();
}
/** Purple gas while dashing, and a green waveform while the shield is up. */
export function drawSuperAura(ctx:CanvasRenderingContext2D,s:SuperState,b:Body){
  ctx.save();
  if(s.dash){
    const moving=s.dash.left>1e-8;
    const alpha=moving?1:Math.max(0.35,s.dash.hang/SUPER.hangTime);
    const rad=b.r*(moving?1.55:1.35);
    const gas=ctx.createRadialGradient(b.x,b.y,b.r*0.55,b.x,b.y,rad);
    gas.addColorStop(0,"rgba(186,120,255,0)");
    gas.addColorStop(0.62,`rgba(168,96,255,${0.42*alpha})`);
    gas.addColorStop(0.82,`rgba(120,48,210,${0.22*alpha})`);
    gas.addColorStop(1,"rgba(90,20,170,0)");
    ctx.fillStyle=gas;ctx.beginPath();ctx.arc(b.x,b.y,rad,0,Math.PI*2);ctx.fill();
    for(let i=0;i<3;i++){
      const a=s.clock*2.4+i*Math.PI*2/3;
      const puff=b.r*(1.15+0.08*Math.sin(s.clock*6+i));
      const px=b.x+Math.cos(a)*b.r*0.35,py=b.y+Math.sin(a)*b.r*0.35;
      const g=ctx.createRadialGradient(px,py,0,px,py,puff*0.55);
      g.addColorStop(0,`rgba(214,186,255,${0.28*alpha})`);
      g.addColorStop(1,"rgba(140,70,230,0)");
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(px,py,puff*0.55,0,Math.PI*2);ctx.fill();
    }
    strokeWave(ctx,b.x,b.y,b.r+6,s.clock*7,5,b.r*0.07,"#d7b6ff",3,0.55*alpha);
  }
  if(s.shield){
    strokeWave(ctx,b.x,b.y,b.r+11,s.clock*11,7,b.r*0.28,"#3ee07a",2.8,0.95);
    strokeWave(ctx,b.x,b.y,b.r+18,s.clock*7+1.2,5,b.r*0.18,"#9dffc0",1.5,0.4);
  }
  if(s.invincible>0 || s.flash>0){
    ctx.strokeStyle=s.invincible>0?'#fff':'#57dcf2';ctx.lineWidth=s.flash>0?4:2;
    ctx.globalAlpha=s.invincible>0?0.6+0.4*Math.sin(s.clock*28)**2:0.8;
    ctx.beginPath();ctx.arc(b.x,b.y,b.r+7,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
  }
  ctx.restore();
}
export function drawSuper(ctx:CanvasRenderingContext2D,w:number,s:SuperState,b:Body){
  const p=superLayout(w),gap=4,seg=(p.w-gap*5)/6;
  ctx.save();
  for(let i=0;i<6;i++){
    const x=p.x+i*(seg+gap);ctx.save();ctx.beginPath();ctx.moveTo(x+6,p.y);ctx.lineTo(x+seg,p.y);ctx.lineTo(x+seg-6,p.y+p.h);ctx.lineTo(x,p.y+p.h);ctx.closePath();
    ctx.fillStyle='#f7f7f3';ctx.fill();ctx.save();ctx.clip();ctx.fillStyle=s.shield?'#70adff':'#61e6c2';
    ctx.fillRect(x,p.y,seg*Math.max(0,Math.min(1,(s.energy-i*20)/20)),p.h);ctx.restore();ctx.strokeStyle='#111';ctx.lineWidth=2;ctx.stroke();ctx.restore();
  }
  ctx.font='bold 11px sans-serif';ctx.textAlign='left';ctx.fillStyle='#111';ctx.strokeStyle='#fff';ctx.lineWidth=3;
  const text=s.shield?'护盾 · 点击关闭':'冲刺 · 点击护盾';ctx.strokeText(text,p.x,p.y+p.h+15);ctx.fillText(text,p.x,p.y+p.h+15);ctx.restore();
}
