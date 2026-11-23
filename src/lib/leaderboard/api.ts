import { createServerFn } from "@tanstack/react-start";
import { parseListMode, parseRunId, parseSubmitPayload } from "./payload.ts";
import type { PublicLeaderboardDetail, PublicLeaderboardRow } from "./constants.ts";

export type ListLeaderboardResult =
  | { ok: true; rows: PublicLeaderboardRow[] }
  | { ok: false; error: string; rows: PublicLeaderboardRow[] };

export type SubmitLeaderboardResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export type GetLeaderboardRunResult =
  | { ok: true; run: PublicLeaderboardDetail }
  | { ok: false; error: string };

export const listLeaderboard = createServerFn({ method: "GET" })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<ListLeaderboardResult> => {
    const parsed = parseListMode(data);
    if (!parsed.ok) return { ok: false, error: parsed.error, rows: [] };
    try {
      const { getSql } = await import("@/lib/db");
      const { listPublicBoard } = await import("./store");
      const sql = await getSql();
      const rows = await listPublicBoard(sql, parsed.value);
      return { ok: true, rows };
    } catch {
      return { ok: false, error: "排行榜暂时无法加载", rows: [] };
    }
  });

export const getLeaderboardRun = createServerFn({ method: "GET" })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<GetLeaderboardRunResult> => {
    const parsed = parseRunId(data);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    try {
      const { getSql } = await import("@/lib/db");
      const { getPublicRun } = await import("./store");
      const sql = await getSql();
      const run = await getPublicRun(sql, parsed.value);
      if (!run) return { ok: false, error: "找不到该成绩" };
      return { ok: true, run };
    } catch {
      return { ok: false, error: "排行榜暂时无法加载" };
    }
  });

export const submitLeaderboardRun = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<SubmitLeaderboardResult> => {
    try {
      const { assertSameSiteRequest } = await import("@/lib/auth/isolation.server");
      assertSameSiteRequest();
    } catch (err) {
      if (err && typeof err === "object" && (err as { name?: string }).name === "CrossSiteRequestError") {
        return { ok: false, error: "提交失败，请稍后再试" };
      }
      throw err;
    }
    const parsed = parseSubmitPayload(data);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    try {
      const { getSql } = await import("@/lib/db");
      const { insertLeaderboardRun } = await import("./store");
      const sql = await getSql();
      const inserted = await insertLeaderboardRun(sql, parsed.value);
      return { ok: true, id: inserted.id };
    } catch {
      return { ok: false, error: "提交失败，请稍后再试" };
    }
  });
