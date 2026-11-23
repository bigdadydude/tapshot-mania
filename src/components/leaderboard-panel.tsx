import { useEffect, useRef, useState } from "react";
import type { BallId } from "@/game/balls.ts";
import type { SceneId } from "@/game/scenes.ts";
import type { RunRecap } from "@/game/types.ts";
import { cn } from "@/lib/utils";
import { RecapTable } from "@/components/recap-table";
import { getLeaderboardRun, listLeaderboard, submitLeaderboardRun } from "@/lib/leaderboard/api.ts";
import {
  DEFAULT_NICKNAME,
  LEADERBOARD_PRIVACY_NOTICE,
  type EligibilityFlags,
  type LeaderboardMode,
  type PublicLeaderboardDetail,
  type PublicLeaderboardRow,
  type TimelineEvent,
} from "@/lib/leaderboard/constants.ts";
import { autoSubmitPlan, autoSubmitRunKey } from "@/lib/leaderboard/auto-submit.ts";
import { lastSubmittedFor, runEligibilityFlags } from "@/lib/leaderboard/eligibility.ts";
import { displayNickname, normalizeNickname } from "@/lib/leaderboard/nickname.ts";

export { LEADERBOARD_PRIVACY_NOTICE };

/** Visible-character cap is 16; a higher maxLength leaves room for grapheme clusters. */
const NICKNAME_INPUT_MAX_LENGTH = 32;

type AutoSubmitRecord =
  | { status: "pending"; promise: Promise<"done" | "error"> }
  | { status: "done" }
  | { status: "error"; error: string };

/** Survives React Strict Mode remounts so one run cannot be submitted twice. */
const autoSubmitByRun = new Map<string, AutoSubmitRecord>();

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
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PublicLeaderboardDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setOpenId(null);
    setDetail(null);
    setDetailError(null);
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

  useEffect(() => {
    if (!openId) return;
    let cancelled = false;
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    getLeaderboardRun({ data: { id: openId } })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setDetail(result.run);
          setDetailError(null);
        } else {
          setDetail(null);
          setDetailError(result.error);
        }
        setDetailLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setDetail(null);
        setDetailError("排行榜暂时无法加载");
        setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [openId]);

  function closeDetail() {
    setOpenId(null);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(false);
  }

  return (
    <>
      <div className="pointer-events-auto mb-4 w-full max-w-xs overflow-hidden rounded-xl border border-border bg-bg-elevated">
        <p className="px-4 pt-3 text-[10px] font-medium tracking-widest text-subtle">排行榜</p>
        <p className="px-4 pt-1.5 pb-2 text-[11px] leading-relaxed text-subtle">
          {LEADERBOARD_PRIVACY_NOTICE}
        </p>
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
                <li key={row.id} className="border-b border-border/60 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setOpenId(row.id)}
                    className="flex w-full items-baseline gap-2 py-2 text-left"
                  >
                    <span className="w-6 shrink-0 text-xs tabular-nums text-subtle">
                      {row.rank}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
                      {row.nickname}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-sans text-sm font-semibold tabular-nums text-fg">
                        {row.score}
                      </span>
                      <span className="block text-[11px] tabular-nums text-subtle">
                        ×{row.peakCombo}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {openId ? (
        <div
          className="pointer-events-auto fixed inset-0 z-30 flex flex-col items-center justify-end bg-bg/60 px-4 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-16"
          onClick={closeDetail}
        >
          <div
            className="mb-4 flex max-h-[min(36rem,calc(100dvh-8rem))] w-full max-w-xs flex-col overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading ? (
              <p className="px-4 py-8 text-center text-sm text-subtle">加载中…</p>
            ) : detailError ? (
              <p className="px-4 py-8 text-center text-sm text-muted">{detailError}</p>
            ) : detail ? (
              <RecapTable recap={detail.recap} nickname={detail.nickname} />
            ) : null}
          </div>
          <button
            type="button"
            onClick={closeDetail}
            className="pointer-events-auto h-12 w-full max-w-xs rounded-lg border border-border bg-bg-elevated text-sm font-medium text-fg"
          >
            关闭
          </button>
        </div>
      ) : null}
    </>
  );
}

export function SubmitBoardBlock({
  recap,
  flags,
  nickname,
  submittedByBoard,
  getTimeline,
  onRemember,
  onNicknameChange,
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
  onNicknameChange?: (name: string) => void;
}) {
  const mode = recap.playMode;
  const runKey = mode === "classic" || mode === "minute" ? autoSubmitRunKey(recap) : "";
  const [confirmedName, setConfirmedName] = useState<string | null>(null);
  const savedNickname = nickname || confirmedName || "";
  const plan =
    mode === "classic" || mode === "minute"
      ? autoSubmitPlan({
          mode,
          score: recap.score,
          lastSubmitted: lastSubmittedFor(mode, recap.sceneId, recap.ballId, { submittedByBoard }),
          flags,
          savedNickname,
        })
      : "skip";
  const cached = autoSubmitByRun.get(runKey);

  const [askName, setAskName] = useState(() => plan === "ask-name");
  const [draft, setDraft] = useState(DEFAULT_NICKNAME);
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(() => cached?.status === "pending");
  const [error, setError] = useState<string | null>(() =>
    cached?.status === "error" ? cached.error : null,
  );
  const [done, setDone] = useState(() => cached?.status === "done");
  const [retryTick, setRetryTick] = useState(0);

  const ctxRef = useRef({ recap, flags, getTimeline, onRemember, nickname, mode, runKey });
  ctxRef.current = { recap, flags, getTimeline, onRemember, nickname, mode, runKey };

  function applyCachedStatus(record: AutoSubmitRecord | undefined) {
    if (record?.status === "done") {
      setDone(true);
      setError(null);
      setBusy(false);
      return;
    }
    if (record?.status === "error") {
      setDone(false);
      setError(record.error);
      setBusy(false);
      return;
    }
    if (record?.status === "pending") {
      setBusy(true);
      setError(null);
    }
  }

  function queueSubmit(submitName: string) {
    const key = ctxRef.current.runKey;
    const existing = autoSubmitByRun.get(key);
    if (existing) return;
    const promise = (async (): Promise<"done" | "error"> => {
      const ctx = ctxRef.current;
      const submitMode = ctx.mode;
      if (submitMode !== "classic" && submitMode !== "minute") {
        autoSubmitByRun.set(key, { status: "error", error: "提交失败，请稍后再试" });
        return "error";
      }
      try {
        const result = await submitLeaderboardRun({
          data: {
            nickname: submitName,
            mode: submitMode,
            score: ctx.recap.score,
            recap: ctx.recap,
            timeline: ctx.getTimeline(),
            flags: ctx.flags,
          },
        });
        if (!result.ok) {
          autoSubmitByRun.set(key, { status: "error", error: result.error });
          return "error";
        }
        ctx.onRemember(
          submitMode,
          submitName,
          ctx.recap.score,
          ctx.recap.sceneId,
          ctx.recap.ballId,
        );
        autoSubmitByRun.set(key, { status: "done" });
        return "done";
      } catch {
        autoSubmitByRun.set(key, { status: "error", error: "提交失败，请稍后再试" });
        return "error";
      }
    })();
    autoSubmitByRun.set(key, { status: "pending", promise });
  }

  useEffect(() => {
    if (plan === "submit" && !autoSubmitByRun.has(runKey)) {
      queueSubmit(displayNickname(savedNickname));
    }
    const record = autoSubmitByRun.get(runKey);
    if (!record) return;
    applyCachedStatus(record);
    if (record.status !== "pending") return;
    let cancelled = false;
    void record.promise.then(() => {
      if (!cancelled) applyCachedStatus(autoSubmitByRun.get(runKey));
    });
    return () => {
      cancelled = true;
    };
  }, [plan, runKey, savedNickname, retryTick]);

  function confirmName() {
    const parsed = normalizeNickname(draft);
    if (!parsed.ok) {
      setNameError(parsed.error);
      return;
    }
    setNameError(null);
    setConfirmedName(parsed.nickname);
    setAskName(false);
    onNicknameChange?.(parsed.nickname);
  }

  function retry() {
    if (autoSubmitByRun.get(runKey)?.status === "error") autoSubmitByRun.delete(runKey);
    setRetryTick((n) => n + 1);
  }

  if (!done && !busy && !error && plan === "skip") return null;

  const showModal = plan === "ask-name" && askName && !done && !busy && !error;

  return (
    <>
      {showModal ? (
        <div
          className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-bg/70 px-6"
          onClick={(e) => {
            e.stopPropagation();
            setAskName(false);
          }}
        >
          <div
            className="w-full max-w-xs rounded-xl border border-border bg-bg-elevated p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-1 text-center text-xs font-medium tracking-widest text-muted">
              填写名称
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-subtle">
              {LEADERBOARD_PRIVACY_NOTICE}
            </p>
            <input
              type="text"
              value={draft}
              maxLength={NICKNAME_INPUT_MAX_LENGTH}
              autoComplete="off"
              enterKeyHint="done"
              aria-label="名称"
              autoFocus
              onChange={(e) => {
                setNameError(null);
                setDraft(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                confirmName();
              }}
              className="mt-3 h-11 w-full rounded-lg border border-border bg-bg-subtle px-3 font-sans text-base font-semibold text-fg outline-none"
            />
            {nameError ? <p className="mt-1.5 text-xs text-muted">{nameError}</p> : null}
            <button
              type="button"
              onClick={confirmName}
              className="mt-4 h-11 w-full rounded-lg bg-accent text-sm font-medium text-accent-fg transition-transform duration-150 active:scale-[0.98]"
            >
              确定
            </button>
            <button
              type="button"
              onClick={() => setAskName(false)}
              className="mt-2 h-11 w-full rounded-lg border border-border bg-bg-subtle text-sm font-medium text-fg"
            >
              取消
            </button>
          </div>
        </div>
      ) : null}
      {done ? (
        <div className="mb-3 w-full max-w-xs shrink-0 rounded-xl border border-border bg-bg-elevated px-4 py-3 text-center">
          <p className="text-sm text-fg">已提交到排行榜</p>
        </div>
      ) : busy ? (
        <div className="mb-3 w-full max-w-xs shrink-0 rounded-xl border border-border bg-bg-elevated px-4 py-3 text-center">
          <p className="text-sm text-fg">提交中…</p>
        </div>
      ) : error ? (
        <div
          className="mb-3 w-full max-w-xs shrink-0 rounded-xl border border-border bg-bg-elevated px-4 py-3 text-left"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-xs text-muted">{error}</p>
          <button
            type="button"
            onClick={() => retry()}
            className={cn(
              "mt-3 h-11 w-full rounded-lg bg-accent text-sm font-medium text-accent-fg",
              "transition-transform duration-150 active:scale-[0.98]",
            )}
          >
            重试
          </button>
        </div>
      ) : plan === "ask-name" && !askName ? (
        <div
          className="mb-3 w-full max-w-xs shrink-0 rounded-xl border border-border bg-bg-elevated px-4 py-3 text-left"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-[11px] leading-relaxed text-subtle">填写名称后即可上传成绩</p>
          <button
            type="button"
            onClick={() => {
              setDraft(DEFAULT_NICKNAME);
              setNameError(null);
              setAskName(true);
            }}
            className={cn(
              "mt-3 h-11 w-full rounded-lg bg-accent text-sm font-medium text-accent-fg",
              "transition-transform duration-150 active:scale-[0.98]",
            )}
          >
            填写名称
          </button>
        </div>
      ) : null}
    </>
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
