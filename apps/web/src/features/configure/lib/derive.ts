// Everything the Configure screen shows that is not stored: filtered cells, disabled states, the
// stack-is-custom flag, the roster, the install inventory. All pure — (catalog, config, search) in,
// view data out — so the screen can never drift from the store by caching a stale copy of any of it.
//
// The design is emphatic that `assignments` is the single source of truth: per-cell agent counts,
// the roster lists and the install inventory are all derived here and none of them is stored.

import {
  CATALOG,
  SUB_AGENT_GROUPS,
  expandStack,
  type CatalogCategory,
  type CatalogDomain,
  type CatalogSkill,
  type SubAgent,
} from "@workspace/matrix"

import type { ConfigureSearch } from "@/routes/search"
import type { AddedSkill } from "@/stores/added-skills-store"
import {
  DEFAULT_SKILL_OPTIONS,
  type LoadState,
  type PersistedConfig,
  type SkillEntry,
} from "@/stores/persisted-schema"

/**
 * A skill as the grid renders it. Catalog skills and session-added skills are
 * flattened to the same shape here so the cell component never branches on
 * provenance — only the `added` flag, which draws the tag.
 */
export type GridSkill = {
  id: string
  displayName: string
  description: string
  monogram: string
  /** Catalog skills carry a slug for the logo lookup; added ones do not. */
  slug?: string
  added: boolean
}

export type SkillCellView = {
  skill: GridSkill
  entry: SkillEntry | undefined
  selected: boolean
  /** Conflicts with something already selected — rendered disabled, never hidden. */
  incompatible: boolean
  incompatibleReason?: string
  agentCount: number
}

export type CategoryView = {
  id: string
  displayName: string
  exclusive: boolean
  cells: SkillCellView[]
}

export type DomainView = {
  id: string
  label: string
  categories: CategoryView[]
}

/** Two letters: first letter of each of the first two words, else the first two. */
export const monogramOf = (displayName: string) => {
  const words = displayName.split(/[\s.+&_-]+/).filter(Boolean)
  return (
    words.length > 1
      ? `${words[0]?.charAt(0) ?? ""}${words[1]?.charAt(0) ?? ""}`
      : displayName.slice(0, 2)
  ).toUpperCase()
}

const toGridSkill = (skill: CatalogSkill): GridSkill => ({
  id: skill.id,
  displayName: skill.displayName,
  description: skill.description,
  monogram: monogramOf(skill.displayName),
  slug: skill.slug,
  added: false,
})

const addedToGridSkill = (skill: AddedSkill): GridSkill => ({
  id: skill.id,
  displayName: skill.displayName,
  description: skill.description,
  monogram: skill.monogram,
  added: true,
})

const matchesQuery = (skill: GridSkill, query: string) => {
  if (!query) return true
  const needle = query.toLowerCase()
  return (
    skill.displayName.toLowerCase().includes(needle) ||
    (skill.slug?.toLowerCase().includes(needle) ?? false) ||
    skill.description.toLowerCase().includes(needle)
  )
}

/**
 * A skill is incompatible when something already selected excludes it.
 * Conflicts are stored per-skill on both sides by the CLI's resolver, so
 * checking one direction is enough.
 *
 * Siblings in an exclusive category are the exception. Every framework
 * conflicts with every other framework, so a naive check disables all of them
 * the moment you pick React — and since disabled cells are not clickable there
 * would be no way to change your mind. In an exclusive category the
 * alternatives stay live and clicking one swaps.
 */
const findConflict = (
  skill: CatalogSkill,
  category: CatalogCategory,
  selectedIds: Set<string>
) =>
  skill.conflictsWith.find(
    (conflictId) =>
      selectedIds.has(conflictId) &&
      !(
        category.exclusive &&
        CATALOG.skillsById[conflictId]?.categoryId === category.id
      )
  )

const toCell = (
  skill: GridSkill,
  entry: SkillEntry | undefined,
  conflictId?: string
): SkillCellView => ({
  skill,
  entry,
  selected: entry !== undefined,
  incompatible: conflictId !== undefined,
  incompatibleReason: conflictId
    ? `Conflicts with ${CATALOG.skillsById[conflictId]?.displayName ?? conflictId}`
    : undefined,
  agentCount: entry ? Object.keys(entry.assignments).length : 0,
})

export const UNCATEGORIZED_ID = "uncategorized"

/**
 * Domain sections with their categories and cells, filtered by the search
 * params. Categories that filter down to nothing are dropped; domains that
 * lose all their categories are dropped too, so the page never renders an
 * empty header.
 *
 * Session-added skills join the category the marketplace index matched them
 * to. Unmatched ones collect in a synthetic `Uncategorized` group appended to
 * a trailing "Added" section — the design names the bucket but never mocks it,
 * and giving it its own section keeps it from implying membership of a real
 * domain.
 */
export const selectDomainViews = (
  config: PersistedConfig,
  added: AddedSkill[],
  search: ConfigureSearch
): DomainView[] => {
  const selectedIds = new Set(Object.keys(config.skills))

  /**
   * The `selected` chip. Applied after `toCell` rather than before it because
   * selection is a property of the *cell* — presence in `config.skills` — and
   * doing it here keeps one definition of "selected" instead of a second
   * lookup that could disagree with the one the cell renders from.
   */
  const isSelectedIfNarrowed = (cell: SkillCellView) =>
    !search.sel || cell.selected

  const addedByCategory = new Map<string, AddedSkill[]>()
  for (const skill of added) {
    const key = skill.categoryId ?? UNCATEGORIZED_ID
    const bucket = addedByCategory.get(key)
    if (bucket) bucket.push(skill)
    else addedByCategory.set(key, [skill])
  }

  const domains = CATALOG.domains
    .filter((domain) => !search.domain || domain.id === search.domain)
    .map((domain: CatalogDomain): DomainView => {
      const categories = domain.categories
        .map((category): CategoryView => {
          const catalogCells = category.skills
            .map(toGridSkill)
            .filter((skill) => matchesQuery(skill, search.q))
            .filter(
              (skill) =>
                !search.rec ||
                (CATALOG.skillsById[skill.id]?.isRecommended ?? false)
            )
            .map((skill) => {
              const entry = config.skills[skill.id]
              const source = CATALOG.skillsById[skill.id]
              return toCell(
                skill,
                entry,
                entry || !source
                  ? undefined
                  : findConflict(source, category, selectedIds)
              )
            })
            .filter(isSelectedIfNarrowed)

          // Added skills are never "recommended" — the flag is a catalog
          // concept — but they can certainly be selected.
          const addedCells = search.rec
            ? []
            : (addedByCategory.get(category.id) ?? [])
                .map(addedToGridSkill)
                .filter((skill) => matchesQuery(skill, search.q))
                .map((skill) => toCell(skill, config.skills[skill.id]))
                .filter(isSelectedIfNarrowed)

          return {
            id: category.id,
            displayName: category.displayName,
            exclusive: category.exclusive,
            cells: [...catalogCells, ...addedCells],
          }
        })
        .filter((category) => category.cells.length > 0)

      return { id: domain.id, label: domain.label, categories }
    })
    .filter((domain) => domain.categories.length > 0)

  const orphans = search.rec
    ? []
    : (addedByCategory.get(UNCATEGORIZED_ID) ?? [])
        .map(addedToGridSkill)
        .filter((skill) => matchesQuery(skill, search.q))
        .map((skill) => toCell(skill, config.skills[skill.id]))
        .filter(isSelectedIfNarrowed)

  if (orphans.length === 0 || search.domain) return domains

  return [
    ...domains,
    {
      id: "added",
      label: "Added",
      categories: [
        {
          id: UNCATEGORIZED_ID,
          displayName: "Uncategorized",
          exclusive: false,
          cells: orphans,
        },
      ],
    },
  ]
}

/* ── Roster ─────────────────────────────────────────────────────────────── */

export type RosterSkill = {
  id: string
  displayName: string
  load: LoadState
}

export type RosterAgent = {
  agent: SubAgent
  skills: RosterSkill[]
}

const displayNameOf = (skillId: string, added: AddedSkill[]) =>
  CATALOG.skillsById[skillId]?.displayName ??
  added.find((skill) => skill.id === skillId)?.displayName ??
  skillId

/** Every sub-agent that exists, with how many skills it holds. */
export const selectAvailableAgents = (config: PersistedConfig) => {
  const counts: Record<string, number> = {}
  for (const entry of Object.values(config.skills)) {
    for (const agentId of Object.keys(entry.assignments)) {
      counts[agentId] = (counts[agentId] ?? 0) + 1
    }
  }

  return SUB_AGENT_GROUPS.flatMap((group) =>
    group.agents.map((agent) => ({
      agent,
      count: counts[agent.id] ?? 0,
    }))
  )
}

/** Only the sub-agents that actually hold skills, with their skill lists. */
export const selectAgentsInUse = (
  config: PersistedConfig,
  added: AddedSkill[]
): RosterAgent[] => {
  const byAgent = new Map<string, RosterSkill[]>()

  for (const [skillId, entry] of Object.entries(config.skills)) {
    for (const [agentId, load] of Object.entries(entry.assignments)) {
      const bucket = byAgent.get(agentId) ?? []
      bucket.push({
        id: skillId,
        displayName: displayNameOf(skillId, added),
        load,
      })
      byAgent.set(agentId, bucket)
    }
  }

  return SUB_AGENT_GROUPS.flatMap((group) => group.agents)
    .filter((agent) => byAgent.has(agent.id))
    .map((agent) => ({
      agent,
      skills: (byAgent.get(agent.id) ?? []).sort((a, b) =>
        a.displayName.localeCompare(b.displayName)
      ),
    }))
}

/* ── Summaries ──────────────────────────────────────────────────────────── */

export type ConfigSummary = {
  skillCount: number
  agentCount: number
  assignmentCount: number
  preloadedCount: number
  ejectedCount: number
}

export const summarize = (config: PersistedConfig): ConfigSummary => {
  const entries = Object.values(config.skills)
  const assignments = entries.flatMap((entry) =>
    Object.entries(entry.assignments)
  )

  return {
    skillCount: entries.length,
    agentCount: new Set(assignments.map(([agentId]) => agentId)).size,
    assignmentCount: assignments.length,
    preloadedCount: assignments.filter(([, load]) => load === "preloaded")
      .length,
    ejectedCount: entries.filter((entry) => entry.install === "eject").length,
  }
}

/* ── Install inventory ──────────────────────────────────────────────────── */

export type InventorySkill = {
  id: string
  displayName: string
  install: "plugin" | "eject"
}

export type InstallInventory = {
  project: InventorySkill[]
  global: InventorySkill[]
  agents: SubAgent[]
}

export const selectInstallInventory = (
  config: PersistedConfig,
  added: AddedSkill[]
): InstallInventory => {
  const skills = Object.entries(config.skills)
    .map(([id, entry]) => ({
      id,
      displayName: displayNameOf(id, added),
      install: entry.install,
      scope: entry.scope,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))

  const assignedAgentIds = new Set(
    Object.values(config.skills).flatMap((entry) =>
      Object.keys(entry.assignments)
    )
  )

  return {
    project: skills.filter((skill) => skill.scope === "project"),
    global: skills.filter((skill) => skill.scope === "global"),
    /**
     * Ordered by the catalogue's own grouping rather than by whichever skill
     * happened to reference an agent first — a Set preserves insertion order,
     * which would make the inventory reshuffle as skills are toggled.
     */
    agents: SUB_AGENT_GROUPS.flatMap((group) => group.agents).filter(
      (agent: SubAgent) => assignedAgentIds.has(agent.id)
    ),
  }
}

/* ── Stack ──────────────────────────────────────────────────────────────── */

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && new Set(a).size === new Set([...a, ...b]).size

const sameAssignments = (
  assignments: Record<string, LoadState>,
  agents: readonly string[],
  preloaded: boolean
) => {
  const ids = Object.keys(assignments)
  if (!sameSet(ids, agents)) return false
  const expected: LoadState = preloaded ? "preloaded" : "lazy"
  return ids.every((agentId) => assignments[agentId] === expected)
}

/**
 * True once the configuration no longer matches what the stack would produce —
 * the design's "Custom" label, where *any* edit counts, not just adding or
 * removing a skill. Flipping one skill from Plugin to Eject is an edit, so
 * options and assignments are compared too.
 */
export const isStackCustom = (config: PersistedConfig): boolean => {
  if (config.stackId === null) return Object.keys(config.skills).length > 0

  const expansion = expandStack(config.stackId)
  if (!expansion) return true

  const current = Object.keys(config.skills)
  if (!sameSet(current, expansion.skillIds)) return true

  const preloaded = new Set<string>(expansion.preloadedSkillIds)
  return current.some((skillId) => {
    const entry = config.skills[skillId]
    if (!entry) return true
    return (
      entry.install !== DEFAULT_SKILL_OPTIONS.install ||
      entry.scope !== DEFAULT_SKILL_OPTIONS.scope ||
      entry.model !== DEFAULT_SKILL_OPTIONS.model ||
      entry.effort !== DEFAULT_SKILL_OPTIONS.effort ||
      !sameAssignments(
        entry.assignments,
        expansion.agentsBySkill[skillId] ?? [],
        preloaded.has(skillId)
      )
    )
  })
}
