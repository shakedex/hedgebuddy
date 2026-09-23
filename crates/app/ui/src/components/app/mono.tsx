import { cn } from "@/lib/utils";

/** File names, variable names, paths and tool names. */
export function Mono({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("font-mono text-[0.95em] text-foreground-strong", className)} {...props} />;
}
