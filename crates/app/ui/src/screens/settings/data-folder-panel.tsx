import { useState } from "react";
import { FolderOpen, TriangleAlert } from "lucide-react";
import { callApp } from "@/api/bridge";
import { useSettingsOverview } from "@/api/queries";
import { wrapPath } from "@/components/app/change-preview-dialog";
import { Mono } from "@/components/app/mono";
import { Readout } from "@/components/app/readout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { appName, firstLine } from "@/lib/format";
import { clearBusyToast, showError } from "@/lib/toast";

function PanelSkeleton() {
  return (
    <section className="surface flex flex-col gap-3 p-3" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-3 w-24 rounded-sm" />
      <Skeleton className="h-4 w-3/4 rounded-sm" />
      <Skeleton className="h-4 w-1/2 rounded-sm" />
    </section>
  );
}

/** The OVERRIDES readout's value (brief step 2): "none", or each overridden app's name (`appName`) with its
 *  own catalog file in mono — `OffShoot (`offshoot.toml`)`. */
function CatalogOverrides({ ids }: { ids: string[] }) {
  if (ids.length === 0) return <>none</>;
  return (
    <span className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 && ", "}
          {appName(id)} (<Mono>{id}.toml</Mono>)
        </span>
      ))}
    </span>
  );
}

/**
 * The data folder panel (spec §6.7): the folder's path with "Show in folder" (`reveal_path`), and the
 * catalog overrides in effect (or why they couldn't be read).
 */
export function DataFolderPanel() {
  const query = useSettingsOverview();
  const [revealing, setRevealing] = useState(false);

  if (query.isPending) return <PanelSkeleton />;
  // The shared `settings_overview` failure is shown once, by `SettingsScreen` — this panel simply doesn't
  // render while that's the case (review round 2, minor: "one ErrorPanel per failed query").
  if (query.isError && !query.isSuccess) return null;

  const data = query.data;
  if (!data) return null;

  const handleReveal = () => {
    if (revealing) return;
    setRevealing(true);
    callApp("reveal_path", { path: data.data_dir }).then(
      () => {
        setRevealing(false);
        clearBusyToast();
      },
      (e: unknown) => {
        setRevealing(false);
        showError(e, handleReveal);
      },
    );
  };

  return (
    <section className="surface @container flex flex-col gap-3 p-3">
      <h2 className="micro-label">Data folder</h2>

      <div className="flex flex-col gap-1.5">
        <Readout label="FOLDER">{wrapPath(data.data_dir)}</Readout>
        <Readout label="OVERRIDES" mono={false}>
          <CatalogOverrides ids={data.catalog_overrides} />
        </Readout>
      </div>

      {data.catalog_error && (
        <p className="flex items-start gap-1.5 text-xs text-warning">
          <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
          {/* A TOML parse error's own text can run to several lines (a source excerpt and a caret); only the
              first is shown, with the full text still reachable in `title` (brief: catalog errors render
              garbled otherwise). */}
          <span className="min-w-0 flex-1 break-words" title={data.catalog_error}>
            {firstLine(data.catalog_error)}. HedgeBuddy uses its built-in catalog until this is fixed.
          </span>
        </p>
      )}

      <div className="flex justify-end border-t border-border pt-2">
        {/* aria-disabled (not disabled): a focused button that goes natively `disabled` mid-click drops
            keyboard focus to <body> in some webviews (review round 2, Important 2 — the same fix Install
            already has). `handleReveal` itself ignores a click while already revealing. */}
        <Button
          variant="ghost"
          size="sm"
          className="aria-disabled:pointer-events-none aria-disabled:opacity-45"
          aria-disabled={revealing}
          aria-busy={revealing}
          onClick={handleReveal}
        >
          <FolderOpen aria-hidden strokeWidth={1.75} /> Show in folder
        </Button>
      </div>
    </section>
  );
}
