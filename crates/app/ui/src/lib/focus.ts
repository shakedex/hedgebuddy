/**
 * The current screen's own `<h1>` (see `ScreenHeader`). A fallback landing spot for focus when whatever
 * held it is gone for good — deleting the active profile unmounts the toolbar's profile pill, for one — and
 * there is nothing more specific left to send it to.
 */
export function focusMainHeading() {
  document.getElementById("screen-heading")?.focus();
}

/**
 * A screen's own list pane (its `role="listbox"`, by DOM id), for after deleting the item that had it open —
 * so keyboard arrow-key navigation keeps working right where the list is, rather than landing on the
 * now-removed row's own detail or a heading with nothing left to point at.
 */
export function focusListbox(id: string) {
  document.getElementById(id)?.focus();
}
