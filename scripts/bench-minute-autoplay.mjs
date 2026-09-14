/**
 * 1-minute auto-play benchmark (measurement only).
 *
 * Usage: node scripts/bench-minute-autoplay.mjs [url] [runs=3]
 *
 * Skips glass (owner-requested) and prison (playable: false).
 * Champion ball cannot enter 1-minute; one probe records that.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const url = process.argv[2] || "http://127.0.0.1:8080/";
const minRuns = Math.max(3, Number(process.argv[3] || 3));
const concurrency = Math.max(1, Number(process.env.BENCH_CONCURRENCY || 3));

const BALLS = [
  { id: "plain", name: "经典球" },
  { id: "ninja", name: "忍者球" },
  { id: "rubber", name: "弹力球" },
  { id: "lava", name: "燃烧球" },
  { id: "frost", name: "冰冻球" },
  { id: "anti", name: "反重力球" },
  { id: "champ", name: "冠军球", minuteBlocked: true },
];

mkdirSync("/workspace/screenshots", { recursive: true });

function pool(limit, items, worker) {
  let i = 0;
  const out = new Array(items.length);
  async function spin() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await worker(items[idx], idx);
    }
  }
  const n = Math.min(limit, items.length);
  return Promise.all(Array.from({ length: n }, spin)).then(() => out);
}

async function probeChamp(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForFunction(() => typeof window.__tq !== "undefined", null, { timeout: 25000 });
    await page.getByRole("button", { name: "开始" }).waitFor({ timeout: 20000 });
    await page.evaluate(() => {
      window.__tq?.goTitle?.();
      window.__tq?.setBall?.("champ");
    });
    await page.waitForTimeout(250);
    const minuteBtn = page.getByRole("button", { name: /固定时长/ });
    const disabled = await minuteBtn.isDisabled().catch(() => true);
    const before = await page.evaluate(() => {
      const t = window.__tq?.snapshot?.();
      return { playMode: t?.playMode, ballId: t?.ballId };
    });
    if (!disabled) {
      await minuteBtn.click();
      await page.waitForTimeout(200);
    }
    const after = await page.evaluate(() => {
      const t = window.__tq?.snapshot?.();
      return { playMode: t?.playMode, ballId: t?.ballId };
    });
    return {
      ball: "champ",
      name: "冠军球",
      skipped: true,
      note: "冠军球不可用于1分钟（选中后「1分钟」按钮禁用；强切会退回经典模式）",
      disabled,
      before,
      after,
      errors,
    };
  } catch (err) {
    return {
      ball: "champ",
      name: "冠军球",
      skipped: true,
      note: `冠军球探测失败：${err?.message || err}`,
      errors,
    };
  } finally {
    await page.close();
  }
}

async function runGame(browser, ball, run) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const started = Date.now();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForFunction(() => typeof window.__tq !== "undefined", null, { timeout: 25000 });
    await page.getByRole("button", { name: "开始" }).waitFor({ timeout: 20000 });
    await page.evaluate((id) => {
      window.__tq?.goTitle?.();
      window.__tq?.setBall?.(id);
    }, ball);
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: /固定时长/ }).click();
    await page.waitForTimeout(150);
    await page.evaluate((id) => window.__tq?.setBall?.(id), ball);
    const mode = await page.evaluate(() => window.__tq?.snapshot?.()?.playMode);
    if (mode !== "minute") {
      return {
        ball,
        run,
        ok: false,
        note: `未能进入1分钟（playMode=${mode}）`,
        score: null,
        maxStreak: 0,
        maxCombo: 0,
        makes: 0,
        errors,
        elapsedMs: Date.now() - started,
      };
    }
    await page.getByRole("button", { name: "开始" }).click();
    await page.waitForFunction(() => window.__tq?.snapshot?.()?.phase === "playing", null, {
      timeout: 12000,
    });
    await page.evaluate(() => window.__tq?.setAutoPlay?.(true));

    let lastMade = 0;
    let maxStreak = 0;
    let maxCombo = 0;
    let armedAt = 0;
    const deadline = Date.now() + 125000;
    let endSnap = null;

    while (Date.now() < deadline) {
      const s = await page.evaluate(() => {
        const t = window.__tq?.snapshot?.();
        if (!t) return null;
        return {
          phase: t.phase,
          score: t.score,
          combo: t.combo,
          streak: t.streak,
          madeCount: t.madeCount,
          timer: t.timer,
          timerArmed: t.timerArmed,
          playMode: t.playMode,
          ballId: t.ballId,
        };
      });
      if (!s) break;
      maxStreak = Math.max(maxStreak, s.streak || 0);
      maxCombo = Math.max(maxCombo, s.combo || 0);
      lastMade = Math.max(lastMade, s.madeCount || 0);
      if (s.timerArmed && !armedAt) armedAt = Date.now();
      if (s.phase === "over") {
        endSnap = s;
        break;
      }
      if (!s.timerArmed && Date.now() - started > 50000) {
        endSnap = s;
        return {
          ball,
          run,
          ok: false,
          note: "首球60秒内未进球，1分钟倒计时未启动",
          score: s.score ?? 0,
          maxStreak,
          maxCombo,
          makes: lastMade,
          errors,
          elapsedMs: Date.now() - started,
          end: s,
        };
      }
      await page.waitForTimeout(90);
    }

    if (!endSnap) {
      endSnap = await page.evaluate(() => window.__tq?.snapshot?.() || null);
    }
    const shot = `/workspace/screenshots/bench-${ball}-r${run}.png`;
    await page.screenshot({ path: shot, fullPage: false });
    await page.evaluate(() => window.__tq?.setAutoPlay?.(false));

    const finished = endSnap?.phase === "over" && endSnap?.playMode === "minute";
    return {
      ball,
      run,
      ok: finished,
      note: finished ? "" : `未正常结束（phase=${endSnap?.phase}, mode=${endSnap?.playMode}）`,
      score: endSnap?.score ?? 0,
      maxStreak,
      maxCombo,
      makes: lastMade,
      errors,
      elapsedMs: Date.now() - started,
      armed: Boolean(armedAt),
      shot,
      end: endSnap
        ? {
            phase: endSnap.phase,
            score: endSnap.score,
            playMode: endSnap.playMode,
            madeCount: endSnap.madeCount,
            ballId: endSnap.ballId,
          }
        : null,
    };
  } catch (err) {
    return {
      ball,
      run,
      ok: false,
      note: `崩溃/超时：${err?.message || err}`,
      score: null,
      maxStreak: 0,
      maxCombo: 0,
      makes: 0,
      errors,
      elapsedMs: Date.now() - started,
    };
  } finally {
    await page.close();
  }
}

function varianceHigh(runs) {
  const scores = runs.filter((r) => r.ok && typeof r.score === "number").map((r) => r.score);
  if (scores.length < 3) return true;
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (mean <= 0) return max - min > 20;
  return (max - min) / mean > 0.4 || max - min > 120;
}

function summarize(name, id, runs, extra = {}) {
  const ok = runs.filter((r) => r.ok && typeof r.score === "number");
  const scores = ok.map((r) => r.score);
  const streaks = ok.map((r) => r.maxStreak);
  return {
    id,
    name,
    runs: runs.length,
    scores,
    streaks,
    bestScore: scores.length ? Math.max(...scores) : null,
    bestStreak: streaks.length ? Math.max(...streaks) : null,
    makes: ok.map((r) => r.makes),
    notes: [...new Set(runs.map((r) => r.note).filter(Boolean))],
    crashes: runs.filter((r) => (r.errors || []).length || /崩溃/.test(r.note || "")),
    ...extra,
  };
}

function markdownTable(rows) {
  const lines = [
    "| 球种 | 轮次 | 分数列表 | 最高分 | 最大连击（各轮） | 最大连击（最佳） |",
    "| --- | ---: | --- | ---: | --- | ---: |",
  ];
  for (const r of rows) {
    if (r.skipped) {
      lines.push(`| ${r.name} | 0 | — | — | — | — |`);
      continue;
    }
    const scores = r.scores.length ? r.scores.join(" / ") : "—";
    const streaks = r.streaks.length ? r.streaks.join(" / ") : "—";
    lines.push(
      `| ${r.name} | ${r.runs} | ${scores} | ${r.bestScore ?? "—"} | ${streaks} | ${r.bestStreak ?? "—"} |`,
    );
  }
  return lines.join("\n");
}

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const champ = await probeChamp(browser);

const jobs = [];
for (const b of BALLS) {
  if (b.minuteBlocked) continue;
  for (let run = 1; run <= minRuns; run++) jobs.push({ id: b.id, run });
}

let results = await pool(concurrency, jobs, (j) => runGame(browser, j.id, j.run));

const byBall = {};
for (const b of BALLS) {
  if (b.minuteBlocked) continue;
  byBall[b.id] = results.filter((r) => r.ball === b.id).sort((a, c) => a.run - c.run);
}

const extraJobs = [];
for (const b of BALLS) {
  if (b.minuteBlocked) continue;
  const runs = byBall[b.id];
  if (varianceHigh(runs)) {
    extraJobs.push({ id: b.id, run: runs.length + 1 });
    extraJobs.push({ id: b.id, run: runs.length + 2 });
  }
}

if (extraJobs.length) {
  const extra = await pool(concurrency, extraJobs, (j) => runGame(browser, j.id, j.run));
  results = results.concat(extra);
  for (const b of BALLS) {
    if (b.minuteBlocked) continue;
    byBall[b.id] = results.filter((r) => r.ball === b.id).sort((a, c) => a.run - c.run);
  }
}

await browser.close();

const tableRows = BALLS.map((b) => {
  if (b.minuteBlocked) {
    return { id: b.id, name: b.name, skipped: true, note: champ.note };
  }
  return summarize(b.name, b.id, byBall[b.id] || []);
});

const report = {
  url,
  minRuns,
  extraRuns: extraJobs.length,
  champ,
  balls: tableRows,
  raw: results,
  generatedAt: new Date().toISOString(),
};

writeFileSync("/workspace/screenshots/bench-minute-results.json", JSON.stringify(report, null, 2));
console.log(markdownTable(tableRows));
console.log("");
for (const r of tableRows) {
  if (r.skipped) {
    console.log(`- ${r.name}: ${r.note || champ.note}`);
    continue;
  }
  const fail = (byBall[r.id] || []).filter((x) => !x.ok);
  const crash = (byBall[r.id] || []).filter((x) => (x.errors || []).length);
  if (fail.length || crash.length || r.notes.length) {
    console.log(
      `- ${r.name}: makes=${(r.makes || []).join("/")} notes=${r.notes.join("；") || "ok"} fail=${fail.length} crash=${crash.length}`,
    );
  } else {
    console.log(`- ${r.name}: makes=${(r.makes || []).join("/")} 全部正常结束`);
  }
}
console.log("\nJSON /workspace/screenshots/bench-minute-results.json");
