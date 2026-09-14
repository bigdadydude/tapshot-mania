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
| ninja        | 30       | `kit.ninja` (abstain)|
| frost        | 20       | `kit.frost` (abstain)|
| heat         | 15       | `kit.heat` (abstain) |
| default      | 0        | always               |

The default policy covers plain kinematics for anything that only changes jump / gravity. It chains **apex boosts** (tap near the top of a jump) because a single floor tap cannot reach the rim — the same pattern a human uses. Specialized policies should `abstain` unless they need to gather a pickup, protect a glass swish, or steer in a black hole.

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
