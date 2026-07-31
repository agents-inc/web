import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "@tanstack/react-router"

import "@workspace/ui/globals.css"
import { ErrorBoundary } from "@/components/error-boundary"
import { initSentry } from "@/lib/observability/sentry"
import { router } from "@/routes/router"

// Before render, so a throw during the first paint is still reported.
initSentry()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  </StrictMode>
)
