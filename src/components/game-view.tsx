import { useEffect, useRef, useState, type ReactNode } from "react";
import { AudioLines, Music, Pause, Volume2, VolumeX } from "lucide-react";
import { createGame, rankFor, GAME_REV, type GameHandle } from "@/game/engine";
import { primeArt } from "@/game/art";
import { DEFAULT_DEV, wantDevQuery } from "@/game/dev";
import { BALLS, DEFAULT_BALL, ballFuseLabel, playableBalls, type BallId } from "@/game/balls";
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
import { ROGUE_CATALOG, RARITY_LABEL, type RogueCatalogEntry } from "@/game/rogue-catalog";
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
      if (hud.rogue?.pendingStreakSave || hud.rogue?.pendingFlameReuse) return;
      if (hud.playMode === "rogue" && hud.rogue && !hud.rogue.fusePicked) return;
      setMenu("pause");
    }
    if (hud.phase === "playing" && !hud.paused && menu === "pause") setMenu("none");
  }, [
    hud.paused,
    hud.phase,
    menu,
    hud.playMode,
    hud.rogue?.pendingStreakSave,
    hud.rogue?.pendingFlameReuse,
    hud.rogue?.fusePicked,
  ]);

  function openPause() {
    const g = gameRef.current;
    if (!g) return;
    if (hud.rogue?.pendingStreakSave || hud.rogue?.pendingFlameReuse) return;
    if (hud.playMode === "rogue" && hud.rogue && !hud.rogue.fusePicked) return;
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
              devMode={hud.dev.on}
              onDevBack={() => gameRef.current?.devBackFromSettle()}
            />
          ) : null}
          {hud.phase === "hub" && menu === "none" && hud.rogue ? (
            <HubCard
              rogue={hud.rogue}
              devMode={hud.dev.on}
              onBuy={(uid) => gameRef.current?.buyRogue(uid)}
              onGrant={(id) => gameRef.current?.grantRogue(id)}
              onRevoke={(id) => gameRef.current?.revokeRogue(id)}
              onContinue={() => gameRef.current?.rogueContinue()}
              onClose={() => gameRef.current?.closeRogueShop()}
              onReset={() => gameRef.current?.resetRogueLoadout()}
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
              devMode={hud.dev.on}
              onDevBack={() => gameRef.current?.devBackFromSettle()}
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

      {hud.phase === "playing" &&
      menu === "none" &&
      hud.playMode === "rogue" &&
      hud.rogue &&
      !hud.rogue.fusePicked &&
      !hud.dev.on ? (
        <FusePickPanel
          ballId={hud.ballId}
          onPick={(id) => gameRef.current?.setRogueFuse(id)}
        />
      ) : null}

      {hud.rogue?.pendingStreakSave ? (
        <StreakSavePrompt
          streak={hud.combo}
          charges={hud.rogue.streakSaveCharges}
          onYes={() => gameRef.current?.answerStreakSave(true)}
          onNo={() => gameRef.current?.answerStreakSave(false)}
        />
      ) : null}

      {hud.rogue?.pendingFlameReuse ? (
        <FlameReusePrompt
          charges={hud.rogue.items.flameON ?? 0}
          onYes={() => gameRef.current?.answerFlameReuse(true)}
          onNo={() => gameRef.current?.answerFlameReuse(false)}
        />
      ) : null}

      {showPause &&
      !hud.rogue?.pendingStreakSave &&
      !hud.rogue?.pendingFlameReuse &&
      !(hud.playMode === "rogue" && hud.rogue && !hud.rogue.fusePicked) ? (
        <PauseMenu
          canResume={hud.phase === "playing"}
          rogue={hud.playMode === "rogue" ? hud.rogue : null}
          ballId={hud.ballId}
          onDismiss={hud.phase === "playing" ? resume : () => setMenu("none")}
          onRestart={restart}
          onSettings={() => setMenu("settings")}
          onTitle={toTitle}
          onUse={(id) => {
            gameRef.current?.useRogue(id);
            if (
              id === "pointexchanger" ||
              id === "comboboost" ||
              id === "ineedpower" ||
              id === "Bunshin" ||
              id === "flameON"
            ) {
              setMenu("none");
            }
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
  const playable = playableBalls();
  const idx = Math.max(0, playable.findIndex((b) => b.id === ballId));
  const minuteBlocked = ballId === "champ";
  const sliderRef = useRef<HTMLDivElement>(null);
  const cardW = 220;
  const gap = 12;

  useEffect(() => {
    const el = sliderRef.current;
    if (!el) return;
    const target = idx * (cardW + gap);
    if (Math.abs(el.scrollLeft - target) <= 2) return;
    el.scrollTo({ left: target, behavior: "smooth" });
  }, [idx, cardW, gap]);

  useEffect(() => {
    const el = sliderRef.current;
    if (!el) return;
    el.scrollLeft = idx * (cardW + gap);
  }, []);

  function settleSlider() {
    const el = sliderRef.current;
    if (!el) return;
    const step = cardW + gap;
    const next = Math.round(el.scrollLeft / step);
    const clamped = Math.max(0, Math.min(playable.length - 1, next));
    const b = playable[clamped];
    if (b && b.id !== ballId) onBall(b.id);
  }

  return (
    <div className="pointer-events-none flex flex-col items-center px-4 pb-[max(1.75rem,env(safe-area-inset-bottom))]">
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
          const blocked = m.id === "minute" && minuteBlocked;
          return (
            <button
              key={m.id}
              type="button"
              disabled={blocked}
              aria-disabled={blocked}
              onClick={() => {
                if (blocked) return;
                onMode(m.id);
              }}
              className={cn(
                "relative overflow-hidden rounded-xl border px-2 py-2.5 text-left",
                blocked
                  ? "cursor-not-allowed border-border/70 bg-bg-subtle/50 opacity-70"
                  : on
                    ? "border-accent bg-bg-elevated"
                    : "border-border bg-bg-subtle/80",
              )}
            >
              <span
                className={cn(
                  "block text-sm font-medium",
                  blocked ? "text-muted" : on ? "text-fg" : "text-muted",
                )}
              >
                {m.label}
              </span>
              <span className="mt-0.5 block text-[10px] leading-tight text-subtle">{m.tip}</span>
              {blocked ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 top-1/2 h-0.5 w-[130%] -translate-x-1/2 -translate-y-1/2 rotate-[-28deg] bg-red-500 shadow-sm"
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="pointer-events-auto mb-4 w-full max-w-xs">
        <div
          ref={sliderRef}
          onScroll={() => {
            // Live highlight while dragging; commit on scroll end via pointer/touch up.
            settleSlider();
          }}
          onPointerUp={settleSlider}
          onTouchEnd={settleSlider}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-[calc((100%-220px)/2)] pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {playable.map((b) => {
            const on = b.id === ballId;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => onBall(b.id)}
                className={cn(
                  "flex h-[11.5rem] w-[220px] shrink-0 snap-center flex-col items-center rounded-xl border px-4 py-3 text-center",
                  on ? "border-accent bg-bg-elevated" : "border-border bg-bg-subtle/70",
                )}
              >
                <BallThumb kit={b} large />
                <span className="mt-2.5 shrink-0 text-base font-medium text-fg">{b.name}</span>
                <span className="mt-1 line-clamp-3 min-h-[2.75rem] text-center text-xs leading-snug text-subtle">
                  {b.skill}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-2.5 flex items-center justify-center gap-1.5">
          {playable.map((b, i) => (
            <button
              key={b.id}
              type="button"
              aria-label={b.name}
              onClick={() => onBall(b.id)}
              className={cn(
                "size-1.5 rounded-full transition-colors",
                i === idx ? "bg-accent" : "bg-border",
              )}
            />
          ))}
        </div>
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
  devMode = false,
  onDevBack,
}: {
  rogue: NonNullable<HudState["rogue"]>;
  onConfirm: () => void;
  onEndless: () => void;
  onEnd: () => void;
  devMode?: boolean;
  onDevBack?: () => void;
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
    <div
      className={cn(
        "flex w-full flex-col items-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]",
        devMode && onDevBack ? "pointer-events-auto" : "pointer-events-none",
      )}
      onClick={
        devMode && onDevBack
          ? () => {
              onDevBack();
            }
          : undefined
      }
    >
      <div
        className="pointer-events-auto w-full max-w-xs rounded-xl border border-border bg-bg-elevated px-5 py-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
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
                if (devMode && onDevBack) onDevBack();
                else onEnd();
              }}
              className={cn(
                "h-12 flex-1 rounded-lg text-sm font-medium",
                ready ? "border border-border text-muted" : "bg-border text-subtle",
              )}
            >
              {devMode ? "返回沙盒" : "结束游戏"}
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
      {devMode && onDevBack ? (
        <p className="pointer-events-none mt-3 text-center text-sm text-fg">
          点击空白处返回沙盒
        </p>
      ) : null}
    </div>
  );
}

function HubCard({
  rogue,
  devMode = false,
  onBuy,
  onGrant,
  onRevoke,
  onContinue,
  onClose,
  onReset,
}: {
  rogue: NonNullable<HudState["rogue"]>;
  devMode?: boolean;
  onBuy: (uid: string) => void;
  onGrant?: (id: string) => void;
  onRevoke?: (id: string) => void;
  onContinue: () => void;
  onClose?: () => void;
  onReset: () => void;
}) {
  const items = rogue.shop.filter((o) => o.kind === "item");
  const orns = rogue.shop.filter((o) => o.kind === "ornament");
  // Same finger-up that opened the shop must not hit 下一关 / buy.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (devMode) return;
    setArmed(false);
    const t = window.setTimeout(() => setArmed(true), 450);
    return () => window.clearTimeout(t);
  }, [rogue.stage, devMode]);

  if (devMode && onGrant && onRevoke) {
    return (
      <DevCatalogHub
        rogue={rogue}
        onGrant={onGrant}
        onRevoke={onRevoke}
        onContinue={onContinue}
        onClose={onClose}
        onReset={onReset}
      />
    );
  }

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
            onClick={onReset}
            className={cn(
              "h-11 flex-1 rounded-lg border border-border text-sm",
              armed ? "text-muted" : "text-subtle opacity-60",
            )}
          >
            重置
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

function DevCatalogHub({
  rogue,
  onGrant,
  onRevoke,
  onContinue,
  onClose,
  onReset,
}: {
  rogue: NonNullable<HudState["rogue"]>;
  onGrant: (id: string) => void;
  onRevoke: (id: string) => void;
  onContinue: () => void;
  onClose?: () => void;
  onReset: () => void;
}) {
  const items = ROGUE_CATALOG.filter((e) => e.status === "active" && e.kind === "item");
  const orns = ROGUE_CATALOG.filter((e) => e.status === "active" && e.kind === "ornament");

  function stacksOf(entry: RogueCatalogEntry): number {
    // Mirror ownedRogueCount using hud fields (run lives in engine).
    if (entry.kind === "ornament") {
      return rogue.ornaments.find((o) => o.id === entry.id)?.stacks ?? 0;
    }
    if (entry.id === "rematch") return rogue.revives;
    if (entry.id === "streakSave") return rogue.streakSaveCharges;
    if (entry.id === "pointexchanger") return rogue.pointExchangeCharges;
    if (entry.id === "moneyprotecter") return rogue.moneyProtect ? 1 : 0;
    return rogue.items[entry.id as RogueItemId] ?? 0;
  }

  return (
    <div className="pointer-events-none flex max-h-[78dvh] w-full flex-col items-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto flex w-full max-w-sm flex-col overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-lg">
        <div className="border-b border-border px-4 py-3 text-center">
          <p className="text-xs font-medium tracking-widest text-muted">开发者目录</p>
          <p className="mt-1 text-sm text-fg">
            金币 <span className="font-semibold tabular-nums">{rogue.gold}</span>
            <span className="text-subtle"> · 无限分 · 全量目录</span>
          </p>
        </div>
        <div className="max-h-[min(52dvh,22rem)] overflow-y-auto overscroll-contain px-2 py-2 [-webkit-overflow-scrolling:touch]">
          <p className="sticky top-0 z-10 bg-bg-elevated px-2 py-1.5 text-[10px] font-medium tracking-widest text-subtle">
            道具
          </p>
          <div className="mb-2 space-y-1">
            {items.map((e) => (
              <DevCatalogRow
                key={e.id}
                name={e.name}
                rarity={RARITY_LABEL[e.rarity]}
                stacks={stacksOf(e)}
                stackCap={e.stackCap}
                onUse={() => onGrant(e.id)}
                onClose={() => onRevoke(e.id)}
              />
            ))}
          </div>
          <p className="sticky top-0 z-10 bg-bg-elevated px-2 py-1.5 text-[10px] font-medium tracking-widest text-subtle">
            饰品
          </p>
          <div className="space-y-1">
            {orns.map((e) => (
              <DevCatalogRow
                key={e.id}
                name={e.name}
                rarity={RARITY_LABEL[e.rarity]}
                stacks={stacksOf(e)}
                stackCap={e.stackCap}
                onUse={() => onGrant(e.id)}
                onClose={() => onRevoke(e.id)}
              />
            ))}
          </div>
        </div>
        <div className="flex gap-2 border-t border-border p-3">
          <button
            type="button"
            onClick={onReset}
            className="h-11 flex-1 rounded-lg border border-border text-sm text-muted"
          >
            重置
          </button>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="h-11 flex-1 rounded-lg border border-border text-sm text-fg"
            >
              关闭
            </button>
          ) : null}
          <button
            type="button"
            onClick={onContinue}
            className="h-11 flex-[1.2] rounded-lg bg-accent text-sm font-medium text-accent-fg"
          >
            下一关
          </button>
        </div>
      </div>
    </div>
  );
}

function DevCatalogRow({
  name,
  rarity,
  stacks,
  stackCap,
  onUse,
  onClose,
}: {
  name: string;
  rarity: string;
  stacks: number;
  stackCap: number;
  onUse: () => void;
  onClose: () => void;
}) {
  const atCap = stacks >= stackCap;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-bg-subtle/80 px-2.5 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-fg">
          {name}
          <span className="ml-1.5 tabular-nums text-muted">×{stacks}</span>
        </p>
        <p className="text-[10px] text-subtle">
          {rarity}
          {stackCap > 1 ? ` · 上限 ${stackCap}` : ""}
        </p>
      </div>
      <button
        type="button"
        disabled={atCap}
        onClick={onUse}
        className={cn(
          "h-9 shrink-0 rounded-md px-2.5 text-xs font-medium",
          atCap ? "bg-border text-subtle" : "bg-accent text-accent-fg",
        )}
      >
        使用
      </button>
      <button
        type="button"
        disabled={stacks <= 0}
        onClick={onClose}
        className={cn(
          "h-9 shrink-0 rounded-md border px-2.5 text-xs font-medium",
          stacks <= 0 ? "border-border text-subtle" : "border-border text-fg",
        )}
      >
        关闭
      </button>
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
  devMode = false,
  onDevBack,
}: {
  score: number;
  best: number;
  rank: string;
  rogue: HudState["rogue"];
  ballId: BallId;
  playMode: PlayMode;
  onRetry: () => void;
  onTitle: () => void;
  devMode?: boolean;
  onDevBack?: () => void;
}) {
  const isRogue = playMode === "rogue" && rogue;
  const isBest = isRogue
    ? rogue.stage >= best && best > 0
    : score > 0 && score === best;
  const ballName = ballFuseLabel(ballId, rogue?.fuseBall ?? null);
  const blankBack = () => {
    if (devMode && onDevBack) onDevBack();
    else onTitle();
  };

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
        onClick={blankBack}
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
          {devMode ? "点击空白处返回沙盒" : "点击空白处返回主界面"}
        </p>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-20 flex flex-col items-center justify-end bg-bg/50 px-6 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-16"
      onClick={onTitle}
    >
      <div
        className="mb-5 w-full max-w-xs rounded-xl border border-border bg-bg-elevated px-6 py-6 text-center shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-medium tracking-widest text-muted">时间到</p>
        <p className="mt-3 font-sans text-6xl font-black leading-none tabular-nums text-fg">
          {score}
        </p>
        <p className="mt-2 text-sm text-muted">{rank}</p>
        <p className="mt-3 text-xs text-subtle">{isBest ? "新纪录" : `最高 ${best}`}</p>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRetry();
        }}
        className={cn(
          "pointer-events-auto h-12 w-full max-w-xs rounded-lg bg-accent text-accent-fg",
          "text-base font-medium tracking-wide",
          "transition-transform duration-150 active:scale-[0.98]",
        )}
      >
        再来一局
      </button>
      <p className="pointer-events-none mt-3 mb-2 text-center text-sm text-fg">
        点击空白处返回主界面
      </p>
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

function FlameReusePrompt({
  charges,
  onYes,
  onNo,
}: {
  charges: number;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-bg/75 px-6">
      <div className="w-full max-w-xs rounded-xl border border-border bg-bg-elevated p-5 shadow-lg">
        <p className="text-center text-xs font-medium tracking-widest text-muted">热火饮料</p>
        <p className="mt-3 text-center text-sm text-fg">烈焰结束，是否继续使用下一瓶？</p>
        <p className="mt-1 text-center text-xs text-subtle">剩余 {charges} 瓶</p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onNo}
            className="h-12 flex-1 rounded-lg border border-border text-sm text-muted"
          >
            不用了
          </button>
          <button
            type="button"
            onClick={onYes}
            className="h-12 flex-[1.2] rounded-lg bg-accent text-sm font-medium text-accent-fg"
          >
            继续喝
          </button>
        </div>
      </div>
    </div>
  );
}

function FusePickPanel({
  ballId,
  onPick,
}: {
  ballId: BallId;
  onPick: (id: BallId | null) => void;
}) {
  const primary = playableBalls().find((b) => b.id === ballId) ?? playableBalls()[0]!;
  const others = playableBalls().filter((b) => b.id !== ballId);
  const [pick, setPick] = useState<BallId | null>(null);

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex flex-col items-center justify-center bg-bg/75 px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-bg-elevated p-5 shadow-lg">
        <p className="text-center text-xs font-medium tracking-widest text-muted">开局融合</p>
        <p className="mt-2 text-center text-sm font-medium text-fg">{primary.name}</p>
        <p className="mt-1 text-center text-xs leading-relaxed text-subtle">{primary.skill}</p>
        <p className="mt-4 text-[10px] font-medium tracking-widest text-subtle">选择副球（技能叠加，外观仍用主球）</p>
        <div className="mt-2 max-h-[40dvh] space-y-1.5 overflow-y-auto">
          {others.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setPick(b.id)}
              className={cn(
                "flex w-full flex-col rounded-lg border px-3 py-2.5 text-left transition-colors",
                pick === b.id
                  ? "border-accent bg-accent/10"
                  : "border-border bg-bg-subtle/50 active:scale-[0.99]",
              )}
            >
              <span className="text-sm font-medium text-fg">{b.name}</span>
              <span className="mt-0.5 text-[11px] leading-snug text-subtle">{b.skill}</span>
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled={pick == null}
            onClick={() => pick != null && onPick(pick)}
            className={cn(
              "h-12 w-full rounded-lg text-sm font-medium",
              pick != null
                ? "bg-accent text-accent-fg active:scale-[0.98]"
                : "cursor-not-allowed bg-bg-subtle text-muted",
            )}
          >
            确认融合
          </button>
          <button
            type="button"
            onClick={() => onPick(null)}
            className="h-11 w-full rounded-lg border border-border text-sm text-muted"
          >
            不融合
          </button>
        </div>
      </div>
    </div>
  );
}

function PauseMenu({
  canResume,
  rogue,
  ballId,
  onDismiss,
  onRestart,
  onSettings,
  onTitle,
  onEndRun,
  onUse,
}: {
  canResume: boolean;
  rogue: HudState["rogue"];
  ballId: BallId;
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
    if ((rogue.items.comboboost ?? 0) > 0) {
      usable.push({
        id: "comboboost",
        label: `${itemLabel("comboboost")} ×${rogue.items.comboboost}`,
        hint: "5 秒内每次进球连击 +3",
        kind: "item",
      });
    }
    if ((rogue.items.ineedpower ?? 0) > 0) {
      usable.push({
        id: "ineedpower",
        label: `${itemLabel("ineedpower")} ×${rogue.items.ineedpower}`,
        hint: "4 秒内每次进球 +20 分",
        kind: "item",
      });
    }
    if ((rogue.items.Bunshin ?? 0) > 0) {
      usable.push({
        id: "Bunshin",
        label: `${itemLabel("Bunshin")} ×${rogue.items.Bunshin}`,
        hint: "10 秒影子分身；再使用可叠更多分身",
        kind: "item",
      });
    }
    if ((rogue.items.flameON ?? 0) > 0) {
      usable.push({
        id: "flameON",
        label: `${itemLabel("flameON")} ×${rogue.items.flameON}`,
        hint: "10 秒烈焰；结束后可续杯",
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
    if ((rogue.items.tranquilizer ?? 0) > 0) {
      passiveItems.push(`${itemLabel("tranquilizer")} ×${rogue.items.tranquilizer}`);
    }
    if (rogue.buffComboLeft > 0) {
      passiveItems.push(`${itemLabel("comboboost")} ${rogue.buffComboLeft.toFixed(1)}s`);
    }
    if (rogue.buffPowerLeft > 0) {
      passiveItems.push(`${itemLabel("ineedpower")} ${rogue.buffPowerLeft.toFixed(1)}s`);
    }
    if (rogue.buffBunshinLeft > 0) {
      passiveItems.push(
        `${itemLabel("Bunshin")} ×${rogue.buffBunshinClones} ${rogue.buffBunshinLeft.toFixed(1)}s`,
      );
    }
    if (rogue.buffFlameLeft > 0) {
      passiveItems.push(`${itemLabel("flameON")} ${rogue.buffFlameLeft.toFixed(1)}s`);
    }
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
            <p>球种 · {ballFuseLabel(ballId, rogue.fuseBall)}</p>
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