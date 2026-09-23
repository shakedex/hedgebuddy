import { useLocation } from "wouter";
import { AppSidebar } from "@/components/app/app-sidebar";
import { ErrorBoundary } from "@/components/app/error-boundary";
import { ProfileSwitcher } from "@/components/app/profile-switcher";
import { ScreenHeader } from "@/components/app/screen-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useMediaQuery } from "@/hooks/use-media-query";
import { navFor } from "@/lib/routes";

/** Spec §4.5: labelled sidebar from 720 px, icon rail below. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const wide = useMediaQuery("(min-width: 720px)");
  const [location] = useLocation();
  const title = location === "/_design" ? "Design system" : navFor(location).label;
  return (
    <SidebarProvider open={wide} onOpenChange={() => {}} style={{ "--sidebar-width": "12.5rem", "--sidebar-width-icon": "3.25rem" } as React.CSSProperties}>
      <AppSidebar />
      <SidebarInset className="ambient flex h-svh min-w-0 flex-col">
        <ScreenHeader title={title}>
          <ProfileSwitcher />
        </ScreenHeader>
        <main className="min-h-0 flex-1">
          <ErrorBoundary key={location}>
            <div key={location} className="h-full animate-rise">{children}</div>
          </ErrorBoundary>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
