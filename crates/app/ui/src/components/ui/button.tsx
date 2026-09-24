import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

/*
 * Restyled to the instrument panel: flat fills, hairline outlines, no shadows or gradients, 120 ms colour
 * changes. Focus is the global 2 px primary outline (globals.css), so nothing here removes the outline.
 * Every size is at least 28 px tall so the hit target holds.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors duration-120 select-none disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80",
        outline:
          "border border-border-strong bg-transparent text-foreground hover:bg-accent hover:text-foreground-strong active:bg-accent/70",
        secondary: "bg-accent text-foreground-strong hover:bg-accent/75 active:bg-accent/60",
        ghost: "text-foreground hover:bg-accent hover:text-foreground-strong active:bg-accent/70",
        /** Text-only red, for Delete. */
        destructive: "text-destructive hover:bg-destructive-tint active:bg-destructive-tint/70",
        link: "text-link underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-3 text-sm has-[>svg]:px-2.5",
        sm: "h-7 px-2.5 text-sm has-[>svg]:px-2",
        icon: "size-7 [&_svg:not([class*='size-'])]:size-4",
      },
    },
    // A link-style button keeps its text height; an invisible ::after makes the hit area 30 px tall.
    compoundVariants: [
      { variant: "link", className: "relative h-auto px-0 has-[>svg]:px-0 after:absolute after:-inset-x-1 after:-inset-y-1.5" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
