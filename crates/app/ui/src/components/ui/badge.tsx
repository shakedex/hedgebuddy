import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

/*
 * A small label chip. Neutral by default; only `destructive` (failed) and `warning` (needs a look) carry a
 * hue, and `link` is for "required by" chips (spec §5.1). There is deliberately no primary badge.
 * Counts use `CountBadge`, not this.
 */
const badgeVariants = cva(
  "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2 text-xs font-medium whitespace-nowrap transition-colors duration-120 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-border-strong bg-accent/50 text-foreground [a&]:hover:bg-accent",
        outline: "border-border-strong bg-transparent text-muted-foreground [a&]:hover:text-foreground",
        destructive: "border-destructive-border bg-destructive-tint text-destructive",
        warning: "border-warning-border bg-warning-tint text-warning",
        link: "border-border-strong bg-transparent text-link [a&]:hover:bg-accent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
