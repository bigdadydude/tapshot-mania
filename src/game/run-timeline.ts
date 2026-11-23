import { TIMELINE_CLOCK, TIMELINE_MAX_EVENTS, type TimelineEvent, type TimelineEventKind } from "../lib/leaderboard/constants.ts";
export type { TimelineEvent, TimelineEventKind };

export type RunTimeline = {
  events: TimelineEvent[];
};

export { TIMELINE_CLOCK };

export function createRunTimeline(): RunTimeline {
  return { events: [] };
}

export function resetRunTimeline(t: RunTimeline) {
  t.events = [];
}

function push(t: RunTimeline, event: TimelineEvent) {
  if (t.events.length >= TIMELINE_MAX_EVENTS) return;
  t.events.push(event);
}

function clockT(seconds: number): number {
  const t = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return Math.round(t * 1000) / 1000;
}

export function noteTimelineTap(t: RunTimeline, clockSeconds: number) {
  push(t, { t: clockT(clockSeconds), kind: "tap" });
}

export function noteTimelineHoldStart(t: RunTimeline, clockSeconds: number) {
  push(t, { t: clockT(clockSeconds), kind: "hold_start" });
}

export function noteTimelineHoldRelease(t: RunTimeline, clockSeconds: number) {
  push(t, { t: clockT(clockSeconds), kind: "hold_release" });
}

export function noteTimelineSkill(t: RunTimeline, clockSeconds: number) {
  push(t, { t: clockT(clockSeconds), kind: "skill" });
}

export function noteTimelineMake(t: RunTimeline, clockSeconds: number) {
  push(t, { t: clockT(clockSeconds), kind: "make" });
}

export function noteTimelineScore(t: RunTimeline, clockSeconds: number, points: number) {
  if (!Number.isFinite(points)) return;
  push(t, { t: clockT(clockSeconds), kind: "score", points });
}

export function cloneTimelineEvents(t: RunTimeline): TimelineEvent[] {
  return t.events.map((ev) => (ev.kind === "score" ? { ...ev } : { t: ev.t, kind: ev.kind }));
}

export function isTimelineEventKind(value: unknown): value is TimelineEventKind {
  return (
    value === "tap" ||
    value === "hold_start" ||
    value === "hold_release" ||
    value === "skill" ||
    value === "make" ||
    value === "score"
  );
}
