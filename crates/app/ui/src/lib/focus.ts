/**
 * The current screen's own `<h1>` (see `ScreenHeader`). A fallback landing spot for focus when whatever
 * held it is gone for good — deleting the active profile unmounts the toolbar's profile pill, for one — and
 * there is nothing more specific left to send it to.
 */
export function focusMainHeading() {
  document.getElementById("screen-heading")?.focus();
}
