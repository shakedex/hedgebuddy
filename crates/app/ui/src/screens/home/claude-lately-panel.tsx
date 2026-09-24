import { Plug } from "lucide-react";
import { Link } from "wouter";
import type { ActivityRecord } from "@/api/tools.gen";
import { EmptyState } from "@/components/app/empty-state";
import { Mono } from "@/components/app/mono";
import { Panel } from "@/components/app/panel";
import { StatusIcon } from "@/components/app/status-icon";
import { Button } from "@/components/ui/button";
import { when } from "@/lib/format";
import { outcomeKey } from "@/lib/status";

/** Spec §6.1 "Claude, lately": Claude's last 3 tool calls. A call that just succeeded needs no icon. */
export function ClaudeLatelyPanel({ records, className }: { records: ActivityRecord[]; className?: string }) {
  return (
    <Panel title="Claude, lately" className={className}>
      {records.length === 0 ? (
        <EmptyState
          icon={Plug}
          title="Claude hasn't used HedgeBuddy yet"
          className="px-2 py-3"
          action={
            <Button variant="outline" size="sm" asChild>
              <Link href="/connect">Connect Claude</Link>
            </Button>
          }
        >
          Connect Claude so it can set up variables and scripts for you.
        </EmptyState>
      ) : (
        records.slice(0, 3).map((record, i) => (
          <div key={i} className="flex h-8 items-center gap-2 rounded-md px-2 text-sm">
            <Mono className="shrink-0 text-sm" title={record.tool}>
              {record.tool}
            </Mono>
            <Mono className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={record.target ?? undefined}>
              {record.target ?? "—"}
            </Mono>
            {record.outcome !== "ok" && <StatusIcon status={outcomeKey(record.outcome)} />}
            <span className="readout shrink-0 text-xs text-muted-foreground">{when(record.ts)}</span>
          </div>
        ))
      )}
    </Panel>
  );
}
