import { useCallback } from "react";

/** Arrow keys, Home and End move the selection through `ids` (spec §7). Attach to the list's onKeyDown. */
export function useListKeyboard(ids: string[], selectedId: string | null, onSelect: (id: string) => void) {
  return useCallback(
    (e: React.KeyboardEvent) => {
      if (ids.length === 0) return;
      const at = selectedId ? ids.indexOf(selectedId) : -1;
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
