import type { BallId } from "./balls";

export type SkillState = "off" | "on";
export type SkillStrength = { score: number; safety: number; tempo: number; cost: number };
export type BalanceConfig = { k: number; r0Tolerance: number; r1Min: number; r1Max: number; strength: Partial<Record<BallId, SkillStrength>> };
export type BalanceTrial = { id: string; sessionId: string; ballId: BallId; skillState: SkillState; score: number; maxCombo: number; triggers: number; skillScore: number; makes?: number; misses?: number; maxMakeGapSeconds?: number; timestamp: string; gameRev: number; configKey: string };
export type BalanceSession = { id: string; baseline: BallId; ballId: BallId; scene: string; physKey: string; createdAt: string; gameRev: number; trials: BalanceTrial[] };
export type BalanceStore = { version: 1; config: BalanceConfig; sessions: BalanceSession[] };
export type BalanceRow = { ballId: BallId; state: SkillState | "base"; count: number; mean: number; median: number; high: number; maxCombo: number; triggers: number; skillScore: number; ratio: number | null; target: number | null; deviation: number | null; verdict: string };

const KEY = "tq-balance-test-v1";
export const DEFAULT_STRENGTH: SkillStrength = { score: 0, safety: 0, tempo: 0, cost: 0 };
export const DEFAULT_BALANCE_CONFIG: BalanceConfig = { k: 0.06, r0Tolerance: 0.08, r1Min: 0.9, r1Max: 1.1, strength: {} };
const defaults = (): BalanceStore => ({ version: 1, config: structuredClone(DEFAULT_BALANCE_CONFIG), sessions: [] });
export function loadBalanceStore(): BalanceStore { try { const raw = JSON.parse(localStorage.getItem(KEY) || "null") as Partial<BalanceStore> | null; if (!raw || raw.version !== 1) return defaults(); return { version: 1, config: { ...DEFAULT_BALANCE_CONFIG, ...raw.config, strength: raw.config?.strength || {} }, sessions: Array.isArray(raw.sessions) ? raw.sessions : [] }; } catch { return defaults(); } }
export function saveBalanceStore(store: BalanceStore) { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch {} }
export function strengthTotal(s: SkillStrength) { return s.score + s.safety + s.tempo + s.cost; }
export function configKey(config: BalanceConfig) { return JSON.stringify(config); }
const mean=(n:number[])=>n.length?n.reduce((a,b)=>a+b,0)/n.length:0;
const median=(n:number[])=>{const s=[...n].sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length?s.length%2?s[m]!:((s[m-1]||0)+(s[m]||0))/2:0;};
export function report(session: BalanceSession, config: BalanceConfig): BalanceRow[] {
 const base=session.trials.filter(t=>t.ballId===session.baseline); const B=mean(base.map(t=>t.score));
 const make=(state:SkillState|"base", ballId:BallId, trials:BalanceTrial[]):BalanceRow=>{const scores=trials.map(t=>t.score); const r=B>0?mean(scores)/B:null; const s=strengthTotal(config.strength[ballId]||DEFAULT_STRENGTH); const target=state==="off"?1-config.k*s:state==="on"?1:null; const dev=r!==null&&target!==null?r-target:null; const ok=state==="base"?"baseline":state==="off"?Math.abs(dev||0)<=config.r0Tolerance?"pass":dev!>0?"strong":"weak":r!==null&&r>=config.r1Min&&r<=config.r1Max?"pass":(r||0)>config.r1Max?"strong":"weak"; return {ballId,state,count:trials.length,mean:mean(scores),median:median(scores),high:Math.max(0,...scores),maxCombo:Math.max(0,...trials.map(t=>t.maxCombo)),triggers:trials.reduce((a,t)=>a+t.triggers,0),skillScore:trials.reduce((a,t)=>a+t.skillScore,0),ratio:r,target,deviation:dev,verdict:ok};};
 return [make("base",session.baseline,base),make("off",session.ballId,session.trials.filter(t=>t.ballId===session.ballId&&t.skillState==="off")),make("on",session.ballId,session.trials.filter(t=>t.ballId===session.ballId&&t.skillState==="on"))];
}
export function calibrateK(rows: BalanceRow[], config: BalanceConfig) { let xy=0, xx=0; for(const row of rows) if(row.state==="off"&&row.ratio!==null){const s=strengthTotal(config.strength[row.ballId]||DEFAULT_STRENGTH); if(s>0){xy+=s*(1-row.ratio);xx+=s*s;}} return xx?Math.max(0,Math.min(1,xy/xx)):config.k; }
export function csv(store: BalanceStore) { const lines=["sessionId,ballId,skillState,score,maxCombo,makes,misses,maxMakeGapSeconds,triggers,skillScore,timestamp,gameRev,configKey"]; for(const s of store.sessions)for(const t of s.trials)lines.push([t.sessionId,t.ballId,t.skillState,t.score,t.maxCombo,t.makes ?? "",t.misses ?? "",t.maxMakeGapSeconds ?? "",t.triggers,t.skillScore,t.timestamp,t.gameRev,JSON.stringify(t.configKey)].map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")); return "\ufeff"+lines.join("\n"); }


/** Mean after removing one minimum and maximum score when there are 3+ samples. */
export function trimmedMean(scores: number[]) {
  if (!scores.length) return null;
  if (scores.length < 3) return mean(scores);
  const sorted = [...scores].sort((a, b) => a - b);
  return mean(sorted.slice(1, -1));
}

export type HistoricalBalanceSummary = {
  baseline: number | null;
  baselineRuns: number;
  r0: number | null;
  r0Runs: number;
  r1: number | null;
  r1Runs: number;
  targetR0: number;
  feelVerdict: "strong" | "weak" | "pass" | "waiting";
  skillVerdict: "strong" | "weak" | "pass" | "waiting";
};

/** Combines comparable local sessions for the selected ball. Each bucket drops one high and low outlier. */
export function historicalSummary(store: BalanceStore, ballId: BallId): HistoricalBalanceSummary {
  const baselineScores = store.sessions.flatMap((session) => session.trials
    .filter((trial) => trial.ballId === "plain")
    .map((trial) => trial.score));
  const offScores = store.sessions.flatMap((session) => session.trials
    .filter((trial) => trial.ballId === ballId && trial.skillState === "off")
    .map((trial) => trial.score));
  const onScores = store.sessions.flatMap((session) => session.trials
    .filter((trial) => trial.ballId === ballId && trial.skillState === "on")
    .map((trial) => trial.score));
  const baseline = trimmedMean(baselineScores);
  const off = trimmedMean(offScores);
  const on = trimmedMean(onScores);
  const r0 = baseline && off !== null ? off / baseline : null;
  const r1 = baseline && on !== null ? on / baseline : null;
  const targetR0 = 1 - store.config.k * strengthTotal(store.config.strength[ballId] || DEFAULT_STRENGTH);
  const feelVerdict = r0 === null ? "waiting" : Math.abs(r0 - targetR0) <= store.config.r0Tolerance ? "pass" : r0 > targetR0 ? "strong" : "weak";
  const skillVerdict = r1 === null ? "waiting" : r1 > store.config.r1Max ? "strong" : r1 < store.config.r1Min ? "weak" : "pass";
  return { baseline, baselineRuns: baselineScores.length, r0, r0Runs: offScores.length, r1, r1Runs: onScores.length, targetR0, feelVerdict, skillVerdict };
}
