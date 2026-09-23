import { EmptyState } from "@/components/app/empty-state";
import { Mono } from "@/components/app/mono";
import { NAV_ICONS } from "@/lib/status";

type Screen = keyof typeof NAV_ICONS;

/** One plain sentence per screen (Tasks 14 and 15 replace `home` and `runs`). */
const SENTENCE: Record<Screen, string> = {
  home: "Home arrives in the next task.",
  runs: "Runs arrives in the next task.",
  variables: "Editing variables here arrives in the next update. Until then, ask Claude to set them.",
  scripts: "Managing scripts here arrives in the next update. Until then, ask Claude to write and attach them.",
  apps: "Checking each Hedge app here arrives in the next update. Home already flags stale entries and version warnings.",
  connect: `Setting up Claude Desktop from here arrives in a later update. Until then, follow the README's “Use it from Claude” steps.`,
  settings: "The Python check and the one-click package install arrive in a later update.",
};

const TITLE: Record<Screen, string> = {
  home: "Home",
  runs: "Runs",
  variables: "Variables",
  scripts: "Scripts",
  apps: "Hedge apps",
  connect: "Connect",
  settings: "Settings",
};

/**
 * One designed screen for the routes not yet built. When the route carries a name (`/variables/CLIENT_EMAIL`),
 * it names the item in mono above the sentence, so a needs-attention link still lands somewhere meaningful.
 */
export function Placeholder({ screen, name }: { screen: Screen; name?: string }) {
  return (
    <div className="p-4 max-[640px]:p-3">
      <EmptyState icon={NAV_ICONS[screen]} title={TITLE[screen]} className="max-w-md">
        {name ? (
          <>
            <span className="block text-foreground">
              You followed a link to <Mono>{name}</Mono>.
            </span>
            <span className="mt-1 block">{SENTENCE[screen]}</span>
          </>
        ) : (
          SENTENCE[screen]
        )}
      </EmptyState>
    </div>
  );
}
