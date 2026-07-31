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
const [AGENT, OTHER_AGENT] = Object.keys(SUB_AGENTS_BY_ID) as [string, string]
const STACK = STACKS[0]!.id

const config = (): PersistedConfig => ({
  stackId: STACK,
  skills: {
    [SKILL]: {
      ...DEFAULT_SKILL_OPTIONS,
      effort: "ultra",
      assignments: {
        [AGENT]: { load: "preloaded", enabled: true },
        // Switched off in the roster — must not leave the browser.
        [OTHER_AGENT]: { load: "lazy", enabled: false },
      },
    },
  },
  remembered: {
    [SKILL]: { ...DEFAULT_SKILL_OPTIONS, assignments: {} },
  },
  pins: { [AGENT]: true },
})

describe("toSeedPayload", () => {
  it("stamps the versioned envelope", () => {
    const payload = toSeedPayload(config())

    expect(payload.v).toBe(SEED_VERSION)
    expect(payload.matrixVersion).toBe(MATRIX_VERSION)
  })

  // The wire keeps the v1 shape — agent → load, presence meaning "live" — so
  // the store's `{ load, enabled }` flattens to only its enabled rows.
  it("carries the selection through, minus disabled rows", () => {
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
  it("never lets remembered or pins ride along", () => {
    const payload = toSeedPayload(config())

    expect(payload).not.toHaveProperty("remembered")
    expect(payload).not.toHaveProperty("pins")
  })

  it("produces what the worker will validate against", () => {
    expect(seedPayloadSchema.safeParse(toSeedPayload(config())).success).toBe(
      true
    )
  })

  // A pinned-off agent renders recessed and is excluded from every count, so
  // its rows must not travel either — presence on the wire means "installs".
  it("drops assignments on pinned-off agents", () => {
    const pinnedOff = {
      ...config(),
      pins: { [AGENT]: false },
    }

    const payload = toSeedPayload(pinnedOff)

    expect(payload.skills[SKILL]!.assignments).toEqual({})
    expect(fromSeedPayload(payload).skills[SKILL]!.assignments).toEqual({})
  })

  it("does not mutate the store state it reads", () => {
    const before = config()
    toSeedPayload(before)
    expect(before).toEqual(config())
  })
})

describe("fromSeedPayload", () => {
  it("round-trips the live assignments as enabled", () => {
    const restored = fromSeedPayload(toSeedPayload(config()))

    expect(restored.stackId).toBe(STACK)
    expect(restored.skills[SKILL]).toEqual({
      ...DEFAULT_SKILL_OPTIONS,
      effort: "ultra",
      assignments: { [AGENT]: { load: "preloaded", enabled: true } },
    })
  })

  it("starts remembered and pins empty", () => {
    const restored = fromSeedPayload(toSeedPayload(config()))

    expect(restored.remembered).toEqual({})
    expect(restored.pins).toEqual({})
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
