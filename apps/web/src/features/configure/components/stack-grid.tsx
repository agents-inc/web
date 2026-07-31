import { CATALOG, STACKS, expandStack } from "@workspace/matrix"
import { Lattice, LatticeCell } from "@workspace/ui/components/lattice"
import { useMemo } from "react"

import { isStackCustom } from "@/features/configure/lib/derive"
import { useConfigStore } from "@/stores/config-store"
import { useUiStore } from "@/stores/ui-store"

type StackCell = {
  id: string | null
  name: string
  members: string
}

// Computed once: per render this would re-expand all 17 stacks on every
// keystroke in the filter bar.
const MEMBER_LIMIT = 5

const stackCells: StackCell[] = [
  {
    id: null,
    name: "Start from scratch",
    members: "no stack · pick every skill yourself",
  },
  ...STACKS.map((stack) => {
    const skillIds = expandStack(stack.id)?.skillIds ?? []
    const names = skillIds
      .map((skillId) => CATALOG.skillsById[skillId]?.displayName ?? skillId)
      .slice(0, MEMBER_LIMIT)
      .map((name) => name.toLowerCase())
    return {
      id: stack.id,
      name: stack.name,
      members:
        skillIds.length > MEMBER_LIMIT
          ? `${names.join(" · ")} · +${skillIds.length - MEMBER_LIMIT}`
          : names.join(" · "),
    }
  }),
]

// The test is `isStackCustom`, not "is anything selected": a stack's own
// expansion is not something the user chose, so browsing between stacks has
// nothing to lose. Prompting every time trains people to dismiss it unread.
export function StackGrid() {
  const stackId = useConfigStore((state) => state.stackId)
  const skills = useConfigStore((state) => state.skills)
  const pins = useConfigStore((state) => state.pins)
  const applyStack = useConfigStore((state) => state.applyStack)
  const requestStack = useUiStore((state) => state.requestStack)

  const edited = useMemo(
    () => isStackCustom({ stackId, skills, pins }),
    [stackId, skills, pins]
  )

  const choose = (id: string | null) => {
    if (id === stackId) return
    if (edited) requestStack(id)
    else applyStack(id)
  }

  return (
    <Lattice columns={4} role="group" aria-label="Stacks">
      {stackCells.map((cell) => (
        <LatticeCell
          key={cell.id ?? "scratch"}
          selected={cell.id === stackId}
          className="px-[0.8125rem] py-[0.6875rem]"
          role="button"
          tabIndex={0}
          // Otherwise the name swallows the member-skill line beneath it.
          aria-label={cell.name}
          aria-pressed={cell.id === stackId}
          onClick={() => choose(cell.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault()
              choose(cell.id)
            }
          }}
        >
          <span className="text-12 font-semibold text-ink">{cell.name}</span>
          <span
            className={`mt-1 font-mono text-9 font-normal ${
              cell.id === stackId ? "text-brand-ink" : "text-subtle"
            }`}
          >
            {cell.members}
          </span>
        </LatticeCell>
      ))}
    </Lattice>
  )
}
