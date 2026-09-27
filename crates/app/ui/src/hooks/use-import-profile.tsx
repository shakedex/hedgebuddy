import { useEffect, useRef, useState } from "react";
import { callApp } from "@/api/bridge";
import { ImportProfileDialog } from "@/components/app/import-profile-dialog";
import { focusMainHeading } from "@/lib/focus";
import { showError } from "@/lib/toast";

/**
 * The "Import profile…" flow: `pick_import_file`, then the dialog once a file is actually chosen. Factored
 * out so the profile pill, Home's first-run step and the Variables no-profile empty state can all reach it
 * without each re-implementing the pick-then-dialog dance (spec §6.1/§6.2/§6.3: import has to be reachable
 * with no active profile too, since the pill itself only shows once one exists).
 *
 * `start()` captures whatever has focus when it's called — the button that triggered it — and restores it
 * once the dialog closes, or right away if the picker is cancelled or errors. If that element is gone by
 * then (switching profiles can unmount the very button that started this, e.g. Home's first-run step), it
 * falls back to the screen's own heading rather than losing focus to `<body>`.
 *
 * `picking` is true while the native file picker itself is open, so a caller can disable its own button —
 * `start()` also guards itself, so a double click can never open two pickers even if a caller doesn't.
 */
export function useImportProfile() {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState<string | null>(null);
  // Bumped every time a file is picked, so the dialog fully remounts (a fresh NAME field, fresh "Switch to
  // it") even when the very same file is chosen twice in a row.
  const [key, setKey] = useState(0);
  const [picking, setPicking] = useState(false);
  const pickingRef = useRef(false);
  const openerRef = useRef<HTMLElement | null>(null);

  const restoreFocus = () => {
    const el = openerRef.current;
    if (el && el.isConnected) el.focus();
    else focusMainHeading();
  };

  // A plain `restoreFocus()` right where `picking` is set back to `false` is a no-op: the caller's own
  // button (disabled with `picking`) is still `disabled` in the DOM at that point, since the state update
  // hasn't rendered yet. Deferring to an effect runs after the re-render that actually re-enables it — the
  // same pattern `ExportProfileDialog`/`ImportProfileDialog` use for their own buttons.
  const [refocus, setRefocus] = useState(false);
  useEffect(() => {
    if (refocus && !picking) {
      restoreFocus();
      setRefocus(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refocus, picking]);

  const start = () => {
    if (pickingRef.current) return;
    pickingRef.current = true;
    setPicking(true);
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    callApp("pick_import_file", {}).then(
      (r) => {
        pickingRef.current = false;
        setPicking(false);
        if (!r.path) {
          setRefocus(true); // Cancelled: nothing to import, nothing changed.
          return;
        }
        setPath(r.path);
        setKey((k) => k + 1);
        setOpen(true);
      },
      (e: unknown) => {
        pickingRef.current = false;
        setPicking(false);
        showError(e);
        setRefocus(true);
      },
    );
  };

  const dialog = path ? (
    <ImportProfileDialog key={key} open={open} onOpenChange={setOpen} path={path} onCloseFocus={restoreFocus} />
  ) : null;

  return { start, dialog, picking };
}
