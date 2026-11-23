import { useEffect, useRef, useState } from "react";
import { recapRows } from "@/game/run-recap";
import type { RunRecap } from "@/game/types.ts";
import { commitDisplayName, displayNickname } from "@/lib/leaderboard/nickname.ts";

function RecapNameRow({
  nickname,
  onNicknameChange,
}: {
  nickname: string;
  onNicknameChange?: (name: string) => void;
}) {
  const [value, setValue] = useState(() => displayNickname(nickname));
  const [error, setError] = useState<string | null>(null);
  const dirty = useRef(false);
  const focused = useRef(false);

  useEffect(() => {
    if (focused.current) return;
    setValue(displayNickname(nickname));
    setError(null);
  }, [nickname]);

  function commit() {
    const result = commitDisplayName({ draft: value, saved: nickname, dirty: dirty.current });
    if (result.action === "error") {
      setError(result.error);
      setValue(result.display);
      return;
    }
    setError(null);
    setValue(result.display);
    dirty.current = false;
    if (result.action === "save" && result.saved !== nickname) {
      onNicknameChange?.(result.saved);
    }
  }

  return (
    <div className="border-b border-border/60 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="shrink-0 text-sm text-muted">名称</span>
        <input
          type="text"
          value={value}
          maxLength={32}
          autoComplete="off"
          enterKeyHint="done"
          aria-label="名称"
          onChange={(e) => {
            dirty.current = true;
            setError(null);
            setValue(e.target.value);
          }}
          onFocus={() => {
            focused.current = true;
          }}
          onBlur={() => {
            focused.current = false;
            commit();
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            (e.currentTarget as HTMLInputElement).blur();
          }}
          className="min-w-0 flex-1 bg-transparent text-right font-sans text-base font-semibold text-fg outline-none"
        />
      </div>
      {error ? <p className="mt-1 text-right text-xs text-muted">{error}</p> : null}
    </div>
  );
}

function RecapNameReadOnly({ nickname }: { nickname: string }) {
  return (
    <div className="border-b border-border/60 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="shrink-0 text-sm text-muted">名称</span>
        <span className="min-w-0 flex-1 truncate text-right font-sans text-base font-semibold text-fg">
          {nickname}
        </span>
      </div>
    </div>
  );
}

export function RecapTable({
  recap,
  hideRogueDuplicates = false,
  nickname = "",
  onNicknameChange,
  nameEditable = true,
}: {
  recap: RunRecap;
  hideRogueDuplicates?: boolean;
  nickname?: string;
  onNicknameChange?: (name: string) => void;
  nameEditable?: boolean;
}) {
  const rows = recapRows(recap, { hideRogueDuplicates });
  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch]"
      style={{ touchAction: "pan-y", WebkitOverflowScrolling: "touch" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-4 py-2">
        <p className="mb-1 text-[10px] font-medium tracking-widest text-subtle">本局数据</p>
        <div className="space-y-0">
          {nameEditable ? (
            <RecapNameRow nickname={nickname} onNicknameChange={onNicknameChange} />
          ) : (
            <RecapNameReadOnly nickname={nickname} />
          )}
          {rows.map((row) => (
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
    </div>
  );
}
