import { useEffect, useState } from "react";

/**
 * The value, delayed until it's stayed put for `delayMs`. Used to settle a typed path before it drives a
 * `path_status` query, so the not-mounted note doesn't blink or shift layout on every keystroke.
 */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
