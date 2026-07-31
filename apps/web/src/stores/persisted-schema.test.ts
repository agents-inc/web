import { CATALOG, STACKS, SUB_AGENTS_BY_ID } from "@workspace/matrix"
import { describe, expect, it } from "vitest"

import {
  DEFAULT_SKILL_OPTIONS,
  PERSIST_VERSION,
  isAgentOn,
  isWorthRemembering,
  migrateConfig,
  pruneUnknownIds,
  type PersistedConfig,
  type SkillEntry,
} from "./persisted-schema"

// localStorage is the one genuinely untrusted input the app has, and this
// module is the boundary that reads it. A bug here is *silent*: nothing
// throws, the app quietly hands back a configuration missing the work someone
// spent an afternoon on.
//
// Reaching these paths through the browser means hand-seeding storage and
// reloading, which is slow and awkward for one case and impractical for a
// dozen — so they are covered here instead.

const KNOWN_SKILL = Object.keys(CATALOG.skillsById)[0]!
const KNOWN_AGENT = Object.keys(SUB_AGENTS_BY_ID)[0]!
const KNOWN_STACK = STACKS[0]!.id
const GONE_SKILL = "removed-in-a-later-release"
const GONE_AGENT = "retired-agent"

const LIVE = { load: "lazy", enabled: true } as const
const PRE = { load: "preloaded", enabled: true } as const
const OFF = { load: "preloaded", enabled: false } as const

const entry = (over: Partial<SkillEntry> = {}): SkillEntry => ({
  ...DEFAULT_SKILL_OPTIONS,
  assignments: {},
  ...over,
})

const config = (over: Partial<PersistedConfig> = {}): PersistedConfig => ({
  stackId: null,
  skills: {},
  remembered: {},
  pins: {},
  ...over,
})

describe("isWorthRemembering", () => {
  it("drops an entry carrying no decisions", () => {
    expect(isWorthRemembering(entry())).toBe(false)
  })

  it.each([
    ["a non-default model", { model: "opus" as const }],
    ["a non-default effort", { effort: "high" as const }],
    ["a non-default install mode", { install: "eject" as const }],
    ["a non-default scope", { scope: "global" as const }],
  ])("keeps an entry with %s", (_label, over) => {
    expect(isWorthRemembering(entry(over))).toBe(true)
  })

  // The case the guard exists for. A stack — or the auto-assignment rule —
  // hands a skill its assignments without the user clicking anything, and
  // losing those to a stray toggle is exactly as costly as hand-built ones.
  it("keeps a stack-provided entry whose only content is assignments", () => {
    const stackProvided = entry({ assignments: { [KNOWN_AGENT]: PRE } })

    expect(stackProvided).toMatchObject(DEFAULT_SKILL_OPTIONS)
    expect(isWorthRemembering(stackProvided)).toBe(true)
  })

  // A switched-off row is still a decision — restoring it recessed is the
  // whole point of keeping it, so it counts as content.
  it("keeps an entry whose only content is disabled rows", () => {
    expect(
      isWorthRemembering(entry({ assignments: { [KNOWN_AGENT]: OFF } }))
    ).toBe(true)
  })
})

describe("isAgentOn", () => {
  it("is off with no skills and no pin", () => {
    expect(isAgentOn(config(), KNOWN_AGENT)).toBe(false)
  })

  it("derives on from holding an enabled skill", () => {
    const holding = config({
      skills: {
        [KNOWN_SKILL]: entry({ assignments: { [KNOWN_AGENT]: LIVE } }),
      },
    })

    expect(isAgentOn(holding, KNOWN_AGENT)).toBe(true)
  })

  it("stays off when its only assignment is disabled", () => {
    const disabled = config({
      skills: { [KNOWN_SKILL]: entry({ assignments: { [KNOWN_AGENT]: OFF } }) },
    })

    expect(isAgentOn(disabled, KNOWN_AGENT)).toBe(false)
  })

  it("lets a pin override the derived state in both directions", () => {
    const holding = config({
      skills: {
        [KNOWN_SKILL]: entry({ assignments: { [KNOWN_AGENT]: LIVE } }),
      },
      pins: { [KNOWN_AGENT]: false },
    })
    const bare = config({ pins: { [KNOWN_AGENT]: true } })

    expect(isAgentOn(holding, KNOWN_AGENT)).toBe(false)
    expect(isAgentOn(bare, KNOWN_AGENT)).toBe(true)
  })
})

describe("pruneUnknownIds", () => {
  it("keeps everything the catalog still knows", () => {
    const kept = config({
      stackId: KNOWN_STACK,
      skills: {
        [KNOWN_SKILL]: entry({ assignments: { [KNOWN_AGENT]: LIVE } }),
      },
      pins: { [KNOWN_AGENT]: true },
    })

    expect(pruneUnknownIds(kept)).toEqual(kept)
  })

  it("drops a skill the catalog no longer has", () => {
    const pruned = pruneUnknownIds(
      config({ skills: { [KNOWN_SKILL]: entry(), [GONE_SKILL]: entry() } })
    )

    expect(Object.keys(pruned.skills)).toEqual([KNOWN_SKILL])
  })

  it("drops a retired sub-agent from inside assignments", () => {
    const pruned = pruneUnknownIds(
      config({
        skills: {
          [KNOWN_SKILL]: entry({
            assignments: { [KNOWN_AGENT]: LIVE, [GONE_AGENT]: PRE },
          }),
        },
      })
    )

    expect(pruned.skills[KNOWN_SKILL]!.assignments).toEqual({
      [KNOWN_AGENT]: LIVE,
    })
  })

  it("drops a retired sub-agent's pin", () => {
    const pruned = pruneUnknownIds(
      config({ pins: { [KNOWN_AGENT]: true, [GONE_AGENT]: false } })
    )

    expect(pruned.pins).toEqual({ [KNOWN_AGENT]: true })
  })

  it("falls back to no stack when the stack is gone", () => {
    expect(pruneUnknownIds(config({ stackId: "deleted-stack" })).stackId).toBe(
      null
    )
  })

  // The map added in v3 is just as exposed to catalogue drift as `skills`.
  it("prunes remembered entries by the same rules", () => {
    const pruned = pruneUnknownIds(
      config({
        remembered: {
          [GONE_SKILL]: entry(),
          [KNOWN_SKILL]: entry({
            assignments: { [KNOWN_AGENT]: LIVE, [GONE_AGENT]: LIVE },
          }),
        },
      })
    )

    expect(Object.keys(pruned.remembered)).toEqual([KNOWN_SKILL])
    expect(pruned.remembered[KNOWN_SKILL]!.assignments).toEqual({
      [KNOWN_AGENT]: LIVE,
    })
  })
})

// Pre-release policy: no migrations — an old version is discarded, not upgraded.
describe("migrateConfig", () => {
  it("passes the current version through unchanged", () => {
    const current = config({ skills: { [KNOWN_SKILL]: entry() } })
    expect(migrateConfig(current, PERSIST_VERSION)).toEqual(current)
  })

  it.each([
    ["an older version", { stackId: null, skills: {} }, PERSIST_VERSION - 1],
    ["an unknown future version", { stackId: null, skills: {} }, 99],
  ])("discards %s rather than guessing", (_label, state, version) => {
    expect(migrateConfig(state, version)).toBeUndefined()
  })
})
