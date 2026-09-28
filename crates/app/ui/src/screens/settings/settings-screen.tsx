import { DataFolderPanel } from "./data-folder-panel";
import { EditorPanel } from "./editor-panel";
import { PythonPanel } from "./python-panel";

/**
 * Settings (spec §6.7): the Python the Hedge apps use (with Install from the bundled wheel), the data
 * folder and its catalog overrides, and the optional editor command. A single scrolling page (Design
 * direction 5C: "Simple pages"), the same idiom as Connect — each section below is its own `surface` panel
 * with its own loading, error and empty states, all reading `settings_overview` (`useSettingsOverview`).
 */
export function SettingsScreen() {
  return (
    <div className="@container h-full overflow-y-auto">
      <div className="flex max-w-[720px] flex-col gap-3 p-4 @max-[640px]:p-3">
        <PythonPanel />
        <DataFolderPanel />
        <EditorPanel />
      </div>
    </div>
  );
}
