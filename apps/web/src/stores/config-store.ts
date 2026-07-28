import {
  CATALOG,
  expandStack,
  type SkillId,
  type StackExpansion,
} from "@workspace/matrix"
import { create } from "zustand"
import { persist } from "zustand/middleware"

import { useAddedSkillsStore } from "./added-skills-store"
import {
  DEFAULT_SKILL_OPTIONS,
  PERSIST_VERSION,
  isWorthRemembering,
  migrateConfig,
  persistedConfigSchema,
  pruneUnknownIds,
  type LoadState,
  type PersistedConfig,
  type SkillEntry,
  type SkillOptions,
} from "./persisted-schema"

type ConfigActions = {
  // Replaces the whole selection. `null` is "Start from scratch".
  applyStack: (stackId: string | null) => void
  toggleSkill: (skillId: string) => void
  setSkillOption: (skillId: string, patch: Partial<SkillOptions>) => void
  // empty → lazy → preloaded → empty, per the design's matrix cell.
  cycleAssignment: (skillId: string, agentId: string) => void
  // The inbound half of sharing: a fetched config replaces the selection
  // wholesale, exactly as applying a stack does.
  importConfig: (config: PersistedConfig) => void
  reset: () => void
}

export type ConfigState = PersistedConfig & ConfigActions

type SkillMap = PersistedConfig["skills"]
type Assignments = SkillEntry["assignments"]

const NEW_ENTRY: SkillEntry = { ...DEFAULT_SKILL_OPTIONS, assignments: {} }

const EMPTY: PersistedConfig = { stackId: null, skills: {}, remembered: {} }

const NEXT_LOAD_STATE: Record<string, LoadState | undefined> = {
  "": "lazy",
  lazy: "preloaded",
  preloaded: undefined,
}

// ── Plain helpers ────────────────────────────────────────────────────────

const withoutKey = <T>(record: Record<string, T>, key: string) => {
  const { [key]: _removed, ...rest } = record
  return rest
}

const partition = <T>(items: readonly T[], matches: (item: T) => boolean) => {
  const matched: T[] = []
  const rest: T[] = []

  for (const item of items) {
    if (matches(item)) matched.push(item)
    else rest.push(item)
  }

  return [matched, rest] as const
}

// ── Catalog questions ────────────────────────────────────────────────────

// The catalog, or the session. The guard stops a stale id from a previous
// release surviving in storage; the session half lets an added skill be picked.
const isKnownSkill = (skillId: string) =>
  skillId in CATALOG.skillsById ||
  useAddedSkillsStore.getState().isAdded(skillId)

const isInCategory = (skillId: string, categoryId: string) =>
  CATALOG.skillsById[skillId]?.categoryId === categoryId

// The skill's category, but only when picking one replaces the others.
const exclusiveCategoryOf = (skillId: string) => {
  const categoryId = CATALOG.skillsById[skillId]?.categoryId
  if (!categoryId) return undefined

  return CATALOG.categoriesById[categoryId]?.exclusive ? categoryId : undefined
}

// ── Selection transforms ─────────────────────────────────────────────────

// Deselecting costs one click; the configuration behind it can be a dozen, so
// it is set aside rather than dropped. Empty entries are not worth keeping.
const setAside = (
  remembered: SkillMap,
  skillId: string,
  entry: SkillEntry | undefined
) => {
  if (!entry) return remembered
  if (!isWorthRemembering(entry)) return withoutKey(remembered, skillId)

  return { ...remembered, [skillId]: entry }
}

// `one of`: picking replaces rather than adds. An eviction is a deselection
// the user did not click, so it keeps the same promise — swap back and it returns.
const clearExclusiveSiblings = (
  { skills, remembered }: PersistedConfig,
  skillId: string
) => {
  const categoryId = exclusiveCategoryOf(skillId)
  if (!categoryId) return { skills, remembered }

  const [evicted, kept] = partition(Object.entries(skills), ([id]) =>
    isInCategory(id, categoryId)
  )

  return {
    skills: Object.fromEntries(kept),
    remembered: evicted.reduce(
      (memory, [id, entry]) => setAside(memory, id, entry),
      remembered
    ),
  }
}

const deselect = (
  state: PersistedConfig,
  skillId: string,
  entry: SkillEntry
) => ({
  skills: withoutKey(state.skills, skillId),
  remembered: setAside(state.remembered, skillId, entry),
})

// Restores what was set aside; a skill never configured starts blank.
const select = (state: PersistedConfig, skillId: string) => {
  const { skills, remembered } = clearExclusiveSiblings(state, skillId)

  return {
    skills: { ...skills, [skillId]: remembered[skillId] ?? { ...NEW_ENTRY } },
    remembered: withoutKey(remembered, skillId),
  }
}

const cycled = (assignments: Assignments, agentId: string) => {
  const next = NEXT_LOAD_STATE[assignments[agentId] ?? ""]
  if (!next) return withoutKey(assignments, agentId)

  return { ...assignments, [agentId]: next }
}

// ── Stack expansion ──────────────────────────────────────────────────────

const toAssignments = (
  agentIds: readonly string[],
  preloaded: boolean
): Assignments => {
  const load: LoadState = preloaded ? "preloaded" : "lazy"
  return Object.fromEntries(agentIds.map((agentId) => [agentId, load]))
}

const toStackSkills = (expansion: StackExpansion): SkillMap => {
  const preloaded = new Set<string>(expansion.preloadedSkillIds)

  const entryFor = (skillId: string): SkillEntry => ({
    ...DEFAULT_SKILL_OPTIONS,
    assignments: toAssignments(
      expansion.agentsBySkill[skillId] ?? [],
      preloaded.has(skillId)
    ),
  })

  return Object.fromEntries(
    expansion.skillIds.map((skillId) => [skillId, entryFor(skillId)])
  )
}

// ── Persistence ──────────────────────────────────────────────────────────

const onlyCatalogSkills = (skills: SkillMap) =>
  Object.fromEntries(
    Object.entries(skills).filter(([skillId]) => skillId in CATALOG.skillsById)
  )

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      ...EMPTY,

      applyStack: (stackId) => {
        if (stackId === null) {
          set({ ...EMPTY })
          return
        }

        const expansion = expandStack(stackId)
        if (!expansion) return

        set({
          stackId,
          skills: toStackSkills(expansion),
          // The explicit start-over action, which already confirms first.
          remembered: {},
        })
      },

      toggleSkill: (skillId) =>
        set((state) => {
          const current = state.skills[skillId]

          if (current) return deselect(state, skillId, current)
          if (!isKnownSkill(skillId)) return {}

          return select(state, skillId)
        }),

      setSkillOption: (skillId, patch) =>
        set((state) => {
          const entry = state.skills[skillId]
          if (!entry) return {}

          return {
            skills: { ...state.skills, [skillId]: { ...entry, ...patch } },
          }
        }),

      cycleAssignment: (skillId, agentId) =>
        set((state) => {
          const entry = state.skills[skillId]
          if (!entry) return {}

          return {
            skills: {
              ...state.skills,
              [skillId]: {
                ...entry,
                assignments: cycled(entry.assignments, agentId),
              },
            },
          }
        }),

      importConfig: (config) => set({ ...config }),

      reset: () => set({ ...EMPTY }),
    }),
    {
      name: "agents-inc:config:v1",
      version: PERSIST_VERSION,
      migrate: migrateConfig,
      // Session-added skills have no catalog entry, so a persisted selection
      // for one would resurrect a skill the next session cannot describe.
      partialize: ({ stackId, skills, remembered }) => ({
        stackId,
        skills: onlyCatalogSkills(skills),
        remembered: onlyCatalogSkills(remembered),
      }),
      // The one untrusted boundary: anything unparseable is discarded in
      // favour of empty state rather than crashing the app.
      merge: (persisted, current) => {
        const parsed = persistedConfigSchema.safeParse(persisted)
        if (!parsed.success) {
          if (import.meta.env.DEV) {
            console.warn(
              "Discarding unreadable saved configuration",
              parsed.error.issues
            )
          }
          return current
        }

        return { ...current, ...pruneUnknownIds(parsed.data) }
      },
    }
  )
)

export type { SkillId }
