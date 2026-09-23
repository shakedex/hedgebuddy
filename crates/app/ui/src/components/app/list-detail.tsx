import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * List and detail (spec §4.5). When the screen is at least 640 px wide the list sits on the left and the
 * detail on the right. Narrower, the list fills the screen; a selection slides the detail over it with a
 * back button. Width comes from a container query, so the sidebar's width is accounted for.
 */
export function ListDetail({ list, detail, selected, onBack, backLabel }: {
  list: React.ReactNode; detail: React.ReactNode; selected: boolean; onBack: () => void; backLabel: string;
}) {
  return (
    <div className="@container flex h-full min-h-0">
      <div
        className={cn(
          "flex min-h-0 w-full flex-col @min-[640px]:w-[clamp(248px,38%,360px)] @min-[640px]:shrink-0 @min-[640px]:border-r @min-[640px]:border-border",
          selected && "@max-[640px]:hidden",
        )}
      >
        {list}
      </div>
      <div
        className={cn("min-h-0 min-w-0 flex-1 flex-col", selected ? "flex @max-[640px]:animate-slide-in" : "hidden @min-[640px]:flex")}
        onKeyDown={(e) => {
          if (e.key === "Escape" && selected) onBack();
        }}
      >
        {selected && (
          <div className="flex h-10 shrink-0 items-center border-b border-border px-1.5 @min-[640px]:hidden">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft aria-hidden className="size-3.5" /> {backLabel}
            </Button>
          </div>
        )}
        {detail}
      </div>
    </div>
  );
}
