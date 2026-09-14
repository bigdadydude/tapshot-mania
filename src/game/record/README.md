# Hand-play recording

In-game **录制**. Isolated from physics, scoring, and 代打. Default **OFF**.
When off the engine never calls into this module beyond a boolean check — no
buffers, no download, no extra geometry.

Session-only. Nothing is written to save / `localStorage`. A JSON file is
downloaded when a run ends (game over, return to title, restart) or when the
toggle is switched off with data.

## How to capture

1. Turn on **录制** (chip next to 代打, or pause / 设置).
2. Play as usual. Sampling is ~30Hz (every 2 physics frames). Every tap and
   discrete event is stored at full fidelity.
3. Finish the run or turn 录制 off. A `.json` file downloads.

Several games in a row: leave 录制 on. Each game over (and each restart)
exports that run, then the next start begins a fresh file.

## File shape

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

`endReason`: `over` (shot clock / fail), `stop` (toggle off or 返回主界面),
`restart` (新一局 while a live take was open).

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

Reconstruct the ball path by interpolating `x,y` over `t`. Hoop switches show
up as `hs` flipping, usually right after a `score` event.

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
| `over` | Game over |
| `stop` | Recording stopped mid-run |

Optional extras on an event: `x` `y` (ball), `score` `combo` at that instant.

## Learning later

This dump is capture-only. Param-driven 代打 (`src/game/ai/`) can later fit
tactics from `taps` + nearby `samples` (release height, bank vs swirl, wrap
recoveries). Do not treat this file as a policy.

## QA hook

`window.__tq.setRecording(true|false)` and `window.__tq.exportRecording()`
return the same JSON the download uses.
