import { DEFAULT_NICKNAME, NICKNAME_MAX_CHARS } from "./constants.ts";

export { DEFAULT_NICKNAME };

export function visibleCharCount(text: string): number {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    let n = 0;
    for (const _ of segmenter.segment(text)) n += 1;
    return n;
  }
  return [...text].length;
}

export type NicknameResult =
  | { ok: true; nickname: string }
  | { ok: false; error: string };

/** Trim, reject empty, allow 1–16 visible characters. Empty is not a stored name. */
export function normalizeNickname(raw: unknown): NicknameResult {
  if (typeof raw !== "string") return { ok: false, error: "请输入昵称" };
  const nickname = raw.trim();
  if (!nickname) return { ok: false, error: "请输入昵称" };
  if (visibleCharCount(nickname) > NICKNAME_MAX_CHARS) {
    return { ok: false, error: "昵称最多 16 个字" };
  }
  return { ok: true, nickname };
}

/** Saved nicknames: keep a still-valid value, otherwise empty (use the display default). */
export function parseSavedNickname(raw: unknown): string {
  const parsed = normalizeNickname(typeof raw === "string" ? raw : "");
  return parsed.ok ? parsed.nickname : "";
}

/** Recap/submit display name. An empty saved nickname shows the default, and is not itself persisted. */
export function displayNickname(saved: string | null | undefined): string {
  return saved ? saved : DEFAULT_NICKNAME;
}

export type NameCommitResult =
  | { action: "none"; display: string }
  | { action: "save"; saved: string; display: string }
  | { action: "error"; error: string; display: string };

/**
 * Commit a recap name edit.
 * Unchanged (not dirty) focus/blur does not persist the default.
 * Empty/whitespace clears the saved name and shows the default.
 * A valid edit, including typing the default as a real change, is saved.
 * Too-long input is rejected and left in the field.
 */
export function commitDisplayName(opts: {
  draft: string;
  saved: string;
  dirty: boolean;
}): NameCommitResult {
  if (!opts.dirty) {
    return { action: "none", display: displayNickname(opts.saved) };
  }
  const trimmed = opts.draft.trim();
  if (!trimmed) {
    return { action: "save", saved: "", display: DEFAULT_NICKNAME };
  }
  const parsed = normalizeNickname(opts.draft);
  if (!parsed.ok) {
    return { action: "error", error: parsed.error, display: opts.draft };
  }
  return { action: "save", saved: parsed.nickname, display: parsed.nickname };
}
