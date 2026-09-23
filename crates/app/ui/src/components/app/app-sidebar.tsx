import { Link, useLocation } from "wouter";
import { useHomeSummary } from "@/api/queries";
import type { SidebarBadges } from "@/api/tools.gen";
import { CountBadge } from "@/components/app/count-badge";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { NAV, SETTINGS, navFor, type NavItem } from "@/lib/routes";
import { cn } from "@/lib/utils";

/** The rail's badge is visual only; this is what a screen reader says instead. */
function badgeWord(tone: "destructive" | "warning", count: number): string {
  return tone === "destructive" ? "failed" : count === 1 ? "needs a look" : "need a look";
}

function NavLink({ item, badges }: { item: NavItem; badges: SidebarBadges | undefined }) {
  const [location] = useLocation();
  const active = navFor(location).path === item.path;
  const count = item.badge ? badges?.[item.badge.key] ?? 0 : 0;
  const Icon = item.icon;
  const label = count > 0 && item.badge ? `${item.label}, ${count} ${badgeWord(item.badge.tone, count)}` : item.label;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
        <Link
          href={item.path}
          aria-label={label}
          aria-current={active ? "page" : undefined}
          className={cn(
            "relative",
            active
              ? "bg-accent text-foreground-strong before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary"
              : "text-muted-foreground hover:bg-card hover:text-foreground",
          )}
        >
          <Icon aria-hidden className="size-4" strokeWidth={1.75} />
          <span className="flex-1 truncate group-data-[collapsible=icon]:hidden">{item.label}</span>
          {item.badge && (
            <>
              <CountBadge count={count} tone={item.badge.tone} className="group-data-[collapsible=icon]:hidden" />
              <CountBadge
                count={count}
                tone={item.badge.tone}
                variant="rail"
                className="absolute -top-1 -right-1 hidden group-data-[collapsible=icon]:flex"
              />
            </>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** Spec §4.5: labelled sidebar from 720 px, icon rail below; spec §5.2 order, Settings pinned to the bottom. */
export function AppSidebar() {
  const badges = useHomeSummary().data?.badges;
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex h-8 items-center gap-2 px-1">
          <div aria-hidden className="size-[18px] shrink-0 rounded-[5px] bg-linear-135 from-[var(--brand-from)] to-[var(--brand-to)]" />
          <span className="truncate text-base font-semibold text-foreground-strong group-data-[collapsible=icon]:hidden">HedgeBuddy</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {NAV.map((item) => (
            <NavLink key={item.path} item={item} badges={badges} />
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <NavLink item={SETTINGS} badges={badges} />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
