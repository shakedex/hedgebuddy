import type { LucideIcon } from "lucide-react";
import type { EventAttachment } from "@/api/tools.gen";
import { Mono } from "@/components/app/mono";
import { STATUS, type StatusKey, type Tone } from "@/lib/status";
import { cn } from "@/lib/utils";

/** The `EventAttachment` union's own `state` values, in the order `STATUS` names them (spec §5.2 / §6.5). */
const STATE_STATUS: Record<EventAttachment["state"], StatusKey> = {
  attached: "attached",
  external: "external",
  stale: "stale",
  staged: "staged",
  detached: "detached",
  manual: "manual",
  unsupported: "unsupported",
};

/** What one row's RUNS cell shows: an icon (from `STATUS`, so its colour follows the design system's tone),
 *  an optional mono target, and the qualifying word. */
interface RowContent {
  icon: LucideIcon;
  tone: Tone;
  /** The script or path to show in mono, when this state has one. */
  mono?: string;
  /** `stale`'s own path is shown a touch dimmer than an `attached`/`external` target. */
  monoMuted?: boolean;
  word: string;
  /** `manual`'s catalog note, shown as the word's `title` tooltip. */
  title?: string;
}

/** Every word below matches `STATUS`'s own (this table is just that vocabulary applied to one event), except
 *  `attached`, where the mono script name already says "attached" — the qualifier here instead says *whose*
 *  profile it belongs to (design direction, 5B). */
function content(row: EventAttachment, activeProfile: string | null): RowContent {
  const key = STATE_STATUS[row.state];
  const { icon, tone } = STATUS[key];
  switch (row.state) {
    case "attached":
      return { icon, tone, mono: row.script, word: row.profile === activeProfile ? "this profile" : row.profile };
    case "external":
      return { icon, tone, mono: row.path, word: STATUS.external.word };
    case "stale":
      return { icon, tone, mono: row.path, monoMuted: true, word: STATUS.stale.word };
    case "staged":
      return { icon, tone, word: STATUS.staged.word };
    case "detached":
      return { icon, tone, word: STATUS.detached.word };
    case "manual":
      return { icon, tone, word: STATUS.manual.word, title: row.note };
    case "unsupported":
      return { icon, tone, word: STATUS.unsupported.word };
    default: {
      const exhaustive: never = row;
      throw new Error(`unknown event attachment state: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function EventRow({
  row, description, activeProfile, onClear,
}: {
  row: EventAttachment; description?: string; activeProfile: string | null; onClear: (row: Extract<EventAttachment, { state: "stale" }>) => void;
}) {
  const c = content(row, activeProfile);
  const wordClass = c.tone === "warning" ? "text-warning" : "text-muted-foreground";
  return (
    <div className="grid grid-cols-1 gap-x-3 gap-y-1 border-t border-border px-3 py-2 @min-[480px]/events:grid-cols-[1.1fr_1.6fr_auto] @min-[480px]/events:items-center @min-[480px]/events:gap-y-0 @min-[480px]/events:py-1.5">
      <div className="min-w-0">
        <span className="block truncate text-sm text-foreground" title={description}>
          {row.event}
        </span>
        {description && <span className="hidden truncate text-xs text-muted-foreground @min-[560px]/events:block">{description}</span>}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <c.icon aria-hidden className={cn("size-3.5 shrink-0", wordClass)} strokeWidth={1.75} />
        {c.mono && (
          <Mono className={cn("min-w-0 truncate text-xs [overflow-wrap:anywhere]", c.monoMuted && "text-muted-foreground")} title={c.mono}>
            {c.mono}
          </Mono>
        )}
        <span className={cn("truncate text-xs", wordClass)} title={c.title}>
          {c.word}
        </span>
      </div>
      <div className="flex justify-start @min-[480px]/events:justify-end">
        {row.state === "stale" && (
          <button
            type="button"
            className="inline-flex min-h-7 items-center text-sm font-medium text-warning hover:underline"
            onClick={() => onClear(row)}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The Hedge apps events table (spec §6.5, design direction 5B "Tables"): one row per app event, what it runs
 * (icon, mono target and a qualifying word from `STATUS`'s own vocabulary), and a Clear action on stale rows.
 * The event's catalog description sits below its id from 560 px of this table's own width, and as a `title`
 * tooltip below that; the three columns stack into one below 480 px. Takes its own named `@container/events`
 * context (the pattern `run-detail.tsx` already uses) so those breakpoints read this table's own width, not
 * the screen-wide one `ListDetail` already establishes (an element never queries itself, so the table's own
 * wrapper still needs a name to be queried by its children rather than by its own, unrelated classes).
 */
export function EventsTable({
  events, descriptions, activeProfile, onClear, tableRef,
}: {
  events: EventAttachment[];
  /** Event id → the catalog's description of it (from `apps_overview`'s own per-app event list). */
  descriptions: Record<string, string>;
  /** The active profile, so an `attached` row can say "this profile" instead of naming it (spec, Lesson 7). */
  activeProfile: string | null;
  onClear: (row: Extract<EventAttachment, { state: "stale" }>) => void;
  /** A landing spot for focus once a row's own Clear button is gone (design direction: Lesson 2). */
  tableRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div className="@container/events">
      <div ref={tableRef} tabIndex={-1} className="surface overflow-hidden">
        <div className="hidden border-b border-border bg-card px-3 py-1.5 @min-[480px]/events:grid @min-[480px]/events:grid-cols-[1.1fr_1.6fr_auto] @min-[480px]/events:gap-x-3">
          <span className="micro-label">Event</span>
          <span className="micro-label">Runs</span>
          <span className="micro-label" aria-hidden />
        </div>
        {events.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground">This app has no scripting events.</p>
        ) : (
          events.map((row) => (
            <EventRow key={row.event} row={row} description={descriptions[row.event]} activeProfile={activeProfile} onClear={onClear} />
          ))
        )}
      </div>
    </div>
  );
}
