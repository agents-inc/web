import {
  CATALOG,
  expandStack,
  type SkillId,
  type StackExpansion,
} from "@workspace/matrix"
import { create } from "zustand"
import { persist } from "zustand/middleware"

import { defaultAssignmentsFor } from "@/features/configure/lib/default-assignments"
import { reportIssue } from "@/lib/observability/report"
import { useAddedSkillsStore } from "./added-skills-store"
import {
  DEFAULT_SKILL_OPTIONS,
  PERSIST_VERSION,
  isAgentOn,
  isWorthRemembering,
  migrateConfig,
  persistedConfigSchema,
  pruneUnknownIds,
  type Assignment,
  type PersistedConfig,
  type SkillEntry,
  type SkillOptions,
} from "./persisted-schema"
import { useUiStore } from "./ui-store"

type ConfigActions = {
  // Replaces the whole selection. `null` is "Start from scratch".
  applyStack: (stackId: string | null) => void
  toggleSkill: (skillId: string) => void
  setSkillOption: (skillId: string, patch: Partial<SkillOptions>) => void
  // empty → lazy → preloaded → empty, per the design's matrix cell. A row the
  // roster switched off counts as empty, so cycling it re-enables at lazy.
  cycleAssignment: (skillId: string, agentId: string) => void
  // The roster's row click: keep the assignment, flip whether it is live.
  toggleAssignmentEnabled: (skillId: string, agentId: string) => void
  // The roster's load word: pre ↔ lazy for that one agent.
  flipAssignmentLoad: (skillId: string, agentId: string) => void
  // The roster's agent click: pin the agent to the opposite of what it
  // currently derives to. Explicit in both directions, exactly like the design
  // — a pinned-off agent stays off as skills arrive, a pinned-on one installs
  // bare.
  toggleAgentPin: (agentId: string) => void
  // The inbound half of sharing: a fetched config replaces the selection
  // wholesale, exactly as applying a stack does.
  importConfig: (config: PersistedConfig) => void
  reset: () => void
}

export type ConfigState = PersistedConfig & ConfigActions

type SkillMap = PersistedConfig["skills"]
type Assignments = SkillEntry["assignments"]

const EMPTY: PersistedConfig = {
  stackId: null,
  skills: {},
  remembered: {},
  pins: {},
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

// `pruneUnknownIds` dropping an id is correct and completely invisible: the
// user gets a smaller configuration back and no explanation. Counting the
// difference is what turns catalog drift into something observable, without
// changing the pure function or the tests that cover it.
const countIds = (config: PersistedConfig) => {
  const entries = [
    ...Object.values(config.skills),
    ...Object.values(config.remembered),
  ]

  return (
    entries.length +
    Object.keys(config.pins).length +
    entries.reduce(
      (total, entry) => total + Object.keys(entry?.assignments ?? {}).length,
      0
    )
  )
}

const reportPruning = (before: PersistedConfig, after: PersistedConfig) => {
  const droppedIds = countIds(before) - countIds(after)
  const droppedStack = before.stackId !== null && after.stackId === null

  if (droppedIds === 0 && !droppedStack) return

  // Catalog slugs and counts — nothing here describes the user.
  reportIssue("Pruned saved ids the catalog no longer knows", {
    droppedIds,
    droppedStackId: droppedStack ? before.stackId : undefined,
  })
}

// ── Catalog questions ────────────────────────────────────────────────────

// The catalog, or the session. The guard stops a stale id from a previous
// release surviving in storage; the session half lets an added skill be picked.
const isKnownSkill = (skillId: string) =>
  skillId in CATALOG.skillsById ||
  useAddedSkillsStore.getState().isAdded(skillId)

const isInCategory = (skillId: string, categoryId: string) =>
  CATALOG.skillsById[skillId]?.categoryId === categoryId

// The skill's category, wherever it is known: the catalog for its own skills,
// the session store for added ones (their category comes from the marketplace
// index and may be absent — those assign nowhere).
const categoryIdOf = (skillId: string) =>
  CATALOG.skillsById[skillId]?.categoryId ??
  useAddedSkillsStore.getState().added.find((skill) => skill.id === skillId)
    ?.categoryId

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

// What a never-configured skill starts as: the rule's assignments, reaching
// its domain's core agents, which is what enables them. Exported because the
// cell shows this before the skill is selected — what you see in the ••• panel
// has to be what picking the skill would actually give you.
export const freshEntry = (skillId: string): SkillEntry => ({
  ...DEFAULT_SKILL_OPTIONS,
  assignments: defaultAssignmentsFor(categoryIdOf(skillId)),
})

// A remembered skill restores exactly what it had instead; the rule must not
// overwrite a setup the user already shaped.
const select = (state: PersistedConfig, skillId: string) => {
  const { skills, remembered } = clearExclusiveSiblings(state, skillId)

  return {
    skills: {
      ...skills,
      [skillId]: remembered[skillId] ?? freshEntry(skillId),
    },
    remembered: withoutKey(remembered, skillId),
  }
}

// The agents an entry actually reaches — a switched-off row does not pulse.
const liveAgentIds = (entry: SkillEntry | undefined) =>
  Object.entries(entry?.assignments ?? {})
    .filter(([, assignment]) => assignment.enabled)
    .map(([agentId]) => agentId)

const cycled = (assignments: Assignments, agentId: string): Assignments => {
  const current = assignments[agentId]

  if (!current || !current.enabled)
    return { ...assignments, [agentId]: { load: "lazy", enabled: true } }
  if (current.load === "lazy")
    return { ...assignments, [agentId]: { load: "preloaded", enabled: true } }

  return withoutKey(assignments, agentId)
}

// Configuring a skill must not select it — the ••• and the badges are their
// own controls, not a way in. So an unselected skill's options go where a
// deselected one's already go, and `select` restores them verbatim when the
// skill is eventually picked. Entries that end up saying nothing are dropped
// rather than left behind.
const configure = (
  state: PersistedConfig,
  skillId: string,
  change: (entry: SkillEntry) => SkillEntry
) => {
  const selected = state.skills[skillId]
  if (selected) {
    return { skills: { ...state.skills, [skillId]: change(selected) } }
  }

  if (!isKnownSkill(skillId)) return {}

  // Starting from a fresh entry rather than a blank one, so a skill
  // configured before it is picked still arrives with its agents.
  const next = change(state.remembered[skillId] ?? freshEntry(skillId))
  return {
    remembered: isWorthRemembering(next)
      ? { ...state.remembered, [skillId]: next }
      : withoutKey(state.remembered, skillId),
  }
}

const patchAssignment = (
  state: PersistedConfig,
  skillId: string,
  agentId: string,
  change: (current: Assignment) => Assignment
) => {
  const entry = state.skills[skillId]
  const current = entry?.assignments[agentId]
  if (!entry || !current) return {}

  return {
    skills: {
      ...state.skills,
      [skillId]: {
        ...entry,
        assignments: { ...entry.assignments, [agentId]: change(current) },
      },
    },
  }
}

// ── Stack expansion ──────────────────────────────────────────────────────

const toAssignments = (
  agentIds: readonly string[],
  preloaded: boolean
): Assignments => {
  const assignment: Assignment = {
    load: preloaded ? "preloaded" : "lazy",
    enabled: true,
  }
  return Object.fromEntries(agentIds.map((agentId) => [agentId, assignment]))
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
    (set, get) => ({
      ...EMPTY,

      applyStack: (stackId) => {
        // Whatever was pulsing belonged to the selection being replaced.
        useUiStore.getState().clearFlash()

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
          pins: {},
        })
      },

      toggleSkill: (skillId) => {
        const selecting = !(skillId in get().skills)

        set((state) => {
          const current = state.skills[skillId]

          if (current) return deselect(state, skillId, current)
          if (!isKnownSkill(skillId)) return {}

          return select(state, skillId)
        })

        // The roster's pulse narrates the selection behind it, so a deselect
        // flashes nobody — which clears whatever was still running. Read back
        // rather than recomputed, so a restored entry flashes what it restored.
        const reached = selecting ? get().skills[skillId] : undefined
        useUiStore.getState().flashAgents(liveAgentIds(reached))
      },

      setSkillOption: (skillId, patch) =>
        set((state) =>
          configure(state, skillId, (entry) => ({ ...entry, ...patch }))
        ),

      cycleAssignment: (skillId, agentId) =>
        set((state) =>
          configure(state, skillId, (entry) => ({
            ...entry,
            assignments: cycled(entry.assignments, agentId),
          }))
        ),

      toggleAssignmentEnabled: (skillId, agentId) =>
        set((state) =>
          patchAssignment(state, skillId, agentId, (current) => ({
            ...current,
            enabled: !current.enabled,
          }))
        ),

      flipAssignmentLoad: (skillId, agentId) =>
        set((state) =>
          patchAssignment(state, skillId, agentId, (current) => ({
            ...current,
            load: current.load === "preloaded" ? "lazy" : "preloaded",
          }))
        ),

      toggleAgentPin: (agentId) =>
        set((state) => ({
          pins: { ...state.pins, [agentId]: !isAgentOn(state, agentId) },
        })),

      importConfig: (config) => {
        useUiStore.getState().clearFlash()
        set({ ...config })
      },

      reset: () => {
        useUiStore.getState().clearFlash()
        set({ ...EMPTY })
      },
    }),
    {
      name: "agents-inc:config:v1",
      version: PERSIST_VERSION,
      migrate: migrateConfig,
      // Session-added skills have no catalog entry, so a persisted selection
      // for one would resurrect a skill the next session cannot describe.
      partialize: ({ stackId, skills, remembered, pins }) => ({
        stackId,
        skills: onlyCatalogSkills(skills),
        remembered: onlyCatalogSkills(remembered),
        pins,
      }),
      // The one untrusted boundary: anything unparseable is discarded in
      // favour of empty state rather than crashing the app.
      merge: (persisted, current) => {
        const parsed = persistedConfigSchema.safeParse(persisted)
        if (!parsed.success) {
          // The app's only *silent* failure: an afternoon of configuration
          // becomes empty state, and nothing on screen says so. Paths and
          // codes only — the issues must never carry the values themselves.
          reportIssue("Discarded unreadable saved configuration", {
            persistVersion: PERSIST_VERSION,
            issues: parsed.error.issues.map(
              (issue) => `${issue.path.join(".") || "(root)"}: ${issue.code}`
            ),
          })
          return current
        }

        const pruned = pruneUnknownIds(parsed.data)
        reportPruning(parsed.data, pruned)

        return { ...current, ...pruned }
      },
    }
  )
)

export type { SkillId }
