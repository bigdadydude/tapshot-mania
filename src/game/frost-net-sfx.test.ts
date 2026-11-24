import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { shouldPlayNetSwish } from "./frost-net.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const engine = readFileSync(new URL("./engine.ts", import.meta.url), "utf8");
const audio = readFileSync(new URL("./audio.ts", import.meta.url), "utf8");
const TEMP_NET_SHATTER_SRC = "/game/scenes/street/sfx/rim-3.mp3";

test("registerScore only plays 刷网 when the scored net is intact", () => {
  const swishCalls = [...engine.matchAll(/audio\.swish\(\);/g)];
  assert.equal(swishCalls.length, 2, "both score-path swish calls stay gated");
  for (const match of swishCalls) {
    const start = Math.max(0, (match.index ?? 0) - 80);
    const window = engine.slice(start, (match.index ?? 0) + match[0].length);
    assert.match(window, /if \(shouldPlayNetSwish\(scoredHoop\)\) audio\.swish\(\);/);
  }
  assert.equal(shouldPlayNetSwish({ netShattered: true }), false);
  assert.equal(shouldPlayNetSwish({ netShattered: false }), true);
});

test("breaking a frozen net plays the temporary destroy SFX before particle work", () => {
  const start = engine.indexOf("function breakFrozenNet(");
  const end = engine.indexOf("function frostSmoke(", start);
  assert.ok(start >= 0 && end > start, "locate breakFrozenNet");
  const body = engine.slice(start, end);
  assert.match(
    body,
    /if \(!shatterFrozenNet\(h\)\) return;\s*audio\.netShatter\(\);\s*if \(!gfx\.particles\) return;/,
  );
});

test("temporary net-destroy SFX reuses an existing in-repo impact clip", () => {
  assert.match(audio, /export const TEMP_NET_SHATTER_SRC = "\/game\/scenes\/street\/sfx\/rim-3\.mp3";/);
  const publicPath = join(root, "public", TEMP_NET_SHATTER_SRC.replace(/^\//, ""));
  assert.equal(existsSync(publicPath), true, publicPath);
  assert.match(audio, /netShatter\(\) \{/);
  assert.match(audio, /fetch\(TEMP_NET_SHATTER_SRC\)/);
  assert.match(audio, /playBuf\(netShatterBuf,/);
});
