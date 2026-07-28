import { CATALOG, STACKS, SUB_AGENTS_BY_ID } from "@workspace/matrix"
import { z } from "zod"

/** Bump when the persisted shape changes, and add a case to `migrateConfig`. */
export const PERSIST_VERSION = 3

/** Not assigned is the absence of a key, so only the two live states appear. */
export const loadStateSchema = z.enum(["lazy", "preloaded"])

export const skillEntrySchema = z.object({
  model: z.enum(["opus", "sonnet", "haiku"]),
  effort: z.enum(["none", "low", "med", "high"]),
  install: z.enum(["plugin", "eject"]),
  scope: z.enum(["project", "global"]),
  /**
   * Sub-agent id → how that agent loads the skill. This is the *single source
   * of truth* for assignment: the per-cell agent count, the roster panel and
   * the install inventory are all derived from it and none of them store their
   * own copy. The v1 shape kept `agents: string[]` beside a skill-wide
   * `preloaded: boolean`, which could not express "preloaded for the tester,
   * lazy for the developer" — the granularity the CLI actually has.
   */
  assignments: z.record(z.string(), loadStateSchema),
})

export const persistedConfigSchema = z.object({
  stackId: z.string().nullable(),
  /**
   * Sparse — presence in this map *is* selection, so there is no `selected`
   * flag to keep in sync with it. Ids are plain strings rather than
   * `z.enum(SKILL_IDS)` because an id that vanished from a regenerated catalog
   * is a pruning concern, not a shape error: one stale id should not throw
   * away an otherwise-valid saved configuration.
   */
  skills: z.record(z.string(), skillEntrySchema),
  /**
   * Configuration for skills that are *not currently selected*, kept so that
   * deselecting is not destructive: nine sub-agent assignments take a dozen
   * clicks to build and one misclick to lose, and the cell gives no warning
   * because deselect reads as "not included" rather than "erase my work".
   *
   * Only entries worth keeping land here — see `isWorthRemembering`. Without
   * that guard this map would grow monotonically with every cell ever clicked
   * while holding nothing anyone would miss.
   */
  remembered: z.record(z.string(), skillEntrySchema),
})

export type LoadState = z.infer<typeof loadStateSchema>
export type SkillEntry = z.infer<typeof skillEntrySchema>
export type PersistedConfig = z.infer<typeof persistedConfigSchema>
export type SkillOptions = Omit<SkillEntry, "assignments">

/**
 * What a freshly-selected skill looks like before the user touches the panel.
 * Shared so `isStackCustom` compares against the same defaults `applyStack`
 * writes. `sonnet` / `med` are the design's resting values for the two
 * segmented rows that have no "off" position.
 */
export const DEFAULT_SKILL_OPTIONS = {
  model: "sonnet",
  effort: "med",
  install: "plugin",
  scope: "project",
} as const satisfies SkillOptions

/**
 * Does this entry carry any information at all?
 *
 * The test is not "did the user customise it" — a skill applied by a stack
 * arrives with its sub-agent assignments already populated, and losing those
 * to a stray click is exactly what this guard exists to prevent. What is
 * dropped is the genuinely empty entry: default options, no assignments, which
 * is what a blank skill selected and immediately deselected looks like.
 * Restoring one of those is indistinguishable from creating it fresh, so
 * keeping it would grow the map with every cell ever clicked for no benefit.
 */
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

/**
 * Drops references the current catalog no longer knows about. The catalog is
 * regenerated from the CLI, so skills and stacks come and go between releases
 * while a user's localStorage does not.
 *
 * Session-added skills are deliberately *not* rescued here: they are never
 * written to the persisted map in the first place (see `config-store`), so a
 * reload drops them, which is the intended behaviour for now.
 */
const pruneSkillMap = (skills: PersistedConfig["skills"]) =>
  Object.fromEntries(
    Object.entries(skills)
      .filter(([skillId]) => skillId in CATALOG.skillsById)
      .map(([skillId, entry]) => [
        skillId,
        {
          ...entry,
          assignments: Object.fromEntries(
            Object.entries(entry.assignments).filter(
              ([agentId]) => agentId in SUB_AGENTS_BY_ID
            )
          ),
        },
      ])
  )

export const pruneUnknownIds = (config: PersistedConfig): PersistedConfig => ({
  stackId: STACKS.some((stack) => stack.id === config.stackId)
    ? config.stackId
    : null,
  skills: pruneSkillMap(config.skills),
  remembered: pruneSkillMap(config.remembered),
})

/** The v1 shape, kept only so the v1 → v2 migration can read it. */
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

/**
 * v1 → v2 folds `agents[]` + a skill-wide `preloaded` flag into per-agent load
 * states, and adds the two options the v5 options panel introduced. A v1 entry
 * that was explicitly deselected is dropped rather than migrated, because in
 * v2 presence in the map is what selection means.
 */
const migrateV1ToV2 = (state: unknown): unknown => {
  const parsed = persistedConfigV1Schema.safeParse(state)
  if (!parsed.success) return undefined

  return {
    stackId: parsed.data.stackId,
    skills: Object.fromEntries(
      Object.entries(parsed.data.skills)
        .filter(([, entry]) => entry.selected)
        .map(([skillId, entry]) => [
          skillId,
          {
            ...DEFAULT_SKILL_OPTIONS,
            install: entry.install,
            scope: entry.scope,
            assignments: Object.fromEntries(
              entry.agents.map((agentId) => [
                agentId,
                entry.preloaded ? "preloaded" : "lazy",
              ])
            ),
          },
        ])
    ),
  }
}

/**
 * v2 → v3 introduces `remembered`. Nothing existing maps into it — a v2 config
 * simply had nowhere to keep the configuration of a deselected skill — so it
 * starts empty.
 */
const migrateV2ToV3 = (state: unknown): unknown =>
  state && typeof state === "object" ? { ...state, remembered: {} } : undefined

/**
 * The exhaustive switch means adding PERSIST_VERSION 4 without writing its
 * migration is a type error, not silent data loss. Returning `undefined`
 * discards the persisted state, which `merge` then replaces with defaults.
 */
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
