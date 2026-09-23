import { Package } from "lucide-react";
import { useHomeSummary } from "@/api/queries";
import type { PythonStatus } from "@/api/tools.gen";
import { EmptyState } from "@/components/app/empty-state";
import { Mono } from "@/components/app/mono";
import { appName } from "@/lib/format";
import { NAV_ICONS } from "@/lib/status";

/** The screens 5A has not built yet. */
type Screen = "variables" | "scripts" | "apps" | "connect" | "settings";

/**
 * What each screen will do (the toolbar already names the screen, so this never repeats it) and what to do
 * until then.
 */
const COPY: Record<Screen, { title: string; next: string }> = {
  variables: { title: "Editing variables arrives in the next update", next: "Until then, ask Claude to set them." },
  scripts: { title: "Managing scripts arrives in the next update", next: "Until then, ask Claude to write and attach them." },
  apps: { title: "Checking each Hedge app arrives in the next update", next: "Home already flags stale entries and version warnings." },
  connect: { title: "Setting up Claude Desktop here arrives in a later update", next: "Until then, follow the README's “Use it from Claude” steps." },
  settings: { title: "The Python check arrives in a later update", next: "Home already flags a missing or outdated hedgebuddy package." },
};

/**
 * One designed screen for the routes not yet built. When the route carries a name (`/variables/CLIENT_EMAIL`),
 * it names the item first, so a needs-attention link still lands somewhere meaningful: in mono for a variable
 * or script, by its display name for a Hedge app.
 */
export function Placeholder({ screen, name }: { screen: Screen; name?: string }) {
  const { title, next } = COPY[screen];
  return (
    <div className="h-full overflow-y-auto p-4 max-[640px]:p-3">
      {screen === "settings" ? (
        <SettingsPlaceholder />
      ) : (
        <EmptyState icon={NAV_ICONS[screen]} title={title} className="max-w-md">
          {name && (
            <p className="text-foreground">
              You followed a link to {screen === "apps" ? <span className="text-foreground-strong">{appName(name)}</span> : <Mono>{name}</Mono>}.
            </p>
          )}
          <p className={name ? "mt-1" : undefined}>{next}</p>
        </EmptyState>
      )}
    </div>
  );
}

/**
 * `python.problem` from `hedgebuddy-core`'s `package_problem` (crates/core/src/python_env.rs) ends with
 * `; run: <install command>`. Splitting it off lets the command sit in its own selectable well.
 */
function splitProblem(problem: string): { sentence: string; command: string | null } {
  const at = problem.indexOf("; run: ");
  if (at === -1) return { sentence: problem, command: null };
  return { sentence: problem.slice(0, at), command: problem.slice(at + "; run: ".length) };
}

/**
 * Settings is where Home's package-problem row leads. Until the real screen exists, it shows that problem and
 * its fix (the install command the core already works out) instead of only saying what is coming.
 */
function SettingsPlaceholder() {
  const summary = useHomeSummary();
  const python: PythonStatus | undefined = summary.data?.python;
  const { title, next } = COPY.settings;
  if (!python?.problem) {
    return (
      <EmptyState icon={NAV_ICONS.settings} title={title} className="max-w-md">
        {next}
      </EmptyState>
    );
  }
  const { sentence, command } = splitProblem(python.problem);
  return (
    <EmptyState
      icon={Package}
      tone="warning"
      // Not capitalised: the sentence may start with the package's own name, `hedgebuddy`.
      title={`${sentence}.`}
      className="max-w-xl"
      action={
        command ? (
          <div className="flex w-full flex-col gap-2">
            <code className="well block px-2.5 py-2 font-mono text-xs break-all text-foreground-strong select-text">{command}</code>
            <p className="text-xs text-muted-foreground">The one-click install arrives in a later update.</p>
          </div>
        ) : undefined
      }
    >
      {command ? "Run this in a terminal to install the version this HedgeBuddy needs:" : "Install Python 3, then open HedgeBuddy again."}
    </EmptyState>
  );
}
