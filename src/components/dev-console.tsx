import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Pause } from "lucide-react";
import {
  DEV_FX,
  DEV_GRAF,
  DEV_MODIFIERS,
  DEV_MOVES,
  DEV_PHYS,
  DEV_PLAY_MODES,
  DEV_SCENES,
  DEV_STAGES,
  type DevCmd,
  type DevPhys,
} from "@/game/dev";
import type { DevHud } from "@/game/dev";
import { playableBalls } from "@/game/balls";
import type { PlayMode } from "@/game/types";
import { modifierName } from "@/game/modifiers";
import { cn } from "@/lib/utils";

type Tab = "match" | "fx" | "phys" | "world";

export function DevConsole({
  dev,
  score,
  combo,
  onCmd,
  onMenu,
  onSearchlights,
}: {
  dev: DevHud;
  score: number;
  combo: number;
  onCmd: (cmd: DevCmd) => void;
  onMenu: () => void;
  onSearchlights: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<Tab>("match");

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center">
      <div className="pointer-events-auto w-full max-w-[min(100%,calc(100dvh*9/16))] px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
        <div className="mb-1 flex gap-1">
          <button
            type="button"
            onClick={onMenu}
            className="flex size-9 items-center justify-center rounded-lg border border-border bg-bg-elevated"
            aria-label="菜单"
          >
            <Pause className="size-4 text-fg" />
          </button>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex h-9 flex-1 items-center justify-between rounded-lg border border-border bg-bg-elevated px-3"
          >
            <span className="text-xs font-medium tracking-widest text-muted">开发者控制台</span>
            {open ? <ChevronDown className="size-4 text-muted" /> : <ChevronUp className="size-4 text-muted" />}
          </button>
        </div>
        {open ? (
          <div className="max-h-[min(46dvh,24rem)] overflow-y-auto rounded-xl border border-border bg-bg-elevated p-3 shadow-lg">
            <div className="mb-3 grid grid-cols-4 gap-1 rounded-lg border border-border bg-bg-subtle p-1">
              {(
                [
                  ["match", "对局"],
                  ["fx", "特效"],
                  ["phys", "物理"],
                  ["world", "场景"],
                ] as [Tab, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={cn(
                    "h-9 rounded-md text-sm font-medium",
                    tab === id ? "bg-accent text-accent-fg" : "text-fg",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {tab === "match" ? (
              <MatchTab score={score} combo={combo} freeze={dev.freeze} holdHeat={dev.holdHeat} onCmd={onCmd} />
            ) : null}
            {tab === "fx" ? <FxTab sear={dev.sear} burning={dev.burning} moveKind={dev.moving ? dev.moveKind : -1} onCmd={onCmd} /> : null}
            {tab === "phys" ? <PhysTab phys={dev.phys} onCmd={onCmd} /> : null}
            {tab === "world" ? (
              <WorldTab
                scene={dev.scene}
                ballId={dev.ballId}
                fuseBall={dev.fuseBall}
                playMode={dev.playMode}
                modifierForce={dev.modifierForce}
                modifier={dev.modifier}
                onCmd={onCmd}
                onSearchlights={onSearchlights}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Chip({
  label,
  on,
  onClick,
}: {
  label: string;
  on?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-9 min-w-11 rounded-md px-2.5 text-sm font-medium",
        on ? "bg-accent text-accent-fg" : "border border-border bg-bg-subtle text-fg",
      )}
    >
      {label}
    </button>
  );
}

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <p className="mb-1.5 text-xs tracking-widest text-muted">{title}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function MatchTab({
  score,
  combo,
  freeze,
  holdHeat,
  onCmd,
}: {
  score: number;
  combo: number;
  freeze: boolean;
  holdHeat: boolean;
  onCmd: (cmd: DevCmd) => void;
}) {
  return (
    <div>
      <Row title={`得分 ${score}`}>
        <Chip label="-10" onClick={() => onCmd({ t: "addScore", n: -10 })} />
        <Chip label="-1" onClick={() => onCmd({ t: "addScore", n: -1 })} />
        <Chip label="+1" onClick={() => onCmd({ t: "addScore", n: 1 })} />
        <Chip label="+10" onClick={() => onCmd({ t: "addScore", n: 10 })} />
        <Chip label="+50" onClick={() => onCmd({ t: "addScore", n: 50 })} />
        <Chip label="清零" onClick={() => onCmd({ t: "score", n: 0 })} />
      </Row>
      <Row title={`连击 ${combo}`}>
        {DEV_STAGES.map((s) => (
          <Chip key={s.n} label={s.label} on={combo === s.n} onClick={() => onCmd({ t: "combo", n: s.n })} />
        ))}
      </Row>
      <Row title="冷却条">
        <Chip label="冻住" on={freeze} onClick={() => onCmd({ t: "freeze", on: !freeze })} />
        <Chip label="锁热度" on={holdHeat} onClick={() => onCmd({ t: "holdHeat", on: !holdHeat })} />
        <Chip label="满" onClick={() => onCmd({ t: "timer01", n: 1 })} />
        <Chip label="60%" onClick={() => onCmd({ t: "timer01", n: 0.6 })} />
        <Chip label="40%" onClick={() => onCmd({ t: "timer01", n: 0.4 })} />
        <Chip label="10%" onClick={() => onCmd({ t: "timer01", n: 0.1 })} />
        <Chip label="开始计时" onClick={() => onCmd({ t: "armTimer" })} />
        <Chip label="时间到" onClick={() => onCmd({ t: "timeUp" })} />
        <Chip label="绝杀窗" onClick={() => onCmd({ t: "buzzer" })} />
      </Row>
      <Row title="球">
        <Chip label="重置球" onClick={() => onCmd({ t: "resetBall" })} />
      </Row>
    </div>
  );
}

function FxTab({
  sear,
  burning,
  moveKind,
  onCmd,
}: {
  sear: number;
  burning: boolean;
  moveKind: number;
  onCmd: (cmd: DevCmd) => void;
}) {
  return (
    <div>
      <Row title="触发">
        {DEV_FX.map((f) => (
          <Chip key={f.kind} label={f.label} onClick={() => onCmd({ t: "fx", kind: f.kind })} />
        ))}
      </Row>
      <Row title="涂鸦">
        {DEV_GRAF.map((g) => (
          <Chip key={g.key} label={g.label} onClick={() => onCmd({ t: "graf", key: g.key })} />
        ))}
      </Row>
      <Row title="篮架焦痕">
        {([0, 1, 2, 3] as const).map((n) => (
          <Chip key={n} label={String(n)} on={sear === n} onClick={() => onCmd({ t: "sear", n })} />
        ))}
        <Chip label="烧网" on={burning} onClick={() => onCmd({ t: "burnNet", on: !burning })} />
      </Row>
      <Row title="移动篮架">
        {DEV_MOVES.map((m) => (
          <Chip key={m.kind} label={m.label} on={moveKind === m.kind} onClick={() => onCmd({ t: "move", kind: m.kind })} />
        ))}
      </Row>
    </div>
  );
}

function PhysTab({ phys, onCmd }: { phys: DevPhys; onCmd: (cmd: DevCmd) => void }) {
  return (
    <div>
      {DEV_PHYS.map((row) => {
        const pct = Math.round(phys[row.k] * 100);
        const presets = row.min === 0 ? [0, 25, 50, 100, 150, 200] : [50, 80, 100, 130, 160, 200];
        return (
          <div key={row.k} className="mb-3">
            <div className="mb-1 flex items-baseline justify-between">
              <p className="text-xs tracking-widest text-muted">{row.label}</p>
              <p className="text-sm tabular-nums text-fg">{pct}%</p>
            </div>
            <p className="mb-1.5 text-xs text-subtle">{row.hint}</p>
            <input
              type="range"
              min={row.min}
              max={200}
              step={5}
              value={pct}
              onChange={(e) => onCmd({ t: "phys", k: row.k, n: Number(e.target.value) / 100 })}
              className="h-11 w-full accent-accent"
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {presets.map((n) => (
                <Chip
                  key={n}
                  label={`${n}`}
                  on={pct === n}
                  onClick={() => onCmd({ t: "phys", k: row.k, n: n / 100 })}
                />
              ))}
            </div>
          </div>
        );
      })}
      <Row title="预设">
        <Chip label="恢复默认" onClick={() => onCmd({ t: "physReset" })} />
      </Row>
    </div>
  );
}

function WorldTab({
  scene,
  ballId,
  fuseBall,
  playMode,
  modifierForce,
  modifier,
  onCmd,
  onSearchlights,
}: {
  scene: DevHud["scene"];
  ballId: DevHud["ballId"];
  fuseBall: DevHud["fuseBall"];
  playMode: PlayMode;
  modifierForce: DevHud["modifierForce"];
  modifier: DevHud["modifier"];
  onCmd: (cmd: DevCmd) => void;
  onSearchlights: () => void;
}) {
  return (
    <div>
      <Row title="模式">
        {DEV_PLAY_MODES.map((m) => (
          <Chip
            key={m.id}
            label={m.label}
            on={playMode === m.id}
            onClick={() => onCmd({ t: "playMode", mode: m.id })}
          />
        ))}
      </Row>
      {playMode === "rogue" ? (
        <>
          <Row title="肉鸽工具">
            <Chip label="+50金" onClick={() => onCmd({ t: "rogueTool", kind: "gold" })} />
            <Chip label="分数清零" onClick={() => onCmd({ t: "rogueTool", kind: "clearScore" })} />
            <Chip label="开商店" onClick={() => onCmd({ t: "rogueTool", kind: "shop" })} />
            <Chip label="通关结算" onClick={() => onCmd({ t: "rogueTool", kind: "clearSettle" })} />
          </Row>
          <Row title={`关卡词条 · 当前 ${modifierName(modifier)}`}>
            {DEV_MODIFIERS.map((m) => (
              <Chip
                key={m.id}
                label={m.label}
                on={m.id === "auto" ? modifierForce == null : modifierForce === m.id}
                onClick={() => onCmd({ t: "modifier", id: m.id })}
              />
            ))}
          </Row>
          <Row title="融合球">
            {playableBalls()
              .filter((b) => b.id !== ballId)
              .map((b) => (
              <Chip
                key={b.id}
                label={b.name}
                on={fuseBall === b.id}
                onClick={() => onCmd({ t: "rogueFuse", id: b.id })}
              />
            ))}
            <Chip
              label="清除融合"
              on={fuseBall == null}
              onClick={() => onCmd({ t: "rogueFuse", id: null })}
            />
          </Row>
        </>
      ) : null}
      <Row title="场景">
        {DEV_SCENES.map((s) => (
          <Chip key={s.id} label={s.label} on={scene === s.id} onClick={() => onCmd({ t: "scene", id: s.id })} />
        ))}
      </Row>
      <Row title="球">
        {playableBalls().map((b) => (
          <Chip key={b.id} label={b.name} on={ballId === b.id} onClick={() => onCmd({ t: "skin", id: b.id })} />
        ))}
      </Row>
      <Row title="监狱工具">
        <Chip label="探照灯布置" onClick={onSearchlights} />
      </Row>
      <Row title="沙盒">
        <Chip label="退出开发者" onClick={() => onCmd({ t: "exit" })} />
      </Row>
      <p className="text-xs leading-relaxed text-subtle">
        选「肉鸽」可在沙盒里测关卡/商店/饰品。空空间没有墙和天空，街头会载入当前场景包。融合球即时叠加技能，外观仍用主球。「探照灯布置」打开监狱墙面编辑页，可拖动灯位与旋转锚点并保存。
      </p>
    </div>
  );
}
