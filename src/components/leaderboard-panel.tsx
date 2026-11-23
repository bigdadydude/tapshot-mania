import { useEffect, useState } from "react";
import type { BallId } from "@/game/balls.ts";
import type { SceneId } from "@/game/scenes.ts";
import type { RunRecap } from "@/game/types.ts";
import { cn } from "@/lib/utils";
import { listLeaderboard, submitLeaderboardRun } from "@/lib/leaderboard/api.ts";
import { LEADERBOARD_PRIVACY_NOTICE, type EligibilityFlags, type LeaderboardMode, type PublicLeaderboardRow, type TimelineEvent } from "@/lib/leaderboard/constants.ts";
import { lastSubmittedFor, runEligibilityFlags, shouldOfferSubmit } from "@/lib/leaderboard/eligibility.ts";
import { displayNickname } from "@/lib/leaderboard/nickname.ts";

export { LEADERBOARD_PRIVACY_NOTICE };

export function LeaderboardPanel({
  mode,
  sceneId,
  ballId,
}: {
  mode: LeaderboardMode;
  sceneId: SceneId;
  ballId: BallId;
}) {
  const [rows, setRows] = useState<PublicLeaderboardRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listLeaderboard({ data: { mode, sceneId, ballId } })
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
  }, [mode, sceneId, ballId]);

  return (
    <div className="pointer-events-auto mb-4 w-full max-w-xs overflow-hidden rounded-xl border border-border bg-bg-elevated">
      <p className="px-4 pt-3 text-[10px] font-medium tracking-widest text-subtle">排行榜</p>
      <p className="px-4 pt-1.5 pb-2 text-[11px] leading-relaxed text-subtle">{LEADERBOARD_PRIVACY_NOTICE}</p>
      <div
        className="max-h-[min(10rem,28dvh)] overflow-y-auto overscroll-contain border-t border-border touch-pan-y [-webkit-overflow-scrolling:touch]"
        style={{ touchAction: "pan-y", WebkitOverflowScrolling: "touch" }}
      >
        {loading ? (
          <p className="px-4 py-5 text-center text-sm text-subtle">加载中…</p>
        ) : error ? (
          <p className="px-4 py-5 text-center text-sm text-muted">{error}</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-5 text-center text-sm text-subtle">暂无成绩</p>
        ) : (
          <ul className="px-3 py-1">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex items-baseline gap-2 border-b border-border/60 py-2 last:border-b-0"
              >
                <span className="w-6 shrink-0 text-xs tabular-nums text-subtle">{row.rank}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{row.nickname}</span>
                <span className="shrink-0 text-right">
                  <span className="block font-sans text-sm font-semibold tabular-nums text-fg">
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
  );
}

export function SubmitBoardBlock({
  recap,
  flags,
  nickname,
  submittedByBoard,
  getTimeline,
  onRemember,
}: {
  recap: RunRecap;
  flags: EligibilityFlags;
  nickname: string;
  submittedByBoard: Record<string, number>;
  getTimeline: () => TimelineEvent[];
  onRemember: (
    mode: LeaderboardMode,
    nickname: string,
    score: number,
    sceneId: SceneId,
    ballId: BallId,
  ) => void;
}) {
  const mode = recap.playMode;
  const eligibleOffer =
    (mode === "classic" || mode === "minute") &&
    shouldOfferSubmit({
      mode,
      score: recap.score,
      lastSubmitted: lastSubmittedFor(mode, recap.sceneId, recap.ballId, { submittedByBoard }),
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
      onRemember(mode, submitName, recap.score, recap.sceneId, recap.ballId);
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
