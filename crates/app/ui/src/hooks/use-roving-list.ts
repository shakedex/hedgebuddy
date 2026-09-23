import { useState, type KeyboardEvent } from "react";

/**
 * Roving tabindex for a list of link/button rows (spec §7: "Arrow keys move through lists"). Only one row
 * is a Tab stop at a time — Tab still moves between panels — while Up/Down move it by one row and Home/End
 * jump to the first/last. Wire `onKeyDown` onto the containing list, and on every row: `data-roving-row`
 * (so this can find its siblings), `tabIndex={tabIndex(i)}`, and `onFocus={onRowFocus(i)}` (keeps the
 * roving stop in sync when a row is focused some other way, e.g. a click).
 */
export function useRovingList() {
  const [current, setCurrent] = useState(0);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    const rows = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-roving-row]")];
    if (rows.length === 0) return;
    const at = rows.indexOf(document.activeElement as HTMLElement);
    const from = at === -1 ? current : at;
    let next = from;
    if (e.key === "Home") next = 0;
    else if (e.key === "End") next = rows.length - 1;
    else if (e.key === "ArrowDown") next = Math.min(rows.length - 1, from + 1);
    else if (e.key === "ArrowUp") next = Math.max(0, from - 1);
    if (next === from) return;
    e.preventDefault();
    rows[next]?.focus();
  };

  return {
    onKeyDown,
    tabIndex: (index: number) => (index === current ? 0 : -1),
    onRowFocus: (index: number) => () => setCurrent(index),
  };
}
