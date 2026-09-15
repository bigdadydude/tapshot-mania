# Hand-play recording

In-game **录制**. Isolated from physics, scoring, and 代打. Default **OFF**.
When off the engine never calls into this module beyond a boolean check — no
buffers, no download, no extra geometry.

Session-only. Nothing is written to save / `localStorage`. A **pack** JSON
downloads when you turn 录制 **off** (or tap export) — not after every game.

## How to capture

1. Turn on **录制** (chip next to 代打, or pause / 设置).
2. Play as usual. Sampling is ~30Hz (every 2 physics frames). Every tap and
   discrete event is stored at full fidelity.
3. Start another game with 录制 still on — that run is **appended**. Prior
   games stay in the pack.
4. Turn 录制 off (or export). One `.json` file downloads with every finished
   game in `sessions[]`.

The chip shows `录制中 · N局` once more than one game is in the pack.

## File shape (version 2 pack)

```json
{
  "version": 2,
  "recordedAt": "2026-09-15T00:20:00.000Z",
  "sessions": [
    { "version": 1, "mode": "classic", "ballId": "plain", "samples": [], "taps": [], "events": [] }
  ]
}
```

Each `sessions[i]` is a **v1 single-game** recording (same fields as the
original one-file-per-run export). Old v1 files (top-level `samples` / `taps` /
`events`, no `sessions`) still parse.

`endReason` on a session: `over` (shot clock / fail), `stop` (toggle off or
返回主界面), `restart` (新一局 while a live take was open).

### Session fields

```json
{
  "version": 1,
  "recordedAt": "2026-09-14T22:40:00.000Z",
  "mode": "classic",
  "ballId": "plain",
  "world": { "w": 390, "h": 844, "floorY": 760 },
  "sampleHz": 30,
  "step": 0.016666666666666666,
  "duration": 12.4,
  "frames": 744,
  "score": 18,
  "combo": 4,
  "endReason": "over",
  "samples": [],
  "taps": [],
  "events": []
}
```

### `samples[]` (downsampled path)

| Key | Meaning |
| --- | --- |
| `t` | Seconds from run start (physics clock, not wall clock) |
| `f` | Physics frame index (60Hz). Sample i maps to `f ≈ i × 2` |
| `x` `y` `vx` `vy` | Ball position / velocity (px, px/s), 0.1 precision |
| `hs` | Active hoop side: `-1` left, `+1` right |
| `hx` `hy` | Rim center |
| `hi` | Rim inner half-width |
| `ht` | Rim tube radius |
| `hm` | Hoop is on a move pattern |
| `bx` `by` `bw` `bh` | Backboard AABB (`visX`, `visY`, `visW`, height) |
| `s` | Score at this sample |
| `c` | Combo / streak shown in HUD |
| `am` | Antimatter orb if present: `{ id, x, y, r, pct }` |
| `orbs` | Pack alias: `[am]`. Some captures only have this array; analyzer reads either |
| `ac` | Antimatter charge 0–100 (omitted when idle at 0) |
| `ho` | Black hole if open: `{ x, y, r, left }` (`left` = seconds remaining) |

`am` / `orbs` / `ac` / `ho` appear only on anti-gravity / antimatter games. Reconstruct
orb paths by interpolating `am.x, am.y` (or `orbs[0]`) over `t`. `id` is unique within the
session (increments on each spawn).

### `taps[]`

| Key | Meaning |
| --- | --- |
| `t` `f` | Physics time / frame of the tap |
| `src` | `"player"` finger/keyboard, `"ai"` 代打 |
| `x` `y` `vx` `vy` | Ball state **after** the jump impulse |

### `events[]`

| `kind` | When |
| --- | --- |
| `start` | Run began |
| `score` | Make. `finish` is `swish` / `bank` / `rim`. `hs` is the hoop that scored. `ghost` marks clone/mini makes |
| `hoop` | Active stand changed (`hs` is the new side) |
| `miss` | Attempt settled as a miss |
| `rim` | Rim contact (debounced ~50ms) |
| `bank` | Backboard / brace contact (debounced) |
| `wrap` | Screen wrap. `wrap` is `ground` or `height` |
| `anti-spawn` | Antimatter orb appeared. `antiId`, `pct` (charge that orb is worth), `x` `y` |
| `anti-collect` | Orb collected. `antiId`, `pct` added, `charge` after pickup |
| `hole-open` | Black hole opened. `hole` is `{ x, y, r, left }` |
| `hole-close` | Black hole closed |
| `over` | Game over |
| `stop` | Recording stopped mid-run |

Optional extras on an event: `x` `y` (ball), `score` `combo` at that instant.

## Learning later

This dump is capture-only. Param-driven 代打 (`src/game/ai/`) can later fit
tactics from `taps` + nearby `samples` (release height, bank vs swirl, wrap
recoveries) and antimatter policy #8 from `am` / `anti-collect` / `hole-open`.
Do not treat this file as a policy.

Summarize a v1 file or a v2 pack:
`node --experimental-strip-types scripts/summarize-recording.mjs <file.json>`

## QA hook

`window.__tq.setRecording(true|false)` and `window.__tq.exportRecording()`
return the **v2 pack** (`sessions[]`). A v1-shaped live take is still on
`sessions[0]` while a single game is open.
