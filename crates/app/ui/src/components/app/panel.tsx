import { cn } from "@/lib/utils";

/** A titled surface. The body has a 4 px inset; rows inside use `px-2`, so their content lines up with the title at 12 px. */
export function Panel({ title, action, children, className, bodyClassName, style, headingRef }: {
  title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode;
  className?: string; bodyClassName?: string; style?: React.CSSProperties;
  /**
   * Lets a caller move focus to this panel's heading once something it replaced (a dialog, a screen swap)
   * has unmounted and there's nowhere better for focus to land. Adds `tabIndex={-1}` so the heading is
   * focusable without joining the Tab order.
   */
  headingRef?: React.Ref<HTMLHeadingElement>;
}) {
  return (
    <section className={cn("surface flex min-w-0 flex-col", className)} style={style}>
      {title && (
        <header className="flex h-10 shrink-0 items-center justify-between gap-2 px-3">
          <h2 ref={headingRef} tabIndex={headingRef ? -1 : undefined} className="text-sm font-medium text-foreground-strong">
            {title}
          </h2>
          {action}
        </header>
      )}
      <div className={cn("min-h-0 px-1 pb-1", !title && "pt-1", bodyClassName)}>{children}</div>
    </section>
  );
}
