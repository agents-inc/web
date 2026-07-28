import {
  createRootRoute,
  createRoute,
  createRouter,
  stripSearchParams,
} from "@tanstack/react-router"

import { ConfigureScreen } from "@/features/configure/components/configure-screen"
import {
  DocsScreen,
  RootLayout,
  SettingsScreen,
  ShareScreen,
} from "./route-components"
import { CONFIGURE_SEARCH_DEFAULTS, configureSearchSchema } from "./search"

const rootRoute = createRootRoute({ component: RootLayout })

const configureRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: configureSearchSchema,
  search: { middlewares: [stripSearchParams(CONFIGURE_SEARCH_DEFAULTS)] },
  component: ConfigureScreen,
})

const docsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/docs",
  component: DocsScreen,
})

const shareRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/share",
  component: ShareScreen,
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsScreen,
})

const routeTree = rootRoute.addChildren([
  configureRoute,
  docsRoute,
  shareRoute,
  settingsRoute,
])

export const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
