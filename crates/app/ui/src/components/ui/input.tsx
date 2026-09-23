import * as React from "react"
import { cn } from "@/lib/utils"

/** A recessed field: well background, strong hairline, red border when `aria-invalid`. Focus is the global ring. */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-md border border-border-strong bg-well px-2.5 text-sm text-foreground-strong transition-colors duration-120",
        "placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
        "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        "aria-invalid:border-destructive-border",
        className
      )}
      {...props}
    />
  )
}

export { Input }
