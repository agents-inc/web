// Everything the screen shows that is not stored. All pure — (catalog, config,
// search) in, view data out — so nothing here can cache a stale copy.

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

// The selection and nothing else. Narrower than `PersistedConfig` on purpose:
// a remembered skill is not selected, so no derivation may see one.
export type ConfigSelection = Pick<PersistedConfig, "stackId" | "skills">

// Catalog and session-added skills flattened to one shape, so the cell never
// branches on provenance — only on `added`, which draws the tag.
export type GridSkill = {
  id: string
  displayName: string
  description: string
  monogram: string
  // Catalog skills carry a slug for the logo lookup; added ones do not.
  slug?: string
  added: boolean
}

export type SkillCellView = {
  skill: GridSkill
  entry: SkillEntry | undefined
  selected: boolean
  // Conflicts with something already selected — rendered disabled, never hidden.
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

// Two letters: first letter of each of the first two words, else the first two.
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

const isRecommended = (skillId: string) =>
  CATALOG.skillsById[skillId]?.isRecommended ?? false

// Every framework conflicts with every other, so counting a sibling would
// disable them all the moment you pick one, with no way back.
const isExclusiveSibling = (conflictId: string, category: CatalogCategory) =>
  category.exclusive &&
  CATALOG.skillsById[conflictId]?.categoryId === category.id

// Conflicts are stored on both sides, so one direction is enough.
const findConflict = (
  skill: CatalogSkill,
  category: CatalogCategory,
  selectedIds: Set<string>
) =>
  skill.conflictsWith.find(
    (conflictId) =>
      selectedIds.has(conflictId) && !isExclusiveSibling(conflictId, category)
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

// ── Grid ─────────────────────────────────────────────────────────────────

// Everything the grid derivation needs, gathered once rather than threaded.
type GridContext = {
  config: ConfigSelection
  search: ConfigureSearch
  selectedIds: Set<string>
  addedByCategory: Map<string, AddedSkill[]>
}

const groupAddedByCategory = (added: AddedSkill[]) => {
  const byCategory = new Map<string, AddedSkill[]>()

  for (const skill of added) {
    const key = skill.categoryId ?? UNCATEGORIZED_ID
    const bucket = byCategory.get(key)
    if (bucket) bucket.push(skill)
    else byCategory.set(key, [skill])
  }

  return byCategory
}

const isVisibleDomain = (domain: CatalogDomain, search: ConfigureSearch) =>
  !search.domain || domain.id === search.domain

// Applied to the cell, not the skill, so "selected" has one definition.
const survivesSelectionFilter = (
  cell: SkillCellView,
  search: ConfigureSearch
) => !search.sel || cell.selected

const toCatalogCell = (
  skill: GridSkill,
  category: CatalogCategory,
  { config, selectedIds }: GridContext
): SkillCellView => {
  const entry = config.skills[skill.id]
  const source = CATALOG.skillsById[skill.id]

  if (entry || !source) return toCell(skill, entry)
  return toCell(skill, entry, findConflict(source, category, selectedIds))
}

const catalogCellsIn = (
  category: CatalogCategory,
  context: GridContext
): SkillCellView[] => {
  const { search } = context

  return category.skills
    .map(toGridSkill)
    .filter((skill) => matchesQuery(skill, search.q))
    .filter((skill) => !search.rec || isRecommended(skill.id))
    .map((skill) => toCatalogCell(skill, category, context))
    .filter((cell) => survivesSelectionFilter(cell, search))
}

// `recommended` is a catalog flag, so an added skill can never satisfy it.
const addedCellsIn = (
  categoryId: string,
  context: GridContext
): SkillCellView[] => {
  const { config, search, addedByCategory } = context
  if (search.rec) return []

  return (addedByCategory.get(categoryId) ?? [])
    .map(addedToGridSkill)
    .filter((skill) => matchesQuery(skill, search.q))
    .map((skill) => toCell(skill, config.skills[skill.id]))
    .filter((cell) => survivesSelectionFilter(cell, search))
}

const toCategoryView = (
  category: CatalogCategory,
  context: GridContext
): CategoryView => ({
  id: category.id,
  displayName: category.displayName,
  exclusive: category.exclusive,
  cells: [
    ...catalogCellsIn(category, context),
    ...addedCellsIn(category.id, context),
  ],
})

const hasCells = (category: CategoryView) => category.cells.length > 0
const hasCategories = (domain: DomainView) => domain.categories.length > 0

const toDomainView = (
  domain: CatalogDomain,
  context: GridContext
): DomainView => ({
  id: domain.id,
  label: domain.label,
  categories: domain.categories
    .map((category) => toCategoryView(category, context))
    .filter(hasCells),
})

// Its own section, so an unmatched skill does not imply a real domain.
const toAddedSection = (cells: SkillCellView[]): DomainView => ({
  id: "added",
  label: "Added",
  categories: [
    {
      id: UNCATEGORIZED_ID,
      displayName: "Uncategorized",
      exclusive: false,
      cells,
    },
  ],
})

// Categories that filter down to nothing are dropped, and so are the domains
// that lose all of theirs, so the page never renders an empty header.
export const selectDomainViews = (
  config: ConfigSelection,
  added: AddedSkill[],
  search: ConfigureSearch
): DomainView[] => {
  const context: GridContext = {
    config,
    search,
    selectedIds: new Set(Object.keys(config.skills)),
    addedByCategory: groupAddedByCategory(added),
  }

  const domains = CATALOG.domains
    .filter((domain) => isVisibleDomain(domain, search))
    .map((domain) => toDomainView(domain, context))
    .filter(hasCategories)

  const orphans = addedCellsIn(UNCATEGORIZED_ID, context)
  if (orphans.length === 0 || search.domain) return domains

  return [...domains, toAddedSection(orphans)]
}
// ── Roster ───────────────────────────────────────────────────────────────

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

// In the catalogue's own order, so lists never reshuffle as skills are toggled.
const allAgents = () => SUB_AGENT_GROUPS.flatMap((group) => group.agents)

const byDisplayName = (
  a: { displayName: string },
  b: { displayName: string }
) => a.displayName.localeCompare(b.displayName)

const allAssignments = (config: ConfigSelection) =>
  Object.values(config.skills).flatMap((entry) =>
    Object.entries(entry.assignments)
  )

const countSkillsByAgent = (config: ConfigSelection) => {
  const counts: Record<string, number> = {}

  for (const [agentId] of allAssignments(config)) {
    counts[agentId] = (counts[agentId] ?? 0) + 1
  }

  return counts
}

const groupSkillsByAgent = (config: ConfigSelection, added: AddedSkill[]) => {
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

  return byAgent
}

// Every sub-agent that exists, with how many skills it holds.
export const selectAvailableAgents = (config: ConfigSelection) => {
  const counts = countSkillsByAgent(config)

  return allAgents().map((agent) => ({
    agent,
    count: counts[agent.id] ?? 0,
  }))
}

// Only the sub-agents that actually hold skills, with their skill lists.
export const selectAgentsInUse = (
  config: ConfigSelection,
  added: AddedSkill[]
): RosterAgent[] => {
  const byAgent = groupSkillsByAgent(config, added)

  return allAgents()
    .filter((agent) => byAgent.has(agent.id))
    .map((agent) => ({
      agent,
      skills: [...(byAgent.get(agent.id) ?? [])].sort(byDisplayName),
    }))
}

// ── Summaries ────────────────────────────────────────────────────────────

export type ConfigSummary = {
  skillCount: number
  agentCount: number
  assignmentCount: number
  preloadedCount: number
  ejectedCount: number
}

const isPreloaded = ([, load]: [string, LoadState]) => load === "preloaded"
const isEjected = (entry: SkillEntry) => entry.install === "eject"

export const summarize = (config: ConfigSelection): ConfigSummary => {
  const entries = Object.values(config.skills)
  const assignments = allAssignments(config)
  const agentIds = new Set(assignments.map(([agentId]) => agentId))

  return {
    skillCount: entries.length,
    agentCount: agentIds.size,
    assignmentCount: assignments.length,
    preloadedCount: assignments.filter(isPreloaded).length,
    ejectedCount: entries.filter(isEjected).length,
  }
}

// ── Install inventory ────────────────────────────────────────────────────

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

type ScopedInventorySkill = InventorySkill & { scope: "project" | "global" }

const assignedAgentIds = (config: ConfigSelection) =>
  new Set(allAssignments(config).map(([agentId]) => agentId))

const toInventorySkills = (
  config: ConfigSelection,
  added: AddedSkill[]
): ScopedInventorySkill[] =>
  Object.entries(config.skills)
    .map(([id, entry]) => ({
      id,
      displayName: displayNameOf(id, added),
      install: entry.install,
      scope: entry.scope,
    }))
    .sort(byDisplayName)

const inScope =
  (scope: ScopedInventorySkill["scope"]) => (skill: ScopedInventorySkill) =>
    skill.scope === scope

export const selectInstallInventory = (
  config: ConfigSelection,
  added: AddedSkill[]
): InstallInventory => {
  const skills = toInventorySkills(config, added)
  const assigned = assignedAgentIds(config)

  return {
    project: skills.filter(inScope("project")),
    global: skills.filter(inScope("global")),
    agents: allAgents().filter((agent) => assigned.has(agent.id)),
  }
}

// ── Stack ────────────────────────────────────────────────────────────────

const sameSet = (a: readonly string[], b: readonly string[]) => {
  if (a.length !== b.length) return false
  const inB = new Set(b)
  return a.every((value) => inB.has(value))
}

const sameAssignments = (
  assignments: Record<string, LoadState>,
  agents: readonly string[],
  preloaded: boolean
) => {
  const assignedIds = Object.keys(assignments)
  if (!sameSet(assignedIds, agents)) return false

  const expected: LoadState = preloaded ? "preloaded" : "lazy"
  return assignedIds.every((agentId) => assignments[agentId] === expected)
}

const hasDefaultOptions = (entry: SkillEntry) =>
  entry.install === DEFAULT_SKILL_OPTIONS.install &&
  entry.scope === DEFAULT_SKILL_OPTIONS.scope &&
  entry.model === DEFAULT_SKILL_OPTIONS.model &&
  entry.effort === DEFAULT_SKILL_OPTIONS.effort

// Any difference from what the stack would have produced counts as an edit.
const isSkillEdited = (
  entry: SkillEntry,
  expectedAgents: readonly string[],
  preloaded: boolean
) =>
  !hasDefaultOptions(entry) ||
  !sameAssignments(entry.assignments, expectedAgents, preloaded)

// The design's "Custom" label, where any edit counts — so options and
// assignments are compared, not just which skills are selected.
export const isStackCustom = (config: ConfigSelection): boolean => {
  if (config.stackId === null) return Object.keys(config.skills).length > 0

  const expansion = expandStack(config.stackId)
  if (!expansion) return true

  const selectedIds = Object.keys(config.skills)
  if (!sameSet(selectedIds, expansion.skillIds)) return true

  const preloaded = new Set<string>(expansion.preloadedSkillIds)

  return selectedIds.some((skillId) => {
    const entry = config.skills[skillId]
    if (!entry) return true

    return isSkillEdited(
      entry,
      expansion.agentsBySkill[skillId] ?? [],
      preloaded.has(skillId)
    )
  })
}
