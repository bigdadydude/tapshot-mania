export const ROCKET={capacity:100,burn:18,refill:25};
export function createRocket(){return {fuel:100,pointer:null as number|null,steer:0,firing:false,supportGrace:0,rest:0};}
export type RocketState=ReturnType<typeof createRocket>;
type Body={x:number;y:number;r:number;vx:number;vy:number};
export function rocketLayout(w:number,h:number,floor:number){return {x:w/2,y:Math.min(h-65,floor+(h-floor)*0.56),half:Math.min(130,w*0.31),r:23};}
export function releaseRocket(s:RocketState,b:Body){
  if(s.pointer!==null || s.firing) b.vy=Math.max(0,b.vy);
  s.pointer=null;s.steer=0;s.firing=false;
}
export function stepRocket(s:RocketState,b:Body,g:number,dt:number){
  s.firing=s.pointer!==null&&s.fuel>0;
  if(!s.firing)return;
  const powered=Math.min(dt,s.fuel/ROCKET.burn);
  s.fuel=Math.max(0,s.fuel-ROCKET.burn*powered);
  b.vy-=g*1.7*powered;
  b.vx+=g*0.85*s.steer*powered;
  b.vx*=Math.exp(-1.5*powered);
  b.vy=Math.max(-g*0.28,b.vy);
  if(s.fuel<=0){s.firing=false;b.vy=Math.max(0,b.vy);}
}
export function refillRocket(s:RocketState,supported:boolean,dt:number){
  if(s.pointer!==null){s.rest=0;s.supportGrace=0;return;}
  s.supportGrace=supported?0.08:Math.max(0,s.supportGrace-dt);
  s.rest=s.supportGrace>0?s.rest+dt:0;
  if(s.rest>=0.15)s.fuel=Math.min(ROCKET.capacity,s.fuel+ROCKET.refill*dt);
}
export function drawRocket(ctx:CanvasRenderingContext2D,w:{w:number;h:number;floorY:number},s:RocketState,b:Body,time:number){
  ctx.save();
  if(s.firing){
    ctx.translate(b.x,b.y);ctx.rotate(s.steer*0.45);
    const len=b.r*(1.7+0.35*Math.sin(time*44));
    ctx.fillStyle="#ff762c";ctx.beginPath();ctx.moveTo(-b.r*.4,b.r*.7);ctx.quadraticCurveTo(-b.r*.3,b.r+len*.6,0,b.r+len);ctx.quadraticCurveTo(b.r*.3,b.r+len*.6,b.r*.4,b.r*.7);ctx.fill();
    ctx.fillStyle="#fff2ab";ctx.beginPath();ctx.moveTo(-b.r*.2,b.r*.8);ctx.lineTo(0,b.r+len*.7);ctx.lineTo(b.r*.2,b.r*.8);ctx.fill();
    ctx.rotate(-s.steer*0.45);ctx.translate(-b.x,-b.y);
  }
  const {x,y,half,r}=rocketLayout(w.w,w.h,w.floorY);
  ctx.fillStyle="#ffffff";ctx.strokeStyle="#141414";ctx.lineWidth=2.5;
  ctx.beginPath();ctx.roundRect(x-half-10,y-12,half*2+20,24,12);ctx.fill();ctx.stroke();
  ctx.save();ctx.clip();ctx.fillStyle=s.fuel<20?"#e19b41":"#54bca0";
  ctx.fillRect(x-half-10,y-12,(half*2+20)*s.fuel/100,24);ctx.restore();
  ctx.strokeStyle="rgba(0,0,0,.25)";ctx.lineWidth=1;
  for(let i=1;i<10;i++){const xx=x-half-10+(half*2+20)*i/10;ctx.beginPath();ctx.moveTo(xx,y-8);ctx.lineTo(xx,y+8);ctx.stroke();}
  ctx.fillStyle="#e53b39";ctx.strokeStyle="#181818";ctx.lineWidth=2.5;
  ctx.beginPath();ctx.arc(x+s.steer*half,y,r,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.fillStyle="rgba(255,255,255,.65)";ctx.beginPath();ctx.arc(x+s.steer*half-6,y-7,4,0,Math.PI*2);ctx.fill();
  ctx.restore();
}
