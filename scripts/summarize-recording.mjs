#!/usr/bin/env node
/**
 * Summarize a hand-play recording JSON (same metrics as the ninja 360 demo).
 *   node --experimental-strip-types scripts/summarize-recording.mjs path.json
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  formatRecordingSummary,
  parseRecordingJson,
  summarizePlayRecording,
} from "../src/game/ai/analyze-recording.ts";

const path = process.argv[2];
if (!path) {
  console.error("usage: node --experimental-strip-types scripts/summarize-recording.mjs <recording.json>");
  process.exit(2);
}
const rec = parseRecordingJson(JSON.parse(readFileSync(resolve(path), "utf8")));
const sum = summarizePlayRecording(rec);
console.log(formatRecordingSummary(sum));
if (process.argv.includes("--json")) console.log(JSON.stringify(sum, null, 2));
