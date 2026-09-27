import { useRef, useState } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { FileCode, Link as LinkIcon, Plus, Search, SearchX } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";
import { callTool } from "@/api/bridge";
import { invalidateHedgeState } from "@/api/queries";
import type { AppsOverviewOutput, ScriptRow, ScriptsOverviewOutput, SyncAttachmentsOutput } from "@/api/tools.gen";
import { ChangePreviewDialog, renderWords } from "@/components/app/change-preview-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorPanel } from "@/components/app/error-panel";
import { Mono } from "@/components/app/mono";
import { StatusIcon } from "@/components/app/status-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useListKeyboard } from "@/hooks/use-list-keyboard";
import { describeActions, describeState, type ChangeRow } from "@/lib/actions";
import { appName } from "@/lib/format";
import type { StatusKey } from "@/lib/status";
import { cn } from "@/lib/utils";
import { NewScriptDialog } from "./new-script-dialog";

/** A row's DOM id, under the `script-` prefix `useListKeyboard` expects. */
const rowId = (name: string) => `script-${name}`;

/** Case-insensitive match against the fields the toolbar's filter promises to search. */
function matches(q: string, row: ScriptRow): boolean {
  return (
    row.name.toLowerCase().includes(q) ||
    (row.target?.app_name.toLowerCase().includes(q) ?? false) ||
    (row.target?.event.toLowerCase().includes(q) ?? false)
  );
}

/** The rows this screen actually shows for `data`, narrowed by `filterText` — shared with `ScriptsScreen` so
 *  its "nothing selected" filler agrees with what the list displays. */
export function filterScripts(data: ScriptsOverviewOutput | undefined, filterText: string) {
  const scripts = data?.scripts ?? [];
  const q = filterText.trim().toLowerCase();
  const filtered = q === "" ? scripts : scripts.filter((r) => matches(q, r));
  return { scripts, filtered };
}

/** `no_target`'s word depends on whether the script even has a manifest (design direction, Task 12 step 1). */
function noTargetWord(row: ScriptRow): string {
  return row.manifest ? "no app event" : "no manifest";
}

/** The row's second-line state word, from `attachment` (Task 12 step 1's own table — distinct from the
 *  detail's `STATUS`-based chip, since these phrases describe the *target*, not a fixed vocabulary). */
function attachmentWord(row: ScriptRow): string {
  const a = row.attachment;
  switch (a.state) {
    case "attached":
      return "attached";
    case "staged":
      return "apply in OffShoot Helper";
    case "other_script":
      return `runs ${a.script} from ${a.profile}`;
    case "external":
      return "runs your own file";
    case "stale":
      return "points at a missing file";
    case "free":
      return "nothing attached";
    case "manual":
      return "attach by hand";
    case "unsupported":
      return "not supported yet";
    case "unknown":
      return "can't read the app's settings";
    case "no_target":
      return noTargetWord(row);
    default: {
      const exhaustive: never = a;
      throw new Error(`unknown attachment state: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function rowSubtitle(row: ScriptRow): string {
  const word = attachmentWord(row);
  const base = row.target ? `${row.target.app_name} · ${row.target.event} · ${word}` : word;
  return row.unmet.length > 0 ? `${base} · ${row.unmet.length} unmet` : base;
}

/** The row's right-hand status icon, by priority (design direction, Task 12 step 1): a manifest/catalog
 *  error or an unmet requirement is a problem worth flagging even on an otherwise-attached script. */
export function rowStatusKey(row: ScriptRow): StatusKey {
  if (row.manifest_error || row.catalog_error) return "alert";
  if (row.unmet.length > 0) return "varMissing";
  if (row.attachment.state === "staged") return "staged";
  if (row.attachment.state === "attached") return "attached";
  return "detached";
}

function ScriptRowView({ row, selected }: { row: ScriptRow; selected: boolean }) {
  return (
    <Link
      href={`/scripts/${encodeURIComponent(row.name)}`}
      id={rowId(row.name)}
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      className={cn(
        "flex flex-col gap-0.5 border-l-2 px-2.5 py-1.5 transition-colors duration-120",
        selected ? "border-l-primary bg-accent" : "border-l-transparent hover:bg-accent/50",
      )}
    >
      <span className="flex items-center gap-1.5">
        <Mono className="min-w-0 flex-1 truncate text-sm" title={row.name}>
          {row.name}
        </Mono>
        <StatusIcon status={rowStatusKey(row)} className="shrink-0" />
      </span>
      <span className="truncate text-xs text-muted-foreground">{rowSubtitle(row)}</span>
    </Link>
  );
}

function ScriptListSkeleton() {
  return (
    <div className="flex flex-col gap-1.5 p-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-10 shrink-0" />
      ))}
    </div>
  );
}

/**
 * The Scripts list (spec §6.4): a filter and New toolbar, a full-width Sync button, one flat listbox. Sync
 * (profile-wide) and New (a modal, not a route) both live here rather than the detail pane.
 */
export function ScriptList({ overview, appsOverview, selectedName, filterText, onFilterTextChange, onSelect }: {
  overview: UseQueryResult<ScriptsOverviewOutput>;
  appsOverview: UseQueryResult<AppsOverviewOutput>;
  selectedName: string | null;
  filterText: string;
  onFilterTextChange: (text: string) => void;
  onSelect: (name: string) => void;
}) {
  // See VariableList: keeps the *last* error across the "pending" flicker a retry causes.
  const lastError = useRef<unknown>(null);
  if (overview.isError) lastError.current = overview.error;
  else if (overview.isSuccess) lastError.current = null;

  const [newOpen, setNewOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);

  const data = overview.data;
  const { scripts, filtered } = filterScripts(data, filterText);
  const profile = data?.profile;

  const rowIds = filtered.map((r) => rowId(r.name));
  const selectedRowId = selectedName !== null && filtered.some((r) => r.name === selectedName) ? rowId(selectedName) : null;
  const onRowSelect = (id: string) => onSelect(id.slice("script-".length));
  const onKeyDown = useListKeyboard(rowIds, selectedRowId, onRowSelect, (id) => id);

  if (lastError.current !== null && !overview.isSuccess) {
    return (
      <div className="flex h-full flex-col">
        <div className="p-3">
          <ErrorPanel error={overview.error ?? lastError.current} onRetry={() => void overview.refetch()} retrying={overview.isFetching} />
        </div>
      </div>
    );
  }

  const toolbar = (
    <div className="flex shrink-0 flex-col gap-1.5 border-b border-border px-2 py-1.5">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
          <Input
            ref={filterInputRef}
            value={filterText}
            onChange={(e) => onFilterTextChange(e.target.value)}
            placeholder="Filter scripts"
            aria-label="Filter scripts"
            className="h-7 pl-7"
          />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button ref={newButtonRef} size="sm" disabled={!data} onClick={() => setNewOpen(true)}>
              <Plus aria-hidden strokeWidth={1.75} /> New
            </Button>
          </TooltipTrigger>
          <TooltipContent>New script from a template</TooltipContent>
        </Tooltip>
      </div>
      <Button variant="outline" size="sm" className="w-full" disabled={!data} onClick={() => setSyncOpen(true)}>
        <LinkIcon aria-hidden strokeWidth={1.75} /> Sync attachments to this profile
      </Button>
    </div>
  );

  let body: React.ReactNode;
  if (overview.isPending) {
    body = <ScriptListSkeleton />;
  } else if (scripts.length === 0) {
    body = (
      <EmptyState
        icon={FileCode}
        title="No scripts yet"
        className="px-3 py-6"
        action={
          <Button size="sm" disabled={!data} onClick={() => setNewOpen(true)}>
            New script
          </Button>
        }
      >
        Scripts run when a Hedge app fires an event. Start one from a template.
      </EmptyState>
    );
  } else if (filtered.length === 0) {
    body = <EmptyState icon={SearchX} title={`No scripts match “${filterText.trim()}”`} className="px-3 py-6" />;
  } else {
    body = (
      <div
        role="listbox"
        aria-label="Scripts"
        tabIndex={0}
        aria-activedescendant={selectedRowId ?? undefined}
        onKeyDown={onKeyDown}
        className="flex flex-col p-2 focus-visible:outline-offset-[-2px]"
      >
        {filtered.map((row) => (
          <ScriptRowView key={row.name} row={row} selected={selectedRowId === rowId(row.name)} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {toolbar}
      <div className="relative min-h-0 flex-1 overflow-y-auto">{body}</div>
      {data && (
        <NewScriptDialog
          open={newOpen}
          onOpenChange={setNewOpen}
          profile={data.profile}
          appsOverview={appsOverview}
          onCloseFocus={() => newButtonRef.current?.focus()}
          onCreated={onSelect}
        />
      )}
      {profile && (
        <ChangePreviewDialog
          open={syncOpen}
          onOpenChange={setSyncOpen}
          title="Sync attachments"
          applyLabel="Sync"
          plan={() => callTool("sync_attachments", { dry_run: true, profile })}
          describe={(p: SyncAttachmentsOutput) => {
            const changes: ChangeRow[] = [
              ...p.attach.map((item): ChangeRow => ({
                kind: "attach",
                target: `${appName(item.app)} · ${item.event}`,
                detail: { text: "run ", path: item.script },
              })),
              ...p.detach.map((item): ChangeRow => ({
                kind: "detach",
                target: `${appName(item.app)} · ${item.event}`,
                detail: { text: "stop running ", path: item.script },
              })),
              ...describeActions(p.actions),
            ];
            const warnings: React.ReactNode[] = [
              ...p.attach
                .filter((item) => item.replaces)
                .map((item) => (
                  <>
                    {appName(item.app)} · {item.event} now runs {renderWords(describeState(item.replaces!))}.
                  </>
                )),
              ...p.conflicts.map((c) => (
                <>
                  {c.scripts.join(", ")} all target {appName(c.app)} · {c.event}; none was attached.
                </>
              )),
              ...p.skipped.map((s) => (
                <>
                  {s.script}: {s.reason}
                </>
              )),
            ];
            const nothingToDo =
              p.attach.length === 0 && p.detach.length === 0 && p.conflicts.length === 0 && p.skipped.length === 0
                ? "The Hedge apps already run this profile's scripts."
                : undefined;
            return {
              summary: (
                <>
                  Make the Hedge apps run <Mono className="text-foreground">{profile}</Mono>'s scripts.
                </>
              ),
              changes,
              warnings: warnings.length > 0 ? warnings : undefined,
              nothingToDo,
            };
          }}
          apply={() => callTool("sync_attachments", { profile })}
          onApplied={(result) => {
            invalidateHedgeState();
            toast(`Synced ${profile}'s scripts`);
            // Ruling (Task 12, per the brief's own note): the real tools add this macOS-worded note on every
            // OS, so it is only shown when the machine actually is one.
            if (appsOverview.data?.os === "macos" && result.note) toast(result.note, { duration: 8000 });
          }}
        />
      )}
    </div>
  );
}
