# Auto-play AI

In-game **自动代打** (demo / AFK). Isolated from the shot clock, physics, and
scoring. Default **OFF**. When off, the controller is never asked to tap and
its cooldown / last decision are cleared — manual play is unchanged.

## How it is wired today

1. Settings (title pause button → 设置) and the in-game pause sheet both expose
   **自动代打**. A small **代打** chip next to pause also toggles while playing.
2. `GameHandle.setAutoPlay(on)` is the only engine API. HUD reads `hud.autoPlay`.
3. Each physics step, if enabled, the engine builds an `AiWorld` snapshot and
   calls `controller.tick(snapshot)`. A `true` result invokes the **same**
   `tapJump()` path as a finger / space / click. No parallel launcher.
4. The flag is **session-only** (not written to save). A future formal menu can
   persist it by storing a boolean and calling `setAutoPlay` after `createGame`.

The toggle does not start a match. Title still needs a real start tap.

## Hand-play recording

**录制** lives in `src/game/record/` (chip next to 代打). Default OFF, session-only.
Leave it on across games — one v2 pack (`sessions[]`) downloads when you turn
it off. Anti-gravity orbs / black hole are on samples + events. Field docs:
`src/game/record/README.md`. Does not change how 代打 decides.

## Physics feel → decisions (`feel.ts`)

`tapJump()` **writes** `jumpVx` / `jumpVy` every tap. Policies should key off
those numbers (and elasticity), not `ballId`. `shotFeel(world)` derives:

| Param (live) | Feel field | What it changes |
|--------------|------------|-----------------|
| `\|jumpVx\| / (w·0.76)` | `jumpFwd` | Combo pace; pocket width; `longJump` if > 1.08 |
| `2·\|jumpVy\| / g` | `hangTime` | Far-climb distance (longer hang → jump earlier) |
| `jumpVy` vs `g·h` | `jumpUp` | Climb vs hang |
| `pMul("ball")` | `bounce` / `hotBounce` | `pop-away` instead of mashing a rim pop |
| `pMul("hoop")` × bounce | `hoopRest` | Rim swirl vs slam |
| `pMul("boardFric")` | `boardGrip` / `slipperyGlass` | Ninja-like glass: don't tap under the cylinder |
| `pMul("grav")` | `grav` | Hang time (via `gravity`) |
| `pMul("floor")` | `floorMul` | Floor pop energy |
| `kit.wrap` | `groundWrap` | 44 px/s crawl after an overshoot |

**Combo pace** (window is 4s): classic ~1.72; **heat / frost** ~1.48 (human lava
678 / 28, frost 1339 / 36). **Long jumpFwd (ninja)** is **tighter** (~1.08s) —
a human 1-min 310 (combo 28, ~5.0 pts/s) had a median make gap of ~1.05s,
first-tap |dx| ~237 (p25–p75 ≈ 195–290), ~2 taps before a make, and **no
swishes** (bank 29 / rim 17). Elite classic 2641 / 138 (~0.64s/make, rim+bank)
and 1324 / 97 (almost all banks) are the decaying-clock bar. Classic 360 was
~1.35s. The old 2.6s ninja wait sat under the rim. `carry-flight` / `ride-flight`
still block combo-clock mash on a live arc; a dying combo on a parked miss
under the rim is `wrap-escape`, not a 1–13 pt drought.
**Glass (bounce 0)** is also tight (~1.24s) — human classic 10156 / combo 117
and 5992 / 88 had a ~1.29s gap and ~3.6 short taps from |dx| ~296 (rim / swish /
bank mix).

**Release pocket:** slightly wide `jumpFwd` (1.0, lava/frost) holds let-drop
sooner so the last apex does not wrap. `longJump` (ninja 1.2) does **not**
widen the pocket — it rides the descent instead.

Ball-id / skill-flag votes are only for skills that are not a number:
**frost** (freeze can keep the same stand), **anti** (pickups / hole),
**glass** (restitution 0), **wrap-height** (rubber orbit), **champ**.

## Policy hierarchy (hard)

1. **Physics hard limits** — `tapJump` always writes full `jumpVx` / `jumpVy`. If the current flight already scores **or** is inbound in the finish pocket on long jumpFwd → **ZERO taps** (`finishPocketLocked` / `protect-finish` / `overshoot-cool` on ninja). Do not weaken these.
2. **Human JSON demos** — mined stats in `demo-priors.ts` (ninja 310 / 2641 / 1324, glass 10156 / 5992, anti packs). Re-mine with `node --experimental-strip-types scripts/summarize-recording.mjs <file.json>` from packs under `/workspace/human-recordings/` when present. Demo numbers win.
3. **Oral 8-tactic playbook** — **soft hints only**. When it conflicts with (1) or (2), demote or disable.

The recording analyzer (`analyze-recording.ts`) is the miner. It is not deleted.

### Oral tactics demoted (demo conflict)

| Oral tactic | Why demoted | Demo instead |
|-------------|-------------|--------------|
| `bank-cut` / `predicted-bank` on long jumpFwd or glass | Extra tap near glass writes full jumpVx → overshoot death loop | Ninja 310: median **~2 taps**, then ride; 0 swishes. Glass: drop-finish. Classic may still kiss-cut. |
| `apex-boost` extra climb on ninja | Third tap after launch/recatch | 310: floor `early-jump` + one too-low recatch, then `carry-flight` / `ride-flight` |
| Swish-hunt `predicted-make` on ninja | 310 mix is bank 29 / rim 17 / **swish 0** | Hold inbound; don't poke for +swish |
| Combo-clock `shot-clock` / `pace-boost` near the hoop on ninja | Oral "keep combo" poke is the same overshoot tap | Pace from far (`early-jump`); near glass, hold |
| Repeating `wrap-escape` / off-screen `approach-enter` / extra jump-speed recatch (ninja-stuck-1/2) | Same jump vector `(±328,-671)` empty wrap, or a 3rd tap after launch+recatch | Break-glass `wrap-loop` on off-screen / identical last pose / extra air tap. **Do not** hold the demo-band floor launch or the too-low recatch — those are the scoring path. If wrap-escape would fire after a fruitless wrap and the reset would kiss glass, one `wrap-bank`, then ride. |
| Oral "must bank" / upper `bank-half` **tap** | Humans bank from a held inbound, not a jump-reset | `bank-half` / `bank-steep` remain as **holds** when `willBoard` |

### Oral tactics kept (demos agree)

- Half-board / steep **holds** when the current path already hits glass (`holdInboundBank`)
- Wrap recoveries (`wrap-escape` past the board / parked miss) — 310: 4/8 wraps scored within 2.5s. **Not** the stuck-loop: after a 0-score wrap, do not wrap-escape the same pose or full-jump from off-screen (`wrap-loop`). Prefer one `wrap-bank` when that wrap-escape would kiss glass. Demo-band launch + too-low recatch remain the attack.
- `hole-spam` / `hole-ride` after the hole opens (anti packs)
- `pop-away` on a hot bounce
- Glass `seek-swish` (+4 HP) and drop-finish (10156 / 5992)

## Named tactics (human playbook)

| Reason | When | Driven by |
|--------|------|-----------|
| `bank-half` | Contact around half board height, moving into glass — **hold** | board geom + vy |
| `bank-steep` | Steeper cut into the board (`\|vy\| > 0.52·\|vx\|`) — **hold** | velocity vs board |
| `protect-finish` | Long jumpFwd in the glass/rim pocket — ZERO extra taps (overshoot loop) | `finishPocketLocked` |
| `wrap-loop` | Break-glass only: off-screen / identical last tap pose / extra jump-speed recatch / wrap-escape after a fruitless wrap. Not the demo-band launch or too-low recatch (including after a rim graze) | recent poses + jump vel |
| `wrap-bank` | Break-glass: wrap-escape (or a close reset) after a fruitless wrap whose tap would kiss glass, then ride | `predictTap.willBoard` once |
| `bank-cut` | Classic only (demo `bankCutTap`): current path misses glass, jump-reset would kiss | `demoPriors.bankCutTap` |
| `rim-swirl` | Inner-rim rattle (刷马桶) — hold, don't reset `jumpVx` | `hitRim` + inner side |
| `tube-up` | Climbing through the net from below, then drop | under cylinder + `vy < 0` |
| `exit-space` | Under-rim but opening court — let spacing grow, then jump back | under + bounce away |
| `pop-away` | Elastic pop near the rim — let spacing open, then re-attack | `hotBounce` / `hoopRest` |
| `wrap-escape` | Stuck under the rim: tap/wrap to the far side (穿屏) | `longJump` or `slipperyGlass` |
| `early-jump` | Far floor launch (`|dx|` ≳ 195), then recatch near a too-low apex after flying in (`|dx|` ~110–133) so the reset peaks at the rim | `longJump` + dx / vy |
| `far-climb` | Distant rapid taps so the ball falls near **90°** | far + rising, not `longJump` |
| `ride-flight` | Descending live arc on a long jump — don't poke | `longJump` + `vy > 0` |
| `carry-flight` | Already flying at the hoop while still rising at jump speed — don't reset `jumpVx` | `longJump` + `flyingAtHoop` |
| `hole-spam` | Black hole open — tap; gravity pulls it in | `kit.anti` / `holeOn` |
| `hole-ride` | Already inbound to the hole — hold, don't reset `jumpVx` | `kit.anti` / `holeOn` |
| `gather-tap` | Antimatter pickup, but shot clock beats farming | `kit.anti` |

Antimatter playbook #8 (human classic 1185 / 33, 996 / 36, 775 / 1): gather
**while scoring**. `score-over-pickup` defers a far-orb detour during a live
combo (775 broke combo farming); a flight that both scores and collects holds
`gather-path`. `clock-over-pickup` drops the farm when the shot/combo clock is
short. Once `holeOn`, `hole-spam` is snappy; `hole-ride` if velocity already
points into the hole.

Oral mapping (soft; demoted rows are in the table above):

1. Bank → **hold** inbound glass (`willBoard` / scores). Ninja: `protect-finish`, no bank-cut. Classic may kiss-cut when the current path misses **and** `predictTap.willBoard`.
2. 刷马桶 → `rim-swirl`
3. Under-rim: `tube-up` while rising through the net; `let-drop` if too low; `exit-space` when opening
4. High bounce → `pop-away`
5. Stuck 穿屏 → `wrap-escape`
6. Distant 90° taps → `far-climb` (not long jumpFwd)
7. Long jumpFwd: floor/far `early-jump` → `carry-flight` → one recatch (`tooLowApex`) → `ride-flight`. No apex-boost / bank-cut / combo poke near finish.
8. Black hole → gather while scoring; `hole-spam` / `hole-ride` once open

Human ninja **1-min 310** (62s, combo 28, ~5.0 pts/s): bank 29 / rim 17 / swish 0. Elite classic **2641 / 138** (88s, rim+bank) and **1324 / 97** (79s, mostly banks). Summarize more demos with `node --experimental-strip-types scripts/summarize-recording.mjs <file.json>`.
Human ninja classic 360 (101.9s, 3.5 pts/s): bank ~58% / rim ~33% / swish ~9%.

## Adding a new ball policy

Skills live on `effectiveBall()` flags (`heat`, `frost`, `champ`, `anti`,
`chain`, `ninja`, `glass`, `wrap`). Rogue fusion **ORs** those flags, so a
`经典+反重力` loadout already receives the antimatter policy without extra work.

1. **Do not invent a skill.** Read `src/game/balls.ts` (and fusion) for what
   the ball actually does. If the difference is jump / bounce / gravity, extend
   `shotFeel` / `physPolicy` — do **not** add `kit.whatever` branches.
2. Add a `BallAiPolicy` only when the skill is not a phys number (freeze, hole,
   glass 0-rest, height wrap):

   ```ts
   export const myPolicy: BallAiPolicy = {
     id: "my-skill",          // stable, unique
     priority: 55,            // higher than default (0); see table below
     match: (kit) => kit.anti && kit.glass, // flags, not ball id
     vote(world, helpers) {
       return { action: "abstain", reason: "defer" };
     },
   };
   ```

3. Append it to `BUILTINS` in `policies.ts`. `installBuiltInBallAiPolicies()`
   registers them once.
4. First non-`abstain` vote wins (highest priority). Use `abstain` when the
   generic launcher should decide; `hold` to block a tap; `tap` to shoot.
5. Use `helpers.predictTap` / `predictCurrent` for “would this jump score /
   collect antimatter / swish?”. Do not copy physics into a new if-else in
   `engine.ts`.

### Priority (built-in)

| id           | priority | when it matches      |
|--------------|----------|----------------------|
| anti         | 80       | `kit.anti`           |
| glass        | 70       | `kit.glass`          |
| wrap-height  | 60       | `kit.wrap === "height"` |
| chain        | 50       | `kit.chain` (placeholder) |
| champ        | 40       | `kit.champ`          |
| phys         | 28       | always (feel tactics) |
| frost        | 20       | `kit.frost`          |
| default      | 0        | always               |

The default policy covers plain kinematics. `phys` only votes when jumpFwd /
bounce / glass grip make a tap dangerous or a playbook tactic applies.

- **Chain:** at the make (`shotMade`) it jumps toward the **new** hoop immediately — no floor wait. It only holds `chain-wait` while still *above* the new rim (a full `jumpVy` from there orbits). `tapJump` after a counted make is a new shot and does not break combo.
- **Banks:** 擦板 only in the **glass pocket**. Prefer **holding** half-board and steep inbound paths (`bank-half` / `bank-steep`). Oral bank-cut is **classic-only** (`demoPriors.bankCutTap`). On ninja / long jumpFwd the controller forbids extra taps in `nearFinishPocket` (`protect-finish`) — humans (310 / 2641 / 1324) finish with few taps.
- **Floor bounce / pop-away:** after a messy miss or a hot bounce, hold while velocity is **opening spacing**. Sitting idle under the rim is `wrap-escape`, not a hover.
- **Climb / release:** far + rising → tap-climb for a near-vertical drop; release in the pocket; let-drop above the rim. Long jumpFwd **jumps early** then **rides** the descent.
- **Frost:** freeze can keep the scored stand (`nextHoop` does not always flip). After a make still next to that stand, **let-drop** instead of `chain-next` into the glass. Frozen +2 is in-engine. Human classic 1339 / 36: combo pace ~1.48s, floor `reset-boost` when the freeze clock is dying.
- **Heat / ninja clones / fire extras:** combo-driven in-engine. AI only sees their phys (jumpFwd 1.0 / 1.2, hoop 0.8, boardFric 0.7). Lava classic 678 / 28 uses the 1.48s heat pace.

`glass` (priority 70) climbs from far (`|dx|` ~296, ~3.6 taps) then **drops**
for the finish. `seek-swish` (+4 HP) is the only scoring tap in the pocket —
`commit-make` slams `jumpVx` into the rim (−2) and shattered the first commit
pass at combo 25. Aligned drops `glass-settle` (rim finishes still count from
a held drop). Off-center / too-low / floor → `glass-launch`. `glassBase` ≤ 10
skips banks (board −1 / top −3); a live bank at low HP `glass-settle`s so we
don't slam iron. `wrap-height` (rubber) lets rattles resolve
and only banks in the glass pocket.

## Formal menu later

```ts
game.setAutoPlay(true);   // from a Demo / AFK row
game.setAutoPlay(false);  // must leave no AI cooldown / last decision
```

`createAiController().setEnabled(false)` already resets that state. Keep the
controller the single owner of the flag so pause, settings, and a future
options screen cannot drift.

## What the AI must not do

- Fork `tapJump`, gravity, or scoring.
- Read or write rogue gold / shop / fuse UI (those pause the sim).
- Stay armed after disable (`setEnabled(false)` clears cooldown).
- Hold on `shotMade`. That combo latch stays true until the next tap, so
  treating it as "don't shoot" stalls forever after the hoop switches sides.
  After a make, **chain** toward the new hoop immediately (humans rarely land
  between baskets). Hold `scored` only when the make has not been counted yet.
- Predict a make on the hoop you just scored (`other` sliding off). That
  looks like "flight-scores" and never aims at the new side. The controller
  also drops cooldown on hoop-side change and watchdog-taps if idle too long.
- Hold `flight-scores` from across the court, or after the make already
  counted. Keep tapping through flight and recover after a miss/bounce.
- Ignore the backboard. Direct-only guesses miss 擦板 windows humans use — but
  only commit banks *at* the glass, never as mid-court spam.
- Spam the same jump after a rubber rim rattle, or float forever on glass
  waiting for a perfect swish.
- Abandon floor-bounce / pop-away recovery. After a bad bounce, humans land,
  ride the bounce away, and shoot again.
