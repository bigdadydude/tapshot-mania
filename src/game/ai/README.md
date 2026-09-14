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

## Adding a new ball policy

Skills live on `effectiveBall()` flags (`heat`, `frost`, `champ`, `anti`,
`chain`, `ninja`, `glass`, `wrap`). Rogue fusion **ORs** those flags, so a
`经典+反重力` loadout already receives the antimatter policy without extra work.

1. **Do not invent a skill.** Read `src/game/balls.ts` (and fusion) for what
   the ball actually does. If the skill is purely combo / timer driven in the
   engine (lava, frost, ninja clones), you usually **abstain** and let
   `default` shoot.
2. Add a `BallAiPolicy` in `src/game/ai/policies.ts` (or a sibling file):

   ```ts
   export const myPolicy: BallAiPolicy = {
     id: "my-skill",          // stable, unique
     priority: 55,            // higher than default (0); see table below
     match: (kit) => kit.anti && kit.glass, // flags, not ball id
     vote(world, helpers) {
       // return tap / hold / abstain
       return { action: "abstain", reason: "defer" };
     },
   };
   ```

3. Append it to `BUILTINS` in the same file. `installBuiltInBallAiPolicies()`
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
| ninja        | 30       | `kit.ninja`          |
| frost        | 20       | `kit.frost`          |
| heat         | 15       | `kit.heat`           |
| default      | 0        | always               |

The default policy covers plain kinematics for anything that only changes jump / gravity.

- **Chain:** at the make (`shotMade`) it jumps toward the **new** hoop immediately — no floor wait. It only holds `chain-wait` while still *above* the new rim (a full `jumpVy` from there orbits). `tapJump` after a counted make is a new shot and does not break combo.
- **Banks:** 擦板 only in the **glass pocket** (between rim and backboard). Once there, **hold** `commit-glass` / `let-drop` — a tap resets to full `jumpVx` and is how long-travel kits bank-spam or fly past. Mid-court bank guesses and `wrap-boost` *near* the board are refused; wrap only after the ball is actually past the glass.
- **Floor bounce reset:** after a messy miss, hold `floor-bounce` only while the bounce is **opening spacing** (velocity away from the hoop). Sitting idle under the rim is not a recovery. First shots and clean windows still launch immediately.
- **Climb / release:** mash while below the basket on a clean look, release in the pocket, let-drop above the rim. Watchdog refuses to mash from above the rim.
- **Ninja:** owns its vote only **under the cylinder** and on a floor stall. Long `jumpFwd` 1.2 + `grav` 0.9 — a tap under the rim hits the glass and orbits, but a 42% court hold was landing live shots and killing combo. Climb / keep-air / chain stay on default. Wrap after the glass; inbound uses snappy `approach-enter`.
- **Frost:** freeze can keep the scored stand as the live hoop (`nextHoop` does not always flip). After a make still next to that stand, **let-drop** instead of `chain-next` into the glass. Frozen +2 is in-engine.
- **Heat:** default `jumpFwd` 1.0 (classic 0.95). Release once flying at the hoop inside ~30% width so the last apex does not wrap. Fire extras are combo-driven in-engine.
- **Combo pace:** classic / rubber still pressure at ~1.85s. Ninja / heat / frost leave the pocket from ~1.45s.

`glass` (priority 70) still protects a real dropping swish, climbs below the rim, then commits in the pocket. `wrap-height` (rubber) lets rattles resolve and only banks in the glass pocket — not every bounce.

Specialized policies should `abstain` unless they need to gather a pickup, protect a glass swish, steer in a black hole, or (rubber) refuse a bad rim spam. Do not abandon floor-bounce recovery for high-travel balls.

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
- Abandon floor-bounce recovery. After a bad bounce, humans land, ride the
  bounce away, and shoot again. Hold `floor-bounce` until spacing opens.
