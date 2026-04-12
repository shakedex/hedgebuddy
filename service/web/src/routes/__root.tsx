import { Outlet, Link, useRouterState } from '@tanstack/react-router'
import {
  LayoutDashboard,
  ScrollText,
  GitBranch,
  Settings,
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
      <aside className="flex w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="flex items-center gap-2.5 border-b border-sidebar-border px-4 py-4">
          <img
            src="/logo192.png"
            alt="Quills"
            className="size-7 rounded-md"
          />
          <span className="text-xl font-bold tracking-tight text-sidebar-foreground">
            Quills
          </span>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {navItems.map(({ to, label, icon: Icon }) => {
            const active =
              to === '/' ? pathname === '/' : pathname.startsWith(to)
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  'group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-all duration-150',
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground border-l-[3px] border-(--lagoon) pl-2.5'
                    : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground hover:translate-x-0.5',
                )}
              >
                <Icon className={cn('h-4 w-4 transition-colors', active && 'text-(--lagoon)')} />
                {label}
              </Link>
            )
          })}
        </nav>
        <div className="border-t border-sidebar-border px-4 py-3">
          <span className="inline-flex items-center rounded-full border border-(--chip-line) bg-(--chip-bg) px-2 py-0.5 text-[10px] text-muted-foreground">
            Quills &middot; HedgeBuddy
          </span>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
