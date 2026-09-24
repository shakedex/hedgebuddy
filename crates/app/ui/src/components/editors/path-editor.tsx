import { useRef, useState } from "react";
import { FolderOpen, TriangleAlert } from "lucide-react";
import { callApp } from "@/api/bridge";
import { usePathStatus } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDebounced } from "@/hooks/use-debounced";
import { showError } from "@/lib/toast";

/** Joins the ids of whichever helper text is showing, for `aria-describedby`. */
export function describedBy(...ids: (string | null | false | undefined)[]): string | undefined {
  return ids.filter((id): id is string => !!id).join(" ") || undefined;
}

/**
 * A Windows path names its drive letter, a UNC path names the share, and anything else (macOS,
 * `/Volumes/...`) is "the volume" (spec §7's wordings). Being unreachable never blocks Save — this is a
 * warning, not a validation error.
 */
export function notMountedMessage(path: string): string {
  const drive = /^([A-Za-z]):[\\/]/.exec(path)?.[1];
  if (drive) return `Drive ${drive.toUpperCase()}: is not connected. You can still save it.`;
  if (/^\\\\[^\\]+\\[^\\]+/.test(path)) return "The network share is not reachable. You can still save it.";
  return "The volume is not mounted. You can still save it.";
}

/** A mono text field plus a folder picker, with an amber note when the path's drive isn't mounted. */
export function PathEditor({ id, value, onChange, error }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
}) {
  const [picking, setPicking] = useState(false);
  const pickingRef = useRef(false);
  const trimmed = value.trim();
  // Settle the path before querying it, so a fast typist doesn't fire (and flicker) a check per keystroke.
  const debounced = useDebounced(trimmed, 300);
  const status = usePathStatus(debounced ? [debounced] : []);
  const notMounted = !error && status.data?.paths.find((p) => p.path === debounced)?.mounted === false;
  const errorId = `${id}-error`;
  const warningId = `${id}-warning`;

  const pick = async () => {
    if (pickingRef.current) return;
    pickingRef.current = true;
    setPicking(true);
    try {
      const { path } = await callApp("pick_folder", { title: "Choose a folder" });
      if (path) onChange(path);
    } catch (e) {
      showError(e);
    } finally {
      pickingRef.current = false;
      setPicking(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Input
          id={id}
          className="font-mono"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={describedBy(error && errorId, notMounted && warningId)}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            {/* aria-disabled (not disabled) while picking: a focused button that goes natively `disabled`
                is blurred to <body> by the browser, dropping keyboard focus. */}
            <Button
              type="button" variant="outline" size="icon" className="size-8 aria-disabled:pointer-events-none aria-disabled:opacity-45"
              aria-label="Choose a folder" onClick={pick} aria-disabled={picking} aria-busy={picking}
            >
              <FolderOpen aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Choose a folder</TooltipContent>
        </Tooltip>
      </div>
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
      {notMounted && (
        <p id={warningId} className="flex items-center gap-1.5 text-xs text-warning">
          <TriangleAlert aria-hidden className="size-3.5 shrink-0" strokeWidth={1.75} />
          {notMountedMessage(debounced)}
        </p>
      )}
    </div>
  );
}
