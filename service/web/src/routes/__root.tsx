import { Outlet, Link, useRouterState } from '@tanstack/react-router'
import {
  LayoutDashboard,
  ScrollText,
  GitBranch,
  Settings,
  Activity,
  Package,
  History,
} from 'lucide-react'
import { cn } from '#/lib/utils'

const navItems = [
  { to: '/' as const, label: 'Dashboard', icon: LayoutDashboard },
  { to: '/events' as const, label: 'Events', icon: ScrollText },
  { to: '/workflows' as const, label: 'Workflows', icon: GitBranch },
  { to: '/runs' as const, label: 'Runs', icon: History },
  { to: '/quills' as const, label: 'Quills', icon: Package },
  { to: '/settings' as const, label: 'Settings', icon: Settings },
]

export function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-sidebar">
        <div className="flex items-center gap-2 border-b border-border px-4 py-4">
          <Activity className="h-5 w-5 text-(--lagoon)" />
          <span className="text-lg font-bold tracking-tight text-sidebar-foreground">
            Quills
          </span>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {navItems.map(({ to, label, icon: Icon }) => {
            const active =
              to === '/' ? pathname === '/' : pathname.startsWith(to)
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            )
          })}
        </nav>
        <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          Quills &middot; HedgeBuddy
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
