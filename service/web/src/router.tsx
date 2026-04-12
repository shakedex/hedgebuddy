import { createRouter, createRootRoute, createRoute } from '@tanstack/react-router'
import { RootLayout } from './routes/__root'
import { DashboardPage } from './routes/dashboard'
import { EventsPage } from './routes/events'
import { WorkflowsPage } from './routes/workflows'
import { WorkflowEditPage } from './routes/workflow-edit'
import { SettingsPage } from './routes/settings'
import { QuillsPage } from './routes/quills'
import { RunsPage } from './routes/runs'

const rootRoute = createRootRoute({
  component: RootLayout,
})

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardPage,
})

const eventsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/events',
  component: EventsPage,
})

const workflowsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workflows',
  component: WorkflowsPage,
})

const workflowEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workflows/$id',
  component: WorkflowEditPage,
})

const quillsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/quills',
  component: QuillsPage,
})

const runsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/runs',
  component: RunsPage,
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
})

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  eventsRoute,
  workflowsRoute,
  workflowEditRoute,
  quillsRoute,
  runsRoute,
  settingsRoute,
])

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
