import type { PlayMode } from "./types";

export type ComboBreakState = {
  mode: PlayMode; blueprint: boolean; buzzer: boolean;
  streak: number; comboCounting: boolean; combo: number;
  rogueRun: boolean; pendingPaid: boolean; paidCharges: number; rogueSaved: boolean;
};
export type ComboBreakAction = "ignored" | "blueprint" | "paidPrompt" | "rogueSaved" | "break";
/** 所有真实断连来源共用此决策；不改计时器或付费状态，由引擎执行原有动作。 */
export function resolveComboBreak(state: ComboBreakState, consumeBlueprint: () => boolean): ComboBreakAction {
  if (state.buzzer || (state.streak <= 0 && !state.comboCounting && state.combo <= 0)) return "ignored";
  // 热量残留或尚无连击不是可保住的当前连击，不能白扣一次。
  if (state.blueprint && state.streak > 0 && state.comboCounting && consumeBlueprint()) return "blueprint";
  if (state.mode === "rogue" && state.rogueRun && !state.pendingPaid && state.streak >= 3 && state.paidCharges > 0) return "paidPrompt";
  if (state.mode === "rogue" && state.rogueSaved) return "rogueSaved";
  return "break";
}
