import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { AudioLines, ChevronLeft, ChevronRight, Music, Pause, Volume2, VolumeX } from "lucide-react";
import { createGame, rankFor, GAME_REV, type GameHandle } from "@/game/engine";
import { primeArt } from "@/game/art";
import { DEFAULT_DEV, wantDevQuery } from "@/game/dev";
import { BALLS, DEFAULT_BALL, type BallId } from "@/game/balls";
import { DEFAULT_GFX, type CloudMode, type Gfx, type HudState, type PlayMode } from "@/game/types";
import { DevConsole } from "@/components/dev-console";
import {
  itemLabel,
  ornamentLabel,
  ROGUE_CAMPAIGN_STAGES,
  ROGUE_ITEMS,
  type RogueItemId,
  type RogueOrnamentId,
} from "@/game/rogue";
import { cn } from "@/lib/utils";

primeArt();
const idleHud: HudState = {
  phase: "title",
  score: 0,
  best: 0,
  combo: 0,
  rank: rankFor(0),
  muted: false,
  hint: true,
  paused: false,
  master: 0.5,
  music: 0.5,
  sfx: 0.5,
  loadPct: 0,
  gfx: { ...DEFAULT_GFX },
  dev: { ...DEFAULT_DEV },
  ballId: DEFAULT_BALL,
  playMode: "classic",
  prison: null,
  rogue: null,
};

type Menu = "none" | "pause" | "settings" | "gfx" | "sound";

export function GameView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<GameHandle | null>(null);
  const [hud, setHud] = useState<HudState>(idleHud);
  const [crash, setCrash] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu>("none");
  const [titleTaps, setTitleTaps] = useState(0);
  const enteredDev = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let game: GameHandle | null = null;
    try {
      game = createGame(canvas, setHud);
      gameRef.current = game;
    } catch (err) {
      setCrash(err instanceof Error ? err.message : String(err));
      return;
    }

    const target = wrapRef.current ?? canvas.parentElement;
    let ro: ResizeObserver | undefined;
    if (target && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => game?.resize());
      ro.observe(target);
    }
    const onWin = () => game?.resize();
    window.addEventListener("resize", onWin);
    game.resize();

    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", onWin);
      game?.destroy();
      gameRef.current = null;
    };
  }, [GAME_REV]);

  useEffect(() => {
    if (hud.loadPct < 1) return;
    if (!wantDevQuery() || enteredDev.current) return;
    enteredDev.current = true;
    gameRef.current?.dev({ t: "enter" });
  }, [hud.loadPct]);

  useEffect(() => {
    if (hud.phase === "playing" && hud.paused && menu === "none") {
      if (hud.rogue?.pendingStreakSave) return;
      setMenu("pause");
    }
    if (hud.phase === "playing" && !hud.paused && menu === "pause") setMenu("none");
  }, [hud.paused, hud.phase, menu, hud.rogue?.pendingStreakSave]);

  function openPause() {
    const g = gameRef.current;
    if (!g) return;
    if (hud.rogue?.pendingStreakSave) return;
    if (hud.phase === "playing") {
      if (hud.paused) {
        g.resume();
        setMenu("none");
      } else {
        g.pause();
        setMenu("pause");
      }
      return;
    }
    if (hud.phase === "hub" || hud.phase === "settle" || hud.phase === "over") {
      setMenu((m) => (m === "none" ? "pause" : "none"));
      return;
    }
    setMenu((m) => (m === "none" ? "settings" : "none"));
  }

  function resume() {
    gameRef.current?.resume();
    setMenu("none");
  }

  function restart() {
    gameRef.current?.retry();
    setMenu("none");
  }

  function toTitle() {
    gameRef.current?.goTitle();
    setMenu("none");
  }

  const showPause = menu === "pause";
  const showSettings = menu === "settings";
  const showGfx = menu === "gfx";
  const showSound = menu === "sound";

  function backFromSettings() {
    setMenu(hud.phase === "title" ? "none" : "pause");
  }

  return (
    <div ref={wrapRef} className="relative h-dvh min-h-[100svh] w-full overflow-hidden bg-bg text-fg">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none select-none"
        style={{ touchAction: "none" }}
      />

      {crash ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center px-6 text-center">
          <p className="max-w-sm text-sm text-fg">{crash}</p>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-0 z-10 flex justify-center">
        <div className="flex h-full w-full max-w-[min(100%,calc(100dvh*9/16))] flex-col">
          <div className="flex-1" />

          {hud.phase === "playing" && hud.hint && menu === "none" ? (
            <p className="mx-auto mb-6 max-w-[16rem] text-center text-sm font-medium text-fg/90">
              点击屏幕，让球跳进篮筐
            </p>
          ) : null}

          {hud.phase === "title" && menu === "none" && hud.loadPct >= 1 ? (
            <TitleCard
              best={hud.best}
              unlocked={hud.dev.unlocked}
              ballId={hud.ballId}
              playMode={hud.playMode}
              onStart={() => gameRef.current?.start()}
              onBall={(id) => gameRef.current?.setBall(id)}
              onMode={(mode) => gameRef.current?.setPlayMode(mode)}
              onTitleTap={() => {
                const n = titleTaps + 1;
                setTitleTaps(n);
                window.setTimeout(() => setTitleTaps((v) => (v === n ? 0 : v)), 2800);
                if (n >= 8) {
                  gameRef.current?.dev({ t: "unlock" });
                  setTitleTaps(0);
                }
              }}
              onDev={() => gameRef.current?.dev({ t: "enter" })}
            />
          ) : null}
          {hud.phase === "settle" && menu === "none" && hud.rogue ? (
            <SettleCard
              rogue={hud.rogue}
              onConfirm={() => gameRef.current?.rogueConfirmSettle()}
              onEndless={() => gameRef.current?.rogueEndless()}
              onEnd={() => gameRef.current?.rogueEndRun()}
            />
          ) : null}
          {hud.phase === "hub" && menu === "none" && hud.rogue ? (
            <HubCard
              rogue={hud.rogue}
              onBuy={(uid) => gameRef.current?.buyRogue(uid)}
              onContinue={() => gameRef.current?.rogueContinue()}
              onTitle={toTitle}
            />
          ) : null}
          {hud.phase === "over" && menu === "none" ? (
            <OverCard
              score={hud.score}
              best={hud.best}
              rank={hud.rank}
              rogue={hud.rogue}
              ballId={hud.ballId}
              playMode={hud.playMode}
              onRetry={() => gameRef.current?.retry()}
              onTitle={toTitle}
            />
          ) : null}

          <footer className="flex items-end justify-end px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {hud.loadPct >= 1 && !hud.dev.on && hud.phase !== "over" ? (
            <button
              type="button"
              className="pointer-events-auto flex size-11 items-center justify-center rounded-md border border-border bg-bg-elevated text-fg"
              onClick={openPause}
              aria-label={hud.paused ? "继续" : "暂停"}
            >
              <Pause className="size-5" />
            </button>
            ) : null}
          </footer>
        </div>
      </div>

      {hud.rogue?.pendingStreakSave ? (
        <StreakSavePrompt
          streak={hud.combo}
          charges={hud.rogue.streakSaveCharges}
          onYes={() => gameRef.current?.answerStreakSave(true)}
          onNo={() => gameRef.current?.answerStreakSave(false)}
        />
      ) : null}

      {showPause && !hud.rogue?.pendingStreakSave ? (
        <PauseMenu
          canResume={hud.phase === "playing"}
          rogue={hud.playMode === "rogue" ? hud.rogue : null}
          onDismiss={hud.phase === "playing" ? resume : () => setMenu("none")}
          onRestart={restart}
          onSettings={() => setMenu("settings")}
          onTitle={toTitle}
          onUse={(id) => {
            gameRef.current?.useRogue(id);
            if (id === "pointexchanger") setMenu("none");
          }}
          onEndRun={
            hud.playMode === "rogue"
              ? () => {
                  setMenu("none");
                  gameRef.current?.rogueEndRun();
                }
              : undefined
          }
        />
      ) : null}
      {showSettings ? (
        <SettingsHub
          showDev={hud.dev.unlocked}
          onGfx={() => setMenu("gfx")}
          onSound={() => setMenu("sound")}
          onDev={() => {
            setMenu("none");
            gameRef.current?.dev({ t: "enter" });
          }}
          onBack={backFromSettings}
        />
      ) : null}
      {showGfx ? (
        <GfxMenu
          gfx={hud.gfx}
          onBack={() => setMenu("settings")}
          onChange={(next) => gameRef.current?.setGfx(next)}
        />
      ) : null}
      {showSound ? (
        <SoundMenu
          master={hud.master}
          music={hud.music}
          sfx={hud.sfx}
          onBack={() => setMenu("settings")}
          onChange={(bus, value) => gameRef.current?.setMix({ [bus]: value })}
          onToggle={(bus) => gameRef.current?.toggleBus(bus)}
        />
      ) : null}

      {hud.dev.on && menu === "none" ? (
        <DevConsole
          dev={hud.dev}
          score={hud.score}
          combo={hud.combo}
          onCmd={(cmd) => gameRef.current?.dev(cmd)}
          onMenu={() => {
            gameRef.current?.pause();
            setMenu("pause");
          }}
        />
      ) : null}
    </div>
  );
}

function TitleCard({
  best,
  unlocked,
  ballId,
  playMode,
  onStart,
  onBall,
  onMode,
  onTitleTap,
  onDev,
}: {
  best: number;
  unlocked: boolean;
  ballId: BallId;
  playMode: PlayMode;
  onStart: () => void;
  onBall: (id: BallId) => void;
  onMode: (mode: PlayMode) => void;
  onTitleTap: () => void;
  onDev: () => void;
}) {
  const idx = Math.max(
    0,
    BALLS.findIndex((b) => b.id === ballId),
  );
  const kit = BALLS[idx] ?? BALLS[0]!;
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);

  function selectAt(i: number) {
    const next = ((i % BALLS.length) + BALLS.length) % BALLS.length;
    const b = BALLS[next];
    if (b) onBall(b.id);
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    dragRef.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
    setDragX(0);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d) return;
    setDragX(e.clientX - d.x);
  }

  function endDrag(e: PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    const dx = d ? e.clientX - d.x : 0;
    const dy = d ? e.clientY - d.y : 0;
    setDragX(0);
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.15) return;
    if (dx < 0) selectAt(idx + 1);
    else selectAt(idx - 1);
  }

  return (
    <div className="pointer-events-none flex flex-col items-center px-6 pb-[max(1.75rem,env(safe-area-inset-bottom))]">
      <div className="mb-4 text-center">
        <h1
          className="pointer-events-auto font-sans text-5xl font-black leading-none tracking-tight text-fg"
          onClick={onTitleTap}
        >
          投球
        </h1>
        <p className="mt-2 text-sm text-muted">
          {playMode === "minute"
            ? "首球后倒计时 60 秒，拼高分"
            : playMode === "rogue"
              ? "闯关攒金，商店强化，通关后无限"
              : "点击弹跳，把球投进左右篮筐"}
        </p>
        <p className="mt-1 text-xs text-subtle">
          {playMode === "rogue" ? `最远第 ${best} 关` : `最高 ${best}`}
        </p>
      </div>

      <div className="pointer-events-auto mb-3 grid w-full max-w-xs grid-cols-3 gap-1.5">
        {(
          [
            { id: "classic" as const, label: "经典", tip: "衰减时钟" },
            { id: "minute" as const, label: "1分钟", tip: "固定时长" },
            { id: "rogue" as const, label: "肉鸽", tip: "闯关商店" },
          ] as const
        ).map((m) => {
          const on = playMode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onMode(m.id)}
              className={cn(
                "rounded-xl border px-2 py-2.5 text-left",
                on ? "border-accent bg-bg-elevated" : "border-border bg-bg-subtle/80",
              )}
            >
              <span className={cn("block text-sm font-medium", on ? "text-fg" : "text-muted")}>
                {m.label}
              </span>
              <span className="mt-0.5 block text-[10px] leading-tight text-subtle">{m.tip}</span>
            </button>
          );
        })}
      </div>

      <div className="pointer-events-auto mb-4 flex w-full max-w-xs items-center gap-1">
        <button
          type="button"
          aria-label="上一个球"
          onClick={() => selectAt(idx - 1)}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-bg-elevated text-fg"
        >
          <ChevronLeft className="size-5" />
        </button>

        <div
          className="relative min-w-0 flex-1 touch-none select-none overflow-hidden"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={() => {
            dragRef.current = null;
            setDragging(false);
            setDragX(0);
          }}
        >
          <div
            className="flex flex-col items-center rounded-xl border border-accent bg-bg-elevated px-4 py-4"
            style={{
              transform: `translateX(${dragX * 0.35}px)`,
              transition: dragging ? "none" : "transform 180ms ease-out",
            }}
          >
            <BallThumb kit={kit} large />
            <span className="mt-3 text-base font-medium text-fg">{kit.name}</span>
            <span className="mt-1 min-h-8 text-center text-xs leading-snug text-subtle">
              {kit.skill}
            </span>
            <div className="mt-3 flex items-center justify-center gap-1.5">
              {BALLS.map((b, i) => (
                <span
                  key={b.id}
                  className={cn(
                    "size-1.5 rounded-full",
                    i === idx ? "bg-accent" : "bg-border",
                  )}
                />
              ))}
            </div>
          </div>
        </div>

        <button
          type="button"
          aria-label="下一个球"
          onClick={() => selectAt(idx + 1)}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-bg-elevated text-fg"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      <button
        type="button"
        onClick={onStart}
        className={cn(
          "pointer-events-auto h-12 w-full max-w-xs rounded-lg bg-accent text-accent-fg",
          "text-base font-medium tracking-wide",
          "transition-transform duration-150 active:scale-[0.98]",
        )}
      >
        开始
      </button>
      {unlocked ? (
        <button
          type="button"
          onClick={onDev}
          className="pointer-events-auto mt-3 h-10 text-xs tracking-widest text-subtle"
        >
          开发者沙盒
        </button>
      ) : null}
    </div>
  );
}

function BallThumb({ kit, large = false }: { kit: (typeof BALLS)[number]; large?: boolean }) {
  const big = large ? "size-20" : "size-16";
  const small = large ? "size-11" : "size-9";
  if (kit.id === "prison") return <PrisonBallThumb className={big} />;
  if (kit.id === "ninja") {
    return (
      <span
        className={`${big} rounded-full shadow-inner`}
        style={{
          background:
            "radial-gradient(circle at 32% 28%, #c4b0ff 0%, #7c4dff 42%, #4a1fb8 100%)",
        }}
      />
    );
  }
  if (kit.id === "frost") {
    return (
      <span
        className={`${big} rounded-full shadow-inner`}
        style={{
          background:
            "radial-gradient(circle at 32% 28%, #e8f6ff 0%, #7ec8ff 45%, #2a6a9e 100%)",
        }}
      />
    );
  }
  if (kit.id === "champ") {
    return (
      <span
        className={`${big} overflow-hidden rounded-full shadow-inner`}
        style={{
          background:
            "linear-gradient(90deg, #c62828 0%, #c62828 50%, #1565c0 50%, #1565c0 100%)",
        }}
      />
    );
  }
  if (kit.id === "anti") {
    return (
      <span
        className={`${big} rounded-full shadow-inner`}
        style={{
          background:
            "radial-gradient(circle at 32% 28%, #b8f0ff 0%, #5a7dff 40%, #2a1a6e 75%, #0a0618 100%)",
        }}
      />
    );
  }
  if (kit.id === "rubber") {
    return (
      <span
        className={`${kit.rScale && kit.rScale < 1 ? small : big} rounded-full shadow-inner`}
        style={{
          background:
            "radial-gradient(circle at 32% 30%, #ffe566 0%, #ffd000 45%, #e6a800 100%)",
        }}
      />
    );
  }
  if (kit.src || kit.fallback) {
    const sz = kit.rScale && kit.rScale < 1 ? (large ? 44 : 36) : large ? 80 : 64;
    return (
      <img
        src={kit.src ?? kit.fallback}
        alt=""
        width={sz}
        height={sz}
        decoding="async"
        draggable={false}
        className={`${kit.rScale && kit.rScale < 1 ? small : big} object-contain`}
      />
    );
  }
  return <span className={`${big} rounded-full border border-fg/35 bg-fg/15 shadow-inner`} />;
}

function PrisonBallThumb({ className = "size-16" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <clipPath id="prison-ball-clip">
          <circle cx="32" cy="32" r="30" />
        </clipPath>
      </defs>
      <g clipPath="url(#prison-ball-clip)">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <path
            key={i}
            d={`M32 32 L${32 + 34 * Math.cos((i / 8) * Math.PI * 2 - Math.PI)} ${32 + 34 * Math.sin((i / 8) * Math.PI * 2 - Math.PI)} A34 34 0 0 1 ${32 + 34 * Math.cos(((i + 1) / 8) * Math.PI * 2 - Math.PI)} ${32 + 34 * Math.sin(((i + 1) / 8) * Math.PI * 2 - Math.PI)} Z`}
            fill={i % 2 === 0 ? "#f2f2f0" : "#141618"}
          />
        ))}
      </g>
      <circle cx="32" cy="32" r="30" fill="none" stroke="#1a1a1a" strokeWidth="2" />
      <path d="M18 30 L46 30 L44 44 Q32 50 20 44 Z" fill="#5a4030" stroke="#2a1c14" strokeWidth="1.2" />
      <rect x="22" y="32" width="20" height="10" fill="#3d2a1e" stroke="#1c120c" strokeWidth="1" />
      {[24, 28, 32, 36, 40].map((x) => (
        <line key={x} x1={x} y1="33" x2={x} y2="41" stroke="#c5ccd4" strokeWidth="1.6" />
      ))}
    </svg>
  );
}

function SettleCard({
  rogue,
  onConfirm,
  onEndless,
  onEnd,
}: {
  rogue: NonNullable<HudState["rogue"]>;
  onConfirm: () => void;
  onEndless: () => void;
  onEnd: () => void;
}) {
  const bd = rogue.lastBreakdown;
  const cleared = rogue.stage >= ROGUE_CAMPAIGN_STAGES && !rogue.endless;
  const [shownGold, setShownGold] = useState(rogue.goldBefore);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setShownGold(rogue.goldBefore);
    setReady(false);
    const from = rogue.goldBefore;
    const to = rogue.gold;
    const start = performance.now();
    const dur = 900;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - (1 - t) * (1 - t);
      setShownGold(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setReady(true);
    };
    raf = requestAnimationFrame(tick);
    const unlock = window.setTimeout(() => setReady(true), 1100);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(unlock);
    };
  }, [rogue.gold, rogue.goldBefore, rogue.stage]);

  return (
    <div className="pointer-events-none flex w-full flex-col items-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto w-full max-w-xs rounded-xl border border-border bg-bg-elevated px-5 py-5 shadow-lg">
        <p className="text-center text-xs font-medium tracking-widest text-muted">
          {cleared ? "通关结算" : `第 ${rogue.stage} 关结算`}
        </p>
        <p className="mt-3 text-center font-sans text-4xl font-black tabular-nums text-fg">
          {rogue.stageScore}
          <span className="ml-1 text-sm font-medium text-subtle">分</span>
        </p>
        <div className="mt-4 space-y-1.5 text-sm text-muted">
          <div className="flex justify-between">
            <span>最高连击</span>
            <span className="tabular-nums text-fg">×{rogue.peakStreak}</span>
          </div>
          {bd ? (
            <>
              <div className="my-2 border-t border-border" />
              <div className="flex justify-between text-xs">
                <span>基础得分</span>
                <span className="tabular-nums">+{bd.base}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>最高连击</span>
                <span className="tabular-nums">+{bd.streak}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>超额分数</span>
                <span className="tabular-nums">+{bd.over}</span>
              </div>
            </>
          ) : null}
        </div>
        <p className="mt-5 text-center text-xs tracking-widest text-subtle">金币</p>
        <p className="mt-1 text-center font-sans text-3xl font-black tabular-nums text-accent">
          {shownGold}
          <span className="ml-1 text-sm font-medium text-muted">(+{rogue.lastGoldGain})</span>
        </p>
        {cleared ? (
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              disabled={!ready}
              onClick={() => {
                if (!ready) return;
                onEnd();
              }}
              className={cn(
                "h-12 flex-1 rounded-lg text-sm font-medium",
                ready ? "border border-border text-muted" : "bg-border text-subtle",
              )}
            >
              结束游戏
            </button>
            <button
              type="button"
              disabled={!ready}
              onClick={() => {
                if (!ready) return;
                onEndless();
              }}
              className={cn(
                "h-12 flex-[1.3] rounded-lg text-sm font-medium",
                ready
                  ? "bg-accent text-accent-fg active:scale-[0.98]"
                  : "bg-border text-subtle",
              )}
            >
              继续得分
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={!ready}
            onClick={() => {
              if (!ready) return;
              onConfirm();
            }}
            className={cn(
              "mt-5 h-12 w-full rounded-lg text-base font-medium",
              ready
                ? "bg-accent text-accent-fg active:scale-[0.98]"
                : "bg-border text-subtle",
            )}
          >
            {ready ? "进入商店" : "结算中…"}
          </button>
        )}
      </div>
    </div>
  );
}

function HubCard({
  rogue,
  onBuy,
  onContinue,
  onTitle,
}: {
  rogue: NonNullable<HudState["rogue"]>;
  onBuy: (uid: string) => void;
  onContinue: () => void;
  onTitle: () => void;
}) {
  const items = rogue.shop.filter((o) => o.kind === "item");
  const orns = rogue.shop.filter((o) => o.kind === "ornament");
  // Same finger-up that opened the shop must not hit 下一关 / buy.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    setArmed(false);
    const t = window.setTimeout(() => setArmed(true), 450);
    return () => window.clearTimeout(t);
  }, [rogue.stage]);

  return (
    <div className="pointer-events-none flex max-h-[70dvh] w-full flex-col items-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto flex w-full max-w-xs flex-col overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-lg">
        <div className="border-b border-border px-4 py-3 text-center">
          <p className="text-xs font-medium tracking-widest text-muted">商店</p>
          <p className="mt-1 text-sm text-fg">
            金币 <span className="font-semibold tabular-nums">{rogue.gold}</span>
            {rogue.revives > 0 ? ` · 重生 ×${rogue.revives}` : ""}
          </p>
        </div>
        <div className="max-h-[42dvh] space-y-3 overflow-y-auto px-3 py-3">
          <div>
            <p className="mb-1.5 text-[10px] font-medium tracking-widest text-subtle">道具</p>
            <div className="space-y-1.5">
              {items.length === 0 ? (
                <p className="px-1 text-xs text-subtle">本关无道具上架</p>
              ) : (
                items.map((o) => (
                  <ShopRow
                    key={o.uid}
                    offer={o}
                    gold={rogue.gold}
                    onBuy={onBuy}
                    locked={!armed}
                  />
                ))
              )}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[10px] font-medium tracking-widest text-subtle">饰品</p>
            <div className="space-y-1.5">
              {orns.length === 0 ? (
                <p className="px-1 text-xs text-subtle">本关无饰品上架</p>
              ) : (
                orns.map((o) => (
                  <ShopRow
                    key={o.uid}
                    offer={o}
                    gold={rogue.gold}
                    onBuy={onBuy}
                    locked={!armed}
                  />
                ))
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2 border-t border-border p-3">
          <button
            type="button"
            disabled={!armed}
            onClick={onTitle}
            className={cn(
              "h-11 flex-1 rounded-lg border border-border text-sm",
              armed ? "text-muted" : "text-subtle opacity-60",
            )}
          >
            放弃
          </button>
          <button
            type="button"
            disabled={!armed}
            onClick={onContinue}
            className={cn(
              "h-11 flex-[1.4] rounded-lg text-sm font-medium",
              armed ? "bg-accent text-accent-fg" : "bg-border text-subtle",
            )}
          >
            {armed ? "下一关" : "…"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ShopRow({
  offer,
  gold,
  onBuy,
  locked = false,
}: {
  offer: NonNullable<HudState["rogue"]>["shop"][number];
  gold: number;
  onBuy: (uid: string) => void;
  locked?: boolean;
}) {
  const can = !locked && !offer.sold && gold >= offer.cost;
  return (
    <button
      type="button"
      disabled={!can}
      onClick={() => {
        if (!can) return;
        onBuy(offer.uid);
      }}
      className={cn(
        "flex w-full items-start justify-between gap-2 rounded-lg border px-3 py-2 text-left",
        offer.sold ? "border-border/50 bg-bg-subtle/40 opacity-50" : "border-border bg-bg-subtle/80",
      )}
    >
      <span>
        <span className="block text-sm font-medium text-fg">{offer.name}</span>
        <span className="mt-0.5 block text-xs text-subtle">{offer.desc}</span>
      </span>
      <span className="shrink-0 text-xs tabular-nums text-muted">
        {offer.sold ? "已购" : `${offer.cost}金`}
      </span>
    </button>
  );
}

function OverCard({
  score,
  best,
  rank,
  rogue,
  ballId,
  playMode,
  onRetry,
  onTitle,
}: {
  score: number;
  best: number;
  rank: string;
  rogue: HudState["rogue"];
  ballId: BallId;
  playMode: PlayMode;
  onRetry: () => void;
  onTitle: () => void;
}) {
  const isRogue = playMode === "rogue" && rogue;
  const isBest = isRogue
    ? rogue.stage >= best && best > 0
    : score > 0 && score === best;
  const ballName = BALLS.find((b) => b.id === ballId)?.name ?? "篮球";

  if (isRogue) {
    const ornLines = rogue.ornaments.map((o) =>
      ornamentLabel(o.id as RogueOrnamentId, o.stacks),
    );
    const itemLines: string[] = [];
    if (rogue.revives > 0) itemLines.push(`重生 ×${rogue.revives}`);
    if (rogue.streakSaveCharges > 0) {
      itemLines.push(`${itemLabel("streakSave")} ×${rogue.streakSaveCharges}`);
    }
    if (rogue.pointExchangeCharges > 0) {
      itemLines.push(`${itemLabel("pointexchanger")} ×${rogue.pointExchangeCharges}`);
    }
    if (rogue.pointExchangeLeft > 0) {
      itemLines.push(`${itemLabel("pointexchanger")}进行中（剩${rogue.pointExchangeLeft}）`);
    }
    if (rogue.moneyProtect) itemLines.push(itemLabel("moneyprotecter"));
    (Object.keys(ROGUE_ITEMS) as RogueItemId[]).forEach((id) => {
      const n = rogue.items[id] ?? 0;
      if (
        n > 0 &&
        id !== "rematch" &&
        id !== "pointexchanger" &&
        id !== "moneyprotecter" &&
        id !== "streakSave"
      ) {
        itemLines.push(`${itemLabel(id)} ×${n}`);
      }
    });
    const loadout = [
      `球种 · ${ballName}`,
      ...itemLines.map((t) => `道具 · ${t}`),
      ...ornLines.map((t) => `饰品 · ${t}`),
    ];
    const stats: { label: string; value: string }[] = [
      { label: "最高通关", value: `第 ${rogue.stage} 关` },
      { label: "最高金币", value: `${rogue.peakGold}` },
      { label: "最高连击", value: `×${rogue.peakStreakAll}` },
      { label: "最高单次得分", value: `${rogue.peakMake}` },
    ];
    return (
      <div
        className="pointer-events-auto absolute inset-0 z-20 flex flex-col items-center justify-end bg-bg/50 px-4 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-16"
        onClick={onTitle}
      >
        <div
          className="mb-4 w-full max-w-xs overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-border px-5 py-4 text-center">
            <p className="text-xs font-medium tracking-widest text-muted">本局结算</p>
            <p className="mt-2 font-sans text-4xl font-black tabular-nums text-fg">
              {score}
            </p>
            <p className="mt-1 text-xs text-subtle">
              {rogue.endless ? "无限模式" : `第 ${rogue.stage} 关`}
              {isBest ? " · 新纪录深度" : best > 0 ? ` · 最远第 ${best} 关` : ""}
            </p>
          </div>
          <div className="border-b border-border px-4 py-3">
            <p className="mb-2 text-[10px] font-medium tracking-widest text-subtle">
              装备一览
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {loadout.map((line) => (
                <li
                  key={line}
                  className="rounded-md border border-border bg-bg-subtle/80 px-2 py-1 text-[11px] text-fg"
                >
                  {line}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-0 px-4 py-2">
            {stats.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between border-b border-border/60 py-2.5 last:border-b-0"
              >
                <span className="text-sm text-muted">{row.label}</span>
                <span className="font-sans text-base font-semibold tabular-nums text-fg">
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>
        <p className="pointer-events-none mb-2 text-center text-sm text-fg">
          点击空白处返回主界面
        </p>
      </div>
    );
  }

  return (
    <div className="pointer-events-none flex flex-col items-center px-6 pb-[max(1.75rem,env(safe-area-inset-bottom))]">
      <div className="mb-5 w-full max-w-xs rounded-xl border border-border bg-bg-elevated px-6 py-6 text-center shadow-lg">
        <p className="text-xs font-medium tracking-widest text-muted">时间到</p>
        <p className="mt-3 font-sans text-6xl font-black leading-none tabular-nums text-fg">
          {score}
        </p>
        <p className="mt-2 text-sm text-muted">{rank}</p>
        <p className="mt-3 text-xs text-subtle">{isBest ? "新纪录" : `最高 ${best}`}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className={cn(
          "pointer-events-auto h-12 w-full max-w-xs rounded-lg bg-accent text-accent-fg",
          "text-base font-medium tracking-wide",
          "transition-transform duration-150 active:scale-[0.98]",
        )}
      >
        再来一局
      </button>
    </div>
  );
}

function StreakSavePrompt({
  streak,
  charges,
  onYes,
  onNo,
}: {
  streak: number;
  charges: number;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-bg/75 px-6">
      <div className="w-full max-w-xs rounded-xl border border-border bg-bg-elevated p-5 shadow-lg">
        <p className="text-center text-xs font-medium tracking-widest text-muted">连击保护</p>
        <p className="mt-3 text-center text-sm text-fg">
          当前连击 ×{streak}，是否使用连击保护？
        </p>
        <p className="mt-1 text-center text-xs text-subtle">剩余 {charges} 次</p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onNo}
            className="h-12 flex-1 rounded-lg border border-border text-sm text-muted"
          >
            不使用
          </button>
          <button
            type="button"
            onClick={onYes}
            className="h-12 flex-[1.2] rounded-lg bg-accent text-sm font-medium text-accent-fg"
          >
            使用
          </button>
        </div>
      </div>
    </div>
  );
}

function PauseMenu({
  canResume,
  rogue,
  onDismiss,
  onRestart,
  onSettings,
  onTitle,
  onEndRun,
  onUse,
}: {
  canResume: boolean;
  rogue: HudState["rogue"];
  onDismiss: () => void;
  onRestart: () => void;
  onSettings: () => void;
  onTitle: () => void;
  onEndRun?: () => void;
  onUse?: (id: string) => void;
}) {
  type UseRow = { id: string; label: string; hint: string; kind: "item" | "ornament" };
  const usable: UseRow[] = [];
  if (rogue && onUse) {
    if (rogue.streakSaveCharges > 0) {
      usable.push({
        id: "streakSave",
        label: `${itemLabel("streakSave")} ×${rogue.streakSaveCharges}`,
        hint: "断连且连击≥3时询问",
        kind: "item",
      });
    }
    if (rogue.pointExchangeCharges > 0) {
      usable.push({
        id: "pointexchanger",
        label: `${itemLabel("pointexchanger")} ×${rogue.pointExchangeCharges}`,
        hint: "点击启用：其后 5 次进球转金币",
        kind: "item",
      });
    }
  }

  const passiveOrns =
    rogue?.ornaments.map((o) => ornamentLabel(o.id as RogueOrnamentId, o.stacks)) ?? [];
  const passiveItems: string[] = [];
  if (rogue) {
    if (rogue.revives > 0) passiveItems.push(`重生 ×${rogue.revives}`);
    if (rogue.moneyProtect) passiveItems.push(itemLabel("moneyprotecter"));
    if (rogue.pointExchangeLeft > 0) {
      passiveItems.push(`${itemLabel("pointexchanger")}进行中（剩${rogue.pointExchangeLeft}）`);
    }
    if ((rogue.items.warmup ?? 0) > 0) passiveItems.push(`${itemLabel("warmup")}（下关）`);
  }

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-bg/70 px-6"
      onClick={onDismiss}
    >
      <div
        className="w-full max-w-xs rounded-xl border border-border bg-bg-elevated p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-4 text-center text-xs font-medium tracking-widest text-muted">
          {canResume ? "暂停" : "菜单"}
        </p>
        {rogue ? (
          <div className="mb-4 space-y-2 rounded-lg border border-border bg-bg-subtle/60 px-3 py-3 text-xs text-muted">
            <p className="text-fg">
              第 {rogue.stage} 关 · 目标 {rogue.target} · 金{" "}
              <span className="font-semibold tabular-nums">{rogue.gold}</span>
            </p>
            <p>
              总分 {rogue.runScore + rogue.stageScore} · 本关 {rogue.stageScore}
            </p>
            {usable.length > 0 ? (
              <div className="space-y-1.5 pt-1">
                <p className="text-[10px] tracking-widest text-subtle">点按使用</p>
                {usable.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => onUse?.(u.id)}
                    className="flex w-full flex-col rounded-lg border border-border bg-bg-elevated px-3 py-2 text-left active:scale-[0.99]"
                  >
                    <span className="text-sm text-fg">{u.label}</span>
                    <span className="text-[11px] text-subtle">{u.hint}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <p>被动道具：{passiveItems.length ? passiveItems.join("、") : "无"}</p>
            <p>被动饰品：{passiveOrns.length ? passiveOrns.join("、") : "无"}</p>
          </div>
        ) : null}
        <div className="flex flex-col gap-2">
          <MenuBtn label="重新开始" onClick={onRestart} />
          {rogue && onEndRun ? (
            <MenuBtn label="结束游戏" onClick={onEndRun} />
          ) : null}
          <MenuBtn label="设置" onClick={onSettings} />
          <MenuBtn label="返回主界面" onClick={onTitle} />
        </div>
      </div>
      {canResume ? (
        <p className="pointer-events-none mt-4 text-center text-sm text-fg">点击空白处继续</p>
      ) : null}
    </div>
  );
}

function MenuBtn({
  label,
  onClick,
  primary,
}: {
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-12 w-full rounded-lg text-base font-medium tracking-wide",
        "transition-transform duration-150 active:scale-[0.98]",
        primary ? "bg-accent text-accent-fg" : "border border-border bg-bg-subtle text-fg",
      )}
    >
      {label}
    </button>
  );
}

function SettingsHub({
  showDev,
  onGfx,
  onSound,
  onDev,
  onBack,
}: {
  showDev: boolean;
  onGfx: () => void;
  onSound: () => void;
  onDev: () => void;
  onBack: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-bg/70 px-6">
      <div className="w-full max-w-xs rounded-xl border border-border bg-bg-elevated p-5 shadow-lg">
        <p className="mb-4 text-center text-xs font-medium tracking-widest text-muted">设置</p>
        <div className="flex flex-col gap-2">
          <MenuBtn label="画面" onClick={onGfx} />
          <MenuBtn label="声音" onClick={onSound} />
          {showDev ? <MenuBtn label="开发者" onClick={onDev} /> : null}
        </div>
        <button
          type="button"
          onClick={onBack}
          className="mt-5 h-12 w-full rounded-lg border border-border bg-bg-subtle text-base font-medium text-fg"
        >
          返回
        </button>
      </div>
    </div>
  );
}

function GfxMenu({
  gfx,
  onBack,
  onChange,
}: {
  gfx: Gfx;
  onBack: () => void;
  onChange: (next: Partial<Gfx>) => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-bg/70 px-6">
      <div className="w-full max-w-xs rounded-xl border border-border bg-bg-elevated p-5 shadow-lg">
        <p className="mb-4 text-center text-xs font-medium tracking-widest text-muted">画面</p>
        <div className="flex max-h-[min(58dvh,28rem)] flex-col gap-3 overflow-y-auto">
          <div>
            <p className="mb-2 text-sm text-fg">云朵</p>
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-bg-subtle p-1">
              {(
                [
                  ["dance", "节拍"],
                  ["drift", "缓慢"],
                  ["off", "关闭"],
                ] as [CloudMode, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onChange({ clouds: id })}
                  className={cn(
                    "h-10 rounded-md text-sm font-medium",
                    gfx.clouds === id ? "bg-accent text-accent-fg" : "text-fg",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <ToggleRow label="球的光影" on={gfx.ballShade} onToggle={() => onChange({ ballShade: !gfx.ballShade })} />
          <ToggleRow label="篮球投影" on={gfx.ballShadow} onToggle={() => onChange({ ballShadow: !gfx.ballShadow })} />
          <ToggleRow label="粒子特效" on={gfx.particles} onToggle={() => onChange({ particles: !gfx.particles })} />
          <ToggleRow label="涂鸦出现" on={gfx.graffitiFx} onToggle={() => onChange({ graffitiFx: !gfx.graffitiFx })} />
          <ToggleRow label="进球镜头" on={gfx.impact} onToggle={() => onChange({ impact: !gfx.impact })} />
          <ToggleRow label="镜头闪动" on={gfx.flash} onToggle={() => onChange({ flash: !gfx.flash })} />
          <ToggleRow label="绝杀聚光灯" on={gfx.buzzerSpot} onToggle={() => onChange({ buzzerSpot: !gfx.buzzerSpot })} />
        </div>
        <button
          type="button"
          onClick={onBack}
          className="mt-5 h-12 w-full rounded-lg border border-border bg-bg-subtle text-base font-medium text-fg"
        >
          返回
        </button>
      </div>
    </div>
  );
}

function ToggleRow({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex h-11 w-full items-center justify-between rounded-lg border border-border bg-bg-subtle px-3"
    >
      <span className="text-sm text-fg">{label}</span>
      <span className={cn("text-sm font-medium", on ? "text-fg" : "text-subtle")}>{on ? "开" : "关"}</span>
    </button>
  );
}

function SoundMenu({
  master,
  music,
  sfx,
  onBack,
  onChange,
  onToggle,
}: {
  master: number;
  music: number;
  sfx: number;
  onBack: () => void;
  onChange: (bus: "master" | "music" | "sfx", value: number) => void;
  onToggle: (bus: "master" | "music" | "sfx") => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-bg/70 px-6">
      <div className="w-full max-w-xs rounded-xl border border-border bg-bg-elevated p-5 shadow-lg">
        <p className="mb-4 text-center text-xs font-medium tracking-widest text-muted">声音设置</p>
        <div className="flex flex-col gap-4">
          <VolRow
            label="全局声音"
            value={master}
            icon={master > 0.001 ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
            onToggle={() => onToggle("master")}
            onChange={(v) => onChange("master", v)}
          />
          <VolRow
            label="背景音乐"
            value={music}
            icon={music > 0.001 ? <Music className="size-5" /> : <VolumeX className="size-5" />}
            onToggle={() => onToggle("music")}
            onChange={(v) => onChange("music", v)}
          />
          <VolRow
            label="特殊声效"
            value={sfx}
            icon={sfx > 0.001 ? <AudioLines className="size-5" /> : <VolumeX className="size-5" />}
            onToggle={() => onToggle("sfx")}
            onChange={(v) => onChange("sfx", v)}
          />
        </div>
        <button
          type="button"
          onClick={onBack}
          className="mt-5 h-12 w-full rounded-lg border border-border bg-bg-subtle text-base font-medium text-fg"
        >
          返回
        </button>
      </div>
    </div>
  );
}

function VolRow({
  label,
  value,
  icon,
  onToggle,
  onChange,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  onToggle: () => void;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onToggle}
        aria-label={`${value > 0.001 ? "静音" : "恢复"}${label}`}
        className="flex size-11 shrink-0 items-center justify-center rounded-md border border-border bg-bg-subtle text-fg"
      >
        {icon}
      </button>
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-sm text-fg">{label}</p>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(value * 100)}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          className="h-6 w-full accent-accent"
          aria-label={label}
        />
      </div>
    </div>
  );
}