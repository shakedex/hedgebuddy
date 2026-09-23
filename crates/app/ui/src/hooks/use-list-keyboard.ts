import { useCallback, useRef } from "react";

/**
 * Arrow keys, Home and End move the selection through `ids` (spec §7). Attach to the list's onKeyDown.
 *
 * Remembers the last non-null `selectedId` (a ref, updated on every render) so that when the selection is
 * cleared — Escape or Back navigate to the bare list, so `selectedId` becomes null — the next ArrowDown/Up
 * continues from where the user was instead of always restarting at row 0.
 */
export function useListKeyboard(ids: string[], selectedId: string | null, onSelect: (id: string) => void) {
  const lastSelectedId = useRef<string | null>(null);
  if (selectedId !== null) lastSelectedId.current = selectedId;

  return useCallback(
    (e: React.KeyboardEvent) => {
      if (ids.length === 0) return;
      const effective = selectedId ?? lastSelectedId.current;
      const at = effective ? ids.indexOf(effective) : -1;
      const next =
        e.key === "ArrowDown" ? Math.min(ids.length - 1, at + 1)
        : e.key === "ArrowUp" ? Math.max(0, at === -1 ? 0 : at - 1)
        : e.key === "Home" ? 0
        : e.key === "End" ? ids.length - 1
        : null;
      if (next === null) return;
      e.preventDefault();
      onSelect(ids[next]);
      document.getElementById(`run-${ids[next]}`)?.scrollIntoView({ block: "nearest" });
    },
    [ids, selectedId, onSelect],
  );
}
