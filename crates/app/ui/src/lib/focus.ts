import { useEffect, useRef } from "react";

/**
 * The current screen's own `<h1>` (see `ScreenHeader`). A fallback landing spot for focus when whatever
 * held it is gone for good — deleting the active profile unmounts the toolbar's profile pill, for one — and
 * there is nothing more specific left to send it to.
 */
export function focusMainHeading() {
  document.getElementById("screen-heading")?.focus();
}

/**
 * Moves focus to the screen heading when a list that had rows becomes empty (Variables, Scripts: deleting
 * the last item). A delete dialog's own `returnFocus` fallback finds the listbox still there the moment it
 * closes — the query invalidation that empties the list is still in flight — and lands focus on it; that
 * invalidation then lands, removing the now-focused listbox from the DOM, which drops focus to `<body>` with
 * nothing left to catch it. This effect runs on exactly that transition (not on a screen that was already
 * empty on first mount) and only steps in while focus has genuinely gone nowhere.
 */
export function useFocusHeadingWhenEmptied(isEmpty: boolean) {
  const wasEmpty = useRef(isEmpty);
  useEffect(() => {
    if (!wasEmpty.current && isEmpty && document.activeElement === document.body) {
      focusMainHeading();
    }
    wasEmpty.current = isEmpty;
  }, [isEmpty]);
}

/**
 * A screen's own list pane (its `role="listbox"`, by DOM id), for after deleting the item that had it open —
 * so keyboard arrow-key navigation keeps working right where the list is, rather than landing on the
 * now-removed row's own detail or a heading with nothing left to point at.
 */
export function focusListbox(id: string) {
  document.getElementById(id)?.focus();
}
