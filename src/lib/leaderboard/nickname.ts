import { NICKNAME_MAX_CHARS } from "./constants.ts";

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

/** Trim, reject empty, allow 1–16 visible characters. No default nickname. */
export function normalizeNickname(raw: unknown): NicknameResult {
  if (typeof raw !== "string") return { ok: false, error: "请输入昵称" };
  const nickname = raw.trim();
  if (!nickname) return { ok: false, error: "请输入昵称" };
  if (visibleCharCount(nickname) > NICKNAME_MAX_CHARS) {
    return { ok: false, error: "昵称最多 16 个字" };
  }
  return { ok: true, nickname };
}

/** Saved nicknames: keep a still-valid value, otherwise empty (player must re-enter). */
export function parseSavedNickname(raw: unknown): string {
  const parsed = normalizeNickname(typeof raw === "string" ? raw : "");
  return parsed.ok ? parsed.nickname : "";
}
