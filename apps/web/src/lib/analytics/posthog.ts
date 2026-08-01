import { env } from "@/env"
import { setAnalyticsSink } from "./track"

// Deliberately different from `initSentry`, which imports its SDK statically:
// an error thrown 50ms into the first paint must already have somewhere to go,
// whereas an analytics event 200ms late is the same event. Loading PostHog
// dynamically keeps ~60KB out of the initial bundle entirely when no key is
// configured, and off the critical path when one is — which matters on a
// bundle already carrying a 420KB catalog.
export const initAnalytics = async () => {
  if (!env.VITE_POSTHOG_KEY) return

  const { default: posthog } = await import("posthog-js")

  posthog.init(env.VITE_POSTHOG_KEY, {
    api_host: env.VITE_POSTHOG_HOST,
    defaults: "2026-01-30",

    // There are no accounts, so `identify` is never called and no person
    // profile is ever created. That keeps this out of most consent territory
    // by construction rather than by policy.
    person_profiles: "identified_only",

    // Off on purpose. Autocapture would hoover up the text content of every
    // click — including the GitHub search box, the one field in the app where
    // a user can type something of their own. Every event here is explicit.
    autocapture: false,
    capture_pageview: false,
  })

  setAnalyticsSink(({ name, ...properties }) => posthog.capture(name, properties))
}
