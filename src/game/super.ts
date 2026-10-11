export const SUPER = { capacity:120, segment:20, chainWindow:0.2, parryWindow:0.07, parryFreeze:0.08, dashTime:0.5, hangTime:0.2, dashDiameters:5, swipeSlop:8, swipeCancel:0.16 };
type Body={x:number;y:number;vx:number;vy:number;r:number};
type DashAim={dx:number;dy:number};
export function createSuper() {
  return {energy:0,shield:false,clock:0,lastSwipe:-Infinity,lastAction:-Infinity,chain:0,refund:false,
    pointer:null as null|{id:number;x:number;y:number;used:boolean},
    pending:null as null|DashAim,queue:[] as DashAim[],
    dash:null as null|{dx:number;dy:number;left:number;hang:number;vx:number;vy:number},
    ghosts:[] as {x:number;y:number;life:number}[],
    impact:null as null|{at:number},freezeLeft:0,flash:0,wave:0};
}
export type SuperState=ReturnType<typeof createSuper>;
export function superSegments(s:SuperState){return Math.floor((s.energy+1e-8)/20);}
export function superIsFrozen(s:SuperState){return s.freezeLeft>1e-8;}
function releaseShield(s:SuperState){
  if(!s.shield)return;
  s.shield=false;s.pending=null;s.queue=[];s.refund=false;s.wave=0;
}
function spend(s:SuperState,n:number){s.energy=Math.max(0,s.energy-n);if(s.energy<=0)releaseShield(s);}
export function superToggle(s:SuperState){s.shield=!s.shield && s.energy>0;s.pending=null;s.queue=[];s.refund=false;s.lastAction=s.clock;s.wave=0;}
export function superPulseShield(s:SuperState){if(s.shield)s.wave=1;}
function parry(s:SuperState,b:Body){
  b.vx=0;b.vy=0;
  s.energy=Math.min(120,s.energy+20);
  s.freezeLeft=SUPER.parryFreeze;
  s.pending=null;s.queue=[];s.dash=null;s.impact=null;s.refund=false;s.flash=0.4;
}
function beginDash(s:SuperState,b:Body,aim:DashAim){
  s.dash={dx:aim.dx,dy:aim.dy,left:SUPER.dashTime,hang:0,vx:b.vx,vy:b.vy};
}
function promoteDash(s:SuperState,b:Body){
  if(s.dash || !s.pending || superIsFrozen(s))return;
  beginDash(s,b,s.pending);
  s.pending=s.queue.shift()??null;
}
export function superSwipe(s:SuperState,b:Body,dx:number,dy:number) {
  s.lastAction=s.clock;
  if(s.shield || Math.hypot(dx,dy)<1)return 'blocked';
  if(superIsFrozen(s))return 'blocked';
  const chain=s.clock-s.lastSwipe<=0.2+1e-8?Math.min(3,s.chain+1):1;
  // Perfect cancel: freeze in place and clear forces. Free at 0 energy.
  if(s.impact && s.clock-s.impact.at<=SUPER.parryWindow){
    const cost=chain*20;
    if(s.energy>=cost)spend(s,cost);
    s.chain=chain;s.lastSwipe=s.clock;s.refund=false;
    parry(s,b);return 'parry';
  }
  if(s.energy<chain*20)return 'empty';
  spend(s,chain*20);s.chain=chain;s.lastSwipe=s.clock;s.refund=true;
  const angle=Math.round(Math.atan2(dy,dx)/(Math.PI/4))*Math.PI/4;
  const aim:DashAim={dx:Math.cos(angle),dy:Math.sin(angle)};
  if(s.dash){if(s.pending)s.queue.push(aim);else s.pending=aim;}
  else beginDash(s,b,aim);
  return 'dash';
}
/** True means the impact is consumed (shield). Otherwise arm the perfect-cancel window and let bounce play. */
export function superImpact(s:SuperState,b:Body,opts?:{shield?:boolean;nx?:number;ny?:number}) {
  if(opts?.shield!==false && s.shield && s.energy>0){spend(s,4);s.flash=0.18;return true;}
  if(superIsFrozen(s)){b.vx=0;b.vy=0;return true;}
  if(s.dash){b.vx=s.dash.vx;b.vy=s.dash.vy;}
  s.impact={at:s.clock};s.dash=null;s.chain=0;s.lastSwipe=-Infinity;
  return false;
}
export function superBaseBonus(s:SuperState){return s.shield?superSegments(s)*2:0;}
export function superScore(s:SuperState,score:number,wasShield=s.shield){
  // A make cannot perfect-cancel: drop any pending rim/board/car window.
  s.impact=null;
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
  s.clock+=dt;s.flash=Math.max(0,s.flash-dt);s.wave=Math.max(0,s.wave-dt/0.28);
  s.freezeLeft=Math.max(0,s.freezeLeft-dt);
  if(s.energy<=0)releaseShield(s);else if(s.shield)spend(s,dt*0.5);
  if(s.impact && s.clock-s.impact.at>SUPER.parryWindow)s.impact=null;
  if(superIsFrozen(s)){b.vx=0;b.vy=0;}
  let kept=0;
  for(const ghost of s.ghosts){ghost.life-=dt;if(ghost.life>0)s.ghosts[kept++]=ghost;}
  s.ghosts.length=kept;
  promoteDash(s,b);
}
/** Linear slowdown over five diameters, then a still hang. Swept collision stays on. */
export function superDashVelocity(s:SuperState,b:Body,dt:number):boolean{
  if(superIsFrozen(s)){b.vx=0;b.vy=0;return true;}
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
  b.vx=0;b.vy=0;s.dash=null;
  promoteDash(s,b);
  return s.dash?superDashVelocity(s,b,dt):false;
}
export function superLayout(world:{w:number;oy?:number}){
  const scoreSize=Math.floor(world.w*0.15),h=14,width=Math.min(92,world.w*0.24);
  return {x:12,y:14-(world.oy??0)+(scoreSize-h)/2,w:width,h};
}
function waveRadius(angle:number,time:number,base:number,amp:number){
  return base
    +Math.sin(angle*3+time*2.3)*amp
    +Math.sin(angle*5-time*1.7)*amp*0.55
    +Math.sin(angle*8+time*3.1)*amp*0.28
    +Math.sin(angle*2.4-time*0.9)*amp*0.22;
}
function strokeAuraLine(ctx:CanvasRenderingContext2D,x:number,y:number,radius:number,time:number,wave:number,color:string){
  ctx.save();
  ctx.shadowBlur=0;ctx.strokeStyle=color;ctx.lineWidth=2.2;ctx.lineJoin='round';ctx.globalAlpha=0.95;
  ctx.beginPath();
  if(wave<=0.02){ctx.arc(x,y,radius,0,Math.PI*2);}
  else{
    const amp=radius*0.11*wave,n=64;
    for(let i=0;i<=n;i++){
      const a=i/n*Math.PI*2,rr=waveRadius(a,time*8,radius,amp);
      const px=x+Math.cos(a)*rr,py=y+Math.sin(a)*rr;
      if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
    }
    ctx.closePath();
  }
  ctx.stroke();
  ctx.restore();
}
function strokeShieldRings(ctx:CanvasRenderingContext2D,x:number,y:number,radius:number,time:number){
  const period=1.55,count=3,core=radius+2.2;
  ctx.save();
  ctx.shadowBlur=0;
  for(let i=0;i<count;i++){
    const t=((time/period)+i/count)%1,grow=t*radius*0.5,alpha=0.95*(1-t);
    ctx.beginPath();ctx.arc(x,y,core+grow,0,Math.PI*2);
    ctx.strokeStyle=`rgba(125,255,176,${alpha})`;ctx.lineWidth=2.2;ctx.stroke();
  }
  ctx.restore();
}
function fillGasCloud(ctx:CanvasRenderingContext2D,x:number,y:number,inner:number,outer:number,time:number,alpha:number){
  ctx.save();
  ctx.beginPath();
  const n=56;
  for(let i=0;i<=n;i++){
    const a=i/n*Math.PI*2;
    const lobe=0.55+0.45*((Math.sin(a*3+time*1.4)+1)*0.5)*((Math.sin(a*5-time*1.1)+1)*0.5);
    const rr=inner+(outer-inner)*(0.72+0.28*lobe)+Math.sin(a*7+time*2.6)*inner*0.08;
    const px=x+Math.cos(a)*rr,py=y+Math.sin(a)*rr;
    if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
  }
  ctx.closePath();
  ctx.clip();
  const gas=ctx.createRadialGradient(x,y,inner*0.55,x,y,outer);
  gas.addColorStop(0,`rgba(255,255,255,${0.96*alpha})`);
  gas.addColorStop(0.32,`rgba(255,255,255,${0.88*alpha})`);
  gas.addColorStop(0.52,`rgba(214,180,255,${0.7*alpha})`);
  gas.addColorStop(0.74,`rgba(124,52,198,${0.55*alpha})`);
  gas.addColorStop(0.9,`rgba(78,22,138,${0.2*alpha})`);
  gas.addColorStop(1,'rgba(60,12,110,0)');
  ctx.fillStyle=gas;ctx.fillRect(x-outer,y-outer,outer*2,outer*2);
  for(let i=0;i<5;i++){
    const a=time*0.9+i*1.26;
    const reach=inner+(outer-inner)*(0.55+0.28*Math.sin(time*1.6+i));
    const px=x+Math.cos(a)*reach,py=y+Math.sin(a)*reach;
    const puff=inner*(0.55+0.18*Math.sin(time*2.2+i*1.7));
    const g=ctx.createRadialGradient(px,py,0,px,py,puff);
    g.addColorStop(0,`rgba(255,255,255,${0.18*alpha})`);
    g.addColorStop(0.45,`rgba(150,88,220,${0.3*alpha})`);
    g.addColorStop(1,'rgba(80,24,140,0)');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(px,py,puff,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
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
/** Soft Gastly-like gas while dashing. Drawn behind the ball. */
export function drawSuperGas(ctx:CanvasRenderingContext2D,s:SuperState,b:Body){
  if(!s.dash)return;
  const moving=s.dash.left>1e-8;
  fillGasCloud(ctx,b.x,b.y,b.r*0.86,b.r*(moving?2.2:1.9),s.clock,moving?1:Math.max(0.4,s.dash.hang/SUPER.hangTime));
}
/** Shield expands and fades; brief cyan flash marks a perfect cancel. */
export function drawSuperAura(ctx:CanvasRenderingContext2D,s:SuperState,b:Body){
  ctx.save();
  if(s.shield){
    strokeShieldRings(ctx,b.x,b.y,b.r,s.clock);
    strokeAuraLine(ctx,b.x,b.y,b.r+2.2,s.clock,s.wave,'#7dffb0');
  }
  if(s.flash>0){
    ctx.strokeStyle='#57dcf2';ctx.lineWidth=s.shield?2:4;ctx.globalAlpha=0.8;
    ctx.beginPath();ctx.arc(b.x,b.y,b.r+7,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
  }
  ctx.restore();
}
export function drawSuper(ctx:CanvasRenderingContext2D,world:{w:number;oy?:number},s:SuperState){
  const p=superLayout(world),gap=1.5,seg=(p.w-gap*5)/6,slant=3,fill=s.shield?'#3ee07a':'#b46cff',glow=s.shield?'#9dffc0':'#e2c2ff';
  ctx.save();
  for(let i=0;i<6;i++){
    const x=p.x+i*(seg+gap),pct=Math.max(0,Math.min(1,(s.energy-i*20)/20)),full=pct>=1-1e-6;
    ctx.save();ctx.beginPath();ctx.moveTo(x+slant,p.y);ctx.lineTo(x+seg,p.y);ctx.lineTo(x+seg-slant,p.y+p.h);ctx.lineTo(x,p.y+p.h);ctx.closePath();
    ctx.fillStyle='#f7f7f3';ctx.fill();ctx.save();ctx.clip();
    if(full){ctx.shadowColor=glow;ctx.shadowBlur=9;}
    ctx.fillStyle=fill;ctx.fillRect(x,p.y,seg*pct,p.h);ctx.restore();
    ctx.strokeStyle='#111';ctx.lineWidth=1.4;ctx.stroke();ctx.restore();
  }
  ctx.restore();
}
