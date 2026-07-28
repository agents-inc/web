import {
  CATALOG,
  MATRIX_VERSION,
  SEED_VERSION,
  STACKS,
  SUB_AGENTS_BY_ID,
  seedPayloadSchema,
} from "@workspace/matrix"
import { describe, expect, it } from "vitest"

import {
  DEFAULT_SKILL_OPTIONS,
  type PersistedConfig,
} from "@/stores/persisted-schema"

import { fromSeedPayload, toSeedPayload } from "./seed"

// The payload is what leaves the browser, so what matters here is the boundary:
// the envelope is stamped, the selection passes through, and nothing that
// should stay local can ride along.

const SKILL = Object.keys(CATALOG.skillsById)[0]!
const AGENT = Object.keys(SUB_AGENTS_BY_ID)[0]!
const STACK = STACKS[0]!.id

const config = (): PersistedConfig => ({
  stackId: STACK,
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

    expect(payload.stackId).toBe(STACK)
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

describe("fromSeedPayload", () => {
  it("round-trips what toSeedPayload produced", () => {
    const restored = fromSeedPayload(toSeedPayload(config()))

    expect(restored.stackId).toBe(STACK)
    expect(restored.skills).toEqual(config().skills)
  })

  it("starts remembered empty", () => {
    expect(fromSeedPayload(toSeedPayload(config())).remembered).toEqual({})
  })

  // A payload can be minted against a matrix this catalog has moved past, so
  // unknown ids are skipped rather than failing the whole import.
  it("prunes ids the catalog does not know", () => {
    const payload = toSeedPayload(config())
    const drifted = {
      ...payload,
      stackId: "retired-stack",
      skills: {
        ...payload.skills,
        "skill-from-the-future": {
          ...payload.skills[SKILL]!,
          assignments: {},
        },
      },
    }

    const restored = fromSeedPayload(drifted)

    expect(restored.stackId).toBe(null)
    expect(Object.keys(restored.skills)).toEqual([SKILL])
  })
})
