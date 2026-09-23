import { CircleCheck, CircleX, Info, LoaderCircle, TriangleAlert } from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/*
 * Toasts are floating layers: card surface, strong hairline, the one soft `shadow-float`. Sonner's own look
 * is unlayered CSS (it would win over Tailwind's layers), so the toasts are `unstyled` and every part is
 * styled here. An error keeps only its red icon; the text stays neutral (spec §2.7: colour marks the
 * problem, not the whole toast).
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      gap={8}
      icons={{
        success: <CircleCheck className="size-4 text-muted-foreground" strokeWidth={1.75} />,
        info: <Info className="size-4 text-muted-foreground" strokeWidth={1.75} />,
        warning: <TriangleAlert className="size-4 text-warning" strokeWidth={1.75} />,
        error: <CircleX className="size-4 text-destructive" strokeWidth={1.75} />,
        loading: <LoaderCircle className="size-4 animate-spin text-muted-foreground" strokeWidth={1.75} />,
      }}
      style={
        {
          // Sonner's few rules that `unstyled` keeps (the close button) read these.
          "--normal-bg": "var(--card)",
          "--normal-bg-hover": "var(--accent)",
          "--normal-border": "var(--border-strong)",
          "--normal-border-hover": "var(--border-strong)",
          "--normal-text": "var(--foreground)",
        } as React.CSSProperties
      }
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-(--width) items-start gap-2 rounded-lg border border-border-strong bg-popover p-3 font-sans shadow-float text-sm text-foreground focus-visible:outline-2! focus-visible:outline-offset-2! focus-visible:outline-primary!",
          icon: "flex h-lh shrink-0 items-center",
          content: "flex min-w-0 flex-1 flex-col",
          title: "font-medium text-foreground-strong",
          // `!`: Sonner colours dark-theme descriptions with an unlayered rule that `unstyled` does not remove.
          description: "text-muted-foreground!",
          actionButton:
            "inline-flex h-7 shrink-0 items-center rounded-md border border-border-strong px-2.5 text-sm font-medium text-foreground transition-colors duration-120 hover:bg-accent hover:text-foreground-strong",
          cancelButton:
            "inline-flex h-7 shrink-0 items-center rounded-md px-2.5 text-sm text-muted-foreground transition-colors duration-120 hover:bg-accent hover:text-foreground-strong",
          closeButton: "text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
