import { CATALOG, STACKS, SUB_AGENTS_BY_ID } from "@workspace/matrix"
import { z } from "zod"

// Bump when the persisted shape changes, and add a case to `migrateConfig`.
export const PERSIST_VERSION = 3

// Not assigned is the absence of a key, so only the two live states appear.
export const loadStateSchema = z.enum(["lazy", "preloaded"])

export const skillEntrySchema = z.object({
  model: z.enum(["opus", "sonnet", "haiku"]),
  effort: z.enum(["none", "low", "med", "high"]),
  install: z.enum(["plugin", "eject"]),
  scope: z.enum(["project", "global"]),
  // Sub-agent id → how that agent loads the skill. The single source of truth
  // for assignment; every count and list on screen is derived from it.
  assignments: z.record(z.string(), loadStateSchema),
})

export const persistedConfigSchema = z.object({
  stackId: z.string().nullable(),
  // Sparse — presence is selection. Ids stay plain strings so one id dropped
  // from a regenerated catalog is pruned rather than failing the whole parse.
  skills: z.record(z.string(), skillEntrySchema),
  // Configuration for skills that are not selected, so deselecting a dozen
  // clicks of setup is not destructive. Only entries worth keeping land here.
  remembered: z.record(z.string(), skillEntrySchema),
})

export type LoadState = z.infer<typeof loadStateSchema>
export type SkillEntry = z.infer<typeof skillEntrySchema>
export type PersistedConfig = z.infer<typeof persistedConfigSchema>
export type SkillOptions = Omit<SkillEntry, "assignments">

// Shared so `isStackCustom` compares against what `applyStack` writes.
// `sonnet` / `med` are the resting values of the two segments with no "off".
export const DEFAULT_SKILL_OPTIONS = {
  model: "sonnet",
  effort: "med",
  install: "plugin",
  scope: "project",
} as const satisfies SkillOptions

// Does this entry carry any information at all? Not "did the user customise
// it" — a stack-applied skill arrives with assignments and must be kept. Only
// the empty entry is dropped, since restoring one equals creating it fresh.
export const isWorthRemembering = (entry: SkillEntry) =>
  Object.keys(entry.assignments).length > 0 ||
  entry.model !== DEFAULT_SKILL_OPTIONS.model ||
  entry.effort !== DEFAULT_SKILL_OPTIONS.effort ||
  entry.install !== DEFAULT_SKILL_OPTIONS.install ||
  entry.scope !== DEFAULT_SKILL_OPTIONS.scope

export const persistedUiSchema = z.object({
  rosterCollapsed: z.object({
    available: z.boolean(),
    inUse: z.boolean(),
  }),
})

export type PersistedUi = z.infer<typeof persistedUiSchema>

// Drops references the regenerated catalog no longer knows. Session-added
// skills are never persisted in the first place, so none reach here.
const isKnownSkill = (skillId: string) => skillId in CATALOG.skillsById
const isKnownAgent = (agentId: string) => agentId in SUB_AGENTS_BY_ID
const isKnownStack = (stackId: string | null) =>
  STACKS.some((stack) => stack.id === stackId)

const pruneAssignments = (assignments: SkillEntry["assignments"]) =>
  Object.fromEntries(
    Object.entries(assignments).filter(([agentId]) => isKnownAgent(agentId))
  )

const pruneEntry = (entry: SkillEntry): SkillEntry => ({
  ...entry,
  assignments: pruneAssignments(entry.assignments),
})

const pruneSkillMap = (skills: PersistedConfig["skills"]) =>
  Object.fromEntries(
    Object.entries(skills)
      .filter(([skillId]) => isKnownSkill(skillId))
      .map(([skillId, entry]) => [skillId, pruneEntry(entry)])
  )

export const pruneUnknownIds = (config: PersistedConfig): PersistedConfig => ({
  stackId: isKnownStack(config.stackId) ? config.stackId : null,
  skills: pruneSkillMap(config.skills),
  remembered: pruneSkillMap(config.remembered),
})

// The v1 shape, kept only so the v1 → v2 migration can read it.
const persistedConfigV1Schema = z.object({
  stackId: z.string().nullable(),
  targetAgentIds: z.array(z.string()).optional(),
  skills: z.record(
    z.string(),
    z.object({
      selected: z.boolean(),
      agents: z.array(z.string()),
      preloaded: z.boolean(),
      install: z.enum(["plugin", "eject"]),
      scope: z.enum(["global", "project"]),
    })
  ),
})

// Folds `agents[]` + a skill-wide `preloaded` into per-agent load states. A
// deselected v1 entry is dropped, since in v2 presence is what selection means.
type V1Entry = z.infer<typeof persistedConfigV1Schema>["skills"][string]

const wasSelected = ([, entry]: [string, V1Entry]) => entry.selected

// v1 recorded one flag for the whole skill; v2 records one state per agent.
const toV2Assignments = (entry: V1Entry): SkillEntry["assignments"] => {
  const load: LoadState = entry.preloaded ? "preloaded" : "lazy"
  return Object.fromEntries(entry.agents.map((agentId) => [agentId, load]))
}

const toV2Entry = (entry: V1Entry): SkillEntry => ({
  ...DEFAULT_SKILL_OPTIONS,
  install: entry.install,
  scope: entry.scope,
  assignments: toV2Assignments(entry),
})

const migrateV1ToV2 = (state: unknown): unknown => {
  const parsed = persistedConfigV1Schema.safeParse(state)
  if (!parsed.success) return undefined

  return {
    stackId: parsed.data.stackId,
    skills: Object.fromEntries(
      Object.entries(parsed.data.skills)
        .filter(wasSelected)
        .map(([skillId, entry]) => [skillId, toV2Entry(entry)])
    ),
  }
}

// v2 had nowhere to keep a deselected skill's configuration, so it starts empty.
const migrateV2ToV3 = (state: unknown): unknown =>
  state && typeof state === "object" ? { ...state, remembered: {} } : undefined

// `undefined` discards the stored state, which `merge` replaces with defaults.
export const migrateConfig = (state: unknown, fromVersion: number): unknown => {
  switch (fromVersion) {
    case 1:
      return migrateV2ToV3(migrateV1ToV2(state))
    case 2:
      return migrateV2ToV3(state)
    case PERSIST_VERSION:
      return state
    default:
      return undefined
  }
}
