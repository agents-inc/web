import { CATALOG, STACKS, expandStack } from "@workspace/matrix"
import { describe, expect, it } from "vitest"

import type { ConfigureSearch } from "@/routes/search"
import type { AddedSkill } from "@/stores/added-skills-store"
import {
  DEFAULT_SKILL_OPTIONS,
  type SkillEntry,
} from "@/stores/persisted-schema"
import {
  isStackCustom,
  monogramOf,
  selectDomainViews,
  selectInstallInventory,
  summarize,
  type ConfigSelection,
} from "./derive"

// `derive.ts` is where the screen's arithmetic lives, and most of it is
// combinatorial: `isStackCustom` alone has six independent ways to flip, and
// `selectDomainViews` crosses four filters with two provenances of skill.
// Each of those is one browser round-trip end-to-end and microseconds here, so
// the browser covers that the wiring works and these cover that the sums do.

const SEARCH: ConfigureSearch = { domain: null, q: "", rec: false, sel: false }
const search = (over: Partial<ConfigureSearch> = {}): ConfigureSearch => ({
  ...SEARCH,
  ...over,
})

// A stack with real assignments, so the "unedited" baseline is not trivially empty.
const STACK = STACKS.find((candidate) => {
  const expansion = expandStack(candidate.id)
  return expansion && expansion.skillIds.length > 2
})!
const EXPANSION = expandStack(STACK.id)!

const asApplied = (): ConfigSelection => {
  const preloaded = new Set<string>(EXPANSION.preloadedSkillIds)
  return {
    stackId: STACK.id,
    skills: Object.fromEntries(
      EXPANSION.skillIds.map((skillId) => [
        skillId,
        {
          ...DEFAULT_SKILL_OPTIONS,
          assignments: Object.fromEntries(
            (EXPANSION.agentsBySkill[skillId] ?? []).map((agentId) => [
              agentId,
              preloaded.has(skillId) ? "preloaded" : "lazy",
            ])
          ),
        } satisfies SkillEntry,
      ])
    ),
  }
}

const FIRST_SKILL = EXPANSION.skillIds[0]!

const edit = (patch: Partial<SkillEntry>): ConfigSelection => {
  const applied = asApplied()
  return {
    ...applied,
    skills: {
      ...applied.skills,
      [FIRST_SKILL]: { ...applied.skills[FIRST_SKILL]!, ...patch },
    },
  }
}

describe("monogramOf", () => {
  it.each([
    ["React", "RE"],
    ["CSS Modules", "CM"],
    ["class-variance-authority", "CV"],
    ["Next.js", "NJ"],
    ["Zod", "ZO"],
  ])("reduces %s to %s", (name, expected) => {
    expect(monogramOf(name)).toBe(expected)
  })
})

describe("isStackCustom", () => {
  it("is false for a stack exactly as applied", () => {
    expect(isStackCustom(asApplied())).toBe(false)
  })

  it("is false for scratch with nothing selected", () => {
    expect(isStackCustom({ stackId: null, skills: {} })).toBe(false)
  })

  it("is true for scratch once anything is selected", () => {
    expect(
      isStackCustom({
        stackId: null,
        skills: {
          [FIRST_SKILL]: { ...DEFAULT_SKILL_OPTIONS, assignments: {} },
        },
      })
    ).toBe(true)
  })

  // Every one of these is an edit the user would be upset to lose, which is
  // what the stack-switch confirm keys off. Comparing only the skill *set*
  // would silently discard the other five.
  it.each([
    ["install mode", { install: "eject" as const }],
    ["scope", { scope: "global" as const }],
    ["model", { model: "opus" as const }],
    ["effort", { effort: "high" as const }],
  ])("is true after changing %s", (_label, patch) => {
    expect(isStackCustom(edit(patch))).toBe(true)
  })

  it("is true after removing a skill the stack included", () => {
    const applied = asApplied()
    const { [FIRST_SKILL]: _dropped, ...rest } = applied.skills
    expect(isStackCustom({ ...applied, skills: rest })).toBe(true)
  })

  it("is true after unassigning a sub-agent", () => {
    expect(isStackCustom(edit({ assignments: {} }))).toBe(true)
  })

  it("is true after changing only a load state", () => {
    const applied = asApplied()
    const current = applied.skills[FIRST_SKILL]!
    const [agentId, load] = Object.entries(current.assignments)[0] ?? []
    if (!agentId) return

    expect(
      isStackCustom(
        edit({
          assignments: {
            ...current.assignments,
            [agentId]: load === "preloaded" ? "lazy" : "preloaded",
          },
        })
      )
    ).toBe(true)
  })

  it("is true when the stack itself no longer exists", () => {
    expect(isStackCustom({ stackId: "deleted-stack", skills: {} })).toBe(true)
  })
})

describe("summarize", () => {
  it("counts nothing for an empty configuration", () => {
    expect(summarize({ stackId: null, skills: {} })).toEqual({
      skillCount: 0,
      agentCount: 0,
      assignmentCount: 0,
      preloadedCount: 0,
      ejectedCount: 0,
    })
  })

  it("counts each sub-agent once across skills, and assignments every time", () => {
    const config: ConfigSelection = {
      stackId: null,
      skills: {
        a: {
          ...DEFAULT_SKILL_OPTIONS,
          assignments: { dev: "preloaded", review: "lazy" },
        },
        b: { ...DEFAULT_SKILL_OPTIONS, assignments: { dev: "lazy" } },
      },
    }

    expect(summarize(config)).toMatchObject({
      skillCount: 2,
      agentCount: 2,
      assignmentCount: 3,
      preloadedCount: 1,
    })
  })

  it("counts ejected skills rather than ejected assignments", () => {
    const config: ConfigSelection = {
      stackId: null,
      skills: {
        a: {
          ...DEFAULT_SKILL_OPTIONS,
          install: "eject",
          assignments: { dev: "lazy", review: "lazy" },
        },
        b: { ...DEFAULT_SKILL_OPTIONS, assignments: {} },
      },
    }

    expect(summarize(config).ejectedCount).toBe(1)
  })
})

describe("selectInstallInventory", () => {
  const config: ConfigSelection = {
    stackId: null,
    skills: {
      [FIRST_SKILL]: {
        ...DEFAULT_SKILL_OPTIONS,
        scope: "global",
        assignments: {},
      },
      [EXPANSION.skillIds[1]!]: {
        ...DEFAULT_SKILL_OPTIONS,
        assignments: {},
      },
    },
  }

  it("splits skills by scope", () => {
    const inventory = selectInstallInventory(config, [])

    expect(inventory.global.map((skill) => skill.id)).toEqual([FIRST_SKILL])
    expect(inventory.project.map((skill) => skill.id)).toEqual([
      EXPANSION.skillIds[1],
    ])
  })

  // Insertion order would reshuffle the pane as skills are toggled.
  it("orders agents by the catalog, not by which skill referenced them first", () => {
    const applied = asApplied()
    const forward = selectInstallInventory(applied, [])
    const reversed = selectInstallInventory(
      {
        ...applied,
        skills: Object.fromEntries(Object.entries(applied.skills).reverse()),
      },
      []
    )

    expect(forward.agents.map((agent) => agent.id)).toEqual(
      reversed.agents.map((agent) => agent.id)
    )
  })
})

describe("selectDomainViews", () => {
  const selected: ConfigSelection = {
    stackId: null,
    skills: {
      [FIRST_SKILL]: { ...DEFAULT_SKILL_OPTIONS, assignments: {} },
    },
  }
  const empty: ConfigSelection = { stackId: null, skills: {} }

  const allCells = (config: ConfigSelection, over?: Partial<ConfigureSearch>) =>
    selectDomainViews(config, [], search(over)).flatMap((domain) =>
      domain.categories.flatMap((category) => category.cells)
    )

  it("renders every domain when nothing is filtered", () => {
    expect(selectDomainViews(empty, [], SEARCH).length).toBe(
      CATALOG.domains.length
    )
  })

  it("narrows to one domain", () => {
    const views = selectDomainViews(empty, [], search({ domain: "web" }))

    expect(views).toHaveLength(1)
    expect(views[0]!.id).toBe("web")
  })

  it("matches a query against name, slug and description", () => {
    const skill = CATALOG.skillsById[FIRST_SKILL]!
    const ids = allCells(empty, { q: skill.displayName }).map(
      (cell) => cell.skill.id
    )

    expect(ids).toContain(FIRST_SKILL)
  })

  it("drops categories and domains that filter down to nothing", () => {
    const views = selectDomainViews(empty, [], search({ q: "zzzznotaskill" }))
    expect(views).toEqual([])
  })

  it("keeps only recommended skills when asked", () => {
    const cells = allCells(empty, { rec: true })

    expect(cells.length).toBeGreaterThan(0)
    expect(
      cells.every((cell) => CATALOG.skillsById[cell.skill.id]?.isRecommended)
    ).toBe(true)
  })

  it("keeps only selected skills when asked", () => {
    const cells = allCells(selected, { sel: true })

    expect(cells.map((cell) => cell.skill.id)).toEqual([FIRST_SKILL])
    expect(cells.every((cell) => cell.selected)).toBe(true)
  })

  it("shows nothing selected as nothing at all", () => {
    expect(allCells(empty, { sel: true })).toEqual([])
  })

  it("derives the agent count from assignments rather than storing it", () => {
    const config: ConfigSelection = {
      stackId: null,
      skills: {
        [FIRST_SKILL]: {
          ...DEFAULT_SKILL_OPTIONS,
          assignments: { dev: "lazy", review: "preloaded" },
        },
      },
    }

    const cell = allCells(config, { sel: true })[0]!
    expect(cell.agentCount).toBe(2)
  })
})

describe("selectDomainViews with added skills", () => {
  const uncategorised: AddedSkill = {
    id: "github:acme/widget",
    displayName: "widget",
    description: "Added from GitHub",
    monogram: "WI",
    repo: "acme/widget",
    categoryId: null,
    domainId: null,
  }

  it("collects unmatched skills in their own trailing section", () => {
    const views = selectDomainViews(
      { stackId: null, skills: {} },
      [uncategorised],
      SEARCH
    )
    const last = views.at(-1)!

    expect(last.id).toBe("added")
    expect(last.categories[0]!.cells.map((cell) => cell.skill.id)).toEqual([
      uncategorised.id,
    ])
  })

  it("marks them so the cell can draw the added tag", () => {
    const views = selectDomainViews(
      { stackId: null, skills: {} },
      [uncategorised],
      SEARCH
    )

    expect(views.at(-1)!.categories[0]!.cells[0]!.skill.added).toBe(true)
  })

  // `isRecommended` is a catalog flag, so an added skill can never satisfy it.
  it("hides them under the recommended filter", () => {
    const views = selectDomainViews(
      { stackId: null, skills: {} },
      [uncategorised],
      search({ rec: true })
    )

    expect(views.some((domain) => domain.id === "added")).toBe(false)
  })
})
