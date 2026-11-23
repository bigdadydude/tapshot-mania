import { useEffect, useState } from "react";
import type { RunRecap } from "@/game/types.ts";
import { cn } from "@/lib/utils";
import { listLeaderboard, submitLeaderboardRun } from "@/lib/leaderboard/api.ts";
import { LEADERBOARD_PRIVACY_NOTICE, type EligibilityFlags, type LeaderboardMode, type PublicLeaderboardRow, type TimelineEvent } from "@/lib/leaderboard/constants.ts";
import { lastSubmittedFor, runEligibilityFlags, shouldOfferSubmit } from "@/lib/leaderboard/eligibility.ts";
import { displayNickname } from "@/lib/leaderboard/nickname.ts";

export { LEADERBOARD_PRIVACY_NOTICE };

export function LeaderboardPanel({
  initialMode,
  onClose,
}: {
  initialMode: LeaderboardMode;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<LeaderboardMode>(initialMode);
  const [rows, setRows] = useState<PublicLeaderboardRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listLeaderboard({ data: { mode } })
      .then((result) => {
        if (cancelled) return;
        setRows(result.rows);
        setError(result.ok ? null : result.error);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setRows([]);
        setError("排行榜暂时无法加载");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-30 flex flex-col items-center justify-end bg-bg/60 px-4 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-16"
      onClick={onClose}
    >
      <div
        className="mb-4 flex max-h-[min(36rem,calc(100dvh-8rem))] w-full max-w-xs flex-col overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-border px-5 py-4 text-center">
          <p className="text-xs font-medium tracking-widest text-muted">排行榜</p>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {(
              [
                { id: "classic" as const, label: "经典" },
                { id: "minute" as const, label: "1分钟" },
              ] as const
            ).map((tab) => {
              const on = mode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMode(tab.id)}
                  className={cn(
                    "h-10 rounded-lg border text-sm font-medium",
                    on ? "border-accent bg-bg-subtle text-fg" : "border-border bg-bg-subtle/60 text-muted",
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
        <p className="shrink-0 border-b border-border px-4 py-2.5 text-left text-[11px] leading-relaxed text-subtle">
          {LEADERBOARD_PRIVACY_NOTICE}
        </p>
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch]"
          style={{ touchAction: "pan-y", WebkitOverflowScrolling: "touch" }}
        >
          {loading ? (
            <p className="px-4 py-8 text-center text-sm text-subtle">加载中…</p>
          ) : error ? (
            <p className="px-4 py-8 text-center text-sm text-muted">{error}</p>
          ) : rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-subtle">暂无成绩</p>
          ) : (
            <ul className="px-3 py-1">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex items-baseline gap-2 border-b border-border/60 py-2.5 last:border-b-0"
                >
                  <span className="w-6 shrink-0 text-xs tabular-nums text-subtle">{row.rank}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{row.nickname}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-subtle">{row.ballLabel}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-sans text-base font-semibold tabular-nums text-fg">
                      {row.score}
                    </span>
                    <span className="block text-[11px] tabular-nums text-subtle">×{row.peakCombo}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="pointer-events-auto h-12 w-full max-w-xs rounded-lg border border-border bg-bg-elevated text-sm font-medium text-fg"
      >
        关闭
      </button>
    </div>
  );
}

export function SubmitBoardBlock({
  recap,
  flags,
  nickname,
  submittedClassic,
  submittedMinute,
  getTimeline,
  onRemember,
}: {
  recap: RunRecap;
  flags: EligibilityFlags;
  nickname: string;
  submittedClassic: number;
  submittedMinute: number;
  getTimeline: () => TimelineEvent[];
  onRemember: (mode: LeaderboardMode, nickname: string, score: number) => void;
}) {
  const mode = recap.playMode;
  const eligibleOffer =
    (mode === "classic" || mode === "minute") &&
    shouldOfferSubmit({
      mode,
      score: recap.score,
      lastSubmitted: lastSubmittedFor(mode, { submittedClassic, submittedMinute }),
      flags,
    });

  const [startedWithoutName] = useState(() => !nickname);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!eligibleOffer && !done) return null;

  async function submit() {
    if (mode !== "classic" && mode !== "minute") return;
    const submitName = displayNickname(nickname);
    setBusy(true);
    setError(null);
    try {
      const result = await submitLeaderboardRun({
        data: {
          nickname: submitName,
          mode,
          score: recap.score,
          recap,
          timeline: getTimeline(),
          flags,
        },
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onRemember(mode, submitName, recap.score);
      setDone(true);
    } catch {
      setError("提交失败，请稍后再试");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mb-3 w-full max-w-xs shrink-0 rounded-xl border border-border bg-bg-elevated px-4 py-3 text-center">
        <p className="text-sm text-fg">已提交到排行榜</p>
      </div>
    );
  }

  return (
    <div
      className="mb-3 w-full max-w-xs shrink-0 rounded-xl border border-border bg-bg-elevated px-4 py-3 text-left"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-[10px] font-medium tracking-widest text-subtle">提交本局成绩</p>
      {startedWithoutName ? (
        <p className="mt-1.5 text-[11px] leading-relaxed text-subtle">{LEADERBOARD_PRIVACY_NOTICE}</p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-muted">{error}</p> : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className={cn(
          "mt-3 h-11 w-full rounded-lg bg-accent text-sm font-medium text-accent-fg",
          "transition-transform duration-150 active:scale-[0.98] disabled:opacity-60",
        )}
      >
        {busy ? "提交中…" : "提交成绩"}
      </button>
    </div>
  );
}

export function hudEligibilityFlags(dev: {
  on: boolean;
  scoreLocked: boolean;
  comboLocked: boolean;
  balance: { session: unknown };
}): EligibilityFlags {
  return runEligibilityFlags({
    sandbox: dev.on,
    balance: Boolean(dev.balance.session),
    scoreLock: dev.scoreLocked,
    comboLock: dev.comboLocked,
  });
}
