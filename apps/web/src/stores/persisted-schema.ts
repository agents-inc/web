import { CATALOG, STACKS, SUB_AGENTS_BY_ID } from "@workspace/matrix"
import { z } from "zod"

// Bump when the persisted shape changes; older blobs are discarded on load.
export const PERSIST_VERSION = 5

export const loadStateSchema = z.enum(["lazy", "preloaded"])

// One (agent, skill) edge. `enabled: false` keeps the row: switching a skill
// off for one agent in the roster must not erase which load mode it had, and
// the row stays listed — recessed — so it can be switched back on.
export const assignmentSchema = z.object({
  load: loadStateSchema,
  enabled: z.boolean(),
})

export const skillEntrySchema = z.object({
  model: z.enum(["opus", "fable", "sonnet", "haiku"]),
  effort: z.enum(["low", "medium", "high", "xhigh", "max", "ultra"]),
  install: z.enum(["plugin", "eject"]),
  scope: z.enum(["project", "global"]),
  // Sub-agent id → how that agent carries the skill. The single source of
  // truth for assignment; every count and list on screen is derived from it.
  assignments: z.record(z.string(), assignmentSchema),
})

export const persistedConfigSchema = z.object({
  stackId: z.string().nullable(),
  // Sparse — presence is selection. Ids stay plain strings so one id dropped
  // from a regenerated catalog is pruned rather than failing the whole parse.
  skills: z.record(z.string(), skillEntrySchema),
  // Configuration for skills that are not selected, so deselecting a dozen
  // clicks of setup is not destructive. Only entries worth keeping land here.
  remembered: z.record(z.string(), skillEntrySchema),
  // Explicit per-agent overrides of the derived on/off state. Sparse — an
  // absent agent follows the rule in `isAgentOn`; a pinned-on agent installs
  // even with no skills (a base agent), a pinned-off one never installs.
  pins: z.record(z.string(), z.boolean()),
})

export type LoadState = z.infer<typeof loadStateSchema>
export type Assignment = z.infer<typeof assignmentSchema>
export type SkillEntry = z.infer<typeof skillEntrySchema>
export type PersistedConfig = z.infer<typeof persistedConfigSchema>
export type SkillOptions = Omit<SkillEntry, "assignments">

// Shared so `isStackCustom` compares against what `applyStack` writes.
// `sonnet` / `medium` are the resting values of the two segments with no "off".
export const DEFAULT_SKILL_OPTIONS = {
  model: "sonnet",
  effort: "medium",
  install: "plugin",
  scope: "project",
} as const satisfies SkillOptions

// The roster's one on/off rule: an explicit pin wins; otherwise an agent is on
// exactly when it holds at least one enabled skill. Selecting a skill enables
// its agents *through* this rule — nothing stores "on".
export const isAgentOn = (
  config: Pick<PersistedConfig, "skills" | "pins">,
  agentId: string
) =>
  config.pins[agentId] ??
  Object.values(config.skills).some(
    (entry) => entry.assignments[agentId]?.enabled
  )

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
  // Domain id → collapsed, sparse. Keyed by id rather than position so a
  // reordered catalog cannot collapse the wrong accordion.
  rosterCollapsed: z.record(z.string(), z.boolean()),
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
  pins: Object.fromEntries(
    Object.entries(config.pins).filter(([agentId]) => isKnownAgent(agentId))
  ),
})

// Pre-release policy: no migrations. Anything but the current version is
// discarded (`undefined`), which `merge` replaces with defaults. When the app
// has real users, migrations start here — the version seam already exists.
export const migrateConfig = (state: unknown, fromVersion: number): unknown =>
  fromVersion === PERSIST_VERSION ? state : undefined
