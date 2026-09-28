/** The toolbar row at the top of every screen: title left, controls (the profile switcher) right. */
export function ScreenHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-4 max-[560px]:px-3">
      {/* `id` + `tabIndex=-1`: a landing spot for focus when whatever had it disappears out from under it
          (deleting the active profile unmounts the profile pill) and there's nowhere more specific to send
          it. See `lib/focus.ts`. */}
      <h1 id="screen-heading" tabIndex={-1} className="truncate text-lg font-semibold text-foreground-strong">
        {title}
      </h1>
      <div className="flex min-w-0 items-center gap-2">{children}</div>
    </header>
  );
}
