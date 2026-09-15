#!/usr/bin/env node
/**
 * Summarize a hand-play recording JSON (same metrics as the ninja 360 demo).
 *   node --experimental-strip-types scripts/summarize-recording.mjs path.json
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  formatRecordingSummary,
  parseRecordingSessions,
  summarizePlayRecording,
} from "../src/game/ai/analyze-recording.ts";

const path = process.argv[2];
if (!path) {
  console.error("usage: node --experimental-strip-types scripts/summarize-recording.mjs <recording.json>");
  process.exit(2);
}
const sessions = parseRecordingSessions(JSON.parse(readFileSync(resolve(path), "utf8")));
if (sessions.length > 1) console.log(`${sessions.length} sessions\n`);
for (let i = 0; i < sessions.length; i++) {
  if (sessions.length > 1) console.log(`--- session ${i + 1} ---`);
  const sum = summarizePlayRecording(sessions[i]);
  console.log(formatRecordingSummary(sum));
  if (process.argv.includes("--json")) console.log(JSON.stringify(sum, null, 2));
}
