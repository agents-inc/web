import {
  CATALOG,
  MATRIX_VERSION,
  SEED_VERSION,
  SUB_AGENTS_BY_ID,
  seedPayloadSchema,
} from "@workspace/matrix"
import { describe, expect, it } from "vitest"

import {
  DEFAULT_SKILL_OPTIONS,
  type PersistedConfig,
} from "@/stores/persisted-schema"

import { toSeedPayload } from "./seed"

// The payload is what leaves the browser, so what matters here is the boundary:
// the envelope is stamped, the selection passes through, and nothing that
// should stay local can ride along.

const SKILL = Object.keys(CATALOG.skillsById)[0]!
const AGENT = Object.keys(SUB_AGENTS_BY_ID)[0]!

const config = (): PersistedConfig => ({
  stackId: "next",
  skills: {
    [SKILL]: {
      ...DEFAULT_SKILL_OPTIONS,
      effort: "ultra",
      assignments: { [AGENT]: "preloaded" },
    },
  },
  remembered: {
    [SKILL]: { ...DEFAULT_SKILL_OPTIONS, assignments: {} },
  },
})

describe("toSeedPayload", () => {
  it("stamps the versioned envelope", () => {
    const payload = toSeedPayload(config())

    expect(payload.v).toBe(SEED_VERSION)
    expect(payload.matrixVersion).toBe(MATRIX_VERSION)
  })

  it("carries the selection through unchanged", () => {
    const payload = toSeedPayload(config())

    expect(payload.stackId).toBe("next")
    expect(payload.skills[SKILL]).toEqual({
      ...DEFAULT_SKILL_OPTIONS,
      effort: "ultra",
      assignments: { [AGENT]: "preloaded" },
    })
  })

  // A full store state is a valid ConfigSelection, so nothing stops a caller
  // passing one; the contract, not the caller, is what keeps `remembered` home.
  it("never lets remembered ride along", () => {
    expect(toSeedPayload(config())).not.toHaveProperty("remembered")
  })

  it("produces what the worker will validate against", () => {
    expect(seedPayloadSchema.safeParse(toSeedPayload(config())).success).toBe(
      true
    )
  })

  it("does not mutate the store state it reads", () => {
    const before = config()
    toSeedPayload(before)
    expect(before).toEqual(config())
  })
})
