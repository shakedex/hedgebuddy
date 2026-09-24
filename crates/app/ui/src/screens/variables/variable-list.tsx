import { useMemo, useRef, useState } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Braces, Plus, Search, SearchX, TriangleAlert } from "lucide-react";
import { Link } from "wouter";
import { usePathStatus } from "@/api/queries";
import type { RequirementRow, VariablesOverviewOutput, VarView } from "@/api/tools.gen";
import { CreateProfileDialog } from "@/components/app/create-profile-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorPanel } from "@/components/app/error-panel";
import { Mono } from "@/components/app/mono";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useListKeyboard } from "@/hooks/use-list-keyboard";
import { summarize } from "@/lib/var-values";
import { cn } from "@/lib/utils";

/** A pinned row's DOM id (a requirement with no value, or the wrong type) and a variable row's, both under
 *  the `var-` prefix `useListKeyboard` expects. The two can name the same variable (a type mismatch is a
 *  real, stored variable too), so they stay distinguishable ids in one flat listbox. */
const needRowId = (name: string) => `var-need-${name}`;
const varRowId = (name: string) => `var-${name}`;

/** Case-insensitive match against name, type and description (the toolbar filter's promise). */
function matches(q: string, name: string, type: string, description: string): boolean {
  return name.toLowerCase().includes(q) || type.toLowerCase().includes(q) || description.toLowerCase().includes(q);
}

/**
 * The rows this screen actually shows for `data`, narrowed by `filterText` — shared with `VariablesScreen`
 * so its "nothing selected" filler agrees with what the list displays instead of counting every requirement
 * (including ones already `set` or `defaulted`, which never get their own row) and ignoring the filter.
 */
export function filterOverview(data: VariablesOverviewOutput | undefined, filterText: string) {
  const variables = data?.variables ?? [];
  const needs = (data?.requirements ?? []).filter((r) => r.state === "missing" || r.state === "type_mismatch");
  const q = filterText.trim().toLowerCase();
  const filteredNeeds = q === "" ? needs : needs.filter((r) => matches(q, r.name, r.type, r.description));
  const filteredVars = q === "" ? variables : variables.filter((v) => matches(q, v.name, v.type, v.description));
  return { variables, needs, filteredNeeds, filteredVars };
}

/** "`<type>` · needed by `<first script>`", plus "and N more" once a second script also needs it. */
function neededByLine(row: RequirementRow): string {
  const scripts = row.required_by.map((r) => r.script);
  const first = scripts[0] ?? "a script";
  const extra = scripts.length - 1;
  return `${row.type} · needed by ${first}${extra > 0 ? ` and ${extra} more` : ""}`;
}

/** The path(s) a `path` or `path[]` variable's value names, for the shared `usePathStatus` check; empty for
 *  every other type (or one with no value yet). */
function pathValuesOf(v: VarView): string[] {
  if (v.type === "path" && typeof v.value === "string" && v.value.trim() !== "") return [v.value];
  if (v.type === "path[]" && Array.isArray(v.value)) return v.value.filter((p): p is string => typeof p === "string" && p.trim() !== "");
  return [];
}

function NeedRow({ row, selected }: { row: RequirementRow; selected: boolean }) {
  return (
    <Link
      href={`/variables/${encodeURIComponent(row.name)}`}
      id={needRowId(row.name)}
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      className={cn(
        "flex items-start gap-2 rounded-md border border-warning-border bg-warning-tint px-2.5 py-1.5 transition-colors duration-120",
        selected ? "ring-1 ring-inset ring-primary" : "hover:bg-warning-tint/70",
      )}
    >
      <Braces aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warning" strokeWidth={1.75} />
      <div className="min-w-0 flex-1">
        <Mono className="block truncate text-sm">{row.name}</Mono>
        <p className="truncate text-xs text-warning/90">{neededByLine(row)}</p>
      </div>
      <span className="shrink-0 self-center text-xs font-medium text-warning">{row.state === "missing" ? "Add" : "Fix"}</span>
    </Link>
  );
}

function VariableRow({ v, selected, notMounted }: { v: VarView; selected: boolean; notMounted: boolean }) {
  return (
    <Link
      href={`/variables/${encodeURIComponent(v.name)}`}
      id={varRowId(v.name)}
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      className={cn(
        "flex flex-col gap-0.5 border-l-2 px-2.5 py-1.5 transition-colors duration-120",
        selected ? "border-l-primary bg-accent" : "border-l-transparent hover:bg-accent/50",
      )}
    >
      <Mono className="truncate text-sm">{v.name}</Mono>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="truncate">
          {v.type} · {summarize(v.type, v.value)}
        </span>
        {notMounted && (
          <span title="Drive not connected" className="inline-flex shrink-0 items-center">
            <TriangleAlert aria-hidden className="size-3.5 text-warning" strokeWidth={1.75} />
            <span className="sr-only">Drive not connected</span>
          </span>
        )}
      </span>
    </Link>
  );
}

function VariableListSkeleton() {
  return (
    <div className="flex flex-col gap-1.5 p-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 7 }, (_, i) => (
        <Skeleton key={i} className="h-9 shrink-0" />
      ))}
    </div>
  );
}

/**
 * The Variables list (spec §6.3, option B): a filter and New toolbar, missing/mismatched requirements pinned
 * above the profile's own variables, one flat listbox. `noProfile` (from `list_profiles`) takes priority over
 * whatever `overview` itself is doing, since with no active profile that query only ever errors.
 */
export function VariableList({ overview, selectedName, filterText, onFilterTextChange, onSelect, noProfile }: {
  overview: UseQueryResult<VariablesOverviewOutput>;
  selectedName: string | null;
  filterText: string;
  onFilterTextChange: (text: string) => void;
  onSelect: (name: string) => void;
  noProfile: boolean;
}) {
  // See RunList: keeps the *last* error across the "pending" flicker a retry causes.
  const lastError = useRef<unknown>(null);
  if (overview.isError) lastError.current = overview.error;
  else if (overview.isSuccess) lastError.current = null;

  const [createOpen, setCreateOpen] = useState(false);
  const newProfileRef = useRef<HTMLButtonElement>(null);

  const data = overview.data;
  const { variables, needs, filteredNeeds, filteredVars } = filterOverview(data, filterText);

  const allPaths = useMemo(() => variables.flatMap(pathValuesOf), [variables]);
  const pathStatus = usePathStatus(allPaths);
  const notMountedOf = (v: VarView) =>
    pathValuesOf(v).some((p) => pathStatus.data?.paths.find((s) => s.path === p)?.mounted === false);

  const rowIds = [...filteredNeeds.map((r) => needRowId(r.name)), ...filteredVars.map((v) => varRowId(v.name))];
  const selectedRowId =
    selectedName !== null && filteredNeeds.some((r) => r.name === selectedName)
      ? needRowId(selectedName)
      : selectedName !== null && filteredVars.some((v) => v.name === selectedName)
        ? varRowId(selectedName)
        : null;
  const onRowSelect = (id: string) => onSelect(id.startsWith("var-need-") ? id.slice("var-need-".length) : id.slice("var-".length));
  const onKeyDown = useListKeyboard(rowIds, selectedRowId, onRowSelect, (id) => id);

  // No profile and a failed load each replace the whole pane (see RunList): neither the filter nor New would
  // do anything useful yet.
  if (noProfile) {
    return (
      <div className="flex h-full flex-col">
        <EmptyState
          icon={Braces}
          title="No profile yet"
          className="px-3 py-6"
          action={
            <Button ref={newProfileRef} size="sm" onClick={() => setCreateOpen(true)}>
              New profile
            </Button>
          }
        >
          Variables belong to a profile — create one to start adding them.
        </EmptyState>
        <CreateProfileDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          activate
          onCloseFocus={() => newProfileRef.current?.focus()}
        />
      </div>
    );
  }
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
    <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1.5">
      <div className="relative min-w-0 flex-1">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
        <Input
          value={filterText}
          onChange={(e) => onFilterTextChange(e.target.value)}
          placeholder="Filter variables"
          aria-label="Filter variables"
          className="h-7 pl-7"
        />
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild size="icon">
            <Link href="/variables/new" aria-label="New variable">
              <Plus aria-hidden strokeWidth={1.75} />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent>New variable</TooltipContent>
      </Tooltip>
    </div>
  );

  let body: React.ReactNode;
  if (overview.isPending) {
    body = <VariableListSkeleton />;
  } else if (needs.length === 0 && variables.length === 0) {
    body = (
      <EmptyState
        icon={Braces}
        title="No variables yet"
        className="px-3 py-6"
        action={
          <Button asChild size="sm">
            <Link href="/variables/new">New variable</Link>
          </Button>
        }
      >
        Variables hold the values your scripts read, such as a project name or a Slack webhook.
      </EmptyState>
    );
  } else if (filteredNeeds.length === 0 && filteredVars.length === 0) {
    body = <EmptyState icon={SearchX} title={`No variables match “${filterText.trim()}”`} className="px-3 py-6" />;
  } else {
    body = (
      <div
        role="listbox"
        aria-label="Variables"
        tabIndex={0}
        aria-activedescendant={selectedRowId ?? undefined}
        onKeyDown={onKeyDown}
        className="flex flex-col gap-3 p-2 focus-visible:outline-offset-[-2px]"
      >
        {filteredNeeds.length > 0 && (
          <div role="group" aria-label="Needs a value" className="flex flex-col gap-1">
            <div className="micro-label px-1">Needs a value</div>
            <div className="flex flex-col gap-1">
              {filteredNeeds.map((r) => (
                <NeedRow key={r.name} row={r} selected={selectedRowId === needRowId(r.name)} />
              ))}
            </div>
          </div>
        )}
        {filteredVars.length > 0 && (
          <div role="group" aria-label="Variables" className="flex flex-col gap-1">
            <div className="micro-label px-1">Variables</div>
            <div className="flex flex-col">
              {filteredVars.map((v) => (
                <VariableRow key={v.name} v={v} selected={selectedRowId === varRowId(v.name)} notMounted={notMountedOf(v)} />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {toolbar}
      <div className="relative min-h-0 flex-1 overflow-y-auto">{body}</div>
    </div>
  );
}
