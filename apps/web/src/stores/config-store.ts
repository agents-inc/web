import { CATALOG, expandStack, type SkillId } from "@workspace/matrix"
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
  /** Replaces the whole selection. `null` is "Start from scratch". */
  applyStack: (stackId: string | null) => void
  toggleSkill: (skillId: string) => void
  setSkillOption: (skillId: string, patch: Partial<SkillOptions>) => void
  /** empty → lazy → preloaded → empty, per the design's matrix cell. */
  cycleAssignment: (skillId: string, agentId: string) => void
  reset: () => void
}

export type ConfigState = PersistedConfig & ConfigActions

const NEW_ENTRY: SkillEntry = { ...DEFAULT_SKILL_OPTIONS, assignments: {} }

const EMPTY: PersistedConfig = { stackId: null, skills: {}, remembered: {} }

/**
 * Moves a skill out of the selection without discarding what the user built.
 *
 * Deselecting costs one click; the configuration behind it can be a dozen —
 * nine sub-agent assignments, a model, an effort. Dropping that silently makes
 * a misclick destructive with no undo, so a deselected entry is set aside and
 * restored if the skill comes back. Entries carrying no decisions are not
 * worth keeping and are simply dropped, which is what stops this map from
 * growing with every cell ever clicked.
 */
const setAside = (
  remembered: PersistedConfig["remembered"],
  skillId: string,
  entry: SkillEntry | undefined
) => {
  if (!entry) return remembered
  if (!isWorthRemembering(entry)) {
    const { [skillId]: _forgotten, ...rest } = remembered
    return rest
  }
  return { ...remembered, [skillId]: entry }
}

const NEXT_LOAD_STATE: Record<string, LoadState | undefined> = {
  "": "lazy",
  lazy: "preloaded",
  preloaded: undefined,
}

/**
 * A skill id is legitimate if the catalog knows it *or* the user added it this
 * session. Keeping the guard is what stops a stale id from a previous release
 * surviving in localStorage as an uninstallable entry; widening it to the
 * session set is what lets a just-added skill be selected at all.
 */
const isKnownSkill = (skillId: string) =>
  skillId in CATALOG.skillsById ||
  useAddedSkillsStore.getState().isAdded(skillId)

/**
 * In an exclusive category (framework, meta-framework, …) picking an option
 * replaces the previous one rather than adding to it — the same radio
 * behaviour the CLI wizard has, and what the design means by `one of`.
 */
const clearExclusiveSiblings = (
  skills: PersistedConfig["skills"],
  remembered: PersistedConfig["remembered"],
  skillId: string
) => {
  const categoryId = CATALOG.skillsById[skillId]?.categoryId
  if (!categoryId || !CATALOG.categoriesById[categoryId]?.exclusive)
    return { skills, remembered }

  const evicted = Object.entries(skills).filter(
    ([id]) => CATALOG.skillsById[id]?.categoryId === categoryId
  )

  return {
    skills: Object.fromEntries(
      Object.entries(skills).filter(
        ([id]) => CATALOG.skillsById[id]?.categoryId !== categoryId
      )
    ),
    // An eviction is a deselection the user did not click, so it keeps the
    // same promise: swap React for Vue, swap back, and React returns as it was.
    remembered: evicted.reduce(
      (kept, [id, entry]) => setAside(kept, id, entry),
      remembered
    ),
  }
}

const onlyCatalogSkills = (skills: PersistedConfig["skills"]) =>
  Object.fromEntries(
    Object.entries(skills).filter(([skillId]) => skillId in CATALOG.skillsById)
  )

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      ...EMPTY,

      applyStack: (stackId) => {
        if (stackId === null) {
          set({ stackId: null, skills: {}, remembered: {} })
          return
        }

        const expansion = expandStack(stackId)
        if (!expansion) return

        const preloaded = new Set<string>(expansion.preloadedSkillIds)
        set({
          stackId,
          // Applying a stack is the explicit start-over action — it already
          // confirms first when edits would be lost — so nothing is carried
          // across from the previous configuration.
          remembered: {},
          skills: Object.fromEntries(
            expansion.skillIds.map((skillId) => [
              skillId,
              {
                ...DEFAULT_SKILL_OPTIONS,
                assignments: Object.fromEntries(
                  (expansion.agentsBySkill[skillId] ?? []).map((agentId) => [
                    agentId,
                    preloaded.has(skillId) ? "preloaded" : "lazy",
                  ])
                ),
              } satisfies SkillEntry,
            ])
          ),
        })
      },

      toggleSkill: (skillId) =>
        set((state) => {
          const current = state.skills[skillId]
          if (current) {
            const { [skillId]: _removed, ...rest } = state.skills
            return {
              skills: rest,
              remembered: setAside(state.remembered, skillId, current),
            }
          }

          if (!isKnownSkill(skillId)) return {}

          const cleared = clearExclusiveSiblings(
            state.skills,
            state.remembered,
            skillId
          )
          // Restore whatever this skill was last configured with. A skill that
          // has never been configured has nothing set aside and starts blank,
          // so there is one rule rather than a special case per category.
          const { [skillId]: restored, ...untouched } = cleared.remembered

          return {
            skills: {
              ...cleared.skills,
              [skillId]: restored ?? { ...NEW_ENTRY },
            },
            remembered: untouched,
          }
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

          const next = NEXT_LOAD_STATE[entry.assignments[agentId] ?? ""]
          const assignments = { ...entry.assignments }
          if (next) assignments[agentId] = next
          else delete assignments[agentId]

          return {
            skills: { ...state.skills, [skillId]: { ...entry, assignments } },
          }
        }),

      reset: () => set(EMPTY),
    }),
    {
      name: "agents-inc:config:v1",
      version: PERSIST_VERSION,
      migrate: migrateConfig,
      /**
       * Session-added skills are stripped on the way out. They have no catalog
       * entry, so persisting a selection for one would resurrect a skill the
       * next session cannot describe or install.
       */
      partialize: ({ stackId, skills, remembered }) => ({
        stackId,
        skills: onlyCatalogSkills(skills),
        remembered: onlyCatalogSkills(remembered),
      }),
      /**
       * The one genuinely untrusted boundary in the app: localStorage can hold
       * anything a previous version, another tab, or the user's devtools left
       * behind. Anything that fails to parse is discarded in favour of the
       * current (empty) state rather than crashing the app.
       */
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
