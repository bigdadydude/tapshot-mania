import { useEffect, useRef, useState } from "react";
import { commitDisplayName, displayNickname } from "@/lib/leaderboard/nickname.ts";

/** Visible-character cap is 16; a higher maxLength leaves room for grapheme clusters. */
const NICKNAME_INPUT_MAX_LENGTH = 32;

export function NicknameField({
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
    <div>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg-subtle px-3 py-2">
        <span className="shrink-0 text-sm text-fg">名称</span>
        <input
          type="text"
          value={value}
          maxLength={NICKNAME_INPUT_MAX_LENGTH}
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
