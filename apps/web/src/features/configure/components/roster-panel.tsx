import { DOMAIN_LABELS } from "@workspace/matrix"
import { Button } from "@workspace/ui/components/button"

import {
  selectAgentsInUse,
  selectAvailableAgents,
  summarize,
} from "@/features/configure/lib/derive"
import type { AddedSkill } from "@/stores/added-skills-store"
import type { PersistedConfig } from "@/stores/persisted-schema"
import { useUiStore } from "@/stores/ui-store"

function SectionHeader({
  label,
  collapsed,
  onToggle,
  className = "",
}: {
  label: string
  collapsed: boolean
  onToggle: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      className={`group flex w-full cursor-pointer items-center gap-2 px-0.5 pb-3 font-mono text-10 font-medium tracking-[.14em] text-muted-foreground uppercase ${className}`}
    >
      {label}
      <span className="ml-auto font-mono text-11 font-normal tracking-normal text-faint group-hover:text-ink">
        {collapsed ? "＋" : "−"}
      </span>
    </button>
  )
}

/**
 * The right column: every sub-agent that exists, then the ones actually
 * holding skills with their skill lists, then the pinned footer.
 *
 * Everything here is derived from `assignments` — the panel stores nothing.
 * Load state is a word (`preloaded` / `lazy`), right-aligned, never an icon.
 */
export function RosterPanel({
  config,
  added,
}: {
  config: PersistedConfig
  added: AddedSkill[]
}) {
  const collapsed = useUiStore((state) => state.rosterCollapsed)
  const toggleSection = useUiStore((state) => state.toggleRosterSection)
  const setDialog = useUiStore((state) => state.setDialog)

  const available = selectAvailableAgents(config)
  const inUse = selectAgentsInUse(config, added)
  const stats = summarize(config)

  return (
    <aside className="sticky top-0 flex h-svh flex-col overflow-hidden border-l border-divider pt-gutter pr-2.5 pb-6 pl-4">
      <div className="min-h-0 flex-1 overflow-auto pr-2">
        <SectionHeader
          label="Available sub-agents"
          collapsed={collapsed.available}
          onToggle={() => toggleSection("available")}
        />
        {!collapsed.available &&
          available.map(({ agent, count }) => (
            <div key={agent.id} className="flex items-baseline gap-1.5 p-0.5">
              <span
                className={`text-10_5 ${count > 0 ? "text-ink" : "text-muted-foreground"}`}
              >
                {agent.domainId}
              </span>
              <span className="text-10_5 text-brand-ink">
                {agent.label.toLowerCase()}
              </span>
              <span
                className={`ml-auto font-mono text-8 font-medium tracking-[.05em] uppercase ${
                  count > 0 ? "text-muted-foreground" : "text-brand-faint"
                }`}
              >
                {count > 0 ? `${count} skills` : "—"}
              </span>
            </div>
          ))}

        <SectionHeader
          label="In use sub-agents"
          collapsed={collapsed.inUse}
          onToggle={() => toggleSection("inUse")}
          className="mt-4.5 border-t border-divider pt-4.5"
        />
        {!collapsed.inUse &&
          (inUse.length === 0 ? (
            <p className="px-0.5 text-10_5 text-muted-foreground italic">
              No sub-agents assigned yet.
            </p>
          ) : (
            inUse.map(({ agent, skills }) => (
              <div key={agent.id} className="px-0.5 pb-5">
                <div className="flex items-baseline gap-[0.4375rem] pb-1">
                  <span className="font-mono text-9 font-semibold tracking-[.1em] text-ink uppercase">
                    {DOMAIN_LABELS[agent.domainId]}
                  </span>
                  <span className="font-mono text-9 font-normal text-brand-ink">
                    {agent.label.toLowerCase()}
                  </span>
                </div>
                {skills.map((skill) => (
                  <div
                    key={skill.id}
                    className="flex items-baseline gap-2 py-0.5"
                  >
                    <span className="text-11 text-ink-2">
                      {skill.displayName}
                    </span>
                    <span
                      className={`ml-auto font-mono text-8 font-medium tracking-[.06em] uppercase ${
                        skill.load === "preloaded"
                          ? "text-brand-ink"
                          : "text-muted-foreground"
                      }`}
                    >
                      {skill.load}
                    </span>
                  </div>
                ))}
              </div>
            ))
          ))}
      </div>

      <div className="flex-none border-t border-divider px-0.5 pt-3.5">
        <p className="pb-2.5 font-mono text-9_5 leading-[1.7] font-normal text-subtle">
          {stats.skillCount} skills · {stats.agentCount} sub-agents ·{" "}
          {stats.assignmentCount} assignments · {stats.preloadedCount} preloaded
        </p>
        <Button variant="full" onClick={() => setDialog("install")}>
          Install
        </Button>
      </div>
    </aside>
  )
}
