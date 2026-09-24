import { useMemo, useState } from "react";
import {
  ChevronRight, ChevronsUpDown, Copy, FileCode, History, Plus, RefreshCw, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { BridgeError } from "@/api/bridge";
import type { Action, AttachState, RunStatus, VarType } from "@/api/tools.gen";
import { ChangePreviewDialog, renderWords } from "@/components/app/change-preview-dialog";
import { CountBadge } from "@/components/app/count-badge";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorPanel } from "@/components/app/error-panel";
import { ListDetail } from "@/components/app/list-detail";
import { Mono } from "@/components/app/mono";
import { Panel } from "@/components/app/panel";
import { Stat } from "@/components/app/stat";
import { StatusIcon } from "@/components/app/status-icon";
import { VarEditor } from "@/components/editors/var-editor";
import { EMPTY_SECRET, type SecretState } from "@/components/editors/secret-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { describeActions, describeState, type ChangeKind, type ChangeRow } from "@/lib/actions";
import { appName, clock, dayKey, dayLabel, duration, plural, when } from "@/lib/format";
import { NAV_ICONS, STATUS, runStatusKey, type StatusKey } from "@/lib/status";
import { cn } from "@/lib/utils";
import { VAR_TYPES, emptyEdit, toEdit, validateValue, type EditValue } from "@/lib/var-values";

/*
 * The design system on one page (preview only, `#/_design`). Everything here is read from the live tokens
 * and the real components, so it doubles as the visual check for every later screen.
 */

const TOKEN_GROUPS: { name: string; note: string; tokens: string[] }[] = [
  { name: "Surfaces", note: "Neutral blue-greys, darkest at the edges.", tokens: ["background", "sidebar", "well", "card", "accent", "border", "border-strong"] },
  { name: "Text", note: "Fine is foreground; secondary is muted.", tokens: ["foreground", "foreground-strong", "muted-foreground"] },
  { name: "Signal", note: "Actions, selection and focus; links.", tokens: ["primary", "primary-foreground", "link"] },
  { name: "Failed", note: "Red is only for failures and Delete.", tokens: ["destructive", "destructive-tint", "destructive-border"] },
  { name: "Needs a look", note: "Amber is only for things to check.", tokens: ["warning", "warning-tint", "warning-border"] },
];

const TYPE_STEPS: { cls: string; name: string; spec: string; sample: string; mono: string }[] = [
  { cls: "text-xs", name: "xs", spec: "11.5 / 16", sample: "Micro labels and meta", mono: "SLACK_WEBHOOK" },
  { cls: "text-sm", name: "sm", spec: "12.5 / 18", sample: "Lists, rows and controls", mono: "on_copy_complete.py" },
  { cls: "text-base", name: "base", spec: "13 / 20", sample: "Body and detail text", mono: "~/Hedge/scripts/" },
  { cls: "text-lg", name: "lg", spec: "15 / 22", sample: "Screen titles", mono: "sync_attachments" },
  { cls: "text-stat", name: "stat", spec: "22 / 26", sample: "14", mono: "02:14:07" },
];

/** Today at a local time, or `daysAgo` days back; keeps the fake data readable at any hour. */
function at(h: number, m: number, s = 0, daysAgo = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(h, m, s, 0);
  return d;
}
const iso = (d: Date, plusMs = 0) => new Date(d.getTime() + plusMs).toISOString();

/** The one selection treatment: accent fill plus a 2 px primary bar at the left edge. Needs `relative`. */
const SELECTED = "bg-accent text-foreground-strong before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary";

type FakeRun = {
  id: string; script: string; app: string; event: string; status: RunStatus | null;
  started: string; ended: string | null; exit: number | null; log: string[]; traceback?: string[];
};

const RUNS: FakeRun[] = [
  {
    id: "r1", script: "on_copy_complete.py", app: "offshoot", event: "FileCopyCompleted", status: "failed",
    started: iso(at(2, 14, 7)), ended: iso(at(2, 14, 7), 2400), exit: 1,
    log: ["02:14:08 copy of A003 finished, posting to Slack"],
    traceback: [
      "Traceback (most recent call last):",
      '  File "on_copy_complete.py", line 24, in main',
      "    urllib.request.urlopen(request, timeout=10)",
      "urllib.error.URLError: <urlopen error timed out>",
    ],
  },
  {
    id: "r2", script: "on_copy_complete.py", app: "offshoot", event: "FileCopyCompleted", status: "ok",
    started: iso(at(1, 52, 3)), ended: iso(at(1, 52, 3), 1200), exit: 0,
    log: ["01:52:03 copy of A002 finished, posting to Slack", "01:52:04 posted to #dit-cart"],
  },
  {
    id: "r3", script: "on_disk_added.py", app: "offshoot", event: "DiskAdded", status: "ok",
    started: iso(at(1, 40, 11)), ended: iso(at(1, 40, 11), 340), exit: 0,
    log: ["01:40:11 A003 mounted at /Volumes/A003"],
  },
  {
    id: "r4", script: "foolcat_report.py", app: "foolcat", event: "ReportCreated", status: null,
    started: iso(at(23, 5, 42, 1)), ended: null, exit: null,
    log: ["23:05:42 report for day 12 started"],
  },
];

export function DesignGallery() {
  return (
    <div className="ambient flex h-full flex-col">
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex max-w-[1080px] flex-col gap-10 px-4 pt-5 pb-16 max-[560px]:px-3">
          <div className="flex justify-end">
            <Badge variant="outline">preview only</Badge>
          </div>
          <Section index={1} title="Colour" note="Spec §5.1, read live from the CSS variables. Only red and amber carry hue; primary marks actions, the selection and focus.">
            <Colours />
          </Section>
          <Section index={2} title="Type" note="Inter Variable with cv05 and cv08; JetBrains Mono Variable for names, paths and code. Numbers that change use tabular figures.">
            <TypeScale />
          </Section>
          <Section index={3} title="Status" note="Spec §5.2: every state is an icon and a word. Fine stays grey.">
            <StatusTable />
          </Section>
          <Section index={4} title="Counts and navigation" note="Badges, never dots. The rail variant sits on the collapsed sidebar.">
            <Navigation />
          </Section>
          <Section index={5} title="Readouts" note="Home's four numbers. Failed is tinted only when it is not zero.">
            <Readouts />
          </Section>
          <Section index={6} title="Panels" note="Milled surfaces: hairline border, a 3 % inset highlight, no drop shadow.">
            <Panels />
          </Section>
          <Section index={7} title="States" note="Loading, empty, error and busy: every data view designs all four.">
            <States />
          </Section>
          <Section index={8} title="Actions" note="Every variant at every size. Tab through them: the focus ring is 2 px primary with a 2 px gap.">
            <Buttons />
          </Section>
          <Section index={9} title="Fields and controls" note="Recessed wells for input; an invalid field says why underneath.">
            <Controls />
          </Section>
          <Section index={10} title="List and detail" note="Two panes from 640 px of container width; below that the detail slides over the list with a back button.">
            <ListDetailDemo />
          </Section>
          <Section index={11} title="Change preview" note="Spec §7: any action outside the data folder, and any deletion, opens this dialog. It dry-runs the tool, then shows the plan in plain words; Apply runs it for real.">
            <ChangePreviewGallery />
          </Section>
          <Section index={12} title="Editors" note="Spec §7: one field per variable type. Amber marks a path whose drive isn't mounted — that's a warning, not a validation error; an invalid value's reason sits under the field.">
            <Editors />
          </Section>
        </div>
      </main>
    </div>
  );
}

function Section({ index, title, note, children }: { index: number; title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="animate-rise flex flex-col gap-3" style={{ animationDelay: `${(index - 1) * 40}ms` }}>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="w-6 shrink-0 font-mono text-xs text-muted-foreground">{String(index).padStart(2, "0")}</span>
          <h2 className="text-sm font-semibold text-foreground-strong">{title}</h2>
          <div aria-hidden className="h-px flex-1 bg-border" />
        </div>
        <p className="max-w-[72ch] pl-8 text-sm text-muted-foreground">{note}</p>
      </div>
      {children}
    </section>
  );
}

/* 01 Colour ---------------------------------------------------------------------------------------- */

function Colours() {
  const values = useMemo(() => {
    const css = getComputedStyle(document.documentElement);
    const all = [...TOKEN_GROUPS.flatMap((g) => g.tokens), "brand-from", "brand-to"];
    return Object.fromEntries(all.map((t) => [t, css.getPropertyValue(`--${t}`).trim()]));
  }, []);
  return (
    <div className="flex flex-col gap-4">
      {TOKEN_GROUPS.map((group) => (
        <div key={group.name} className="grid grid-cols-[120px_1fr] gap-3 max-[640px]:grid-cols-1 max-[640px]:gap-2">
          <div className="pt-1">
            <div className="micro-label">{group.name}</div>
            <p className="mt-1 text-xs text-muted-foreground">{group.note}</p>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(204px,1fr))] gap-2">
            {group.tokens.map((t) => (
              <Swatch key={t} name={t} value={values[t]} />
            ))}
          </div>
        </div>
      ))}
      <div className="grid grid-cols-[120px_1fr] gap-3 max-[640px]:grid-cols-1 max-[640px]:gap-2">
        <div className="pt-1">
          <div className="micro-label">Brand</div>
          <p className="mt-1 text-xs text-muted-foreground">The logo mark only.</p>
        </div>
        <div className="surface flex w-fit items-center gap-3 p-3">
          <div aria-hidden className="size-5 rounded-[5px]" style={{ background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))" }} />
          <span className="text-sm font-semibold text-foreground-strong">HedgeBuddy</span>
          <span className="font-mono text-xs text-muted-foreground">
            {values["brand-from"]} → {values["brand-to"]}
          </span>
        </div>
      </div>
    </div>
  );
}

function Swatch({ name, value }: { name: string; value: string }) {
  return (
    <div className="surface flex items-center gap-3 p-2 pr-3">
      <div aria-hidden className="size-10 shrink-0 rounded-md border border-white/[0.06]" style={{ background: `var(--${name})` }} />
      <div className="min-w-0">
        <div className="truncate font-mono text-xs text-foreground-strong">{name}</div>
        <div className="font-mono text-xs text-muted-foreground uppercase">{value}</div>
      </div>
    </div>
  );
}

/* 02 Type ------------------------------------------------------------------------------------------ */

function TypeScale() {
  return (
    <div className="flex flex-col gap-3">
      <div className="surface divide-y divide-border">
        {TYPE_STEPS.map((step) => (
          <div key={step.name} className="grid grid-cols-[112px_minmax(0,1fr)_minmax(0,1fr)] items-baseline gap-3 p-3 max-[640px]:grid-cols-[88px_minmax(0,1fr)]">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-xs text-foreground-strong">{step.name}</span>
              <span className="readout text-xs text-muted-foreground">{step.spec}</span>
            </div>
            <span className={cn(step.cls, "truncate text-foreground", step.name === "stat" && "readout font-semibold tracking-tight text-foreground-strong", step.name === "lg" && "font-semibold text-foreground-strong")}>
              {step.sample}
            </span>
            <span className={cn(step.cls, "truncate font-mono text-foreground-strong max-[640px]:col-start-2")}>{step.mono}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
        <div className="surface p-3">
          <div className="micro-label">Tabular figures</div>
          <div className="mt-2 font-mono text-base text-foreground-strong">
            <div>11:11:11 · 1.1 s</div>
            <div>08:40:59 · 0.3 s</div>
          </div>
          <div className="readout mt-1 text-base text-foreground-strong">
            <div>11:11:11 · 1 111</div>
            <div>08:40:59 · 8 408</div>
          </div>
        </div>
        <div className="surface p-3">
          <div className="micro-label">Unambiguous names</div>
          <div className="mt-2 text-lg text-foreground-strong">Il1 · CLIENT_ID · lil</div>
          <div className="mt-1 text-xs text-muted-foreground">cv05 tails the l, cv08 serifs the I</div>
        </div>
        <div className="surface p-3">
          <div className="micro-label">Inline names</div>
          <p className="mt-2 text-base text-foreground">
            <Mono>CLIENT_EMAIL</Mono> is needed by <Mono>on_copy_complete.py</Mono> but not set.
          </p>
        </div>
        <div className="surface p-3">
          <div className="micro-label">Mono, no ligatures</div>
          <div className="mt-2 font-mono text-base text-foreground-strong">{"a -> b != c // d :: e"}</div>
          <div className="mt-1 text-xs text-muted-foreground">calt is off, so paths and code read as typed</div>
        </div>
      </div>
    </div>
  );
}

/* 03 Status ---------------------------------------------------------------------------------------- */

function StatusTable() {
  const keys = Object.keys(STATUS) as StatusKey[];
  return (
    <div className="surface grid grid-cols-[repeat(auto-fill,minmax(236px,1fr))] gap-x-2 p-1">
      {keys.map((key) => (
        <div key={key} className="flex h-8 items-center justify-between gap-2 rounded-md px-2">
          <StatusIcon status={key} label />
          <span className="truncate font-mono text-xs text-muted-foreground">{key}</span>
        </div>
      ))}
    </div>
  );
}

/* 04 Counts and navigation ------------------------------------------------------------------------- */

const NAV: { key: keyof typeof NAV_ICONS; label: string; count?: number; tone?: "destructive" | "warning" }[] = [
  { key: "home", label: "Home" },
  { key: "runs", label: "Runs", count: 2, tone: "destructive" },
  { key: "variables", label: "Variables", count: 1, tone: "warning" },
  { key: "scripts", label: "Scripts" },
  { key: "apps", label: "Hedge apps", count: 3, tone: "warning" },
  { key: "connect", label: "Connect" },
  { key: "settings", label: "Settings", count: 1, tone: "warning" },
];

function Navigation() {
  const [active, setActive] = useState<keyof typeof NAV_ICONS>("home");
  return (
    <div className="flex flex-wrap items-start gap-3">
      <nav aria-label="Navigation, labelled" className="w-[200px] rounded-lg border border-border bg-sidebar p-2">
        <div className="mb-1 flex items-center gap-2 px-2 py-2">
          <div aria-hidden className="size-4 rounded-[4px]" style={{ background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))" }} />
          <span className="text-sm font-semibold text-foreground-strong">HedgeBuddy</span>
        </div>
        {NAV.map(({ key, label, count, tone }) => {
          const Icon = NAV_ICONS[key];
          const on = active === key;
          return (
            <button
              key={key}
              onClick={() => setActive(key)}
              aria-current={on ? "page" : undefined}
              className={cn(
                "relative flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm transition-colors duration-120",
                on ? SELECTED : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <Icon aria-hidden className="size-4" strokeWidth={1.75} />
              <span className="flex-1 text-left">{label}</span>
              {tone && <CountBadge count={count ?? 0} tone={tone} />}
            </button>
          );
        })}
      </nav>
      <nav aria-label="Navigation, icon rail" className="flex w-12 flex-col items-center gap-1 rounded-lg border border-border bg-sidebar py-2">
        <div aria-hidden className="my-2 size-4 rounded-[4px]" style={{ background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))" }} />
        {NAV.map(({ key, label, count, tone }) => {
          const Icon = NAV_ICONS[key];
          const on = active === key;
          return (
            <Tooltip key={key}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setActive(key)}
                  aria-label={label}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "relative grid size-8 place-items-center rounded-md transition-colors duration-120",
                    on ? SELECTED : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  <Icon aria-hidden className="size-4" strokeWidth={1.75} />
                  {tone && <CountBadge count={count ?? 0} tone={tone} variant="rail" className="absolute -top-1 -right-1" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
      <div className="surface flex flex-col gap-2 p-3">
        <div className="micro-label">Count badge</div>
        <div className="flex items-center gap-2">
          <CountBadge count={2} tone="destructive" />
          <CountBadge count={3} tone="warning" />
          <CountBadge count={140} tone="warning" />
          <span className="text-xs text-muted-foreground">pill</span>
        </div>
        <div className="flex items-center gap-2">
          <CountBadge count={2} tone="destructive" variant="rail" />
          <CountBadge count={7} tone="warning" variant="rail" />
          <CountBadge count={140} tone="destructive" variant="rail" />
          <span className="text-xs text-muted-foreground">rail</span>
        </div>
        <div className="flex items-center gap-2">
          <CountBadge count={0} tone="destructive" />
          <span className="text-xs text-muted-foreground">zero renders nothing</span>
        </div>
      </div>
    </div>
  );
}

/* 05 Readouts -------------------------------------------------------------------------------------- */

function Readouts() {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-4 gap-2 max-[640px]:grid-cols-2">
        <Stat label="Runs since last open" value={14} />
        <Stat label="Failed" value={2} tone="destructive" />
        <Stat label="Scripts attached" value={3} />
        <Stat label="Variables" value={9} />
      </div>
      <div className="grid grid-cols-4 gap-2 max-[640px]:grid-cols-2">
        <Stat label="Runs since last open" value={0} />
        <Stat label="Failed" value={0} tone="destructive" />
      </div>
    </div>
  );
}

/* 06 Panels ---------------------------------------------------------------------------------------- */

function Panels() {
  const [selected, setSelected] = useState("r1");
  return (
    <div className="grid grid-cols-[1.25fr_1fr] gap-3 max-[640px]:grid-cols-1">
      <Panel title="Needs attention">
        <AttentionRow status="runFailed">
          <Mono>on_copy_complete.py</Mono> failed at <span className="readout">{when(RUNS[0].started)}</span>
        </AttentionRow>
        <AttentionRow status="varMissing">
          <Mono>CLIENT_EMAIL</Mono> is needed but not set
        </AttentionRow>
        <AttentionRow status="stale">3 OffShoot events point at deleted scripts</AttentionRow>
        <AttentionRow status="package">hedgebuddy package is 0.10.0, needs 0.11.0</AttentionRow>
      </Panel>
      <Panel title="Recent runs" action={<Button variant="ghost" size="sm">All runs <ChevronRight aria-hidden /></Button>}>
        {RUNS.slice(0, 3).map((run) => (
          <button
            key={run.id}
            onClick={() => setSelected(run.id)}
            aria-current={selected === run.id ? "true" : undefined}
            className={cn(
              "relative flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors duration-120",
              selected === run.id ? SELECTED : "hover:bg-accent/50",
            )}
          >
            <StatusIcon status={runStatusKey(run.status)} />
            <Mono className="min-w-0 flex-1 truncate text-xs">{run.script}</Mono>
            {run.status === "failed" && <span className="text-xs text-destructive">failed</span>}
            <span className="readout text-xs text-muted-foreground">{clock(run.started)}</span>
          </button>
        ))}
      </Panel>
    </div>
  );
}

function AttentionRow({ status, children }: { status: StatusKey; children: React.ReactNode }) {
  return (
    <a
      href="#/_design"
      onClick={(e) => e.preventDefault()}
      className="group flex min-h-8 items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground transition-colors duration-120 hover:bg-accent/50"
    >
      <StatusIcon status={status} />
      <span className="min-w-0 flex-1">{children}</span>
      <ChevronRight aria-hidden className="size-3.5 text-muted-foreground transition-transform duration-120 group-hover:translate-x-0.5" strokeWidth={1.75} />
    </a>
  );
}

/* 07 States ---------------------------------------------------------------------------------------- */

function States() {
  const retry = () => toast("Retrying", { description: "The preview has nothing to retry." });
  return (
    <div className="grid grid-cols-2 gap-3 max-[640px]:grid-cols-1">
      <Panel title="Loading">
        <div className="flex flex-col px-2" aria-busy aria-label="Loading runs">
          {[62, 48, 71].map((w) => (
            <div key={w} className="flex h-8 items-center gap-2">
              <Skeleton className="size-3.5 rounded-full" />
              <Skeleton className="h-3 rounded-sm" style={{ width: `${w}%` }} />
              <Skeleton className="ml-auto h-3 w-9 rounded-sm" />
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Empty">
        <EmptyState icon={History} title="No runs yet" className="px-2 py-3" action={<Button variant="outline" size="sm"><FileCode aria-hidden /> Open Scripts</Button>}>
          Runs show here after an attached script runs. Attach one on the Scripts screen.
        </EmptyState>
      </Panel>
      <ErrorPanel error={new BridgeError("error", "cannot read hedgebuddy.json: invalid JSON at line 1")} onRetry={retry} />
      <ErrorPanel error={new BridgeError("busy", "another HedgeBuddy is busy; try again")} onRetry={retry} />
      <div className="surface col-span-full flex flex-wrap items-center gap-2 px-3 py-2">
        <span className="micro-label mr-1">Toasts</span>
        <Button variant="outline" size="sm" onClick={() => toast.success("Saved CLIENT_EMAIL")}>Saved</Button>
        <Button variant="outline" size="sm" onClick={() => toast.error("Couldn't detach on_copy_complete.py", { description: "The OffShoot Helper workspace is read-only." })}>
          Failed action
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => toast("Another HedgeBuddy is busy", { description: "It is saving something.", action: { label: "Try again", onClick: () => undefined } })}
        >
          Busy
        </Button>
      </div>
    </div>
  );
}

/* 08 Actions --------------------------------------------------------------------------------------- */

const VARIANTS = ["default", "outline", "secondary", "ghost", "destructive", "link"] as const;
const LABELS: Record<(typeof VARIANTS)[number], string> = {
  default: "Apply", outline: "Detach", secondary: "Sync", ghost: "All runs", destructive: "Delete", link: "Open in editor",
};

function Buttons() {
  return (
    <div className="surface overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border">
            {["variant", "default", "sm", "icon", "disabled"].map((h) => (
              <th key={h} scope="col" className="micro-label px-3 py-2 font-normal max-[560px]:px-1">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {VARIANTS.map((v) => (
            <tr key={v} className="border-b border-border last:border-0">
              <th scope="row" className="px-3 py-2 font-mono text-xs font-normal text-muted-foreground max-[560px]:px-1">{v}</th>
              <td className="px-3 py-2 max-[560px]:px-1"><Button variant={v}>{v === "destructive" && <Trash2 aria-hidden />}{LABELS[v]}</Button></td>
              <td className="px-3 py-2 max-[560px]:px-1"><Button variant={v} size="sm">{LABELS[v]}</Button></td>
              <td className="px-3 py-2 max-[560px]:px-1">
                {v !== "link" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant={v} size="icon" aria-label={v === "destructive" ? "Delete" : "Refresh"}>
                        {v === "destructive" ? <Trash2 aria-hidden /> : <RefreshCw aria-hidden />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{v === "destructive" ? "Delete" : "Refresh"}</TooltipContent>
                  </Tooltip>
                )}
              </td>
              <td className="px-3 py-2 max-[560px]:px-1"><Button variant={v} size="sm" disabled>{LABELS[v]}</Button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* 09 Fields and controls --------------------------------------------------------------------------- */

function Controls() {
  const [profile, setProfile] = useState("commercial-one-day");
  const [filter, setFilter] = useState("all");
  const [unfinished, setUnfinished] = useState(true);
  return (
    <div className="grid grid-cols-2 gap-3 max-[640px]:grid-cols-1">
      <div className="surface flex flex-col gap-3 p-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="g-filter">Filter</Label>
          <Input id="g-filter" placeholder="Filter variables" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="g-webhook" className="font-mono text-xs text-foreground-strong">SLACK_WEBHOOK</Label>
          <Input id="g-webhook" className="font-mono" defaultValue="hooks.slack.com/services/T0" aria-invalid aria-describedby="g-webhook-error" />
          <p id="g-webhook-error" className="text-xs text-destructive">Must start with http:// or https://</p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="g-disabled">Data folder</Label>
          <Input id="g-disabled" className="font-mono" defaultValue="~/Library/Application Support/HedgeBuddy" disabled />
        </div>
      </div>
      <div className="surface flex flex-col gap-3 p-3">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="g-switch">Show unfinished runs</Label>
          <Switch id="g-switch" checked={unfinished} onCheckedChange={setUnfinished} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-foreground">Runs</span>
          <ToggleGroup type="single" variant="outline" size="sm" value={filter} onValueChange={(v) => v && setFilter(v)} aria-label="Show runs">
            <ToggleGroupItem value="all">All</ToggleGroupItem>
            <ToggleGroupItem value="failed">Failed <CountBadge count={2} tone="destructive" /></ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-foreground">Profile</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="max-w-[60%]">
                <span className="truncate font-mono text-xs text-foreground-strong">{profile}</span>
                <ChevronsUpDown aria-hidden className="text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Profiles</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={profile} onValueChange={setProfile}>
                {["commercial-one-day", "feature-doc", "music-video"].map((p) => (
                  <DropdownMenuRadioItem key={p} value={p} className="font-mono text-xs">{p}</DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem><Plus aria-hidden /> New profile</DropdownMenuItem>
              <DropdownMenuItem><Copy aria-hidden /> Duplicate</DropdownMenuItem>
              <DropdownMenuItem variant="destructive"><Trash2 aria-hidden /> Delete profile</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Badge>OffShoot · FileCopyCompleted</Badge>
          <Badge variant="outline">no manifest</Badge>
          <Badge variant="link">required by on_copy_complete.py</Badge>
          <Badge variant="warning">1 unmet</Badge>
          <Badge variant="destructive">failed · exit 1</Badge>
        </div>
      </div>
    </div>
  );
}

/* 10 List and detail ------------------------------------------------------------------------------- */

function ListDetailDemo() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const run = RUNS.find((r) => r.id === selectedId) ?? null;
  const days = [...new Set(RUNS.map((r) => dayKey(r.started)))];
  // Roving tab stop: the list is one stop in the Tab order (the selected row, else the first); arrows move within it.
  const tabStop = selectedId ?? RUNS[0].id;

  const onListKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-run]")];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = buttons[Math.min(buttons.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1)))];
    if (next) {
      e.preventDefault();
      next.focus();
      setSelectedId(next.dataset.run ?? null);
    }
  };

  return (
    <div className="surface h-[340px] overflow-hidden p-0">
      <ListDetail
        selected={run !== null}
        onBack={() => setSelectedId(null)}
        backLabel="Runs"
        list={
          <div className="min-h-0 flex-1 overflow-y-auto p-1" onKeyDown={onListKey}>
            {days.map((day) => {
              const runs = RUNS.filter((r) => dayKey(r.started) === day);
              return (
                <div key={day} className="mb-1">
                  <div className="micro-label px-2 pt-2 pb-1">
                    {dayLabel(day)} · <span className="readout">{runs.length}</span> {plural(runs.length, "run")}
                  </div>
                  {runs.map((r) => {
                    const on = r.id === selectedId;
                    const took = duration(r.started, r.ended);
                    return (
                      <button
                        key={r.id}
                        data-run={r.id}
                        tabIndex={r.id === tabStop ? 0 : -1}
                        onClick={() => setSelectedId(r.id)}
                        aria-current={on ? "true" : undefined}
                        className={cn(
                          "relative grid h-11 w-full grid-cols-[auto_minmax(0,1fr)] content-center items-center gap-x-2 rounded-md px-2 text-left transition-colors duration-120",
                          on ? SELECTED : "hover:bg-accent/50",
                        )}
                      >
                        <StatusIcon status={runStatusKey(r.status)} />
                        <span className="flex min-w-0 items-center gap-2">
                          <Mono className="min-w-0 flex-1 truncate text-sm">{r.script}</Mono>
                          <span className="readout text-xs text-muted-foreground">{clock(r.started)}</span>
                        </span>
                        <span className="readout col-start-2 truncate text-xs text-muted-foreground">
                          {r.event} · {r.status === "failed" ? <span className="text-destructive">exit {r.exit}</span> : (took ?? "no end record")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        }
        detail={
          run ? (
            <RunDetail run={run} />
          ) : (
            <EmptyState icon={History} title="Pick a run" className="py-8">
              Its log, exit code and any traceback show here.
            </EmptyState>
          )
        }
      />
    </div>
  );
}

function RunDetail({ run }: { run: FakeRun }) {
  const took = duration(run.started, run.ended);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Mono className="text-base">{run.script}</Mono>
        <StatusIcon status={runStatusKey(run.status)} label />
      </div>
      <p className="readout text-sm text-muted-foreground">
        {appName(run.app)} · {run.event} · {dayLabel(dayKey(run.started))} {clock(run.started, true)}
        {run.ended && <> → {clock(run.ended, true)}</>}
        {took && <> · {took}</>}
        {run.exit !== null && <> · exit {run.exit}</>}
      </p>
      <div className="flex flex-col gap-1">
        <div className="micro-label">Log</div>
        <pre className="well overflow-x-auto px-3 py-2 font-mono text-xs text-foreground">{run.log.join("\n")}</pre>
      </div>
      {run.traceback && (
        <div className="flex flex-col gap-1">
          <div className="micro-label">Traceback</div>
          <pre className="well overflow-x-auto border-destructive-border px-3 py-2 font-mono text-xs text-foreground">{run.traceback.join("\n")}</pre>
        </div>
      )}
      <div className="mt-auto flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm"><Copy aria-hidden /> Copy details</Button>
        <Button variant="outline" size="sm"><FileCode aria-hidden /> Open script</Button>
      </div>
    </div>
  );
}

/* 11 Change preview --------------------------------------------------------------------------------- */

/** What an attach on Windows would replace: the operator's own file, wired straight into OffShoot's registry. */
const REPLACES_EXTERNAL: AttachState = { state: "external", path: "C:\\Tools\\notify_dit.py" };
/** What an attach on macOS would replace: an entry already staged for OffShoot Helper to pick up. */
const REPLACES_STAGED: AttachState = { state: "staged", path: "on_x.py", workspace: "doc-series" };

const ATTACH_WIN_ACTIONS: Action[] = [
  {
    action: "registry_set",
    key: "HKCU\\Software\\Bounce Software\\OffShoot\\Scripting",
    value: "FileCopyCompleted",
    data: { type: "string", data: "C:\\Users\\op\\HedgeBuddy\\commercial-one-day\\scripts\\on_copy_complete.py" },
  },
];
const ATTACH_MAC_ACTIONS: Action[] = [
  { action: "workspace_prefs", path: "~/Library/Application Support/OffShoot Helper/workspace.json", set: { FileCopyCompleted: "on_x.py" } },
];

/** A ledger long enough to need the 45vh scroll. */
const LONG_LEDGER_KINDS: ChangeKind[] = ["registry", "registry_delete", "workspace", "file", "delete", "attach", "detach"];
const LONG_LEDGER: ChangeRow[] = Array.from({ length: 16 }, (_, i) => ({
  kind: LONG_LEDGER_KINDS[i % LONG_LEDGER_KINDS.length],
  target: `HKCU\\Software\\Bounce Software\\OffShoot\\Scripting\\Event${i + 1}`,
  detail: { text: `entry ${i + 1} of 16` },
}));

const CHANGE_PREVIEW_BUTTONS = [
  { key: "planning", label: "Planning forever" },
  { key: "failed", label: "Plan failed" },
  { key: "plan-busy", label: "Plan busy" },
  { key: "blocked", label: "Blocked" },
  { key: "nothing", label: "Nothing to do" },
  { key: "attach-win", label: "Attach, replaces a file" },
  { key: "attach-mac", label: "Attach, macOS staged" },
  { key: "delete", label: "Delete script" },
  { key: "slow", label: "Slow apply (2 s)" },
  { key: "apply-failed", label: "Apply fails" },
  { key: "apply-busy", label: "Apply busy" },
  { key: "long", label: "Long ledger (16 rows)" },
] as const;

function ChangePreviewGallery() {
  const [openKey, setOpenKey] = useState<(typeof CHANGE_PREVIEW_BUTTONS)[number]["key"] | null>(null);
  const close = () => setOpenKey(null);
  const confirmed = (message: string) => () => toast(message);

  return (
    <div className="flex flex-wrap gap-2">
      {CHANGE_PREVIEW_BUTTONS.map(({ key, label }) => (
        <Button key={key} variant="outline" size="sm" onClick={() => setOpenKey(key)}>{label}</Button>
      ))}

      <ChangePreviewDialog
        open={openKey === "planning"} onOpenChange={close}
        title="Attach on_copy_complete.py?" applyLabel="Attach"
        plan={() => new Promise<never>(() => undefined)}
        describe={() => ({ summary: "", changes: [] })}
        apply={() => Promise.resolve()}
      />

      <ChangePreviewDialog
        open={openKey === "failed"} onOpenChange={close}
        title="Attach on_copy_complete.py?" applyLabel="Attach"
        plan={() => Promise.reject<{ actions: Action[] }>(new Error("cannot read OffShoot's registry key"))}
        describe={(p) => ({ summary: "HedgeBuddy will make these changes.", changes: describeActions(p.actions) })}
        apply={() => Promise.resolve()}
      />

      <ChangePreviewDialog
        open={openKey === "plan-busy"} onOpenChange={close}
        title="Sync attachments?" applyLabel="Sync"
        plan={() => Promise.reject<{ actions: Action[] }>(new BridgeError("busy", "another HedgeBuddy is busy; try again"))}
        describe={(p) => ({ summary: "HedgeBuddy will make these changes.", changes: describeActions(p.actions) })}
        apply={() => Promise.resolve()}
      />

      <ChangePreviewDialog
        open={openKey === "blocked"} onOpenChange={close}
        title="Delete profile commercial-one-day?" applyLabel="Delete" destructive
        plan={() => Promise.resolve({ actions: [] as Action[] })}
        describe={() => ({ summary: "", changes: [], blocked: "OffShoot is running. Quit it before deleting this profile." })}
        apply={() => Promise.resolve()}
      />

      <ChangePreviewDialog
        open={openKey === "nothing"} onOpenChange={close}
        title="Sync attachments?" applyLabel="Sync"
        plan={() => Promise.resolve({ actions: [] as Action[] })}
        describe={() => ({ summary: "", changes: [], nothingToDo: "Every script already matches its manifest. Nothing to change." })}
        apply={() => Promise.resolve()}
      />

      <ChangePreviewDialog
        open={openKey === "attach-win"} onOpenChange={close}
        title="Attach on_copy_complete.py?" applyLabel="Attach"
        plan={() => Promise.resolve({ actions: ATTACH_WIN_ACTIONS })}
        describe={(p) => ({
          summary: <>HedgeBuddy will attach <Mono className="text-foreground">on_copy_complete.py</Mono> to OffShoot's FileCopyCompleted event.</>,
          changes: describeActions(p.actions),
          warnings: [<>Replaces {renderWords(describeState(REPLACES_EXTERNAL))}</>],
        })}
        apply={() => Promise.resolve()}
        onApplied={confirmed("Attached on_copy_complete.py")}
      />

      <ChangePreviewDialog
        open={openKey === "attach-mac"} onOpenChange={close}
        title="Attach on_x.py?" applyLabel="Attach"
        plan={() => Promise.resolve({ actions: ATTACH_MAC_ACTIONS })}
        describe={(p) => ({
          summary: <>HedgeBuddy will stage <Mono className="text-foreground">on_x.py</Mono> for OffShoot Helper to attach next time it runs.</>,
          changes: describeActions(p.actions),
          warnings: [<>Replaces {renderWords(describeState(REPLACES_STAGED))}</>],
        })}
        apply={() => Promise.resolve()}
        onApplied={confirmed("Staged on_x.py")}
      />

      <ChangePreviewDialog
        open={openKey === "delete"} onOpenChange={close}
        title="Delete on_copy_complete.py?" applyLabel="Delete" destructive
        plan={() => Promise.resolve({ actions: [] as Action[] })}
        describe={() => ({
          summary: <>HedgeBuddy will delete <Mono className="text-foreground">on_copy_complete.py</Mono> from commercial-one-day.</>,
          changes: [{ kind: "delete", target: "on_copy_complete.py", detail: { text: "removed from commercial-one-day" } }],
          warnings: [<>OffShoot · FileCopyCompleted will be left pointing at a file that no longer exists</>],
        })}
        apply={() => Promise.resolve()}
        onApplied={confirmed("Deleted on_copy_complete.py")}
      />

      <ChangePreviewDialog
        open={openKey === "slow"} onOpenChange={close}
        title="Attach on_copy_complete.py?" applyLabel="Attach"
        plan={() => Promise.resolve({ actions: ATTACH_WIN_ACTIONS })}
        describe={(p) => ({
          summary: <>HedgeBuddy will attach <Mono className="text-foreground">on_copy_complete.py</Mono> to OffShoot's FileCopyCompleted event.</>,
          changes: describeActions(p.actions),
        })}
        apply={() => new Promise<void>((resolve) => setTimeout(resolve, 2000))}
        onApplied={confirmed("Attached on_copy_complete.py")}
      />

      <ChangePreviewDialog
        open={openKey === "apply-failed"} onOpenChange={close}
        title="Attach on_copy_complete.py?" applyLabel="Attach"
        plan={() => Promise.resolve({ actions: ATTACH_WIN_ACTIONS })}
        describe={(p) => ({
          summary: <>HedgeBuddy will attach <Mono className="text-foreground">on_copy_complete.py</Mono> to OffShoot's FileCopyCompleted event.</>,
          changes: describeActions(p.actions),
        })}
        apply={() => Promise.reject(new Error("OffShoot's registry key is read-only"))}
      />

      <ChangePreviewDialog
        open={openKey === "apply-busy"} onOpenChange={close}
        title="Attach on_copy_complete.py?" applyLabel="Attach"
        plan={() => Promise.resolve({ actions: ATTACH_WIN_ACTIONS })}
        describe={(p) => ({
          summary: <>HedgeBuddy will attach <Mono className="text-foreground">on_copy_complete.py</Mono> to OffShoot's FileCopyCompleted event.</>,
          changes: describeActions(p.actions),
        })}
        apply={() =>
          new Promise<void>((_, reject) => setTimeout(() => reject(new BridgeError("busy", "another HedgeBuddy is busy; try again")), 350))
        }
      />

      <ChangePreviewDialog
        open={openKey === "long"} onOpenChange={close}
        title="Sync 16 attachments?" applyLabel="Sync 16"
        plan={() => Promise.resolve({ rows: LONG_LEDGER })}
        describe={(p) => ({ summary: "HedgeBuddy will make these changes across every profile.", changes: p.rows })}
        apply={() => Promise.resolve()}
        onApplied={confirmed("Synced 16 attachments")}
      />
    </div>
  );
}

/* 12 Editors ----------------------------------------------------------------------------------------- */

/** A valid starting value per type; `path` and one `path[]` entry are deliberately on an unplugged drive. */
const EDITOR_SEED: Record<Exclude<VarType, "secret">, unknown> = {
  string: "ClientX Spot",
  int: 3,
  float: 0.5,
  bool: true,
  path: "X:/Reels/A003",
  url: "https://hooks.slack.com/services/T0",
  "string[]": ["dailies", "vfx", "sound"],
  "path[]": ["D:/Offload/A003", "D:/Offload/A004", "/Volumes/Offline/dailies"],
};

/** One field that cannot be saved, per validated type, to show the reason under it. */
const EDITOR_INVALID: { type: VarType; edit: EditValue }[] = [
  { type: "int", edit: "12.5" },
  { type: "float", edit: "abc" },
  { type: "path", edit: "" },
  { type: "url", edit: "ftp://example.com/hook" },
  { type: "path[]", edit: ["D:/Offload/A003", ""] },
];

const FAKE_SECRET = "sk_live_9f2c3f1a2b";

function Editors() {
  const [values, setValues] = useState<Record<VarType, EditValue>>(() => {
    const entries = VAR_TYPES.map((t) => [t, t === "secret" ? emptyEdit(t) : toEdit(t, EDITOR_SEED[t])] as const);
    return Object.fromEntries(entries) as Record<VarType, EditValue>;
  });
  const [secret, setSecret] = useState<SecretState>(EMPTY_SECRET);
  const [invalid, setInvalid] = useState<EditValue[]>(() => EDITOR_INVALID.map((d) => d.edit));
  const revealFake = () => new Promise<string>((resolve) => setTimeout(() => resolve(FAKE_SECRET), 300));

  return (
    <div className="flex flex-col gap-3">
      <div className="surface divide-y divide-border">
        {VAR_TYPES.map((type) => (
          <div key={type} className="flex flex-col gap-1.5 p-3">
            <div className="micro-label">Value · {type}</div>
            {type === "secret" ? (
              <VarEditor id="demo-secret" type={type} value="" onChange={() => undefined} error={null} secret={secret} onSecretChange={setSecret} reveal={revealFake} />
            ) : (
              <VarEditor
                id={`demo-${type}`}
                type={type}
                value={values[type]}
                onChange={(v) => setValues((prev) => ({ ...prev, [type]: v }))}
                error={validateValue(type, values[type])}
              />
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <div className="micro-label px-1">Invalid, to check the message under the field</div>
        <div className="surface divide-y divide-border">
          {EDITOR_INVALID.map((demo, i) => (
            <div key={demo.type} className="flex flex-col gap-1.5 p-3">
              <div className="micro-label">Value · {demo.type}</div>
              <VarEditor
                id={`demo-invalid-${demo.type}`}
                type={demo.type}
                value={invalid[i]}
                onChange={(v) => setInvalid((prev) => prev.map((cur, idx) => (idx === i ? v : cur)))}
                error={validateValue(demo.type, invalid[i])}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
