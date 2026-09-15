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

**Combo pace** (window is 4s): classic ~1.72; heat slightly longer. **Long
jumpFwd (ninja)** is **tighter** (~1.12s) — a human 1-min 310 (combo 28,
~5.0 pts/s) had a median make gap of ~1.05s, first-tap |dx| ~237
(p25–p75 ≈ 195–290), ~2 taps before a make, and **no swishes** (bank 29 /
rim 17). Classic 360 was ~1.35s. The old 2.6s ninja wait sat under the rim.
`carry-flight` / `ride-flight` still block combo-clock mash on a live arc.
**Glass (bounce 0)** is also tight (~1.24s) — human classic 10156 / combo 117
had a ~1.29s gap and ~3.6 short taps from |dx| ~296 (rim 52 / swish 40 / bank 25).

**Release pocket:** slightly wide `jumpFwd` (1.0, lava/frost) holds let-drop
sooner so the last apex does not wrap. `longJump` (ninja 1.2) does **not**
widen the pocket — it rides the descent instead.

Ball-id / skill-flag votes are only for skills that are not a number:
**frost** (freeze can keep the same stand), **anti** (pickups / hole),
**glass** (restitution 0), **wrap-height** (rubber orbit), **champ**.

## Named tactics (human playbook)

| Reason | When | Driven by |
|--------|------|-----------|
| `bank-half` | Contact around half board height, moving into glass | board geom + vy |
| `bank-steep` | Steeper cut into the board (`\|vy\| > 0.52·\|vx\|`) | velocity vs board |
| `rim-swirl` | Inner-rim rattle (刷马桶) — hold, don't reset `jumpVx` | `hitRim` + inner side |
| `tube-up` | Climbing through the net from below, then drop | under cylinder + `vy < 0` |
| `exit-space` | Under-rim but opening court — let spacing grow, then jump back | under + bounce away |
| `pop-away` | Elastic pop near the rim — let spacing open, then re-attack | `hotBounce` / `hoopRest` |
| `wrap-escape` | Stuck under the rim: tap/wrap to the far side (穿屏) | `longJump` or `slipperyGlass` |
| `early-jump` | Far floor launch (`|dx|` ≳ 195), then recatch near a too-low apex (human 2 taps; mid-climb recatch overshoots) | `longJump` + dx / vy |
| `far-climb` | Distant rapid taps so the ball falls near **90°** | far + rising, not `longJump` |
| `ride-flight` | Descending live arc on a long jump — don't poke | `longJump` + `vy > 0` |
| `carry-flight` | Already flying at the hoop while still rising at jump speed — don't reset `jumpVx` | `longJump` + `flyingAtHoop` |
| `hole-spam` | Black hole open — tap; gravity pulls it in | `kit.anti` / `holeOn` |
| `gather-tap` | Antimatter pickup, but shot clock beats farming | `kit.anti` |

Antimatter later: keep gathering **while scoring** (`score-over-pickup` defers a
make); `clock-over-pickup` drops the farm when the shot/combo clock is short.
Once `holeOn`, `hole-spam` is snappy.

Playbook mapping (PO):

1. Bank → `bank-half` / `bank-steep`
2. 刷马桶 → `rim-swirl`
3. Under-rim: `tube-up` while rising through the net; `let-drop` if too low; `exit-space` when opening
4. High bounce → `pop-away`
5. Stuck 穿屏 → `wrap-escape`
6. Distant 90° taps → `far-climb`
7. Long jumpFwd: floor/far `early-jump` (band `|dx|` 195–290) → `carry-flight` until near apex → one recatch (`tooLowApex`, including under the cylinder when the first apex is still ~150px low) → `ride-flight` / `rim-swirl` / upper `bank-half`. A recatch at vy ~-270 overshoots into a wrap. Wrap past glass is `wrap-escape` (310 demo: 4/8 wraps scored in 2.5s). Do not start a shot late under the rim. Do not `carry-flight` the whole first climb — one floor tap peaks ~150px under the rim. `tube-up` only through the net, not from a too-low rise.

Human ninja **1-min 310** (62s, combo 28, ~5.0 pts/s): bank 29 / rim 17 / swish 0. Summarize more demos with `node --experimental-strip-types scripts/summarize-recording.mjs <file.json>`.
Human ninja classic 360 (101.9s, 3.5 pts/s): bank ~58% / rim ~33% / swish ~9%.
8. Black hole → `gather-tap` while scoring; `hole-spam` once open

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
- **Banks:** 擦板 only in the **glass pocket**. Prefer **half-board** and **steep** cuts (`bank-half` / `bank-steep`). A tap resets to full `jumpVx`.
- **Floor bounce / pop-away:** after a messy miss or a hot bounce, hold while velocity is **opening spacing**. Sitting idle under the rim is `wrap-escape`, not a hover.
- **Climb / release:** far + rising → tap-climb for a near-vertical drop; release in the pocket; let-drop above the rim. Long jumpFwd **jumps early** then **rides** the descent.
- **Frost:** freeze can keep the scored stand (`nextHoop` does not always flip). After a make still next to that stand, **let-drop** instead of `chain-next` into the glass. Frozen +2 is in-engine.
- **Heat / ninja clones / fire extras:** combo-driven in-engine. AI only sees their phys (jumpFwd 1.0 / 1.2, hoop 0.8, boardFric 0.7).

`glass` (priority 70) still protects a real dropping swish or rim finish. It
**commits** (`seek-swish` / `commit-make`) when a tap would score, keeps
climbing from far (`|dx|` ~296, ~3.6 taps), and only `glass-settle`s in the
pocket or above the rim — not from mid-court. `wrap-height` (rubber) lets
rattles resolve and only banks in the glass pocket.

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
