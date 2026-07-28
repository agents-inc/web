import { Badge } from "@workspace/ui/components/badge"
import { LatticeCell } from "@workspace/ui/components/lattice"
import { useEffect, useRef } from "react"

import { SkillIcon } from "@/components/skill-icon"
import type { SkillCellView } from "@/features/configure/lib/derive"
import { useConfigStore } from "@/stores/config-store"
import { useUiStore } from "@/stores/ui-store"
import { SkillOptionsPanel } from "./skill-options-panel"

// The whole cell toggles selection, so every control inside stops propagation
// — otherwise flipping Install to Eject would also deselect the skill.
export function SkillCell({
  view,
  column,
  columns,
}: {
  view: SkillCellView
  column: number
  columns: number
}) {
  const toggleSkill = useConfigStore((state) => state.toggleSkill)
  const setSkillOption = useConfigStore((state) => state.setSkillOption)
  const openPanelSkillId = useUiStore((state) => state.openPanelSkillId)
  const togglePanel = useUiStore((state) => state.togglePanel)
  const openPanel = useUiStore((state) => state.openPanel)

  const { skill, entry, selected, incompatible, agentCount } = view
  const open = openPanelSkillId === skill.id
  const cellRef = useRef<HTMLDivElement>(null)

  const stop = (event: { stopPropagation: () => void }) =>
    event.stopPropagation()

  // Options only apply once selected, so opening selects first. Otherwise the
  // ••• is a dead click on every unselected cell.
  const requestPanel = () => {
    if (!selected) {
      toggleSkill(skill.id)
      openPanel(skill.id)
      return
    }
    togglePanel(skill.id)
  }

  // Same reasoning as `requestPanel` — a badge must never be a dead click.
  const flip = (patch: Parameters<typeof setSkillOption>[1]) => {
    if (!selected) toggleSkill(skill.id)
    setSkillOption(skill.id, patch)
  }

  // `pointerdown`, not `click`, so the panel is gone before the press
  // resolves. Presses inside are ignored, or the ••• would close then reopen.
  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      if (!cellRef.current?.contains(event.target as Node)) openPanel(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") openPanel(null)
    }

    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open, openPanel])

  return (
    <LatticeCell
      ref={cellRef}
      selected={selected}
      disabled={incompatible}
      overflow={selected || open ? "visible" : "clip"}
      className={`px-3 py-[0.6875rem] ${open ? "z-58" : ""}`}
      role="button"
      tabIndex={incompatible ? -1 : 0}
      // Otherwise the accessible name is every string in the cell, run together.
      aria-label={skill.displayName}
      aria-pressed={selected}
      aria-disabled={incompatible || undefined}
      title={view.incompatibleReason}
      onClick={() => toggleSkill(skill.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          toggleSkill(skill.id)
        }
      }}
    >
      <div className="flex items-start gap-2.5">
        <SkillIcon
          monogram={skill.monogram}
          slug={skill.slug}
          selected={selected}
        />

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate text-12 leading-[1.25] font-semibold text-ink">
              {skill.displayName}
            </span>
            {skill.added && <Badge variant="tag">added</Badge>}
          </div>
          <div className="mt-0.5 flex min-w-0 items-baseline gap-1.5 font-mono text-9 font-medium text-muted-foreground">
            <span className="truncate">{skill.description}</span>
          </div>
        </div>

        <button
          type="button"
          aria-label={`Options for ${skill.displayName}`}
          aria-expanded={open}
          onClick={(event) => {
            stop(event)
            requestPanel()
          }}
          className={`ml-auto shrink-0 cursor-pointer px-[0.1875rem] py-px text-10 leading-[.9] font-bold tracking-[-0.03125rem] [writing-mode:vertical-rl] ${
            open ? "text-ink" : "text-dots hover:text-subtle"
          }`}
        >
          •••
        </button>
      </div>

      <div className="mt-[0.5625rem] -ml-[0.3125rem] flex items-center gap-[0.125rem]">
        <Badge
          interactive
          alt={entry?.install === "eject"}
          render={
            <button
              type="button"
              // "plugin, button" tells a screen reader nothing on its own.
              aria-label={`Install mode: ${entry?.install ?? "plugin"}`}
              onClick={(event) => {
                stop(event)
                flip({
                  install: entry?.install === "eject" ? "plugin" : "eject",
                })
              }}
            />
          }
        >
          {entry?.install ?? "plugin"}
        </Badge>

        <Badge
          interactive
          alt={entry?.scope === "global"}
          render={
            <button
              type="button"
              aria-label={`Scope: ${entry?.scope ?? "project"}`}
              onClick={(event) => {
                stop(event)
                flip({
                  scope: entry?.scope === "global" ? "project" : "global",
                })
              }}
            />
          }
        >
          {entry?.scope ?? "project"}
        </Badge>

        {/* Derived from assignments, never stored on the skill. */}
        {selected && (
          <button
            type="button"
            onClick={(event) => {
              stop(event)
              requestPanel()
            }}
            className={`ml-auto shrink-0 cursor-pointer py-[0.1875rem] font-mono text-8 font-medium tracking-[.06em] whitespace-nowrap uppercase ${
              open ? "text-ink" : "text-muted-foreground hover:text-ink"
            }`}
          >
            {agentCount === 1 ? "1 agent" : `${agentCount} agents`}
          </button>
        )}
      </div>

      {open && entry && (
        <SkillOptionsPanel
          skillId={skill.id}
          entry={entry}
          flip={column === columns - 1}
        />
      )}
    </LatticeCell>
  )
}
