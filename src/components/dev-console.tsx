import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Pause } from "lucide-react";
import { DEV_FX, DEV_GRAF, DEV_MAZE, DEV_MODIFIERS, DEV_MOVES, DEV_PHYS, DEV_PLAY_MODES, DEV_SCENES, DEV_STAGES, type DevCmd, type DevMaze, type DevPhys, type DevHud } from "@/game/dev";
import { playableBalls, type BallId } from "@/game/balls";
import type { Gfx } from "@/game/types";
import type { RogueHud } from "@/game/rogue";
import { ROGUE_CATALOG, type RogueCatalogEntry } from "@/game/rogue-catalog";
import { csv, balanceExportPayload, calibrateKDetailed, historicalSummary, loadBalanceStore, mergeLiveSession, saveBalanceStore, sessionProgress, skillEfficiencyEntrance, strengthTotal, autoStrengthReport, DEFAULT_AUTO_WEIGHTS, type AutoBallReadout, type BalanceSession, type BalanceStore, type VerdictLabel } from "@/game/balance-test";
import { cn } from "@/lib/utils";

type Tab = "match" | "scene" | "ball" | "balance" | "rogue" | "shop";
const numeric = (value: string, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const ZH = {
  testMode: String.fromCharCode(0x6d4b, 0x8bd5, 0x6a21, 0x5f0f),
  chooseBall: String.fromCharCode(0x9009, 0x62e9, 0x7bee, 0x7403),
  restore: String.fromCharCode(0x6062, 0x590d),
  restoreDefault: String.fromCharCode(0x6062, 0x590d, 0x9ed8, 0x8ba4),
  gyroDebug: String.fromCharCode(0x9640, 0x87ba, 0x4eea, 0x8c03, 0x8bd5),
  restoreMaze: String.fromCharCode(0x6062, 0x590d, 0x8ff7, 0x5bab, 0x9ed8, 0x8ba4),
  locked: String.fromCharCode(0x5df2, 0x9501, 0x5b9a),
  resetLocked: String.fromCharCode(0x91cd, 0x65b0, 0x8bbe, 0x7f6e),
  setAndLock: String.fromCharCode(0x8bbe, 0x7f6e, 0x5e76, 0x9501, 0x5b9a),
  score: String.fromCharCode(0x7d2f, 0x8ba1, 0x5206, 0x6570),
  combo: String.fromCharCode(0x8fde, 0x51fb, 0x6570),
  cooldownTime: String.fromCharCode(0x51b7, 0x5374, 0x6761, 0x20, 0x002f, 0x20, 0x65f6, 0x95f4),
  full: String.fromCharCode(0x6ee1),
  freeze: String.fromCharCode(0x51bb, 0x7ed3),
  startTimer: String.fromCharCode(0x5f00, 0x59cb, 0x8ba1, 0x65f6),
  timeUp: String.fromCharCode(0x65f6, 0x95f4, 0x5230),
  buzzer: String.fromCharCode(0x7edd, 0x6740),
  match: String.fromCharCode(0x5bf9, 0x5c40),
  resetBall: String.fromCharCode(0x91cd, 0x7f6e, 0x7bee, 0x7403),
  balance: String.fromCharCode(0x5e73,0x8861),
};

export function DevConsole({ dev, score, combo, gfx, rogue, onCmd, onMenu, onSearchlights, panelOpen, onPanelOpenChange, balanceFocus = 0 }: { dev: DevHud; score: number; combo: number; gfx: Gfx; rogue: RogueHud | null; onCmd: (cmd: DevCmd) => void; onMenu: () => void; onSearchlights: () => void; panelOpen: boolean; onPanelOpenChange: (open: boolean) => void; balanceFocus?: number }) {
  const [tab, setTab] = useState<Tab>("match");
  const focusSeen = useRef(balanceFocus);
  useEffect(() => {
    if (balanceFocus === focusSeen.current) return;
    focusSeen.current = balanceFocus;
    setTab("balance");
  }, [balanceFocus]);
  return <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center"><div className="pointer-events-auto w-full max-w-[min(100%,calc(100dvh*9/16))] px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
    <div className="mb-1 flex gap-1"><button type="button" onClick={onMenu} className="flex size-9 items-center justify-center rounded-lg border border-border bg-bg-elevated" aria-label="菜单"><Pause className="size-4 text-fg" /></button><button type="button" onClick={() => onPanelOpenChange(!panelOpen)} aria-expanded={panelOpen} className="flex h-9 flex-1 items-center justify-between rounded-lg border border-border bg-bg-elevated px-3"><span className="text-xs font-medium tracking-widest text-muted">开发者控制台</span>{panelOpen ? <ChevronDown className="size-4 text-muted" /> : <ChevronUp className="size-4 text-muted" />}</button></div>
    {panelOpen ? <div className="max-h-[min(53dvh,31rem)] overflow-y-auto rounded-xl border border-border bg-bg-elevated p-3 shadow-lg"><div className="mb-3 grid grid-cols-6 gap-1 rounded-lg border border-border bg-bg-subtle p-1">{([ ["match",ZH.match],["scene","场景"],["ball","篮球"],["balance","平衡"],["rogue","肉鸽"],["shop","商店"] ] as [Tab,string][]).map(([id,label]) => <button key={id} type="button" onClick={() => setTab(id)} className={cn("h-9 rounded-md text-xs font-medium",tab===id?"bg-accent text-accent-fg":"text-fg")}>{label}</button>)}</div>
      {tab === "match" && <MatchTab dev={dev} score={score} combo={combo} onCmd={onCmd} />}
      {tab === "scene" && <SceneTab dev={dev} gfx={gfx} onCmd={onCmd} onSearchlights={onSearchlights} />}
      {tab === "ball" && <BallTab dev={dev} onCmd={onCmd} />}
      {tab === "balance" && <BalanceTab dev={dev} onCmd={onCmd} />}
      {tab === "rogue" && <RogueTab rogue={rogue} dev={dev} onCmd={onCmd} />}
      {tab === "shop" && <ShopTab rogue={rogue} onCmd={onCmd} />}
    </div> : null}</div></div>;
}
function Chip({label,on,onClick}:{label:string;on?:boolean;onClick:()=>void}) { return <button type="button" onClick={onClick} className={cn("h-9 min-w-11 rounded-md px-2.5 text-sm font-medium",on?"bg-accent text-accent-fg":"border border-border bg-bg-subtle text-fg")}>{label}</button>; }
function Row({title,children}:{title:string;children:ReactNode}) { return <div className="mb-3"><p className="mb-1.5 text-xs tracking-widest text-muted">{title}</p><div className="flex flex-wrap gap-1.5">{children}</div></div>; }
function NumberEdit({label,value,locked=false,onSet}:{label:string;value:number;locked?:boolean;onSet:(n:number)=>void}) { const [draft,setDraft]=useState(String(value)); return <div className="mb-3"><div className="mb-1.5 flex items-center justify-between"><p className="text-xs tracking-widest text-muted">{label}</p>{locked ? <span className="text-[10px] font-medium tracking-wider text-accent">{ZH.locked}</span> : null}</div><div className="flex gap-1.5"><input inputMode="numeric" value={draft} onChange={(e)=>setDraft(e.target.value)} className="h-10 min-w-0 flex-1 rounded-md border border-border bg-bg-subtle px-3 text-sm text-fg"/><Chip label={locked ? ZH.resetLocked : ZH.setAndLock} onClick={()=>onSet(numeric(draft,value))}/></div></div>; }
function MatchTab({dev,score,combo,onCmd}:{dev:DevHud;score:number;combo:number;onCmd:(cmd:DevCmd)=>void}) { return <><NumberEdit label={ZH.score} value={score} locked={dev.scoreLocked} onSet={(n)=>onCmd({t:"score",n})}/><NumberEdit label={ZH.combo} value={combo} locked={dev.comboLocked} onSet={(n)=>onCmd({t:"combo",n})}/><Row title={ZH.cooldownTime}><Chip label={ZH.full} onClick={()=>onCmd({t:"timer01",n:1})}/><Chip label="60%" onClick={()=>onCmd({t:"timer01",n:.6})}/><Chip label="10%" onClick={()=>onCmd({t:"timer01",n:.1})}/><Chip label={ZH.freeze} on={dev.freeze} onClick={()=>onCmd({t:"freeze",on:!dev.freeze})}/><Chip label={ZH.startTimer} onClick={()=>onCmd({t:"armTimer"})}/><Chip label={ZH.timeUp} onClick={()=>onCmd({t:"timeUp"})}/><Chip label={ZH.buzzer} onClick={()=>onCmd({t:"buzzer"})}/></Row><Row title={ZH.match}><Chip label={ZH.resetBall} onClick={()=>onCmd({t:"resetBall"})}/><Chip label={ZH.restoreDefault} onClick={()=>onCmd({t:"resetMatch"})}/></Row></>; }
function SceneTab({dev,gfx,onCmd,onSearchlights}:{dev:DevHud;gfx:Gfx;onCmd:(cmd:DevCmd)=>void;onSearchlights:()=>void}) {
  const keys: [keyof Pick<Gfx,"ballShade"|"ballShadow"|"particles"|"graffitiFx"|"impact"|"flash"|"buzzerSpot">,string][] = [["ballShade","球光影"],["ballShadow","投影"],["particles","粒子"],["graffitiFx","涂鸦"],["impact","镜头"],["flash","闪光"],["buzzerSpot","绝杀聚光"]];
  return <>

    <Row title="涂鸦">{DEV_GRAF.map((graf)=><Chip key={graf.key} label={graf.label} onClick={()=>onCmd({t:"graf",key:graf.key})}/>)}</Row>

    <Row title="当前篮架移动">{DEV_MOVES.map((move)=><Chip key={move.kind} label={move.label} on={dev.moving&&dev.moveKind===move.kind} onClick={()=>onCmd({t:"move",kind:move.kind})}/>)}</Row>
    <Row title="场景词条">{DEV_MODIFIERS.map((modifier)=><Chip key={modifier.id} label={modifier.label} on={dev.modifierForce===modifier.id} onClick={()=>onCmd({t:"modifier",id:modifier.id})}/>)}</Row>
    <Row title="监狱">{dev.scene === "prison" ? <><Chip label="子弹" on={dev.prisonProjectiles} onClick={()=>onCmd({t:"prisonProjectiles",on:!dev.prisonProjectiles})}/><Chip label="探照灯布置" onClick={onSearchlights}/></> : <span className="text-xs text-subtle">切换到监狱背景后可测试探照灯与子弹</span>}</Row>
    <Row title="当前背景特效">{keys.map(([key,label])=><Chip key={key} label={label} on={gfx[key]} onClick={()=>onCmd({t:"gfx",key,on:!gfx[key]})}/>)}</Row>
    <Row title="测试阶段">{DEV_FX.map((fx)=><Chip key={fx.kind} label={fx.label} onClick={()=>onCmd({t:"fx",kind:fx.kind})}/>)}</Row>
    <Row title="恢复"><Chip label="物理默认" onClick={()=>onCmd({t:"physReset"})}/><Chip label="清除涂鸦" onClick={()=>onCmd({t:"graf",key:"clear"})}/></Row>
  </>;
}
function BallTab({dev,onCmd}:{dev:DevHud;onCmd:(cmd:DevCmd)=>void}) { return <><Row title={ZH.testMode}>{DEV_PLAY_MODES.map(m=><Chip key={m.id} label={m.label} on={dev.playMode===m.id} onClick={()=>onCmd({t:"playMode",mode:m.id})}/>)}</Row><Row title={ZH.chooseBall}>{playableBalls().map(b=><Chip key={b.id} label={b.name} on={dev.ballId===b.id} onClick={()=>onCmd({t:"skin",id:b.id})}/>)}</Row>{dev.ballId === "maze" ? <MazeTab maze={dev.maze} onCmd={onCmd}/> : null}<PhysTab phys={dev.phys} onCmd={onCmd}/><Row title={ZH.restore}><Chip label={ZH.restoreDefault} onClick={()=>onCmd({t:"physReset"})}/></Row></>; }
function MazeTab({maze,onCmd}:{maze:DevMaze;onCmd:(cmd:DevCmd)=>void}) { return <section className="mb-4 border-y border-accent/40 py-3"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-bold tracking-[0.2em] text-accent">{ZH.gyroDebug}</p><button type="button" onClick={()=>onCmd({t:"mazeReset"})} className="rounded border border-border px-2 py-1 text-[10px] text-muted">{ZH.restoreMaze}</button></div>{DEV_MAZE.map(row=>{const raw=maze[row.k]; const value=(row.k === "sensitivity" || row.k === "deadzone" || row.k === "maxSpeed") ? Math.round(raw*100) : raw; return <div key={row.k} className="mb-3"><div className="mb-1 flex justify-between"><p className="text-xs tracking-widest text-muted">{row.label}</p><p className="text-xs text-fg">{value}{row.unit}</p></div><p className="mb-1 text-[10px] text-subtle">{row.hint}</p><input type="range" min={row.min} max={row.max} step={row.step} value={value} onChange={e=>{const next=Number(e.target.value);onCmd({t:"maze",k:row.k,n:(row.k === "sensitivity" || row.k === "deadzone" || row.k === "maxSpeed") ? next/100 : next})}} className="h-10 w-full accent-accent"/></div>})}</section>; }
function PhysTab({phys,onCmd}:{phys:DevPhys;onCmd:(cmd:DevCmd)=>void}) { const groups = [["ball", "\u7403\u7269\u7406"], ["scene", "\u573a\u666f\u7269\u7406"]] as const; return <>{groups.map(([group, title]) => <section key={group} className="mb-4 border-t border-border pt-3 first:border-t-0 first:pt-0"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-bold tracking-[0.2em] text-accent">{title}</p><button type="button" onClick={()=>onCmd({t:"physGroupReset",group})} className="rounded border border-border px-2 py-1 text-[10px] text-muted">{"\u6062\u590d\u9ed8\u8ba4"}</button></div>{DEV_PHYS.filter(row => row.group === group).map(row=>{const pct=Math.round(phys[row.k]*100);return <div key={row.k} className="mb-3"><div className="mb-1 flex justify-between"><p className="text-xs tracking-widest text-muted">{row.label}</p><p className="text-xs text-fg">{pct}%</p></div><p className="mb-1 text-[10px] text-subtle">{row.hint}</p><input type="range" min={row.min} max={200} step={5} value={pct} onChange={e=>onCmd({t:"phys",k:row.k,n:Number(e.target.value)/100})} className="h-10 w-full accent-accent"/></div>})}</section>)}</>; }
function download(name:string, body:string, type:string) { const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([body],{type})); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),0); }
function AutoBallCard({ row, selected }: { row: AutoBallReadout; selected: boolean }) {
  return (
    <article
      className={cn(
        "mb-1.5 min-w-0 rounded-md border p-2",
        selected ? "border-accent bg-accent/10" : "border-border bg-bg-elevated",
      )}
    >
      <p className="text-xs text-muted">{row.ballName}{selected ? " · 当前" : ""}</p>
      <p className={cn("mt-0.5 break-words font-semibold leading-snug text-fg", selected ? "text-base" : "text-sm")}>
        {row.label}
      </p>
      <p className="mt-1 break-words text-xs leading-relaxed text-subtle">{row.componentsLabel}</p>
    </article>
  );
}
function BalanceTab({ dev, onCmd }: { dev: DevHud; onCmd: (cmd: DevCmd) => void }) {
  const b = dev.balance;
  const s = b.session;
  const balls = playableBalls();
  const [candidate, setCandidate] = useState(s?.ballId ?? balls[0]?.id ?? "plain");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<BalanceSession[]>(() => loadBalanceStore().sessions);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [calibrateNote, setCalibrateNote] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);
  const importFile = async (file: File) => {
    setImporting(true);
    setImportNote(null);
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("文件过大，请选择 20 MB 以内的 JSON");
      const data: unknown = JSON.parse((await file.text()).replace(/^\uFEFF/, ""));
      onCmd({ t: "balanceImport", data, onResult: (result) => {
        if ("error" in result) setImportNote(`导入失败：${result.error}`);
        else {
          setHistory(loadBalanceStore().sessions);
          setImportNote(`导入完成：新增 ${result.addedSessions} 个会话 / ${result.addedTrials} 局；共 ${result.sessions} 个会话 / ${result.trials} 局。重复记录已跳过，本地配置不变。`);
        }
      } });
    } catch (error) {
      setImportNote(`导入失败：${error instanceof Error ? error.message : "文件无法读取"}`);
    } finally {
      setImporting(false);
      if (importInput.current) importInput.current.value = "";
    }
  };
  const selectedBall = (balls.some((ball) => ball.id === dev.ballId) ? dev.ballId : candidate) as BallId;
  const isClassic = selectedBall === "plain";
  const pickBall = (id: BallId) => {
    setCandidate(id);
    onCmd({ t: "balancePick", ballId: id });
  };
  const begin = () => {
    onCmd({ t: "balanceStart", ballId: selectedBall, baseline: "plain" });
    setSelectedId(null);
  };
  const retry = () => onCmd({ t: "balanceRetry" });
  const set = (key: "score" | "safety" | "tempo" | "cost", n: number) => {
    if (!s) return;
    const target = !isClassic ? selectedBall : s.ballId !== "plain" ? s.ballId : selectedBall;
    onCmd({ t: "balanceConfig", ballId: target, strengthKey: key, n });
  };
  const refreshHistory = () => setHistory(loadBalanceStore().sessions);
  const selected = history.find((item) => item.id === selectedId) ?? null;
  const onLocks = (s?.trials ?? []).filter(
    (trial) => trial.skillState === "on" && typeof trial.skillLockSeconds === "number",
  );
  const lockMean = onLocks.length
    ? onLocks.reduce((sum, trial) => sum + (trial.skillLockSeconds ?? 0), 0) / onLocks.length
    : null;
  const filterRev = s?.gameRev ?? history.find((item) => item.ballId === candidate)?.gameRev;
  const filter = useMemo(
    () =>
      filterRev !== undefined
        ? { gameRev: filterRev, playMode: "minute" as const, scene: s?.scene }
        : undefined,
    [filterRev, s?.scene],
  );
  const summary = historicalSummary({ version: 1, config: b.config, sessions: history }, selectedBall as never, filter);
  const progress = s ? sessionProgress(s) : null;
  const configStamp = JSON.stringify(b.config);
  const trialCount = s?.trials.length ?? 0;
  const ballReadouts = useMemo(() => {
    const store = mergeLiveSession(loadBalanceStore(), s, b.config);
    return autoStrengthReport(store, filter);
    // Trials are pushed onto the same session object, so the length has to invalidate the cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configStamp, trialCount, s?.id, s?.ballId, s?.scene, filter, history.length]);
  const orderedReadouts = [...ballReadouts].sort((a, c) => {
    if (a.ballId === selectedBall) return -1;
    if (c.ballId === selectedBall) return 1;
    return 0;
  });
  const sessionReadout = s ? ballReadouts.find((row) => row.ballId === s.ballId) ?? null : null;
  const liveStore = (): BalanceStore => mergeLiveSession(loadBalanceStore(), s, b.config);
  const selectedStore = (): BalanceStore | null => {
    const session = selected ?? s;
    if (!session) return null;
    return { version: 1, config: b.config, sessions: [session] };
  };
  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const exportSelected = (format: "json" | "csv") => {
    const payload = selectedStore();
    if (!payload) return;
    const full = liveStore();
    const id = (selected ?? s)!.ballId;
    if (format === "json") {
      download(
        `balance-selected-${id}-${stamp()}.json`,
        JSON.stringify(balanceExportPayload(payload, full, filter), null, 2),
        "application/json",
      );
    } else {
      download(`balance-selected-${id}-${stamp()}.csv`, csv(payload, full, filter), "text/csv;charset=utf-8");
    }
  };
  const exportAll = (format: "json" | "csv") => {
    const payload = liveStore();
    if (format === "json") {
      download(
        `balance-all-${stamp()}.json`,
        JSON.stringify(balanceExportPayload(payload, payload, filter), null, 2),
        "application/json",
      );
    } else {
      download(`balance-all-${stamp()}.csv`, csv(payload, payload, filter), "text/csv;charset=utf-8");
    }
  };
  const verdictLabel = (value: VerdictLabel, strong = "偏强", weak = "偏弱") => {
    if (value === "strong") return strong;
    if (value === "weak") return weak;
    if (value === "pass") return "合格";
    if (value === "fail") return "不通过";
    if (value === "retest") return "再测";
    if (value === "insufficient") return "样本不足";
    if (value === "incomparable") return "不可比";
    if (value === "unreliable") return "不可信";
    if (value === "waiting") return "等待数据";
    return String(value);
  };
  const deleteSession = (id: string) => {
    const persisted = loadBalanceStore();
    persisted.sessions = persisted.sessions.filter((item) => item.id !== id);
    saveBalanceStore(persisted);
    setHistory(persisted.sessions);
    if (selectedId === id) setSelectedId(null);
  };
  const runCalibrate = () => {
    const detail = calibrateKDetailed(b.rows, b.config);
    onCmd({ t: "balanceConfig", k: detail.k });
    const residualText = detail.residuals.map((r) => `${r.ballId} Δ${r.residual.toFixed(3)}`).join(" · ") || "无";
    setCalibrateNote(
      `k=${detail.k.toFixed(3)} · RMS残差 ${detail.rms.toFixed(3)}${detail.warnNonlinear ? " · 残差偏大，考虑分段/非线性" : ""} · 排除 ${detail.excluded.length ? detail.excluded.join("；") : "无"} · ${residualText}`,
    );
  };
  const skillStateLabel = (state: string) =>
    state === "baseline" ? "基准" : state === "off" ? "技能关" : "技能开";

  return (
    <>
      <section className="mb-3 rounded-md border border-accent/40 bg-accent/5 p-2">
        <p className="mb-2 text-xs font-bold tracking-widest text-accent">当前判定</p>
        <div className="grid grid-cols-3 gap-1.5 text-xs">
          <div className="rounded bg-bg-elevated p-2">
            <p className="text-muted">B · 经典球</p>
            <p className="mt-1 font-medium text-fg">{summary.baseline === null ? "—" : summary.baseline.toFixed(1)}</p>
            <p className="text-[10px] text-subtle">
              {summary.baselineRuns} 局{summary.baselineRuns >= 3 ? " · 去最高/最低" : ""}
              {summary.baselineLo !== null && summary.baselineHi !== null
                ? ` · CI ${summary.baselineLo.toFixed(1)}–${summary.baselineHi.toFixed(1)}`
                : ""}
            </p>
          </div>
          <div className="rounded bg-bg-elevated p-2">
            <p className="text-muted">R0 · 技能关</p>
            <p className="mt-1 font-medium text-fg">{summary.r0 === null ? "—" : summary.r0.toFixed(2)}</p>
            <p className="text-[10px] text-subtle">
              目标 {summary.targetR0.toFixed(2)} · {summary.r0Runs} 局
              {summary.r0Lo !== null && summary.r0Hi !== null ? ` · CI ${summary.r0Lo.toFixed(2)}–${summary.r0Hi.toFixed(2)}` : ""}
            </p>
          </div>
          <div className="rounded bg-bg-elevated p-2">
            <p className="text-muted">R1 · 技能开</p>
            <p className="mt-1 font-medium text-fg">{summary.r1 === null ? "—" : summary.r1.toFixed(2)}</p>
            <p className="text-[10px] text-subtle">
              {summary.r1Runs} 局 · {b.config.r1Min}–{b.config.r1Max}
              {summary.r1Lo !== null && summary.r1Hi !== null ? ` · CI ${summary.r1Lo.toFixed(2)}–${summary.r1Hi.toFixed(2)}` : ""}
            </p>
          </div>
        </div>
        <p className="mt-2 text-xs text-fg">
          手感/物理：{verdictLabel(summary.feelVerdict)} · 技能/整体：{verdictLabel(summary.skillVerdict)}
          {summary.incomparableSessions > 0 ? ` · ${summary.incomparableSessions} 个会话不可比（已排除）` : ""}
        </p>
        <p className="mt-1 text-[10px] text-subtle">{summary.sampleNote}</p>
      </section>

      {orderedReadouts[0] ? (
        <div className="mb-3 min-w-0">
          <AutoBallCard row={orderedReadouts[0]} selected />
        </div>
      ) : null}

      <Row title="测试球">
        {balls.map((x) => (
          <Chip
            key={x.id}
            label={x.name}
            on={selectedBall === x.id}
            onClick={() => pickBall(x.id)}
          />
        ))}
      </Row>
      <p className="mb-3 text-[10px] text-subtle">
        {isClassic
          ? "当前为经典球：开局记录计入 B 基准。"
          : "当前为特技球：开局按技能开/关记录 R1 / R0；经典球跑出来的分才是 B。"}
      </p>

      <Row title="一分钟测试">
        <Chip label="开始测试" onClick={begin} />
        <Chip label="重新测试" onClick={retry} />
        <Chip
          label={`历史 (${history.length})`}
          on={historyOpen}
          onClick={() => {
            refreshHistory();
            setHistoryOpen((v) => !v);
          }}
        />
      </Row>

      <section className="mb-3 min-w-0">
        <p className="mb-1.5 text-xs font-medium tracking-widest text-muted">各球自动 S</p>
        {orderedReadouts.slice(1).map((row) => (
          <AutoBallCard key={row.ballId} row={row} selected={false} />
        ))}
      </section>

      {historyOpen ? (
        <section className="mb-3 rounded-md border border-border bg-bg-subtle p-2">
          <p className="mb-2 text-xs font-medium tracking-widest text-muted">测试历史</p>
          {history.length ? (
            history
              .slice()
              .reverse()
              .map((item) => {
                const prog = sessionProgress(item);
                const comparable =
                  filterRev === undefined ||
                  (item.gameRev === filterRev && (item.playMode || "minute") === "minute");
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={cn(
                      "mb-1 w-full rounded border p-2 text-left text-xs",
                      selectedId === item.id ? "border-accent bg-accent/10" : "border-border bg-bg-elevated",
                    )}
                  >
                    <span className="font-medium text-fg">
                      {item.ballId} · {new Date(item.createdAt).toLocaleString()}
                    </span>
                    <span className="block text-subtle">
                      {item.trials.length} 局 · {item.scene} · {item.playMode || "minute"} · v{item.gameRev} ·{" "}
                      {prog.status === "complete" ? "完整" : prog.status === "incomplete" ? "不完整" : "进行中"}
                      {comparable ? "" : " · 不可比"}
                    </span>
                  </button>
                );
              })
          ) : (
            <p className="text-xs text-subtle">尚无已保存的会话。</p>
          )}
          {selected ? (
            <div className="mt-2 border-t border-border pt-2">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-medium text-fg">{selected.ballId} 记录</p>
                <button type="button" className="text-xs text-red-400" onClick={() => deleteSession(selected.id)}>
                  删除
                </button>
              </div>
              <div className="max-h-40 overflow-y-auto">
                {selected.trials.map((trial, index) => (
                  <p key={trial.id} className="border-t border-border py-1 text-[11px] text-fg">
                    #{index + 1} · {trial.ballId} · {skillStateLabel(trial.skillState)} · 进球 {trial.makes ?? "—"} · 打铁{" "}
                    {trial.misses ?? "—"} · 分 {trial.score} · 最高连击 {trial.maxCombo} · 最长间隔{" "}
                    {trial.maxMakeGapSeconds === undefined ? "—" : `${trial.maxMakeGapSeconds.toFixed(1)}s`}
                    {trial.completed ? " · 打满" : " · 未满"} · 触发 {trial.triggers} · 技能分 {trial.skillScore}
                    {trial.clicks !== undefined
                      ? ` · 点击 ${trial.clicks}/长按 ${trial.holds ?? 0}/技能输入 ${trial.skillInputs ?? 0}/激活 ${trial.skillActiveSeconds ?? 0}s${trial.skillLockSeconds !== undefined ? `/锁定 ${trial.skillLockSeconds}s` : ""}`
                      : ""}
                    {trial.directMakes !== undefined
                      ? ` · 直接进球 ${trial.directMakes}/直接分 ${trial.directScore ?? 0}/挽救 ${trial.rescues ?? 0}/未归因 ${trial.unattributedScore ?? 0}`
                      : ""}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {s ? (
        <>
          <p className="mb-3 text-xs text-muted">
            当前场上：{selectedBall}
            {isClassic ? "（计入 B）" : `（特技球会话焦点 ${s.ballId}）`}
            {" · "}已锁场景/物理/版本/模式
            {progress
              ? ` · 基准 ${progress.base} / 关 ${progress.off} / 开 ${progress.on} · ${progress.status === "complete" ? "完整" : progress.status === "incomplete" ? "不完整" : "进行中"}`
              : ""}
            {" · "}首球进筐后开始 60 秒。
          </p>
          <Row title={`会话（${s.trials.length} 局）`}>
            {!isClassic ? (
              <Chip
                label={b.skillOn ? "技能开" : "技能关"}
                on={b.skillOn}
                onClick={() => onCmd({ t: "balanceSkill", on: !b.skillOn })}
              />
            ) : (
              <span className="text-xs text-subtle">经典球无需技能开关</span>
            )}
            <Chip label="清除会话" onClick={() => onCmd({ t: "balanceClear" })} />
          </Row>

          <section className="mb-3 min-w-0 rounded-md border border-border bg-bg-subtle p-2">
            <p className="mb-1 text-xs font-medium tracking-widest text-muted">自动 S（只读遥测）</p>
            {sessionReadout ? (
              <>
                <p className="text-sm font-semibold leading-snug text-fg break-words">{sessionReadout.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-subtle break-words">{sessionReadout.componentsLabel}</p>
                {sessionReadout.auto.unreliable ? (
                  <p className="mt-1 text-xs text-subtle">归因偏低，标记不可信</p>
                ) : null}
                <p className="mt-1 text-xs leading-relaxed text-subtle break-words">
                  权重 得分{(b.config.autoWeights ?? DEFAULT_AUTO_WEIGHTS).score} / 容错
                  {(b.config.autoWeights ?? DEFAULT_AUTO_WEIGHTS).safety} / 节奏
                  {(b.config.autoWeights ?? DEFAULT_AUTO_WEIGHTS).tempo} / 爆发
                  {(b.config.autoWeights ?? DEFAULT_AUTO_WEIGHTS).burst} / 代价
                  {(b.config.autoWeights ?? DEFAULT_AUTO_WEIGHTS).cost}（初值，暂算不改 R0 / R1）
                </p>
                {sessionReadout.auto.ready ? (
                  <p className="mt-1 text-xs leading-relaxed text-subtle break-words">
                    ΔR {sessionReadout.auto.scoreGain?.toFixed(2)} · 打铁率Δ {sessionReadout.auto.missRateGain?.toFixed(2)} · 间隔Δ{" "}
                    {sessionReadout.auto.gapGain?.toFixed(2)} · 连击Δ {sessionReadout.auto.comboGain?.toFixed(2)} · 归因占比{" "}
                    {sessionReadout.auto.attributionShare?.toFixed(2)}
                  </p>
                ) : null}
                <p className="mt-1 text-xs leading-relaxed text-subtle">判定：不足 10 局不给结论；3 局起用去极值平均；定稿建议 20 局。代价未齐时标「待测」。</p>
              </>
            ) : (
              <p className="text-xs text-subtle">还没有会话。</p>
            )}
            {lockMean !== null ? (
              <p className="mt-2 text-[10px] text-subtle">
                技能开锁定 {lockMean.toFixed(2)}s（代价记录，不计入技能激活时长，也不进 S）
              </p>
            ) : null}
            <p className="mt-2 text-[10px] text-subtle">{skillEfficiencyEntrance(s.ballId).message}</p>
          </section>

          <Row title="强度 S（设计备注）">
            <NumberEdit
              label="得分"
              value={b.config.strength[s.ballId === "plain" ? selectedBall : s.ballId]?.score ?? 0}
              onSet={(n) => set("score", n)}
            />
            <NumberEdit
              label="容错"
              value={b.config.strength[s.ballId === "plain" ? selectedBall : s.ballId]?.safety ?? 0}
              onSet={(n) => set("safety", n)}
            />
            <NumberEdit
              label="节奏"
              value={b.config.strength[s.ballId === "plain" ? selectedBall : s.ballId]?.tempo ?? 0}
              onSet={(n) => set("tempo", n)}
            />
            <NumberEdit
              label="代价"
              value={b.config.strength[s.ballId === "plain" ? selectedBall : s.ballId]?.cost ?? 0}
              onSet={(n) => set("cost", n)}
            />
            <p className="text-xs text-muted">
              S ={" "}
              {strengthTotal(
                b.config.strength[s.ballId === "plain" ? selectedBall : s.ballId] ?? {
                  score: 0,
                  safety: 0,
                  tempo: 0,
                  cost: 0,
                },
              )}
            </p>
          </Row>

          <Row title="目标">
            <NumberEdit label="k" value={b.config.k} onSet={(n) => onCmd({ t: "balanceConfig", k: n })} />
            <NumberEdit label="R0 容差" value={b.config.r0Tolerance} onSet={(n) => onCmd({ t: "balanceConfig", r0Tolerance: n })} />
            <NumberEdit label="R1 下限" value={b.config.r1Min} onSet={(n) => onCmd({ t: "balanceConfig", r1Min: n })} />
            <NumberEdit label="R1 上限" value={b.config.r1Max} onSet={(n) => onCmd({ t: "balanceConfig", r1Max: n })} />
          </Row>

          <div className="mb-3 space-y-1 rounded-md border border-border bg-bg-subtle p-2">
            {b.rows.map((r) => (
              <p key={r.state} className="text-xs text-fg">
                {r.state === "base" || r.state === "baseline" ? "基准" : r.state === "off" ? "技能关" : "技能开"}: n=
                {r.rawCount}/{r.effectiveCount} avg={r.mean.toFixed(1)} median={r.median.toFixed(1)} R=
                {r.ratio?.toFixed(2) ?? "-"}
                {r.ratioLo !== null && r.ratioHi !== null ? ` CI[${r.ratioLo.toFixed(2)},${r.ratioHi.toFixed(2)}]` : ""}{" "}
                target={r.target?.toFixed(2) ?? "-"} {verdictLabel(r.verdict as VerdictLabel)} · {r.sampleNote}
              </p>
            ))}
          </div>

          <Row title="校准">
            <Chip label="校准 k" onClick={runCalibrate} />
          </Row>
          {calibrateNote ? <p className="mb-3 text-[10px] text-subtle">{calibrateNote}</p> : null}
        </>
      ) : (
        <p className="mb-3 text-xs text-muted">选好测试球后点「开始测试」。经典球计入 B，特技球测 R0/R1。</p>
      )}

      <Row title="导入手机测试记录">
        <button type="button" disabled={importing} onClick={() => importInput.current?.click()} className="h-11 rounded-md border border-border bg-bg-subtle px-3 text-sm font-medium text-fg disabled:opacity-50">{importing ? "正在导入…" : "导入 JSON"}</button>
        <input ref={importInput} type="file" accept=".json,application/json" aria-label="导入平衡测试 JSON" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); }} />
      </Row>
      <p className="mb-3 text-xs text-muted">仅合并会话与局记录，按 ID 去重；保留已有数据和本地配置。</p>
      {importNote ? <p role="status" className="mb-3 break-words text-xs text-fg">{importNote}</p> : null}
      <Row title="导出">
        <Chip label="导出选中 JSON" onClick={() => exportSelected("json")} />
        <Chip label="导出选中 CSV" onClick={() => exportSelected("csv")} />
        <Chip label="导出全部 JSON" onClick={() => exportAll("json")} />
        <Chip label="导出全部 CSV" onClick={() => exportAll("csv")} />
      </Row>
      <p className="mb-1 text-[10px] text-subtle">
        {selected
          ? `选中：历史会话 ${selected.ballId}（${selected.trials.length} 局）`
          : s
            ? `选中：当前会话 ${s.ballId}（${s.trials.length} 局）；打开历史点一条可改选中`
            : "导出选中需先有当前会话，或打开历史点选一条"}
      </p>
    </>
  );
}
function RogueTab({rogue,dev,onCmd}:{rogue:RogueHud|null;dev:DevHud;onCmd:(cmd:DevCmd)=>void}) { const fuses=dev.fuseBalls; return <><NumberEdit label="金币" value={rogue?.gold??0} onSet={n=>onCmd({t:"rogueGold",n})}/><NumberEdit label="关卡分数" value={rogue?.stageScore??0} onSet={n=>onCmd({t:"rogueScore",n})}/><NumberEdit label="目标分数" value={rogue?.target??Infinity} onSet={n=>onCmd({t:"rogueTarget",n})}/><Row title="通关"><Chip label="通关结算画面" onClick={()=>onCmd({t:"rogueTool",kind:"clearSettle"})}/><Chip label="开商店" onClick={()=>onCmd({t:"rogueTool",kind:"shop"})}/></Row><Row title={`融合球 · 最多三次 (${fuses.length}/3)`}>{playableBalls().filter(b=>b.id!==dev.ballId).map(b=><Chip key={b.id} label={b.name} on={fuses.includes(b.id)} onClick={()=>onCmd({t:"rogueFuse",id:b.id})}/>)}</Row><Row title="融合"><Chip label="清除融合" onClick={()=>onCmd({t:"rogueFuse",id:null})}/></Row></>; }
function ShopTab({rogue,onCmd}:{rogue:RogueHud|null;onCmd:(cmd:DevCmd)=>void}) { const [kind,setKind]=useState<"item"|"ornament">("item"); const entries=ROGUE_CATALOG.filter((entry)=>entry.status==="active"&&entry.kind===kind); const count=(entry:RogueCatalogEntry)=>entry.kind==="ornament"?rogue?.ornaments.find(o=>o.id===entry.id)?.stacks??0:rogue?.items[entry.id as never]??0; return <><Row title="分类"><Chip label="道具" on={kind==="item"} onClick={()=>setKind("item")}/><Chip label="饰品" on={kind==="ornament"} onClick={()=>setKind("ornament")}/></Row><div className="grid grid-cols-2 gap-1.5">{entries.map(entry=>{const n=count(entry);return <button key={entry.id} type="button" onClick={()=>onCmd({t:"rogueGrant",id:entry.id})} className="rounded-md border border-border bg-bg-subtle p-2 text-left"><p className="text-sm font-medium text-fg">{entry.name} <span className="text-accent">×{n}</span></p><p className="mt-1 line-clamp-2 text-xs text-subtle">{entry.desc}</p></button>})}</div></>; }
