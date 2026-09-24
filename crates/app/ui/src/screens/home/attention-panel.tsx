import { ChevronRight, CircleCheck } from "lucide-react";
import { Link } from "wouter";
import type { AttentionItem } from "@/api/tools.gen";
import { EmptyState } from "@/components/app/empty-state";
import { Mono } from "@/components/app/mono";
import { Panel } from "@/components/app/panel";
import { StatusIcon } from "@/components/app/status-icon";
import { useRovingList } from "@/hooks/use-roving-list";
import { plural, whenPhrase } from "@/lib/format";
import type { StatusKey } from "@/lib/status";

/** The version string before a trailing `" ("` (a build number, say): `"26.2 (1)"` → `"26.2"`. */
function versionBefore(version: string): string {
  const i = version.indexOf(" (");
  return i === -1 ? version : version.slice(0, i);
}

/** One row's status icon, text and link. Exhaustive over `kind`: a new variant is a type error here. */
function rowFor(item: AttentionItem, activeProfile: string): { status: StatusKey; text: React.ReactNode; href: string; label: string } {
  switch (item.kind) {
    case "run_failed":
      return {
        status: "runFailed",
        text: (
          <>
            <Mono>{item.script}</Mono> failed {whenPhrase(item.started_at)}
            {item.profile !== activeProfile && <span className="text-muted-foreground"> · {item.profile}</span>}
          </>
        ),
        href: `/runs/${encodeURIComponent(item.run_id)}`,
        label: "Runs",
      };
    case "more_failed_runs":
      return {
        status: "runFailed",
        text: `${item.count} more failed ${plural(item.count, "run")}`,
        href: "/runs",
        label: "Runs",
      };
    case "variable_issue":
      return {
        status: "varMissing",
        text:
          item.problem === "missing" ? (
            <>
              <Mono>{item.name}</Mono> is needed but not set
            </>
          ) : (
            <>
              <Mono>{item.name}</Mono> should be {item.type}, not {item.actual}
            </>
          ),
        href: `/variables/${encodeURIComponent(item.name)}`,
        label: "Variables",
      };
    case "stale_entries":
      return {
        status: "stale",
        text: `${item.count} ${item.app_name} ${plural(item.count, "event")} ${
          item.count === 1 ? "points at a deleted script" : "point at deleted scripts"
        }`,
        href: `/apps/${encodeURIComponent(item.app)}`,
        label: "Hedge apps",
      };
    case "package_problem":
      return {
        status: "package",
        text: !item.python_found
          ? "Python 3 is not installed"
          : item.installed === null
            ? `hedgebuddy package is not installed (needs ${item.required})`
            : `hedgebuddy package is ${item.installed}, needs ${item.required}`,
        href: "/settings",
        label: "Settings",
      };
    case "app_newer":
      return {
        status: "alert",
        text: `${item.app_name} ${versionBefore(item.version)} is newer than tested (${item.tested_against})`,
        href: `/apps/${encodeURIComponent(item.app)}`,
        label: "Hedge apps",
      };
    case "scripting_off":
      return {
        status: "alert",
        text: `Scripting is off in ${item.app_name}, which has ${item.events} ${plural(item.events, "event")} attached`,
        href: `/apps/${encodeURIComponent(item.app)}`,
        label: "Hedge apps",
      };
    default: {
      const exhaustive: never = item;
      return exhaustive;
    }
  }
}

function AttentionRow({ item, activeProfile, tabIndex, onFocus }: {
  item: AttentionItem; activeProfile: string; tabIndex: number; onFocus: () => void;
}) {
  const { status, text, href, label } = rowFor(item, activeProfile);
  return (
    <Link
      href={href}
      data-roving-row
      tabIndex={tabIndex}
      onFocus={onFocus}
      className="flex min-h-9 items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors duration-120 hover:bg-accent/60"
    >
      {/* Decorative: the row text already says "failed" / "is needed but not set" / etc., so a second, silent status word would just be noise for a screen reader. */}
      <StatusIcon status={status} decorative />
      <span className="min-w-0 flex-1">{text}</span>
      <span className="flex shrink-0 items-center gap-1 text-xs text-link">
        <span className="@max-[640px]:hidden">{label}</span>
        <ChevronRight aria-hidden className="size-3.5" strokeWidth={1.75} />
      </span>
    </Link>
  );
}

/** Spec §6.1 "Needs attention": every problem, most serious first, each linking to where it gets fixed. */
export function AttentionPanel({ items, activeProfile, className, headingRef }: {
  items: AttentionItem[]; activeProfile: string; className?: string; headingRef?: React.Ref<HTMLHeadingElement>;
}) {
  const roving = useRovingList();
  return (
    <Panel title="Needs attention" className={className} headingRef={headingRef}>
      {items.length === 0 ? (
        <EmptyState icon={CircleCheck} title="Nothing needs a look" className="px-2 py-3">
          Runs, variables, Hedge apps and Python are all fine.
        </EmptyState>
      ) : (
        <ul onKeyDown={roving.onKeyDown}>
          {items.map((item, i) => (
            <li key={i}>
              <AttentionRow item={item} activeProfile={activeProfile} tabIndex={roving.tabIndex(i)} onFocus={roving.onRowFocus(i)} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
