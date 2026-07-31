import { z } from "zod"

// Read from two places with different runtimes: the browser bundle (`env.ts`,
// via `import.meta.env`) and the build itself (`vite.config.ts`, via Vite's
// `loadEnv` in Node). Nothing here may touch `import.meta` — that is what lets
// the build validate before it emits, so a missing variable fails CI rather
// than reaching a visitor.
export const envSchema = z.object({
  // The config-sharing worker. Defaulted for local dev only: a production
  // build that omitted this would ship pointing at localhost, and every share
  // would fail with a message that reads like an outage rather than a typo.
  VITE_API_URL: z.url(),
})

export type Env = z.infer<typeof envSchema>

const DEV_DEFAULTS = {
  VITE_API_URL: "http://localhost:8787",
} as const satisfies Env

// `bun dev` needs no setup; a production build must state everything.
export const parseEnv = (
  source: Record<string, unknown>,
  isProduction: boolean
): Env => {
  const parsed = envSchema.safeParse(
    isProduction ? source : { ...DEV_DEFAULTS, ...source }
  )
  if (parsed.success) return parsed.data

  const named = parsed.error.issues
    .map((issue) => `${issue.path.join(".")} (${issue.message})`)
    .join(", ")

  throw new Error(
    `Invalid environment: ${named}. See apps/web/.env.example for what each one is.`
  )
}
