import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, FolderOpen, Plus, TriangleAlert, X } from "lucide-react";
import { callApp } from "@/api/bridge";
import { usePathStatus } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDebounced } from "@/hooks/use-debounced";
import { showError } from "@/lib/toast";
import { describedBy, notMountedMessage } from "./path-editor";

/**
 * `string[]` and `path[]`: one mono row per item, on the well, with up/down reorder and remove buttons (every
 * control is a plain button, so the whole list is reachable and operable with Tab and Enter alone) and an
 * Add row at the end. `path[]` rows also get the folder picker and the not-mounted note (spec §7).
 */
export function ListEditor({ id, type, items, onChange, error }: {
  id: string;
  type: "string[]" | "path[]";
  items: string[];
  onChange: (items: string[]) => void;
  error?: string | null;
}) {
  const isPath = type === "path[]";
  // Settle the list before querying it, so retyping one row doesn't fire (and flicker) a check on every
  // keystroke; usePathStatus itself caps to the first 64 distinct paths rather than throwing.
  const debouncedItems = useDebounced(items, 300);
  const paths = isPath ? debouncedItems.filter((p) => p.trim() !== "").map((p) => p.trim()) : [];
  const status = usePathStatus(paths);
  const mounted = (path: string) => status.data?.paths.find((p) => p.path === path)?.mounted !== false;

  // Only path[] has an empty-row rule (core: string[] items may be blank); the reason goes under the first
  // offending row, not every one of them, and never under Add.
  const emptyIndex = isPath ? items.findIndex((it) => it.trim() === "") : -1;

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const upRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const downRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const addRef = useRef<HTMLButtonElement>(null);
  const [pendingFocus, setPendingFocus] = useState<number | null>(null);
  const [pickingIndex, setPickingIndex] = useState<number | null>(null);
  const pickingRef = useRef<number | null>(null);
  const [announcement, setAnnouncement] = useState("");

  // Add's new row doesn't exist until the next render, so its focus waits here; move and remove focus an
  // already-rendered row synchronously (same DOM nodes, just reordered or one fewer), so they don't need this.
  useEffect(() => {
    if (pendingFocus === null) return;
    inputRefs.current[pendingFocus]?.focus();
    setPendingFocus(null);
  }, [pendingFocus, items]);

  const set = (i: number, value: string) => onChange(items.map((item, idx) => (idx === i ? value : item)));

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    // Keep focus on the row's up/down control so repeated moves need no extra Tabs. At an end, that same
    // control is about to go `disabled` (which would blur it to <body>), so land on the other one instead —
    // it's guaranteed to stay enabled there.
    const staysMovable = dir === -1 ? j > 0 : j < items.length - 1;
    const target = staysMovable ? (dir === -1 ? upRefs : downRefs) : dir === -1 ? downRefs : upRefs;
    target.current[j]?.focus();
    setAnnouncement(`Moved to position ${j + 1} of ${items.length}`);
  };

  const remove = (i: number) => {
    const next = items.filter((_, idx) => idx !== i);
    onChange(next);
    const target = next.length > 0 ? Math.min(i, next.length - 1) : null;
    if (target !== null) inputRefs.current[target]?.focus();
    else addRef.current?.focus();
  };

  const add = () => {
    setPendingFocus(items.length);
    onChange([...items, ""]);
  };

  const pick = async (i: number) => {
    if (pickingRef.current !== null) return;
    pickingRef.current = i;
    setPickingIndex(i);
    try {
      const { path } = await callApp("pick_folder", { title: "Choose a folder" });
      if (path) set(i, path);
    } catch (e) {
      showError(e);
    } finally {
      pickingRef.current = null;
      setPickingIndex(null);
    }
  };

  const errorId = `${id}-error`;
  const label = isPath ? "Folder" : "Item";

  return (
    <div className="flex flex-col gap-1.5">
      {/* Announces a move for screen reader users, who won't otherwise notice the row content swap. */}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
      {items.length === 0 && <p className="text-xs text-muted-foreground">No {label.toLowerCase()}s yet. Add one below.</p>}
      <div className="flex flex-col gap-1">
        {items.map((item, i) => {
          const trimmed = item.trim();
          const rowInvalid = isPath && trimmed === "";
          const showReason = rowInvalid && i === emptyIndex;
          const notMounted = isPath && trimmed !== "" && !mounted(trimmed);
          const warningId = `${id}-warning-${i}`;
          const picking = pickingIndex === i;
          return (
            <div key={i} className="flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <Input
                  id={i === 0 ? id : undefined}
                  ref={(el) => {
                    inputRefs.current[i] = el;
                  }}
                  className="font-mono"
                  spellCheck={false}
                  value={item}
                  onChange={(e) => set(i, e.target.value)}
                  aria-invalid={rowInvalid}
                  aria-describedby={describedBy(showReason && errorId, notMounted && warningId)}
                  // Row 1 keeps whatever external <label htmlFor> names this field; naming it here too would
                  // silently override that label. Rows 2+ have no external label, so they name themselves.
                  aria-label={i === 0 ? undefined : `${label} ${i + 1} of ${items.length}`}
                />
                {isPath && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button" variant="outline" size="icon"
                        className="size-8 aria-disabled:pointer-events-none aria-disabled:opacity-45"
                        aria-label={`Choose a folder for item ${i + 1}`} onClick={() => pick(i)}
                        aria-disabled={picking} aria-busy={picking}
                      >
                        <FolderOpen aria-hidden />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Choose a folder for item {i + 1}</TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button" variant="ghost" size="icon" className="size-8"
                      aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}
                      ref={(el) => {
                        upRefs.current[i] = el;
                      }}
                    >
                      <ArrowUp aria-hidden />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Move up</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button" variant="ghost" size="icon" className="size-8"
                      aria-label="Move down" onClick={() => move(i, 1)} disabled={i === items.length - 1}
                      ref={(el) => {
                        downRefs.current[i] = el;
                      }}
                    >
                      <ArrowDown aria-hidden />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Move down</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Remove" onClick={() => remove(i)}>
                      <X aria-hidden />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Remove</TooltipContent>
                </Tooltip>
              </div>
              {showReason && error && (
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
        })}
      </div>
      <Button type="button" variant="ghost" size="sm" className="w-fit" ref={addRef} onClick={add}>
        <Plus aria-hidden /> Add
      </Button>
    </div>
  );
}
