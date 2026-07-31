import {
  MATRIX_VERSION,
  SEED_VERSION,
  seedPayloadSchema,
  type SeedPayload,
  type SeedSkill,
} from "@workspace/matrix"

import {
  isAgentOn,
  pruneUnknownIds,
  type PersistedConfig,
  type SkillEntry,
} from "@/stores/persisted-schema"

import type { ConfigSelection } from "./derive"

// The wire keeps assignments as agent → load with presence meaning "live", so
// nothing the panel shows recessed may travel: rows switched off are dropped,
// and so are rows on pinned-off agents — the CLI must never install what the
// sharer's own counts exclude. Pins themselves do not travel: the seed
// contract predates them and an extra field would be silently dropped by
// consumers, so a pinned bare agent is a browser-only nicety for now.
// Everything the panel shows recessed stays behind: a row switched off, and a
// row on an agent the selection has pinned off.
const travelling = (entry: SkillEntry, isOn: (agentId: string) => boolean) =>
  Object.entries(entry.assignments).filter(
    ([agentId, assignment]) => assignment.enabled && isOn(agentId)
  )

const toSeedSkill = (
  entry: SkillEntry,
  isOn: (agentId: string) => boolean
): SeedSkill => ({
  model: entry.model,
  effort: entry.effort,
  install: entry.install,
  scope: entry.scope,
  assignments: Object.fromEntries(
    travelling(entry, isOn).map(([agentId, assignment]) => [
      agentId,
      assignment.load,
    ])
  ),
})

// Builds the exact JSON the config store (Cloudflare KV) will hold: the
// selection under the versioned envelope, nothing else. Read-only — the store
// is untouched, and `remembered` never appears because `ConfigSelection` is
// the same narrowing that keeps it out of every derivation. The parse makes
// "exact" literal: anything the contract doesn't know is stripped, so a field
// added to the store later cannot leak into payloads unnoticed.
export const toSeedPayload = (config: ConfigSelection): SeedPayload =>
  seedPayloadSchema.parse({
    v: SEED_VERSION,
    matrixVersion: MATRIX_VERSION,
    stackId: config.stackId,
    skills: Object.fromEntries(
      Object.entries(config.skills).map(([skillId, entry]) => [
        skillId,
        toSeedSkill(entry, (agentId) => isAgentOn(config, agentId)),
      ])
    ),
  })

const fromSeedSkill = (skill: SeedSkill): SkillEntry => ({
  model: skill.model,
  effort: skill.effort,
  install: skill.install,
  scope: skill.scope,
  assignments: Object.fromEntries(
    Object.entries(skill.assignments).map(([agentId, load]) => [
      agentId,
      { load, enabled: true },
    ])
  ),
})

// The inbound half. A payload may have been minted against any matrix version,
// so ids this catalog does not know are pruned — the same skip-don't-fail
// policy the CLI will apply. `remembered` starts empty: it never travels.
export const fromSeedPayload = (payload: SeedPayload): PersistedConfig =>
  pruneUnknownIds({
    stackId: payload.stackId,
    skills: Object.fromEntries(
      Object.entries(payload.skills).map(([skillId, skill]) => [
        skillId,
        fromSeedSkill(skill),
      ])
    ),
    remembered: {},
    pins: {},
  })
