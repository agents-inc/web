import { DOMAIN_LABELS, type SubAgent } from "@workspace/matrix"
import { Button } from "@workspace/ui/components/button"
import { useEffect, useRef, useState } from "react"

import {
  selectRosterGroups,
  summarize,
  type RosterAgentRow,
  type RosterSkillRow,
} from "@/features/configure/lib/derive"
import {
  useShareLink,
  type ShareState,
} from "@/features/configure/lib/use-share-link"
import type { AddedSkill } from "@/stores/added-skills-store"
import type { ConfigSelection } from "@/features/configure/lib/derive"
import { useConfigStore } from "@/stores/config-store"
import { useUiStore } from "@/stores/ui-store"

const SHARE_LABELS: Record<ShareState, string> = {
  idle: "Share",
  sharing: "Sharing…",
  copied: "Link copied",
  failed: "Sharing failed",
}

// The domain band is exactly this tall, and each pinned header offsets by one
// band per index — that is what makes them stack while scrolling.
const BAND_REM = 1.625

// The where-used overlay, measured at hover time — position is geometry, not
// configuration, so none of it is stored.
type UseTip = {
  rows: { agent: SubAgent; here: boolean; newDomain: boolean }[]
  side: "right" | "left"
  x: number | null
  right: number | null
  y: number
}

const tipName = (agent: SubAgent) =>
  `${DOMAIN_LABELS[agent.domainId].toLowerCase()} ${agent.label.toLowerCase()}`

const TIP_ID = "where-used-tip"

// Geometry, all measured at hover time. The gap is the air between the tooltip
// and whatever it is anchored to; the margin is how close it may come to the
// viewport edge; and it needs this much room on the right to open that way.
const TIP_GAP_PX = 7
const VIEWPORT_MARGIN_PX = 8
const TIP_MIN_ROOM_PX = 160

// Rows and domain gaps at the app's 110% scale, plus the frame. An estimate,
// but only the upward clamp consumes it, so a long list still opens intact.
const TIP_ROW_PX = 15.5
const TIP_DOMAIN_GAP_PX = 7
const TIP_FRAME_PX = 16

// Names only, with the agent being pointed from marked and a break wherever
// the domain changes — the tooltip's whole content.
const toTipRows = (usedBy: SubAgent[], fromAgentId: string) =>
  usedBy.map((agent, index) => ({
    agent,
    here: agent.id === fromAgentId,
    newDomain: index > 0 && usedBy[index - 1]?.domainId !== agent.domainId,
  }))

const estimateTipHeight = (rows: UseTip["rows"]) => {
  const domainBreaks = rows.filter((row) => row.newDomain).length

  return (
    rows.length * TIP_ROW_PX + domainBreaks * TIP_DOMAIN_GAP_PX + TIP_FRAME_PX
  )
}

// Opens to the right of the number, or flips when there is no room — and when
// it flips it clears the whole panel, anchored to the panel's edge rather than
// the number's. Clamped against its own height so a long list opens upward
// near the viewport bottom.
const placeTip = (
  anchor: DOMRect,
  panel: DOMRect | undefined,
  height: number
): Omit<UseTip, "rows"> => {
  const fits = window.innerWidth - anchor.right > TIP_MIN_ROOM_PX
  const highestTop = window.innerHeight - height - VIEWPORT_MARGIN_PX

  return {
    side: fits ? "right" : "left",
    x: fits ? Math.round(anchor.right + TIP_GAP_PX) : null,
    right:
      fits || !panel
        ? null
        : Math.round(window.innerWidth - panel.left + TIP_GAP_PX),
    y: Math.max(
      VIEWPORT_MARGIN_PX,
      Math.min(anchor.top - VIEWPORT_MARGIN_PX, highestTop)
    ),
  }
}

function WhereUsedTip({ tip }: { tip: UseTip }) {
  return (
    <div
      id={TIP_ID}
      role="tooltip"
      className={`fixed z-[120] border border-tip-border bg-page px-[0.5625rem] py-1.5 ${
        tip.side === "left"
          ? "border-r-2 border-r-brand shadow-[-6px_6px_18px_rgba(28,26,22,.13)]"
          : "border-l-2 border-l-brand shadow-[6px_6px_18px_rgba(28,26,22,.13)]"
      }`}
      style={{
        top: tip.y,
        left: tip.x ?? "auto",
        right: tip.right ?? "auto",
      }}
    >
      {tip.rows.map(({ agent, here, newDomain }) => (
        <div
          key={agent.id}
          className={`flex items-baseline gap-[0.4375rem] py-px whitespace-nowrap ${
            newDomain ? "mt-1.5" : ""
          }`}
        >
          <span
            className={`text-10 ${
              here
                ? "font-medium text-brand-ink"
                : "font-normal text-roster-ink"
            }`}
          >
            {tipName(agent)}
          </span>
        </div>
      ))}
    </div>
  )
}

// One assignment line: bullet · name · load word · where-used. A 4-track grid
// so the bullet occupies the first track and every skill name shares the
// agents' flush left edge — indentation by structure, not padding.
function SkillRow({
  skill,
  agentOn,
  agentId,
  onShowUses,
  onHideUses,
}: {
  skill: RosterSkillRow
  agentOn: boolean
  agentId: string
  onShowUses: (anchor: HTMLElement, skill: RosterSkillRow) => void
  onHideUses: () => void
}) {
  const toggleAssignmentEnabled = useConfigStore(
    (state) => state.toggleAssignmentEnabled
  )
  const flipAssignmentLoad = useConfigStore((state) => state.flipAssignmentLoad)

  // The row reads as off when either switch is off — its own, or the agent's.
  const live = agentOn && skill.enabled

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={skill.enabled}
      aria-label={`${skill.displayName} on ${agentId}`}
      onClick={() => toggleAssignmentEnabled(skill.id, agentId)}
      onKeyDown={(event) => {
        // Only when the row itself is focused — the nested load-word and
        // where-used buttons must keep their own native activation.
        if (event.target !== event.currentTarget) return
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          toggleAssignmentEnabled(skill.id, agentId)
        }
      }}
      className="-mx-1 grid w-[calc(100%+0.5rem)] cursor-pointer grid-cols-[1rem_minmax(0,1fr)_1.875rem_1.625rem] items-center px-1 py-0.5 hover:bg-skill-hover"
    >
      <span
        aria-hidden
        className={`mx-0.5 block size-[0.3125rem] ${
          live
            ? "bg-brand"
            : "bg-transparent shadow-[inset_0_0_0_1px_var(--color-hairline)]"
        }`}
      />
      <span
        className={`truncate text-10_5 leading-[1.35] font-normal ${
          live ? "text-brand" : "text-roster-off"
        }`}
      >
        {skill.displayName}
      </span>
      {/* `pre` / `lazy` — never "preloaded" — and never amber: that is
          reserved for the name's on-state. Click flips this agent's copy. */}
      <button
        type="button"
        aria-label={`Load mode: ${skill.load}`}
        onClick={(event) => {
          event.stopPropagation()
          flipAssignmentLoad(skill.id, agentId)
        }}
        className={`cursor-pointer pr-1.5 text-right font-mono text-8 font-medium tracking-[.06em] uppercase hover:text-roster-ink ${
          live && skill.load === "preloaded"
            ? "text-matrix-ink"
            : "text-roster-off"
        }`}
      >
        {skill.load === "preloaded" ? "pre" : "lazy"}
      </button>
      {skill.usedBy.length > 1 ? (
        <button
          type="button"
          aria-label={`Used by ${skill.usedBy.length} sub-agents`}
          aria-describedby={TIP_ID}
          onMouseEnter={(event) => onShowUses(event.currentTarget, skill)}
          onMouseLeave={onHideUses}
          // Keyboard users get the same answer: focus opens, blur closes.
          onFocus={(event) => onShowUses(event.currentTarget, skill)}
          onBlur={onHideUses}
          onClick={(event) => event.stopPropagation()}
          className="mr-0.5 flex size-[0.8125rem] cursor-help items-center justify-center justify-self-end font-mono text-7_5 font-medium text-use-ink hover:bg-wash hover:text-brand-ink"
        >
          {skill.usedBy.length}
        </button>
      ) : (
        <span />
      )}
    </div>
  )
}

function AgentBlock({
  row,
  flashed,
  onShowUses,
  onHideUses,
}: {
  row: RosterAgentRow
  flashed: boolean
  onShowUses: (anchor: HTMLElement, skill: RosterSkillRow) => void
  onHideUses: () => void
}) {
  const toggleAgentPin = useConfigStore((state) => state.toggleAgentPin)
  const { agent, on, skills } = row

  return (
    <div className="pb-2">
      {/* State is colour only — no checkbox, no bracket. Click pins the agent
          to the opposite of what it currently derives to. */}
      <button
        type="button"
        aria-pressed={on}
        onClick={() => toggleAgentPin(agent.id)}
        // The pulse is the row's own tint and nothing else — the prototype's
        // amber left bar reads as a second, competing marker at this size.
        className={`-mx-1 flex w-[calc(100%+0.5rem)] cursor-pointer items-baseline px-1 py-0.5 text-left transition-colors duration-[250ms] ${
          flashed ? "bg-flash" : "hover:bg-roster-hover"
        }`}
      >
        <span
          className={`text-11_5 ${
            flashed
              ? "font-medium text-brand-ink"
              : on
                ? "font-medium text-roster-ink"
                : "font-normal text-roster-off"
          }`}
        >
          {agent.label.toLowerCase()}
        </span>
      </button>

      {skills.map((skill) => (
        <SkillRow
          key={skill.id}
          skill={skill}
          agentOn={on}
          agentId={agent.id}
          onShowUses={onShowUses}
          onHideUses={onHideUses}
        />
      ))}

      {on && skills.length === 0 && (
        <p className="pl-[0.5625rem] text-10 font-normal text-roster-empty">
          no skills — base agent
        </p>
      )}
    </div>
  )
}

// The right column: every sub-agent there is, grouped under stacking sticky
// domain bands, with each agent's assignments inline. Everything is derived
// from `assignments` + `pins` — the panel stores nothing but hover geometry.
export function RosterPanel({
  config,
  added,
}: {
  config: ConfigSelection
  added: AddedSkill[]
}) {
  const collapsed = useUiStore((state) => state.rosterCollapsed)
  const toggleRosterDomain = useUiStore((state) => state.toggleRosterDomain)
  const flashedAgentIds = useUiStore((state) => state.flashedAgentIds)
  const setDialog = useUiStore((state) => state.setDialog)

  const asideRef = useRef<HTMLElement>(null)
  const [tip, setTip] = useState<UseTip | null>(null)

  const groups = selectRosterGroups(config, added)
  const stats = summarize(config)
  const { state: shareState, share } = useShareLink(config)
  const flashed = new Set(flashedAgentIds)

  // The tooltip's position was measured against a scroll state that no longer
  // holds — any scroll while it is open dismisses it. Capture phase, because
  // the roster's own scroller does not bubble.
  useEffect(() => {
    if (!tip) return

    const close = () => setTip(null)
    window.addEventListener("scroll", close, { capture: true, passive: true })
    return () => window.removeEventListener("scroll", close, { capture: true })
  }, [tip])

  const showUses = (
    anchor: HTMLElement,
    skill: RosterSkillRow,
    fromAgentId: string
  ) => {
    const rows = toTipRows(skill.usedBy, fromAgentId)

    setTip({
      rows,
      ...placeTip(
        anchor.getBoundingClientRect(),
        asideRef.current?.getBoundingClientRect(),
        estimateTipHeight(rows)
      ),
    })
  }

  return (
    <aside
      ref={asideRef}
      className="sticky top-0 flex h-svh flex-col overflow-hidden border-l border-divider pt-gutter pr-2.5 pb-6"
    >
      {tip && <WhereUsedTip tip={tip} />}

      <div className="rail-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-2">
        <div className="flex items-center gap-2 pr-0.5 pb-3 pl-4 font-mono text-10 font-medium tracking-[.14em] text-muted-foreground uppercase">
          Sub-agents
        </div>

        {groups.map((group, index) => {
          const shut = collapsed[group.domainId] ?? false

          return (
            // `display: contents` is doing real work here, not tidying.
            // `position: sticky` is confined to its containing block, so while
            // this <section> generated a box each band could only stay pinned
            // while its own group was on screen: the previous domain vanished
            // the moment the next one pinned, and since band N pins at N ×
            // band-height, the strip above it was left uncovered with rows
            // scrolling through the gap — which reads as the band sitting
            // *under* the content. One cause, both symptoms.
            //
            // Removing the box makes the scroll container their shared
            // containing block, so they stack. The element stays because it is
            // what groups a band with its agents in the DOM.
            <section className="contents" key={group.domainId}>
              {/* 26px unfilled band, hairline top and bottom, pinned at
                  index × 26px so collapsed headers stack flush. */}
              <button
                type="button"
                aria-expanded={!shut}
                onClick={() => {
                  // Collapsing can take the tooltip's anchor with it.
                  setTip(null)
                  toggleRosterDomain(group.domainId)
                }}
                style={{ top: `${index * BAND_REM}rem` }}
                className="sticky z-[5] flex h-[1.625rem] w-full cursor-pointer items-center border-y border-roster-band bg-page pl-[1.0625rem] text-left whitespace-nowrap"
              >
                <span className="font-mono text-7_5 font-semibold tracking-[.12em] text-ink-3 uppercase">
                  {group.label.toLowerCase()}
                </span>
                {/* Never changes on hover — the tooltip answers usage. */}
                <span className="ml-auto font-mono text-7_5 font-medium tracking-[.06em] text-roster-off">
                  {group.onCount} of {group.agents.length}
                </span>
              </button>

              {/* Spacing lives on the body and goes with it, so shut headers
                  butt together at exactly one band each. */}
              {!shut && (
                <div className="pt-2 pb-4 pl-[1.0625rem]">
                  {group.agents.map((row) => (
                    <AgentBlock
                      key={row.agent.id}
                      row={row}
                      flashed={flashed.has(row.agent.id)}
                      onShowUses={(event, skill) =>
                        showUses(event, skill, row.agent.id)
                      }
                      onHideUses={() => setTip(null)}
                    />
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>

      <div className="flex-none border-t border-divider pt-3.5 pr-0.5 pl-4">
        {/* Copies a `?fromId=` link; the button itself is the only feedback
            surface, so its label narrates the outcome and decays to idle. */}
        <Button
          className="mb-2 w-full"
          disabled={shareState === "sharing" || stats.skillCount === 0}
          onClick={() => void share()}
        >
          {SHARE_LABELS[shareState]}
        </Button>
        <Button variant="full" onClick={() => setDialog("install")}>
          Install{" "}
          <span className="pl-1 font-normal tracking-[.06em] text-faint">
            {stats.agentCount}{" "}
            {stats.agentCount === 1 ? "sub-agent" : "sub-agents"} and{" "}
            {stats.skillCount} {stats.skillCount === 1 ? "skill" : "skills"}
          </span>
        </Button>
      </div>
    </aside>
  )
}
