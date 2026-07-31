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
import { useState } from "react"

import { useConfigStore } from "@/stores/config-store"
import type { LoadState, SkillEntry } from "@/stores/persisted-schema"

const MODELS = ["opus", "fable", "sonnet", "haiku"] as const
const EFFORTS = ["low", "medium", "high", "xhigh", "max", "ultra"] as const

// The design's unified matrix: the same four role columns over every
// implementation domain, with Meta held out as the stated exception. These are
// also exactly the roles auto-assignment targets, so the grid shows what a
// selection just did.
const ROLE_COLUMNS = [
  { id: "developer", short: "dev" },
  { id: "pm", short: "pm" },
  { id: "reviewer", short: "rev" },
  { id: "tester", short: "test" },
] as const

type RoleColumn = (typeof ROLE_COLUMNS)[number]

const CANONICAL_ROLES = new Set<string>(ROLE_COLUMNS.map((role) => role.id))

// Agent ids are `<domain>-<role>`; anything else has no role to read.
const roleOf = (agentId: string, domainId: Domain) =>
  agentId.startsWith(`${domainId}-`) ? agentId.slice(domainId.length + 1) : null

const isCanonicalRole = (role: string | null): role is string =>
  role !== null && CANONICAL_ROLES.has(role)

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

const implementationGroups = SUB_AGENT_GROUPS.filter(
  (group) => group.domainId !== "meta"
)

// Implementation domains that actually have at least one role-column agent.
//
// The grid is deliberately the whole story for these domains: the design draws
// the four roles and nothing else, because the CLI is unifying every domain
// onto exactly this set (docs/subagents-todo.md). The catalogue's leftovers —
// web-architecture, web-pattern-critique, the researchers — still take skills
// from a stack and still appear in the roster, where they can be switched off;
// they are just not hand-assignable here.
type MatrixGroup = {
  domainId: Domain
  label: string
  byRole: Map<string, SubAgent>
}

const matrixGroups: MatrixGroup[] = implementationGroups
  .map((group) => ({
    domainId: group.domainId,
    label: group.label,
    byRole: canonicalAgentsByRole(group),
  }))
  .filter(hasAnyRole)

// The exception, folded shut by default behind the design's `＋`.
const metaAgents = SUB_AGENT_GROUPS.filter(
  (group) => group.domainId === "meta"
).flatMap((group) => group.agents)

// Reads as the word it is: nothing, `lazy`, or `pre`.
const loadWord = (state: LoadState | null) =>
  state === "preloaded" ? "pre" : (state ?? "")

// A switched-off row reads as unassigned here: the matrix answers "where does
// this install", and cycling an off cell starts it over at lazy.
const liveLoad = (entry: SkillEntry, agentId: string): LoadState | null => {
  const assignment = entry.assignments[agentId]
  return assignment?.enabled ? assignment.load : null
}

// An agent row the grid cannot place: the same cell, labelled and full width.
function LabelledAgentCell({
  agent,
  state,
  onCycle,
}: {
  agent: SubAgent
  state: LoadState | null
  onCycle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onCycle}
      // The tri-state styling comes from the one CVA so the two can never drift.
      className={cn(
        matrixCellVariants({ state: state ?? "empty" }),
        "justify-between px-[0.3125rem]"
      )}
    >
      <span className="truncate">{agent.id}</span>
      <span>{loadWord(state)}</span>
    </button>
  )
}

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
  const [metaOpen, setMetaOpen] = useState(false)

  // Both close over the open skill, so they live here rather than at module
  // scope — but they are still named, so the grid below reads as one line.
  const toMatrixCell = (group: MatrixGroup, role: RoleColumn) => {
    const agent = group.byRole.get(role.id)
    if (!agent) return null

    return {
      key: agent.id,
      label: role.short,
      state: liveLoad(entry, agent.id),
      onCycle: () => cycleAssignment(skillId, agent.id),
    }
  }

  const toMatrixRow = (group: MatrixGroup): MatrixRow => ({
    key: group.domainId,
    label: group.label,
    cells: ROLE_COLUMNS.map((role) => toMatrixCell(group, role)),
  })

  const rows = matrixGroups.map(toMatrixRow)

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

        <button
          type="button"
          aria-expanded={metaOpen}
          onClick={() => setMetaOpen((open) => !open)}
          className="group flex w-full cursor-pointer items-center gap-2 pt-2 text-left"
        >
          <span className="font-mono text-8 font-semibold tracking-[.06em] text-ink-3 uppercase">
            Meta
          </span>
          <span className="ml-auto font-mono text-10 font-normal text-dots group-hover:text-ink">
            {metaOpen ? "−" : "＋"}
          </span>
        </button>

        {metaOpen && (
          <div className="mt-[0.375rem] flex flex-col gap-[0.125rem]">
            {metaAgents.map((agent) => (
              <LabelledAgentCell
                key={agent.id}
                agent={agent}
                state={liveLoad(entry, agent.id)}
                onCycle={() => cycleAssignment(skillId, agent.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
