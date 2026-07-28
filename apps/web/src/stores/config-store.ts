import { CATALOG, expandStack, type SkillId } from "@workspace/matrix"
import { create } from "zustand"
import { persist } from "zustand/middleware"

import { useAddedSkillsStore } from "./added-skills-store"
import {
  DEFAULT_SKILL_OPTIONS,
  PERSIST_VERSION,
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

const EMPTY: PersistedConfig = { stackId: null, skills: {} }

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
  skillId: string
) => {
  const categoryId = CATALOG.skillsById[skillId]?.categoryId
  if (!categoryId || !CATALOG.categoriesById[categoryId]?.exclusive)
    return skills

  return Object.fromEntries(
    Object.entries(skills).filter(
      ([id]) => CATALOG.skillsById[id]?.categoryId !== categoryId
    )
  )
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      ...EMPTY,

      applyStack: (stackId) => {
        if (stackId === null) {
          set({ stackId: null, skills: {} })
          return
        }

        const expansion = expandStack(stackId)
        if (!expansion) return

        const preloaded = new Set<string>(expansion.preloadedSkillIds)
        set({
          stackId,
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
          if (state.skills[skillId]) {
            const { [skillId]: _removed, ...rest } = state.skills
            return { skills: rest }
          }
          if (!isKnownSkill(skillId)) return {}
          return {
            skills: {
              ...clearExclusiveSiblings(state.skills, skillId),
              [skillId]: { ...NEW_ENTRY },
            },
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
      partialize: ({ stackId, skills }) => ({
        stackId,
        skills: Object.fromEntries(
          Object.entries(skills).filter(
            ([skillId]) => skillId in CATALOG.skillsById
          )
        ),
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
