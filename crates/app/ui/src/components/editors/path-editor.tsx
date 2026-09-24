import { useState } from "react";
import { FolderOpen, TriangleAlert } from "lucide-react";
import { callApp } from "@/api/bridge";
import { usePathStatus } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { showError } from "@/lib/toast";

/** Joins the ids of whichever helper text is showing, for `aria-describedby`. */
export function describedBy(...ids: (string | null | false | undefined)[]): string | undefined {
  return ids.filter((id): id is string => !!id).join(" ") || undefined;
}

/**
 * A Windows path names its drive letter; anything else (macOS, `/Volumes/...`) is "the volume" (spec §7's
 * two wordings). Being unmounted never blocks Save — this is a warning, not a validation error.
 */
export function notMountedMessage(path: string): string {
  const drive = /^([A-Za-z]):[\\/]/.exec(path)?.[1];
  return drive
    ? `Drive ${drive.toUpperCase()}: is not connected. You can still save it.`
    : "The volume is not mounted. You can still save it.";
}

/** A mono text field plus a folder picker, with an amber note when the path's drive isn't mounted. */
export function PathEditor({ id, value, onChange, error }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
}) {
  const [picking, setPicking] = useState(false);
  const trimmed = value.trim();
  const status = usePathStatus(trimmed ? [trimmed] : []);
  const notMounted = !error && status.data?.paths[0]?.mounted === false;
  const errorId = `${id}-error`;
  const warningId = `${id}-warning`;

  const pick = async () => {
    setPicking(true);
    try {
      const { path } = await callApp("pick_folder", { title: "Choose a folder" });
      if (path) onChange(path);
    } catch (e) {
      showError(e);
    } finally {
      setPicking(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Input
          id={id}
          className="font-mono"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={describedBy(error && errorId, notMounted && warningId)}
        />
        <Button type="button" variant="outline" size="icon" aria-label="Choose a folder" onClick={pick} disabled={picking} aria-busy={picking}>
          <FolderOpen aria-hidden />
        </Button>
      </div>
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
      {notMounted && (
        <p id={warningId} className="flex items-center gap-1.5 text-xs text-warning">
          <TriangleAlert aria-hidden className="size-3.5 shrink-0" strokeWidth={1.75} />
          {notMountedMessage(trimmed)}
        </p>
      )}
    </div>
  );
}
