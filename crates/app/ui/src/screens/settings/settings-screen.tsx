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
  const failed = overview.isError && !overview.isSuccess;

  return (
    <div className="@container h-full overflow-y-auto">
      <div className="flex max-w-[720px] flex-col gap-3 p-4 @max-[640px]:p-3">
        {failed ? (
          <section className="surface flex flex-col gap-3 p-3">
            <ErrorPanel error={overview.error} onRetry={() => void overview.refetch()} retrying={overview.isFetching} />
          </section>
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
