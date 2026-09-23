import { invoke } from "@tauri-apps/api/core";
import type { AppCommandName, AppCommandTypes, ToolName, ToolTypes } from "./tools.gen";

/** `busy`: another HedgeBuddy holds the data folder, so offer Try again. */
export type BridgeErrorKind = "busy" | "error";

/** A failed tool or app command, carrying the message to show. */
export class BridgeError extends Error {
  readonly kind: BridgeErrorKind;

  constructor(kind: BridgeErrorKind, message: string) {
    super(message);
    this.name = "BridgeError";
    this.kind = kind;
  }
}

/** The browser preview's stand-in for Tauri; only `vite --mode mock` loads it. */
const mock = import.meta.env.MODE === "mock" ? import("@/mock/handlers") : null;

/** True in the browser preview (`bun run dev:mock`). */
export const isPreview = mock !== null;

function toBridgeError(e: unknown): BridgeError {
  if (e instanceof BridgeError) return e;
  if (typeof e === "object" && e !== null && "message" in e) {
    const { kind, message } = e as { kind?: unknown; message: unknown };
    return new BridgeError(kind === "busy" ? "busy" : "error", String(message));
  }
  return new BridgeError("error", String(e));
}

/** Run a tool exactly as Claude does. */
export async function callTool<N extends ToolName>(
  name: N,
  args: ToolTypes[N]["input"],
): Promise<ToolTypes[N]["output"]> {
  try {
    if (mock) return await (await mock).callTool(name, args);
    return await invoke<ToolTypes[N]["output"]>("tool", { name, args });
  } catch (e) {
    throw toBridgeError(e);
  }
}

/** Run an app-only command. */
export async function callApp<C extends AppCommandName>(
  name: C,
  args: AppCommandTypes[C]["input"],
): Promise<AppCommandTypes[C]["output"]> {
  try {
    if (mock) return await (await mock).callApp(name, args);
    return await invoke<AppCommandTypes[C]["output"]>(name, { args });
  } catch (e) {
    throw toBridgeError(e);
  }
}
