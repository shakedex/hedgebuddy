import { cn } from "@/lib/utils";

export function Panel({ title, action, children, className, bodyClassName, style }: {
  title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode;
  className?: string; bodyClassName?: string; style?: React.CSSProperties;
}) {
  return (
    <section className={cn("surface flex min-w-0 flex-col", className)} style={style}>
      {title && (
        <header className="flex h-10 shrink-0 items-center justify-between gap-2 px-3">
          <h2 className="text-sm font-medium text-foreground-strong">{title}</h2>
          {action}
        </header>
      )}
      <div className={cn("min-h-0 px-1.5 pb-1.5", !title && "pt-1.5", bodyClassName)}>{children}</div>
    </section>
  );
}
