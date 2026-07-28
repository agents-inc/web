import {
  SUB_AGENT_GROUPS,
  type Domain,
  type SubAgent,
  type SubAgentGroup,
} from "@workspace/matrix"
import {
  MatrixGrid,
  matrixCellVariants,
  type MatrixRow,
} from "@workspace/ui/components/matrix-grid"
import {
  FieldLabel,
  Segmented,
  SegmentedItem,
} from "@workspace/ui/components/segmented"
import { cn } from "@workspace/ui/lib/utils"

import { useConfigStore } from "@/stores/config-store"
import type { LoadState, SkillEntry } from "@/stores/persisted-schema"

const MODELS = ["opus", "sonnet", "haiku"] as const
const EFFORTS = ["none", "low", "med", "high"] as const

// The four canonical roles the design's matrix has columns for. Real agent ids
// are `<domain>-<role>`, and 14 of the 23 agents fall into this grid; the other
// nine (web-pm, web-architecture, api-pm, the meta agents…) have roles the
// matrix has no column for and are listed beneath it instead, so nothing in
// the catalogue is unassignable.
const ROLE_COLUMNS = [
  { id: "developer", short: "dev" },
  { id: "reviewer", short: "review" },
  { id: "tester", short: "test" },
  { id: "researcher", short: "research" },
] as const

const CANONICAL_ROLES = new Set<string>(ROLE_COLUMNS.map((role) => role.id))

// Agent ids are `<domain>-<role>`; anything else has no role to read.
const roleOf = (agentId: string, domainId: Domain) =>
  agentId.startsWith(`${domainId}-`) ? agentId.slice(domainId.length + 1) : null

const isCanonicalRole = (role: string | null): role is string =>
  role !== null && CANONICAL_ROLES.has(role)

const fitsTheGrid = (agent: SubAgent, domainId: Domain) =>
  isCanonicalRole(roleOf(agent.id, domainId))

const canonicalAgentsByRole = (group: SubAgentGroup) => {
  const byRole = new Map<string, SubAgent>()

  for (const agent of group.agents) {
    const role = roleOf(agent.id, group.domainId)
    if (isCanonicalRole(role)) byRole.set(role, agent)
  }

  return byRole
}

const hasAnyRole = (group: { byRole: Map<string, SubAgent> }) =>
  group.byRole.size > 0

// Domains that actually have at least one canonical-role agent.
const matrixGroups = SUB_AGENT_GROUPS.map((group) => ({
  domainId: group.domainId,
  label: group.label,
  byRole: canonicalAgentsByRole(group),
})).filter(hasAnyRole)

// Everything the 4-column grid cannot express.
const extraAgents = SUB_AGENT_GROUPS.flatMap((group) =>
  group.agents.filter((agent) => !fitsTheGrid(agent, group.domainId))
)

// Reads as the word it is: nothing, `lazy`, or `pre`.
const loadWord = (state: LoadState | null) =>
  state === "preloaded" ? "pre" : (state ?? "")

// The `•••` popover. Opens to the right of its cell, top-aligned, and flips to
// the left for cells in the last column so it cannot escape the main column.
//
// Sections are separated by whitespace only — the design uses no rules inside
// the panel.
export function SkillOptionsPanel({
  skillId,
  entry,
  flip,
}: {
  skillId: string
  entry: SkillEntry
  flip: boolean
}) {
  const setSkillOption = useConfigStore((state) => state.setSkillOption)
  const cycleAssignment = useConfigStore((state) => state.cycleAssignment)

  const rows: MatrixRow[] = matrixGroups.map((group) => ({
    key: group.domainId,
    label: group.label,
    cells: ROLE_COLUMNS.map((role) => {
      const agent = group.byRole.get(role.id)
      if (!agent) return null
      return {
        key: agent.id,
        label: role.short,
        state: entry.assignments[agent.id] ?? null,
        onCycle: () => cycleAssignment(skillId, agent.id),
      }
    }),
  }))

  return (
    <div
      role="group"
      aria-label="Skill options"
      // The panel lives inside the cell, whose click toggles selection. Without
      // this, configuring a skill would also deselect it.
      onClick={(event) => event.stopPropagation()}
      className={`absolute top-0 z-30 w-[18.5rem] border border-rule bg-cell pt-1 pb-2 text-left shadow-panel ${
        flip ? "right-[calc(100%+0.3125rem)]" : "left-[calc(100%+0.3125rem)]"
      }`}
    >
      <FieldLabel first>Model</FieldLabel>
      <Segmented>
        {MODELS.map((model) => (
          <SegmentedItem
            key={model}
            active={entry.model === model}
            onClick={() => setSkillOption(skillId, { model })}
          >
            {model}
          </SegmentedItem>
        ))}
      </Segmented>

      <FieldLabel>Thinking effort</FieldLabel>
      <Segmented>
        {EFFORTS.map((effort) => (
          <SegmentedItem
            key={effort}
            active={entry.effort === effort}
            onClick={() => setSkillOption(skillId, { effort })}
          >
            {effort}
          </SegmentedItem>
        ))}
      </Segmented>

      {/* Mirrors the cell's two badges — the design requires they stay in sync,
          which they do by both reading and writing the same store fields. */}
      <FieldLabel>Install mode</FieldLabel>
      <Segmented>
        {(["plugin", "eject"] as const).map((install) => (
          <SegmentedItem
            key={install}
            active={entry.install === install}
            onClick={() => setSkillOption(skillId, { install })}
          >
            {install}
          </SegmentedItem>
        ))}
      </Segmented>
      <Segmented>
        {(["project", "global"] as const).map((scope) => (
          <SegmentedItem
            key={scope}
            active={entry.scope === scope}
            onClick={() => setSkillOption(skillId, { scope })}
          >
            {scope}
          </SegmentedItem>
        ))}
      </Segmented>

      <FieldLabel>Sub-agents</FieldLabel>
      <div className="px-[0.625rem] pt-[0.125rem]">
        <MatrixGrid
          columns={ROLE_COLUMNS.map((role) => role.short)}
          rows={rows}
        />

        {extraAgents.length > 0 && (
          <div className="mt-[0.375rem] flex flex-col gap-[0.125rem]">
            {extraAgents.map((agent) => {
              const state = entry.assignments[agent.id] ?? null
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => cycleAssignment(skillId, agent.id)}
                  // Same cell as the matrix above, just labelled and full width
                  // — the tri-state styling comes from the one CVA so the two
                  // can never drift.
                  className={cn(
                    matrixCellVariants({ state: state ?? "empty" }),
                    "justify-between px-[0.3125rem]"
                  )}
                >
                  <span className="truncate">{agent.id}</span>
                  <span>{loadWord(state)}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
