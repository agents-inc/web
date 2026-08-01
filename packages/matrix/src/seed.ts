import { z } from "zod"

// The wire contract for shared configs: the web app POSTs this payload to the
// config store (Cloudflare Worker + KV) and gets a short id back; `agents-inc
// init --from <id>` fetches and validates it with this same schema. Canonical home is
// the CLI's shared package once that exists (D-239); until then this file is
// the source of truth and the CLI vendors it.

// Bump when the payload shape changes. Consumers switch on `v`, so ids shared
// before a bump keep working.
export const SEED_VERSION = 1

// The CLI's option sets, not the web store's — the store's narrower enums
// (no "fable", four effort levels) migrate toward these.
export const seedModelSchema = z.enum(["opus", "fable", "sonnet", "haiku"])
export const seedEffortSchema = z.enum([
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
])

export const seedLoadStateSchema = z.enum(["lazy", "preloaded"])

export const seedSkillSchema = z.object({
  model: seedModelSchema,
  effort: seedEffortSchema,
  install: z.enum(["plugin", "eject"]),
  scope: z.enum(["project", "global"]),
  // Sub-agent id → load state; presence is assignment. Per (agent, skill),
  // matching the granularity of the CLI's stack config.
  assignments: z.record(z.string(), seedLoadStateSchema),
})

// Ids are full catalog slugs, never positional indices, so a payload survives
// catalog churn: consumers warn and skip unknown ids rather than failing.
export const seedPayloadSchema = z.object({
  v: z.literal(SEED_VERSION),
  // Diagnostics only. A mismatch with the consumer's matrix must not fail the
  // decode — it explains why some ids were skipped.
  matrixVersion: z.string(),
  stackId: z.string().nullable(),
  // Sparse — presence is selection, exactly like the web store. `remembered`
  // is deliberately absent: deselected setup never leaves the browser.
  skills: z.record(z.string(), seedSkillSchema),
})

export type SeedModel = z.infer<typeof seedModelSchema>
export type SeedEffort = z.infer<typeof seedEffortSchema>
export type SeedLoadState = z.infer<typeof seedLoadStateSchema>
export type SeedSkill = z.infer<typeof seedSkillSchema>
export type SeedPayload = z.infer<typeof seedPayloadSchema>
