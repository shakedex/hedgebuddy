import type { LucideIcon } from "lucide-react";
import { NAV_ICONS } from "@/lib/status";
import type { SidebarBadges } from "@/api/tools.gen";

export type NavItem = {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Which count from `home_summary.badges` shows on it, and in which tint (spec §5.2). */
  badge?: { key: keyof SidebarBadges; tone: "destructive" | "warning" };
};

/** Spec §5.2 order. Settings sits at the bottom. */
export const NAV: NavItem[] = [
  { path: "/", label: "Home", icon: NAV_ICONS.home },
  { path: "/runs", label: "Runs", icon: NAV_ICONS.runs, badge: { key: "runs", tone: "destructive" } },
  { path: "/variables", label: "Variables", icon: NAV_ICONS.variables, badge: { key: "variables", tone: "warning" } },
  { path: "/scripts", label: "Scripts", icon: NAV_ICONS.scripts },
  { path: "/apps", label: "Hedge apps", icon: NAV_ICONS.apps, badge: { key: "apps", tone: "warning" } },
  { path: "/connect", label: "Connect", icon: NAV_ICONS.connect },
];
export const SETTINGS: NavItem = { path: "/settings", label: "Settings", icon: NAV_ICONS.settings, badge: { key: "settings", tone: "warning" } };

/** The nav item a location belongs to (`/runs/abc` → Runs). */
export function navFor(location: string): NavItem {
  return [...NAV, SETTINGS].find((n) => (n.path === "/" ? location === "/" : location === n.path || location.startsWith(`${n.path}/`))) ?? NAV[0];
}
