import {
  MATRIX_VERSION,
  SEED_VERSION,
  seedPayloadSchema,
  type SeedPayload,
} from "@workspace/matrix"

import type { ConfigSelection } from "./derive"

// Builds the exact JSON the config store (Cloudflare KV) will hold: the
// selection under the versioned envelope, nothing else. Read-only — the store
// is untouched, and `remembered` never appears because `ConfigSelection` is
// the same narrowing that keeps it out of every derivation. The parse makes
// "exact" literal: anything the contract doesn't know is stripped, so a field
// added to the store later cannot leak into payloads unnoticed.
export const toSeedPayload = (config: ConfigSelection): SeedPayload =>
  seedPayloadSchema.parse({
    v: SEED_VERSION,
    matrixVersion: MATRIX_VERSION,
    stackId: config.stackId,
    skills: config.skills,
  })
