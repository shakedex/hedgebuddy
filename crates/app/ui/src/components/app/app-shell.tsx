import { useLocation } from "wouter";
import { AppSidebar } from "@/components/app/app-sidebar";
import { ErrorBoundary } from "@/components/app/error-boundary";
import { ProfileSwitcher } from "@/components/app/profile-switcher";
import { ScreenHeader } from "@/components/app/screen-header";
import { UnsavedDialog } from "@/components/app/unsaved-dialog";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useMediaQuery } from "@/hooks/use-media-query";
import { navFor } from "@/lib/routes";

/** Spec §4.5: labelled sidebar from 720 px, icon rail below. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const wide = useMediaQuery("(min-width: 720px)");
  const [location] = useLocation();
  const nav = location === "/_design" ? undefined : navFor(location);
  const title = location === "/_design" ? "Design system" : (nav?.label ?? "Home");
  // Keyed on the screen (its nav path), not the raw location: `/runs` → `/runs/abc` stays the same screen,
  // so a list-and-detail screen isn't destroyed and remounted on every row click or arrow key.
  const screen = location === "/_design" ? location : (nav?.path ?? "/");
  return (
    <SidebarProvider open={wide} onOpenChange={() => {}} style={{ "--sidebar-width": "12.5rem", "--sidebar-width-icon": "3.25rem" } as React.CSSProperties}>
      <AppSidebar />
      <SidebarInset className="ambient flex h-svh min-w-0 flex-col">
        <ScreenHeader title={title}>
          <ProfileSwitcher />
        </ScreenHeader>
        <div className="min-h-0 flex-1">
          <ErrorBoundary key={screen}>
            <div key={screen} className="h-full animate-rise">{children}</div>
          </ErrorBoundary>
        </div>
      </SidebarInset>
      <UnsavedDialog />
    </SidebarProvider>
  );
}
