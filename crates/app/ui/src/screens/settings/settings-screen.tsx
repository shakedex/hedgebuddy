import { useRef } from "react";
import { useSettingsOverview } from "@/api/queries";
import { ErrorPanel } from "@/components/app/error-panel";
import { DataFolderPanel } from "./data-folder-panel";
import { EditorPanel } from "./editor-panel";
import { PythonPanel } from "./python-panel";

/**
 * Settings (spec §6.7): the Python the Hedge apps use (with Install from the bundled wheel), the data
 * folder and its catalog overrides, and the optional editor command. A single scrolling page (Design
 * direction 5C: "Simple pages"), the same idiom as Connect — every panel below reads the same
 * `settings_overview` query (`useSettingsOverview`), so a failed load shows one `ErrorPanel` for the whole
 * page here (review round 2, minor) rather than one per panel; each panel still owns its own loading
 * skeleton, since those differ in shape.
 */
export function SettingsScreen() {
  const overview = useSettingsOverview();

  // Home's own `lastError` pattern (final review, Important) — see `ConnectScreen`'s copy of this comment for
  // why `isPending`/`isError` alone can't be trusted to tell Retry's refetch apart from the first load.
  const lastError = useRef<unknown>(null);
  if (overview.isError) lastError.current = overview.error;
  else if (overview.isSuccess) lastError.current = null;
  const failed = lastError.current !== null && !overview.isSuccess;

  return (
    <div className="@container h-full overflow-y-auto">
      <div className="flex max-w-[720px] flex-col gap-3 p-4 @max-[640px]:p-3">
        {failed ? (
          <ErrorPanel
            error={overview.error ?? lastError.current}
            onRetry={() => void overview.refetch()}
            retrying={overview.isFetching}
            title="Couldn't load Settings"
          />
        ) : (
          <>
            <PythonPanel />
            <DataFolderPanel />
            <EditorPanel />
          </>
        )}
      </div>
    </div>
  );
}
