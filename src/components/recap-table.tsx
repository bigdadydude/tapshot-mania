import { recapRows } from "@/game/run-recap";
import type { RunRecap } from "@/game/types.ts";
import { displayNickname } from "@/lib/leaderboard/nickname.ts";

function RecapNameReadOnly({ nickname }: { nickname: string }) {
  return (
    <div className="border-b border-border/60 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="shrink-0 text-sm text-muted">名称</span>
        <span className="min-w-0 flex-1 truncate text-right font-sans text-base font-semibold text-fg">
          {displayNickname(nickname)}
        </span>
      </div>
    </div>
  );
}

export function RecapTable({
  recap,
  hideRogueDuplicates = false,
  nickname = "",
}: {
  recap: RunRecap;
  hideRogueDuplicates?: boolean;
  nickname?: string;
}) {
  const rows = recapRows(recap, { hideRogueDuplicates });
  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch]"
      style={{ touchAction: "pan-y", WebkitOverflowScrolling: "touch" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-4 py-2">
        <p className="mb-1 text-[10px] font-medium tracking-widest text-subtle">本局数据</p>
        <div className="space-y-0">
          <RecapNameReadOnly nickname={nickname} />
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between border-b border-border/60 py-2.5 last:border-b-0"
            >
              <span className="text-sm text-muted">{row.label}</span>
              <span className="font-sans text-base font-semibold tabular-nums text-fg">
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
