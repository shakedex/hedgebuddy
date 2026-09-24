import { useEffect, useRef } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * List and detail (spec §4.5). When the screen is at least 640 px wide the list sits on the left and the
 * detail on the right. Narrower, the list fills the screen; a selection slides the detail over it with a
 * back button. Width comes from a container query, so the sidebar's width is accounted for.
 *
 * Focus follows the panes: in the narrow layout a new selection moves focus to the back button (the list
 * it was in is hidden), and Back or Escape returns it to the list item it came from. In the wide layout
 * focus stays in the list, so arrowing through it keeps working. Escape anywhere inside clears the
 * selection; menus and dialogs portalled out of this tree handle their own Escape.
 */
export function ListDetail({ list, detail, selected, onBack, backLabel }: {
  list: React.ReactNode; detail: React.ReactNode; selected: boolean; onBack: () => void; backLabel: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  /** The last element focused inside the list: where Back returns to. */
  const lastInList = useRef<HTMLElement | null>(null);
  const wasSelected = useRef(selected);

  useEffect(() => {
    const was = wasSelected.current;
    wasSelected.current = selected;
    const listPane = listRef.current;
    if (!listPane) return;
    if (selected && !was) {
      // Narrow layout: the list just got hidden, so bring focus into the detail.
      if (getComputedStyle(listPane).display === "none") backRef.current?.focus();
    } else if (!selected && was) {
      // Back: return to the list unless focus is already there (wide layout, Escape from a row).
      if (!listPane.contains(document.activeElement)) {
        const target = lastInList.current?.isConnected ? lastInList.current : listPane;
        target.focus();
      }
    }
  }, [selected]);

  return (
    <div
      className="@container flex h-full min-h-0"
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !selected || e.defaultPrevented) return;
        // Events from portalled content (menus, dialogs) bubble through React but are not ours to handle.
        if (!e.currentTarget.contains(e.target as Node)) return;
        e.preventDefault();
        onBack();
      }}
    >
      <div
        ref={listRef}
        tabIndex={-1}
        onFocusCapture={(e) => {
          if (e.target !== e.currentTarget) lastInList.current = e.target as HTMLElement;
        }}
        className={cn(
          "flex min-h-0 w-full flex-col focus-visible:outline-offset-[-2px] @min-[640px]:w-[clamp(248px,38%,360px)] @min-[640px]:shrink-0 @min-[640px]:border-r @min-[640px]:border-border",
          selected && "@max-[640px]:hidden",
        )}
      >
        {list}
      </div>
      <div className={cn("min-h-0 min-w-0 flex-1 flex-col", selected ? "flex @max-[640px]:animate-slide-in" : "hidden @min-[640px]:flex")}>
        {selected && (
          <div className="flex h-10 shrink-0 items-center border-b border-border px-2 @min-[640px]:hidden">
            <Button ref={backRef} variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft aria-hidden className="size-3.5" /> {backLabel}
            </Button>
          </div>
        )}
        {detail}
      </div>
    </div>
  );
}
