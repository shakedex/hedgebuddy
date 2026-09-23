import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge only knows t-shirt font sizes; without this it reads `text-stat` as a text colour and
 * drops it whenever a colour class such as `text-foreground-strong` follows.
 */
const twMerge = extendTailwindMerge({ extend: { theme: { text: ["stat"] } } });

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
