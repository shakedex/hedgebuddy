import { useCallback } from "react";
import type { BaseLocationHook } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { confirmLeave } from "./unsaved";

/** wouter's hash location, whose navigate asks before throwing away unsaved edits. Links and navigate() both go through it. */
export const useGuardedHashLocation: BaseLocationHook = () => {
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
};

// wouter's <Link> reads `hook.hrefs` to render its href (`#/…`); without it links render a plain path
// (still clickable, but hover previews, "copy link" and modified clicks no longer target the hash URL).
// wouter's own `.d.ts` doesn't type this runtime-assigned static, so read it through `BaseLocationHook`.
useGuardedHashLocation.hrefs = (useHashLocation as BaseLocationHook).hrefs;
