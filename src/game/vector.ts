/** Shared rules for the Vector Ball. World units are CSS pixels. */
export const VECTOR = { conversion: 1 / 5, correctionOutput: 50, correctionCost: 250, correctionMin: 1000, capacity: 1500, storageLock: 10, burstMin: 40, hold: 1, chargeStart: 0.12, pulse: 0.16, pulseSpeed: 0.7, pulseHold: 0.08, drain: 18, makeCost: 5 };
export function createVector() {
  return { energy: 0, powered: false, burst: 0, injected: 0, bounces: 0, coast: 0,
    unlocked: false, stored: 0, storeFlash: 0, spent: 0, released: 0, storageCooldown: 0,
    elapsed: 0, leakLeft: 0, leakAmount: 0, leakRemaining: 0, leakKick: 0, leakCooldown: 0, leakBounceCooldown: 0,
    pointer: null as number | null, held: 0, consumed: false, notice: 0,
    correction: null as { vx:number; vy:number; left:number; linger:number } | null, collisionCooldown: 0,
    anchor: null as {x:number;y:number;vx:number;vy:number} | null,
    trail: [] as { x: number; y: number }[] };
}
export type VectorState = ReturnType<typeof createVector>;
export function vectorPulse(ball: {x:number;y:number;r:number}, hoop: {x:number;y:number}, width:number, boardTop=-Infinity) {
  const aboveBoard=ball.y+ball.r<=boardTop;
  const targetX=!aboveBoard && ball.y>hoop.y ? width/2 : hoop.x;
  const targetY=aboveBoard ? ball.y : ball.y>hoop.y ? hoop.y : Math.max(ball.r+2,hoop.y-ball.r*4);
  const dx=targetX-ball.x, dy=targetY-ball.y;
  // Keep the established 50-unit pulse strength; releasing it costs 250 storage.
  // Travel is 70% of the previous speed. The moving segment still ends at `pulse`.
  const distance=Math.hypot(dx,dy),speed=width*2.2*Math.sqrt(VECTOR.correctionOutput/15)*VECTOR.pulseSpeed;
  return {vx:distance>0?dx/distance*speed:0,vy:distance>0?dy/distance*speed:0,left:Math.min(VECTOR.pulse,distance/speed),linger:VECTOR.pulseHold};
}
/** Drive a short-press correction. False means the hold is over and physics may resume. */
export function stepVectorCorrection(ball:{vx:number;vy:number}, correction:{vx:number;vy:number;left:number;linger:number}, dt:number) {
  if (correction.left > 0) {
    const fraction = dt > 0 ? Math.min(1, correction.left / dt) : 1;
    ball.vx = correction.vx * fraction;
    ball.vy = correction.vy * fraction;
    correction.left = Math.max(0, correction.left - dt);
    return true;
  }
  // Displacement is finished: clear velocity and stay put for the hold.
  ball.vx = 0;
  ball.vy = 0;
  if (correction.linger > 0) {
    correction.linger = Math.max(0, correction.linger - dt);
    return correction.linger > 0;
  }
  return false;
}
export function vectorChargeProgress(s:VectorState) {
  return s.anchor ? Math.min(1,Math.max(0,(s.held-VECTOR.chargeStart)/(VECTOR.hold-VECTOR.chargeStart))) : 0;
}
export function vectorChargeScale(s:VectorState) {
  return 1-0.5*vectorChargeProgress(s);
}
export function vectorGaugeEnergy(s:VectorState) {
  return s.energy*(1-vectorChargeProgress(s));
}
export function vectorFinishBurst(s:VectorState) {
  if(s.injected<=0 || s.burst>0) return false;
  s.injected=0; s.storageCooldown=VECTOR.storageLock;
  return true;
}
export function vectorLayout(w: number, h: number, floorY: number) {
  const r = Math.max(28, Math.min(40, w * 0.085));
  return { x: w / 2, y: Math.min(h-60, floorY+r*2.15+18), r };
}
export function cancelVectorPress(s: VectorState) { s.pointer = null; s.held = 0; s.consumed = false; }
export function vectorRecover(s: VectorState, impulse: number, after: number, speedRef: number, random=Math.random):number {
  if (!s.unlocked || s.leakLeft > 0 || s.burst > 0 || s.injected > 0 || s.storageCooldown > 0 || s.coast > 0 || s.collisionCooldown > 0 || impulse < speedRef*0.2) return 0;
  const x=50*(Math.max(after,impulse*0.5)/speedRef)**2;
  const fraction=Math.max(0,Math.min(1,random()));
  const gained=Math.min(x*fraction,Math.max(0,VECTOR.capacity-s.energy));
  s.energy+=gained; s.stored=gained; s.storeFlash=gained>0?0.65:0;
  s.collisionCooldown=0.16;
  return x>0 ? gained/x : 0;
}
export function vectorMake(s: VectorState) {
  if (s.burst > 0) s.burst = Math.max(0, s.burst - VECTOR.makeCost);
  s.unlocked = true;
}
export function vectorRelease(s: VectorState): "correct" | "empty" | "none" {
  if (s.pointer === null) return "none";
  const short = !s.consumed && s.held < VECTOR.hold;
  cancelVectorPress(s);
  if (!short) return "none";
  if (s.energy < VECTOR.correctionCost) { s.notice = 0.8; return "empty"; }
  s.energy -= VECTOR.correctionCost;
  s.spent=VECTOR.correctionCost; s.released=s.spent*VECTOR.conversion;
  s.powered = true;
  return "correct";
}
export function vectorHold(s: VectorState, dt: number): boolean {
  if (s.pointer === null || s.consumed) return false;
  s.held += dt;
  if (s.held + 1e-8 < VECTOR.hold) return false;
  s.consumed = true;
  if (s.energy < VECTOR.burstMin) { s.notice = 0.8; return false; }
  s.spent=s.energy; s.released=s.spent*VECTOR.conversion;
  s.burst = s.released;
  s.injected = s.released;
  s.energy = 0;
  s.powered = true;
  s.correction = null;
  s.coast = 0;
  s.bounces = 0;
  s.trail = [];
  return true;
}
export function drawVector(ctx: CanvasRenderingContext2D, world: {w: number; h: number; floorY: number}, s: VectorState, disabled: boolean) {
  const {x,y,r} = vectorLayout(world.w, world.h, world.floorY);
  const active = s.burst > 0;
  ctx.save();
  if (active) {
    ctx.strokeStyle = "rgba(90,232,237,.75)";
    ctx.lineJoin = "round";
    for (let i=1; i<s.trail.length; i++) {
      ctx.globalAlpha = i / s.trail.length * 0.7;
      ctx.lineWidth = 1 + i / s.trail.length * 4;
      ctx.beginPath(); ctx.moveTo(s.trail[i-1]!.x,s.trail[i-1]!.y); ctx.lineTo(s.trail[i]!.x,s.trail[i]!.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  ctx.globalAlpha = disabled ? 0.45 : 1;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  const radius=r*2.15, inner=radius-39, cy=y+8, start=Math.PI*1.08, sweep=Math.PI*0.84;
  const ring=(from:number,to:number)=>{
    ctx.beginPath();ctx.arc(x,cy,radius,from,to);
    ctx.arc(x,cy,inner,to,from,true);ctx.closePath();
  };
  ring(start,start+sweep);ctx.fill();
  ctx.fillStyle="#e97676";ring(start+sweep*2/3,start+sweep);ctx.fill();
  ring(start,start+sweep);ctx.stroke();
  for(let i=0;i<=15;i++) {
    const angle=start+sweep*i/15,major=i%5===0;
    ctx.strokeStyle="#000000"; ctx.lineWidth=major?2:1;
    ctx.beginPath();ctx.moveTo(x+Math.cos(angle)*(radius-5),cy+Math.sin(angle)*(radius-5));
    ctx.lineTo(x+Math.cos(angle)*(radius-(major?18:12)),cy+Math.sin(angle)*(radius-(major?18:12)));ctx.stroke();
    if(major) { ctx.fillStyle="#000000";ctx.font="700 9px sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";
      const labelAngle=angle+(i===0?0.13:i===15?-0.18:0);
      ctx.fillText(String(i*100),x+Math.cos(labelAngle)*(radius-28),cy+Math.sin(labelAngle)*(radius-28)); }
  }
  const displayed=vectorGaugeEnergy(s), shake=(s.energy>1000 || s.leakLeft>0) && !s.anchor ? Math.sin(s.elapsed*75)*0.045+Math.sin(s.elapsed*117)*0.025 : 0;
  const angle=start+sweep*Math.min(1,displayed/VECTOR.capacity)+shake;
  ctx.strokeStyle="#ffffff";ctx.lineWidth=5;
  ctx.beginPath();ctx.moveTo(x,cy);ctx.lineTo(x+Math.cos(angle)*(radius-19),cy+Math.sin(angle)*(radius-19));ctx.stroke();
  ctx.strokeStyle="#000000";ctx.lineWidth=2.5;ctx.stroke();
  ctx.fillStyle="#000000";ctx.beginPath();ctx.arc(x,cy,4,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

// Rate per second, evaluated with dt so render/substep frequency cannot change the odds.
export function vectorLeakRate(elapsed:number) { return Math.min(0.12,Math.max(0,elapsed)*0.0004); }
export function stepVectorLeak(s:VectorState,dt:number,random=Math.random) {
  s.elapsed+=dt;
  s.leakCooldown=Math.max(0,s.leakCooldown-dt);
  s.leakBounceCooldown=Math.max(0,s.leakBounceCooldown-dt);
  if(s.leakLeft>0) {
    const spent=Math.min(s.energy,s.leakRemaining,s.leakAmount/3*Math.min(dt,s.leakLeft));
    s.energy-=spent;s.leakRemaining-=spent;s.leakKick+=spent;
    s.leakLeft=Math.max(0,s.leakLeft-dt);
    if(s.leakLeft===0) { s.leakKick=0;s.leakRemaining=0;s.leakCooldown=6; }
    return false;
  }
  if(!s.unlocked || s.energy<=1000 || s.leakCooldown>0 || s.burst>0 || s.injected>0 || s.anchor || s.pointer!==null || s.storageCooldown>0 || s.coast>0) return false;
  if(random()>=1-Math.exp(-vectorLeakRate(s.elapsed)*dt)) return false;
  s.leakAmount=100+Math.min(400,Math.floor(Math.max(0,random())*401));
  s.leakRemaining=s.leakAmount;s.leakLeft=3;s.leakKick=0;
  return true;
}
export function vectorLeakBounce(s:VectorState,before:{vx:number;vy:number},after:{vx:number;vy:number},speedRef:number,random=Math.random) {
  const nx=after.vx-before.vx,ny=after.vy-before.vy,n=Math.hypot(nx,ny);
  if(s.leakLeft<=0 || s.burst>0 || s.leakBounceCooldown>0 || n<speedRef*0.2) return after;
  // The collision impulse points away from the surface; stay within its outward hemisphere.
  const angle=Math.atan2(ny,nx)+(random()-0.5)*Math.PI*0.72;
  const speed=Math.min(speedRef*2.2,Math.sqrt(after.vx**2+after.vy**2+s.leakKick/50*speedRef**2));
  s.leakKick=0;s.leakBounceCooldown=0.12;
  return {vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed};
}
