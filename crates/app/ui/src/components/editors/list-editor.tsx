import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, FolderOpen, Plus, TriangleAlert, X } from "lucide-react";
import { callApp } from "@/api/bridge";
import { usePathStatus } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const paths = isPath ? items.filter((p) => p.trim() !== "") : [];
  const status = usePathStatus(paths);
  const mounted = (path: string) => status.data?.paths.find((p) => p.path === path)?.mounted !== false;

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const addRef = useRef<HTMLButtonElement>(null);
  const [pendingFocus, setPendingFocus] = useState<number | null>(null);
  const [pickingIndex, setPickingIndex] = useState<number | null>(null);

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
    inputRefs.current[j]?.focus();
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
    setPickingIndex(i);
    try {
      const { path } = await callApp("pick_folder", { title: "Choose a folder" });
      if (path) set(i, path);
    } catch (e) {
      showError(e);
    } finally {
      setPickingIndex(null);
    }
  };

  const errorId = `${id}-error`;
  const noun = isPath ? "folder" : "item";

  return (
    <div className="flex flex-col gap-1.5">
      {items.length === 0 && <p className="text-xs text-muted-foreground">No {noun}s yet. Add one below.</p>}
      <div className="flex flex-col gap-1">
        {items.map((item, i) => {
          const trimmed = item.trim();
          const notMounted = isPath && trimmed !== "" && !mounted(trimmed);
          const warningId = `${id}-warning-${i}`;
          return (
            <div key={i} className="flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <Input
                  id={i === 0 ? id : undefined}
                  ref={(el) => {
                    inputRefs.current[i] = el;
                  }}
                  className="font-mono"
                  value={item}
                  onChange={(e) => set(i, e.target.value)}
                  aria-invalid={!!error}
                  aria-describedby={describedBy(error && errorId, notMounted && warningId)}
                  aria-label={`${isPath ? "Folder" : "Item"} ${i + 1}`}
                />
                {isPath && (
                  <Button
                    type="button" variant="outline" size="icon" aria-label="Choose a folder"
                    onClick={() => pick(i)} disabled={pickingIndex === i} aria-busy={pickingIndex === i}
                  >
                    <FolderOpen aria-hidden />
                  </Button>
                )}
                <Button type="button" variant="ghost" size="icon" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  type="button" variant="ghost" size="icon" aria-label="Move down"
                  onClick={() => move(i, 1)} disabled={i === items.length - 1}
                >
                  <ArrowDown aria-hidden />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => remove(i)}>
                  <X aria-hidden />
                </Button>
              </div>
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
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
