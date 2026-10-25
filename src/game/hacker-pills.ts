type World = { w:number; h:number; floorY:number };
type Body = { x:number; y:number; r:number };
export type HackerPill = { u:number; v:number; revealed:boolean; grace:number; redPass?:'leaving'|'armed'|'approaching' };
export function createHackerPills() { return { ready:false, pill:null as HackerPill|null, glitchPhase:0, glitchLeft:0, glitchIndex:0 }; }
export type HackerPills = ReturnType<typeof createHackerPills>;
export function pillPoint(p:HackerPill,w:World) {
  return {x:24+p.u*Math.max(1,w.w-48),y:40+p.v*Math.max(1,w.floorY-64)};
}
export function spawnHackerPill(w:World,b:Body,random=Math.random):HackerPill {
  let pill:HackerPill={u:0,v:0,revealed:false,grace:0.45};
  let best=-1;
  for(let i=0;i<16;i++) {
    const candidate={u:random(),v:random(),revealed:false,grace:0.45};
    const pos=pillPoint(candidate,w),d=Math.hypot(pos.x-b.x,pos.y-b.y);
    if(d>best){best=d;pill=candidate;}
    if(d>Math.max(110,b.r*5))return candidate;
  }
  return pill;
}
function segmentDistance(b:Body,previous:{x:number;y:number},p:{x:number;y:number},w:World) {
  // Screen wraps are discontinuities, not paths through every hidden pickup.
  if(Math.abs(b.x-previous.x)>w.w/2)return Math.hypot(b.x-p.x,b.y-p.y);
  const dx=b.x-previous.x,dy=b.y-previous.y,len=dx*dx+dy*dy;
  const t=len?Math.max(0,Math.min(1,((p.x-previous.x)*dx+(p.y-previous.y)*dy)/len)):0;
  return Math.hypot(previous.x+t*dx-p.x,previous.y+t*dy-p.y);
}
export function hackerGlitchRate(s:HackerPills,w:World,b:Body,awake=false) {
  if(awake || s.ready || !s.pill || s.pill.revealed)return 0;
  const p=pillPoint(s.pill,w),range=Math.max(180,w.w*0.65);
  const proximity=Math.max(0,1-Math.hypot(b.x-p.x,b.y-p.y)/range);
  return proximity>0?0.6+8*proximity*proximity:0;
}
export function stepHackerPill(s:HackerPills,w:World,b:Body,previous:{x:number;y:number},dt:number,awake=false,random=Math.random) {
  const rate=hackerGlitchRate(s,w,b,awake);
  s.glitchLeft=Math.max(0,s.glitchLeft-dt);
  if(rate===0){s.glitchPhase=0;s.glitchLeft=0;}
  else {
    s.glitchPhase+=rate*dt;
    if(s.glitchPhase>=1){s.glitchPhase%=1;s.glitchLeft=0.055;s.glitchIndex++;}
  }
  const p=s.pill;if(!p)return false;
  p.grace=Math.max(0,p.grace-dt);
  const point=pillPoint(p,w),distance=segmentDistance(b,previous,point,w);
  const pickup=b.r+11,outer=Math.max(pickup+26,b.r*2.5);
  const outside=Math.hypot(b.x-point.x,b.y-point.y)>outer+8;
  if(awake) {
    if(distance<Math.max(100,b.r*5))p.revealed=true;
  } else {
    if(p.grace>0)return false;
    if(!p.revealed) {
      if(distance<=outer){p.revealed=true;p.redPass=outside?'armed':'leaving';s.glitchLeft=0;s.glitchPhase=0;}
      return false;
    }
    // The first visit must end before another visit can collect the pill.
    if(p.redPass==='leaving') { if(outside)p.redPass='armed';return false; }
    if(distance<=outer)p.redPass='approaching';
    if(p.redPass!=='approaching')return false;
    if(distance>pickup) {
      if(outside){s.pill=spawnHackerPill(w,b,random);s.glitchLeft=0;s.glitchPhase=0;}
      return false;
    }
  }
  if(p.grace>0 || distance>pickup)return false;
  s.pill=null;
  s.glitchLeft=0;s.glitchPhase=0;
  return true;
}
export function hackerPillButton(w:World) {
  return {x:w.w/2,y:Math.min(w.h-42,w.floorY+(w.h-w.floorY)*0.55),r:28};
}
export function hitHackerPillButton(w:World,x:number,y:number) {
  const p=hackerPillButton(w);return Math.hypot(x-p.x,y-p.y)<=p.r;
}
function capsule(ctx:CanvasRenderingContext2D,x:number,y:number,blue:boolean,scale=1) {
  ctx.save();ctx.translate(x,y);ctx.rotate(-0.45);ctx.scale(scale,scale);
  ctx.shadowColor=blue?'#58c6ff':'#ff6275';ctx.shadowBlur=12;
  ctx.fillStyle=blue?'#228bd5':'#d93b51';ctx.beginPath();ctx.roundRect(-12,-7,24,14,7);ctx.fill();
  ctx.shadowBlur=0;ctx.strokeStyle='#fff0e4';ctx.lineWidth=1.4;ctx.stroke();
  ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(0,6);ctx.stroke();
  ctx.fillStyle='#ffffffaa';ctx.beginPath();ctx.roundRect(-7,-4,12,2,1);ctx.fill();ctx.restore();
}
export function drawHackerPills(ctx:CanvasRenderingContext2D,w:World,s:HackerPills,awake:boolean,disabled:boolean) {
  ctx.save();
  if(s.pill?.revealed){const p=pillPoint(s.pill,w);capsule(ctx,p.x,p.y,awake);}
  if(s.ready){
    const p=hackerPillButton(w);ctx.globalAlpha=disabled?0.4:1;
    ctx.fillStyle='#171e26e8';ctx.strokeStyle='#ff6275';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();ctx.stroke();capsule(ctx,p.x,p.y,false,1.2);
    ctx.font='700 12px sans-serif';ctx.textAlign='center';ctx.fillStyle='#fff0e4';
    ctx.strokeStyle='#171e26';ctx.lineWidth=3;ctx.strokeText('点击觉醒',p.x,p.y+43);ctx.fillText('点击觉醒',p.x,p.y+43);
  }
  ctx.restore();
}

/** Only distort the ball's rendered slices; physics and the rest of the court stay intact. */
export function drawHackerGlitch(ctx:CanvasRenderingContext2D,s:HackerPills,b:Body,paint:(x:number,y:number,r:number)=>void) {
  if(s.glitchLeft<=0 || !s.pill || s.ready)return;
  for(let i=0;i<3;i++){
    const y=b.y+b.r*(-0.75+i*0.57),height=b.r*(i===1?0.3:0.18);
    const offset=(i%2?1:-1)*(4+(s.glitchIndex%3)*2);
    ctx.save();ctx.beginPath();ctx.rect(b.x-b.r-10,y,b.r*2+20,height);ctx.clip();
    ctx.globalAlpha=0.9;paint(b.x+offset,b.y,b.r);
    ctx.globalCompositeOperation='screen';ctx.globalAlpha=0.65;
    ctx.fillStyle=i%2?'#ff507c':'#58ffdd';ctx.fillRect(b.x-b.r+offset,y,b.r*2,2);
    ctx.restore();
  }
}
