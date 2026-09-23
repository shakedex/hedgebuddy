import {
  AppWindow, Ban, Braces, CircleCheck, CircleDashed, CirclePause, CircleX, FileCode, FileX, Hand,
  History, Hourglass, House, Link, Package, Plug, Settings, TriangleAlert, Unlink, type LucideIcon,
} from "lucide-react";
import type { ActivityOutcome, RunStatus } from "@/api/tools.gen";

/** Colour only marks problems (spec §2.7): red failed, amber needs a look; fine is neutral grey. */
export type Tone = "neutral" | "muted" | "destructive" | "warning";

/** Spec §5.2 status table: one icon and one word per state. */
export const STATUS = {
  runOk: { icon: CircleCheck, word: "ok", tone: "neutral" },
  runFailed: { icon: CircleX, word: "failed", tone: "destructive" },
  runUnfinished: { icon: CircleDashed, word: "unfinished", tone: "neutral" },
  attached: { icon: Link, word: "attached", tone: "neutral" },
  detached: { icon: Unlink, word: "nothing attached", tone: "muted" },
  external: { icon: FileCode, word: "your own file", tone: "neutral" },
  stale: { icon: FileX, word: "file missing", tone: "warning" },
  staged: { icon: Hourglass, word: "apply in OffShoot Helper", tone: "warning" },
  manual: { icon: Hand, word: "set in the app", tone: "neutral" },
  unsupported: { icon: Ban, word: "not supported yet", tone: "muted" },
  varMissing: { icon: Braces, word: "not set", tone: "warning" },
  package: { icon: Package, word: "package problem", tone: "warning" },
  alert: { icon: TriangleAlert, word: "needs a look", tone: "warning" },
  callOk: { icon: CircleCheck, word: "ok", tone: "neutral" },
  callError: { icon: CircleX, word: "error", tone: "destructive" },
  callWaiting: { icon: CirclePause, word: "waited for your OK", tone: "neutral" },
} as const satisfies Record<string, { icon: LucideIcon; word: string; tone: Tone }>;

export type StatusKey = keyof typeof STATUS;

/** Icon colour per tone. Fine stays grey. */
export const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-muted-foreground",
  muted: "text-muted-foreground/60",
  destructive: "text-destructive",
  warning: "text-warning",
};

export function runStatusKey(status: RunStatus | null | undefined): StatusKey {
  if (status === "ok") return "runOk";
  if (status === "failed" || status === "error") return "runFailed";
  return "runUnfinished";
}

export function outcomeKey(outcome: ActivityOutcome): StatusKey {
  return outcome === "ok" ? "callOk" : outcome === "error" ? "callError" : "callWaiting";
}

/** Spec §5.2 navigation icons. */
export const NAV_ICONS = {
  home: House, runs: History, variables: Braces, scripts: FileCode, apps: AppWindow, connect: Plug, settings: Settings,
} satisfies Record<string, LucideIcon>;
