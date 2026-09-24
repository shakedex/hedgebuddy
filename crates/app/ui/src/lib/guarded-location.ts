import { useCallback } from "react";
import { useHashLocation } from "wouter/use-hash-location";
import { confirmLeave } from "./unsaved";

/** wouter's hash location, whose navigate asks before throwing away unsaved edits. Links and navigate() both go through it. */
export function useGuardedHashLocation(): ReturnType<typeof useHashLocation> {
  const [location, navigate] = useHashLocation();
  const guarded = useCallback(
    (to: Parameters<typeof navigate>[0], options?: Parameters<typeof navigate>[1]) => {
      void confirmLeave().then((ok) => {
        if (ok) navigate(to, options);
      });
    },
    [navigate],
  ) as typeof navigate;
  return [location, guarded];
}
