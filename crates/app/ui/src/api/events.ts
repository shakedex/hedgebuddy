import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { isPreview } from "./bridge";
import { invalidateFor } from "./queries";

/** Payload of the app's `data-changed` event. */
export type DataChanged = { categories: string[] };

/** The browser preview's stand-in event name. */
export const MOCK_EVENT = "hb:data-changed";

/** Reload what changed on disk (Claude, `hedgebuddy call`, another HedgeBuddy). Mount once. */
export function useDataChanged() {
  useEffect(() => {
    if (isPreview) {
      const onEvent = (e: Event) => invalidateFor((e as CustomEvent<DataChanged>).detail.categories);
      window.addEventListener(MOCK_EVENT, onEvent);
      return () => window.removeEventListener(MOCK_EVENT, onEvent);
    }
    const stop = listen<DataChanged>("data-changed", (e) => invalidateFor(e.payload.categories));
    return () => {
      void stop.then((unlisten) => unlisten());
    };
  }, []);
}
