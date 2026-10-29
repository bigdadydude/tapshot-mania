# Tap Shot Mania（投球）· 开发内容参考

> 面向指挥官与助手的只读对照表。数据跟踪 `main` · commit `193275b`（`Slow Vector short-press pulse and hold 0.08s` / Vector pulse PR #21 合入后；本文从该提交分出）。  
> **勿改游戏代码；本文档不是 PR。**  
> 每个概念格式：**中文名** · **代码标识** · **一句话含义** · **文件路径**

---

## 1. 总览

### 前提（premise）

| 项 | 内容 |
|----|------|
| 产品名 | 投球 / Tap Shot Mania |
| 玩法一句话 | 点击起跳，把球投进左右轮换的篮筐；空心 / 擦板 / 压哨等标签加分；连击决定热度与节奏 |
| 平台 | 竖屏浏览器；本机 `localStorage` 存纪录与设置，默认无需账号 |
| 输入 | 点按场地 / 空格 / ↑ 起跳；空中再点加力不断连；`Esc` 暂停 |

来源：`README.md`、`docs/pitch.md`、`src/game/engine.ts`、`src/components/game-view.tsx`

### 实际存在的模式 · `PlayMode`

| 中文名 | 代码标识 | 一句话含义 | 文件路径 |
|--------|----------|------------|----------|
| 经典 | `classic` | 衰减投篮钟；首球后约 15s，每次进球回满但上限 ×0.972，最短约 2.6s | `src/game/types.ts`、`engine.ts`（`TIMER_*`） |
| 1分钟 | `minute` | 首球后固定 60s 倒计时，不因进球缩短/回满；冠军球不可用 | 同上；`game-view.tsx` 屏蔽 `champ` |
| 肉鸽 | `rogue` | 正式 9 关目标分 + 过关金币商店；通关后可 endless；纪录为最远关 | `rogue.ts` `ROGUE_CAMPAIGN_STAGES=9` |

> README / pitch 仍写「5 关 / 每关 200」——**与当前代码不一致**，以 `rogue.ts` 的 `STAGE_TARGETS` 为准。

### 关键场景 · `SceneId`

| 中文名 | 代码标识 | 默认词条 | 文件路径 |
|--------|----------|----------|----------|
| 街头 | `street` | 无强制 | `src/game/scenes.ts` |
| 监狱 | `prison` | `yard-lights`（放风探照） | 同上 |
| 都市 | `overpass` | 无；带 traffic 桥上车流 | 同上 |
| 空空间（开发） | `void`（`DevSceneId`） | 沙盒 | `src/game/dev.ts` |

### `src/game/` 关键地图

| 文件 | 职责 |
|------|------|
| `balls.ts` | 球种表、`BallId`、融合 `effectiveBall`、可玩过滤 |
| `dev.ts` | `DevPhys` / clamp / 开发者 HUD、模式与场景标签 |
| `engine.ts` | 主循环；`pMul`、计分、穿屏、各球技能驱动 |
| `vector.ts` / `super.ts` / `rocket.ts` | 矢量 / 超能 / 火箭专用状态机 |
| `rogue.ts` / `rogue-catalog.ts` | 肉鸽跑局、金币、商店、`roguePhysMul` |
| `balance-test.ts` | 平衡会话、R0/R1、自动 S |
| `modifiers.ts` + `modifiers/*` | 关卡词条：游魂圈 / 墓地手 / 放风探照 |
| `scenes.ts` | 场景资源包、涂鸦键、BGM/SFX 路径 |
| `types.ts` | `PlayMode`、热度阈值、`CloudMode`、`HudState` |
| `audio.ts` / `render.ts` / `net.ts` / `traffic.ts` | 音效、绘制、篮网、车流 |
| `chain.ts` / `maze-pad.ts` / `hacker-pad.ts` | 监狱链、迷宫摇杆、骇客方向垫 |

UI 入口：`src/components/game-view.tsx`（模式按钮「经典 / 1分钟 / 肉鸽」）、`src/components/dev-console.tsx`（开发者控制台）。

---

## 2. 术语表

| 中文名 | 代码标识 | 一句话含义 | 文件路径 |
|--------|----------|------------|----------|
| 进球 / make | `registerScore`、`shotMade` | 球穿过篮圈平面且满足计分条件，结算一次得分与连击 | `engine.ts` |
| 连击 | `streak` / HUD `combo` | 当前连续进球数；超时 `COMBO_STOP=4`s 断连；热度掉段 `COMBO_DROP=2`s | `engine.ts`、`types.ts` |
| 热度阶段 | `fireStage` / `FIRE_*` | 5 白烟 / 10 冒烟 / 15 点燃 / 20 烈火；影响加分、云舞、燃烧球 | `types.ts` |
| 篮板 | `board` / `hitBoard` | 打板碰撞；影响空心判定与玻璃扣分 | `engine.ts` |
| 篮筐 / 篮圈 | `hoop` / `rim` / `hitRim` | 左右轮换目标；打铁记 `hitRim` | `types.ts` `Hoop` |
| 穿屏 | `wrap`：`ground` \| `height`；`wrapX` | 球出左右边再出现：`ground` 贴地滚入，`height` 保持高度朝筐侧出现 | `balls.ts`、`engine.ts` `wrapX` |
| 经典球 | `plain` | 默认球；技能文案玩笑向；phys 略低于 1.0 跳距 | `balls.ts` |
| 技能 | `BallKit` 各 flag（`heat`/`frost`/`bolt`…） | 球种能力开关；开发者平衡会话可关 `skillsEnabled` | `balls.ts`、`engine.ts` |
| 过热 | `boltOverheatLeft` / `BOLT_OVERHEAT_DUR=3` | 闪电球连灌耗尽后锁定约 3s，电量随时间抽干 | `engine.ts` |
| 储能 | `vector.energy` / `VECTOR.capacity=1500` | 矢量球首球后靠碰撞回弹储能 | `vector.ts` |
| 短按 | Vector：`held < VECTOR.hold(1)`；Super：滑动冲刺 | 矢量短按消耗 250 做方向脉冲；超能靠滑动 | `vector.ts`、`super.ts` |
| 长按 | Vector：`VECTOR.hold=1`s；Bolt：`BOLT_HOLD_ARM=0.5`s；Time：地面快退 | 矢量全爆发 / 闪电连灌 / 时间倒放 | 各模块 |
| 漏能 | `stepVectorLeak` / `vectorLeakRate` | 矢量能量>1000 时随对局时间升高泄漏风险；3s 流失 100–500，转成随机回弹 | `vector.ts` |
| 云朵模式 | `CloudMode`：`dance` \| `drift` \| `off` | 设置项；`dance` 时跟 BGM 节拍跳舞，否则漂移或关闭 | `types.ts`、`engine.ts` `stepClouds` |
| drift / dance | `cloudGroove` → `drift`/`g1`/`g2`/`g3` | 非对局或关 BGM → drift；dance 且热度越高舞步越密 | `engine.ts` |
| BGM BPM | `beat = 60/90`（即 **90 BPM**） | 云朵节拍硬编码 90；与街头 `sfx.bgm` 对齐假设 | `engine.ts` `cloudHopSteps` |
| 平衡 R0 | `state==="off"` 时 `target = 1 − k×S` | 关技能分 / 基准分 B 的目标比；默认 `k=0.06`，容差 `r0Tolerance=0.08` | `balance-test.ts`、`dev.ts` |
| 平衡 R1 | `state==="on"`，目标区间 `[r1Min,r1Max]` 默认 0.9–1.1 | 开技能分 / B 应接近 1 | 同上 |
| 强度 S | `SkillStrength` 四项和：`score+safety+tempo+cost` | 手填技能强度；用于 R0 目标，不是自动 S | `balance-test.ts` |
| 自动 S | `automaticStrength` / `AutoStrength` | 从遥测估技能贡献（只读，不写回 strength） | `balance-test.ts` |
| 代打 | （无独立 id；实践指开发者 **1分钟平衡会话**） | 在 `dev=1` 控制台开 balance session，按基准/关技能/开技能各打若干局采集 R0/R1 | `dev.ts`、`balance-test.ts`、`dev-console.tsx` |
| 开发者模式 | `DevHud` / `?dev=1` / `wantDevQuery` | URL `dev=1` 或存档 `devUnlocked`；沙盒改 phys、球、模式、肉鸽道具 | `dev.ts`、`engine.ts`、`dev-console.tsx` |
| 融合 | `fuseBall` / `fuseBalls` / `effectiveBall` | 肉鸽开局选副球叠技能；外观/wrap/phys 跟主球，技能 flag OR，`rScale` 相乘 | `balls.ts`、`rogue.ts`、`game-view.tsx` |
| 词条 / 修饰 | `Modifier` / `ModifierId` | 关卡灾害：无 / 游魂圈 / 墓地手 / 放风探照 | `modifiers.ts` |
| 绝杀 | `buzzer` / `timeUp` / tag `"绝杀"` | 时钟耗尽后空中进球；+5；一般不可再起跳（饰品「绝杀时刻」例外） | `engine.ts` |
| 空心 / 擦板 / 刷马桶 / 幸运 / 穿针 / 深水 | `swish`/`bank`/`toilet`/`lucky`/`needle`/`depth` | 进球标签；分别 +3 /（标签）/ 磕筐≥3 / 板上端 / 自下而上 / 飞顶再空心(+30) | `engine.ts` `registerScore` |
| 随机球 | 标题 `focusKey==="random"` | 开局从当前模式可玩球池抽一颗（minute 排除 champ） | `game-view.tsx` |

---

## 3. 手感物理参数（重点）

### 3.1 `DevPhys` 字段

| 键 | 中文（控制台） | 含义 | 默认 `DEFAULT_PHYS` | clamp |
|----|----------------|------|---------------------|-------|
| `jumpUp` | 向上距离 | 起跳高度系数 | 1 | `[0.5, 2]` |
| `jumpFwd` | 前进距离 | 朝筐水平冲量系数 | 1 | `[0.5, 2]` |
| `ball` | 球弹力 | 乘进反弹 restitution | 1 | `[0, 2]` |
| `grav` | 重量（下落） | 重力倍率 | 1 | `[0.5, 2]` |
| `buoy` | 浮力 | 持续上抵重力 | 0 | `[0, 2]` |
| `air` | 空中阻力 | 空中水平减速 / 旋转变慢 | 1 | `[0.5, 2]` |
| `roll` | 地面阻力 | 贴地滚动减速 | 1 | `[0.5, 2]` |
| `floor` | 地面弹力 | 砸地板回弹 | 1 | `[0.5, 2]` |
| `hoop` | 篮板篮筐 | 打板/打铁回弹 | 1 | `[0.5, 2]` |
| `rimFric` | 篮筐摩擦 | 打铁切向蹭掉速度 | 1 | `[0, 2]` |
| `boardFric` | 篮板摩擦 | 打板切向蹭掉速度 | 1 | `[0, 2]` |

定义与 clamp：`src/game/dev.ts`（`clampPhys` / `clampPhysKey`）。

### 3.2 `pMul` 如何接到重力与起跳

`engine.ts` ~1298：

```
pMul(k) =
  clampPhysKey( k,  开发者开？devPhys[k] : kitPhys(k) )
  ×（肉鸽且非开发者：饰品 roguePhysMul 对 rimFric/ball/jumpFwd/jumpUp/grav）
  ×（监狱场景下 shackle/free 额外微调）
```

应用到运动（约 1416–1450）：

| 量 | 公式（摘要） |
|----|----------------|
| 重力 `gravity()` | `world.h * 3.1 * pMul("grav") * stageMod.gravMul?` |
| 起跳竖直 `jumpVy()` | `-sqrt( 2 * gravity() * world.h * 0.185 * pMul("jumpUp") * stageMod.jumpMul? )` |
| 起跳水平 `jumpVx()` | `hoop.side * world.w * 0.76 * pMul("jumpFwd")` |
| 反弹 `bounceRest` | floorHi `0.7*ball*floor`；floorLo `0.64*…`；rim `0.56*ball*hoop`；board `0.76*ball*hoop`；地板 cap 0.84、其它 cap 0.95 |

球种未写的 phys 键：`kitPhys` 返回 `buoy→0`，其余 `→1`（即经典默认手感）。

### 3.3 经典默认与球种覆盖

- 全局默认：`DEFAULT_PHYS` 全 1（`buoy=0`）。
- 球种表只写 `Partial<DevPhys>`，见第 4 节「关键 phys」。
- **经典 / 1分钟**非开发者：用球种 `phys`，不受肉鸽饰品 `roguePhysMul` 影响。
- **开发者开**：整盘用 `devPhys`（可 `physReset` 回当前球 `ballDefaultPhys`）。

### 3.4 `rScale`

| 说明 | 值 |
|------|-----|
| 定义 | 相对 `world.ballR` 的半径倍率；`ballRadius = world.ballR * (rScale??1)` |
| 弹力球 | `0.5`（直径≈经典半径） |
| 火箭球 | `1`（显式） |
| 融合 | 主球 × 各副球 `rScale` 连乘（弹力作副球会缩小） |
| 肉鸽饰品「儿童装」 | 再 ×0.5（`rogueBallRMul`） |

### 3.5 `roguePhysMul`

`rogue.ts`：对饰品 stack 线性累加后 `max(0.35, v)`：

| 键 | 典型饰品 | 每层 |
|----|----------|------|
| `rimFric` | `rimGrip` 粗糙篮筐 | +0.06 |
| `ball` | `ballBounce` 打气筒 | +0.05 |
| `jumpFwd` | `biggershoe` / `smallshoe` | ±0.08 |
| `jumpUp` | `jumphigher` / `jumplower` | ±0.08 |
| `grav` | `gravitywell` 重力井 | +0.12 |

仅在 `!devOn && isRogueMode()` 时乘进 `pMul`。

---

## 4. 球一览

> `playable: false` = 数据保留但选择器隐藏、`parseBall` 回退经典球。  
> 无 `src` 的球由 `render.ts` 程序绘制。

| id | 中文名 | 贴图路径 | 技能摘要 | 关键 phys / rScale / wrap | 特殊规则 | playable |
|----|--------|----------|----------|---------------------------|----------|----------|
| `plain` | 经典球 | `/game/balls/plain.webp`（fb `.png`） | 「别人都靠技能，而我…就很…」 | `jumpUp/Fwd=0.95`；wrap ground | 默认球 `DEFAULT_BALL` | ✅ |
| `super` | 超能球 | `/game/balls/super.png` | 得分充能每 20 一段最多 6；八向滑冲 **5 直径**（`dashDiameters:5`），顶端滞空 0.2s；连冲耗 1/2/3 段；打板铁/车/弹后 0.07s 完美取消返 1 段；能量条切护盾 | `jumpUp/Fwd=0.95` | 见 `SUPER` 常量；护盾进球不充能 | ✅ |
| `rocket` | 火箭球 | 复用 plain 图 | 按住底红点飞，拖左右；耗燃料，贴地恢复 | `jumpUp/Fwd=0.95, ball=0.35`；rScale 1 | **未开放** | ❌ |
| `bolt` | 闪电球 | `/game/balls/lightning.png` | 首球后滚速充电；空心+1%/擦板+8%；>90% 打铁+1 掉 1%；长按 0.5s 连灌；耗尽过热 3s | `jumpUp/Fwd=0.95` | `BOLT_*`；过热钉死球并抽电 | ✅ |
| `ninja` | 忍者球 | `/game/balls/ninja1.png` | 连击 **10/26/47** 各一影分身；分身只加连击不计分 | `jumpUp=1, jumpFwd=1.2, grav=0.9, hoop=0.8, boardFric=0.7` | 延迟轨 `NINJA_DELAYS` | ✅ |
| `rubber` | 弹力球 | （程序绘） | 高弹小号，穿边朝筐出现 | `rScale=0.5`；`jumpUp=1, jumpFwd=0.8, grav=1, ball=2`；**wrap height** | 靠手感拿分；设计约定倾向锁定 | ✅ |
| `maze` | 迷宫球 | （程序绘） | 地面摇杆改重力；中立停力保惯性 | `ball=0.92, air=0.86, roll=0.72` | **未开放**；穿边保动量 | ❌ |
| `quantum` | 量子球 | `/game/balls/quantum0.png` | 每进球按连击%隧穿（1连1%…≥100必中）；成功 6s 穿篮架 | 默认 phys | `quantumTunnelLeft`；跳过板/撑碰撞 | ✅ |
| `time` | 时间球 | `/game/balls/time.png` | 进球按剩余钟比例充能；长按快退最多 5s；绝杀禁用 | 默认 phys | 能量上限 100=满 5s；`TIME_*` | ✅ |
| `vector` | 矢量球 | `/game/balls/vector.png` | 首球后储能 cap 1500；短按耗 250 定向脉冲；长按 1s 全爆发（≥40），释能×5 为消耗换算；大招后 10s 不能储；>1000 漏能 | `jumpUp/Fwd=1` | PR#21：短脉冲 `pulse=0.16`、`pulseSpeed=0.7`、抵达后停 `pulseHold=0.08` | ✅ |
| `rain` | 骇客球 | （程序绿绘） | 晴天每 5 进球满一层气；超过 3 秒未进球后每秒流失一层的 20%。按下立刻起跳；按住超过 0.3 秒耗气。1 层箭头、2 层锁筐，都带深水；半层松开补回并停 0.2 秒。3 层进代码雨。雨中也攒气、不衰减，气条整段扣且不补回。进球先 +1，其余每 0.5 秒按当前连击入账（至少 1），绑筐，收筐或出雨作废。有气长按留筐，鸟/车掉落各 +1 连击，结束后再留 3 秒。满气底中黑电话短按撤离，落入主筐按当前连击计分 | `jumpUp/Fwd=1, grav=0.98, ball=1.04, air=0.96` | `codeRain`；晴天半层补回；雨中延时分与电话撤离 | ✅ |
| `lava` | 燃烧球 | `/game/balls/lava.webp` | 「什么味道？…」→ 连击升温给额外分并可点燃对面筐 | 默认 phys；`heat:true` | `canHeat`；热度阶段 +1/+2/+3 | ✅ |
| `frost` | 冰冻球 | `/game/balls/frost.png` | 连击抬冻筐概率；首冻 4s 续冻 3s；灌冻筐叠基础分 | 默认 phys | `FROST_*`；冻中进球 `frostGain=2` | ✅ |
| `champ` | 冠军球 | （程序绘） | 存剩余时间 20%；耗尽开双倍冠军时刻；**不可 1分钟** | `jumpUp/Fwd=0.95, grav=0.95, ball=0.9, hoop=0.9, rim/boardFric=1.1` | `CHAMP_BANK_RATE=0.2`；冠军中不 refill 钟 | ✅ |
| `anti` | 反重力球 | （程序绘） | 收集反物质开黑洞；洞 20s 起，场上越久越短≥10s | `jumpUp/Fwd=0.95, ball=0.8` | 洞开时进球 `gain=0`（洞自计分另算） | ✅ |
| `glass` | 玻璃球 | `/game/balls/glass.webp` | 基础分自 **30** 起；打铁/打板冲击扣 0–2/0–1；落地按高度 0–10；空心+4；上限 50；扣到 0 结束 | `grav=1.4, jumpUp=0.9, jumpFwd=0.8, ball=0`；**wrap height**；`score:"glass"` | 靠手感拿分；设计约定倾向锁定；肉鸽「安全包装」可免伤 | ✅ |
| `prison` | 监狱球 | （程序绘） | 链拖铁球；释放如经典（暂未开放） | `jumpUp/Fwd=0.95`；`chain:true` | **未开放** | ❌ |

融合生效逻辑（代码已实现）：

- **外观 / wrap / phys**：始终主球 `primary`。
- **技能 flag**：主+副 OR（含 `heat/frost/bolt/vector/super/…`）。
- **`rScale`**：连乘。
- **玻璃判定**：主或任一副 `score==="glass"` 即玻璃计分。

> 约定「融合时两球 phys 在取值间随机」——**当前代码未实现**，见第 6 节。

---

## 5. 模式与系统

### 5.1 计分（`registerScore`）

核心：`gain = basePart + streakPart (+ 标签 + 热度额外 + …)`

| 成分 | 规则 |
|------|------|
| `streakPart` | 当前 `streak`（连击数） |
| `basePart` | 玻璃=`glassBase`；迷宫=`mazeBaseBonus`；否则 0；混乱药丸 → 均匀 `[-10,15]` |
| 超能护盾 | `basePart += segments×2` |
| 标签加分 | 深水 +30；穿针 +20；幸运 +10；空心 +3（互斥优先序见代码） |
| 热度额外 | 烈焰+3 / 点燃+2 / 冒烟+1 |
| 绝杀 | +5 |
| 冠军时刻 | `gain *= 2` |
| 反重力黑洞开 | `gain = 0` |
| 忍者影分身进球 | `gain = 0`（只加连击） |
| 肉鸽分身术 ghost | 固定 1 分 |
| 都市擦车 | `traffic.nearMiss` 加进 gain |
| 肉鸽饰品/道具 | `applyRogueMakeMods`（标签分/金、黑洞三倍等） |
| 小小我 | 每层再 +1 连击 + `round(gain/2)` |

### 5.2 连击与热度

| 常量 | 值 | 含义 |
|------|-----|------|
| `COMBO_STOP` | 4s | 活跃连击必须再进球的窗口（肉鸽可被「简易连招」加秒） |
| `COMBO_DROP` | 2s | 热度掉段计时 |
| `FIRE_WHITE/SMOKE/IGNITE/BLAZE` | 5/10/15/20 | 热度阈值 |
| 冒烟空心跳段 | 冒烟空心可跳到点燃；点燃空心可跳烈火 | `registerScore` |

断连：落地 miss 后下一次新起跳、或超时；可用肉鸽「连击保护」。

### 5.3 时钟

| 模式 | 行为 |
|------|------|
| classic / rogue | `TIMER_START=15`；每次 make `timerMax = max(2.6, timerMax * decay)`，`decay` 默认 0.972（缓慢计时饰品 → 0.988） |
| minute | `TIMER_MINUTE=60`；不 refill、不衰减 |
| 绝杀窗 | `BUZZER_WINDOW=5`；空中球仍可进 |

### 5.4 场景灾害 / 词条

| id | 中文 | 池 |
|----|------|-----|
| `none` | 无词条 | 街头肉鸽 roll 池 |
| `ghost-rings` | 游魂圈 | 街头池 |
| `grave-hands` | 墓地手 | 街头池 |
| `yard-lights` | 放风探照 | **监狱场景强制**（不进街头 roll） |

`rollStageModifier`：`["none","ghost-rings","grave-hands"]` 均匀。

### 5.5 肉鸽

| 项 | 代码事实（193275b） |
|----|---------------------|
| 正式关数 | `ROGUE_CAMPAIGN_STAGES = 9` |
| 目标分 | 400,700,1100,1700,2600,4000,6000,8500,11000；endless ×1.22^超关 |
| 金币结算 | `base=⌊target/10⌋ + peakStreak + over(超出目标分)`（`special` 字段现恒 0） |
| 开局融合 | `fusePicked`；可多副球（开发者最多测 3）；玩家开局选一或「不融合」 |
| 商店 | 道具+饰品，稀有度权重 common4 / rare2.2 / epic1 / legendary0.4 |
| 重生上限 | `REVIVE_CAP=2` |

完整道具/饰品表见 `rogue-catalog.ts` / `docs/rogue-shop-catalog.md`（以 catalog 代码为准）。

### 5.6 平衡钩子

| 钩子 | 说明 |
|------|------|
| 会话 | `balanceStart(ballId, baseline)`，通常在 minute + 开发者 |
| 三态 | baseline / skill off / skill on |
| R0 | 关技能 / B ≈ `1−kS` ± tolerance |
| R1 | 开技能 / B ∈ [0.9,1.1] |
| 自动 S | 遥测估分，**不改**手填 S，样本建议 ≥10 局标「暂算」 |
| 技能归因 | `noteBalanceSkillEffect`：直接进球/挽救/未归因分等 |

---

## 6. 设计约定（约定 / 待实现）

下列条目来自指挥官流程约定；**标「代码已落实」或「待实现」**。

| # | 约定 | 状态 |
|---|------|------|
| 1 | **经典模式手感固定**：非开发者经典/1分钟只用球种表 `phys`，不吃肉鸽饰品乘子 | ✅ 代码：`pMul` 仅 rogue 乘 `roguePhysMul` |
| 2 | **肉鸽多数球以经典球（plain）为基准浮动**：饰品改 jump/grav/ball/rim；或开局 roll 球种 | ⚠️ 部分落实（饰品乘子✅；「相对 plain 浮动表」无独立数据） |
| 3 | **融合时各 phys 参数在两球取值间随机** | ❌ **待实现**——现逻辑是主球 phys 原样，副球只贡献技能与 `rScale` |
| 4 | **弹力球 / 玻璃球等靠手感拿分的球锁定手感**（不被饰品/随机融合改核心 phys） | ⚠️ 约定；代码未对 rubber/glass 排除 `roguePhysMul`（玻璃 `ball=0` 乘子后仍 0；弹力 `ball=2` 仍可被打气筒抬） |
| 5 | **开局可 roll**：标题「随机球」从可玩池抽取 | ✅ `game-view.tsx` |
| 6 | **合并需指挥官说「合并」** | 流程约定（文档/协作门闩，非代码门闩）——未口令不擅自合并分支/PR |
| 7 | 冠军球禁止 1分钟 | ✅ UI + 逻辑 |
| 8 | 火箭 / 迷宫 / 监狱球数据保留未上架 | ✅ `playable:false` |

### 协作备忘

- 改手感数字：优先改 `balls.ts` 的 `phys` / `rScale`，或开发者控制台试完再回写。
- 改肉鸽强度：`rogue-catalog.ts` 与 `STAGE_TARGETS`。
- 改矢量手感：`vector.ts` 的 `VECTOR`（当前短按脉冲已按 PR#21）。
- 改超能冲刺距离：`SUPER.dashDiameters`（现 **5**；技能文案写「五个球直径」）。

---

## 7. 关键文件索引

| 路径 | 用途 |
|------|------|
| `src/game/balls.ts` | 球种权威表、融合、可玩过滤 |
| `src/game/dev.ts` | DevPhys、clamp、开发者模式枚举 |
| `src/game/engine.ts` | 物理 `pMul`、计分、穿屏、时钟、全技能运行时 |
| `src/game/vector.ts` | 矢量储能/短按/长按/漏能 |
| `src/game/super.ts` | 超能冲刺/护盾/完美取消 |
| `src/game/rogue.ts` | 关卡目标、金币、`roguePhysMul`、跑局状态 |
| `src/game/rogue-catalog.ts` | 商店目录 id/名/价/效果 |
| `src/game/balance-test.ts` | R0/R1/S/自动 S |
| `src/game/modifiers.ts` | 词条工厂与标签 |
| `src/game/modifiers/ghost-rings.ts` | 游魂圈 |
| `src/game/modifiers/grave-hands.ts` | 墓地手 |
| `src/game/modifiers/yard-lights.ts` | 放风探照 |
| `src/game/scenes.ts` | 街头/监狱/都市资源 |
| `src/game/types.ts` | PlayMode、热度、CloudMode、HUD |
| `src/game/audio.ts` | BGM/SFX 总线 |
| `src/game/render.ts` | 绘制（无贴图球的程序外观） |
| `src/game/save.ts` | 本机存档含 `playMode` / best |
| `src/components/game-view.tsx` | 模式选择、融合 UI、结算/商店壳 |
| `src/components/dev-console.tsx` | 开发者控制台 |
| `README.md` / `docs/pitch.md` | 对外说明（部分数字可能过期） |
| `docs/rogue-shop-catalog.md` | 商店人读表 |

### 与 README 的已知偏差（以代码为准）

| 主题 | README/pitch | 代码 193275b |
|------|--------------|--------------|
| 肉鸽关数/目标 | 5 关 / 每关 200 | 9 关 / `STAGE_TARGETS` 递增至 11000 |
| 玻璃基础分文案 | 从 20 起、固定扣分表 | `GLASS_BASE_START=30`，冲击缩放扣分 |
| 忍者分身阈值 | 10/26/**40** | **10/26/47** |
| 超能冲刺 | （技能串：五个直径） | `dashDiameters:5` ✅ 一致 |

---

## 附录 A · 经典 / 默认数值速查

| 符号 | 值 |
|------|-----|
| 仿真步 | `STEP = 1/60` |
| 经典钟起点 | 15s |
| 钟衰减 | ×0.972 / make |
| 钟最短 | 2.6s |
| 1分钟 | 60s |
| 连击窗 | 4s |
| 云 BPM | 90 |
| 玻璃基础 | 30 → max 50；空心治疗 +4 |
| 矢量 cap / 短按耗 / 长按最小 / 锁储 | 1500 / 250 / 40 / 10s |
| 超能段 / 冲刺直径 / 滞空 / 完美窗 | 20 分一段×6 / 5Ø / 0.2s / 0.07s |
| 闪电过热 | 3s |

## 附录 B · 待查

| 项 | 说明 |
|----|------|
| 迷宫球正式手感与开放排期 | `playable:false`，仅开发者可测 |
| 火箭球燃料数值表 | 逻辑在 `rocket.ts`，本文未逐条展开 |
| 反重力黑洞每秒计分曲线 | `engine.ts` 洞存活计分段落，细则待指挥官需要时再拆 |
| README 与代码同步 | 文档债，非玩法债 |
| 融合 phys 随机插值 | 约定待实现 |
| 「代打」正式工具名 | 现指平衡会话代打流程，无独立 `daida` id |

---

*生成自只读 checkout `193275b`。更新本文时请重新对照 `balls.ts` / `dev.ts` / `engine.ts` pMul / `rogue.ts` STAGE_TARGETS / `vector.ts` VECTOR / `super.ts` SUPER。*
