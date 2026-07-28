import { Badge } from "@workspace/ui/components/badge"
import { Rule } from "@workspace/ui/components/divider"
import { Lattice } from "@workspace/ui/components/lattice"
import { useRef } from "react"

import type { DomainView } from "@/features/configure/lib/derive"
import { usePinnedAttribute } from "@/features/configure/lib/use-pinned"
import { SkillCell } from "./skill-cell"

const COLUMNS = 4

/**
 * One domain: a sticky title, then a sub-category group per category with
 * every skill in it rendered — no accordion, no collapse, no pagination.
 *
 * The header pins directly under the filter bar and has to move with it: the
 * bar is 87px tall at rest and 51px once stuck, so the header's `top` follows.
 * A full-bleed rule separates domains; the first gets 30px of clearance
 * instead, to sit under the sticky bar without a line running into it.
 */
export function DomainSection({
  view,
  first,
}: {
  view: DomainView
  first: boolean
}) {
  const headerRef = useRef<HTMLDivElement>(null)
  // Writes `data-pinned` straight to the DOM. Routing this through React state
  // re-rendered every skill cell in the section on a value only a border
  // depends on — an 88ms blocking task with the full catalogue on screen.
  usePinnedAttribute(headerRef)

  return (
    // Named so the domain is a landmark rather than an anonymous <section>.
    <section aria-label={`${view.label} skills`}>
      {first ? <div className="mt-[1.875rem]" /> : <Rule />}

      <div
        ref={headerRef}
        /**
         * Two states, both driven by attributes rather than React:
         *
         * `data-pinned` — while holding the top of the column the header floats
         * over content rather than sitting in it, so it needs an edge of its own
         * to separate the two. In flow it has none, per the whitespace rule.
         *
         * `data-bar-stuck` on the document root — the header pins beneath the
         * filter bar and has to follow it up when the bar reaches the page top.
         * This is the design's own `.app.stuck .dom{top:51px}`.
         */
        className="sticky top-[5.4375rem] z-56 -mx-gutter flex items-baseline gap-[0.6875rem] border-b border-transparent bg-column px-gutter pt-3.5 pb-[0.8125rem] data-pinned:border-hairline [html[data-bar-stuck]_&]:top-[3.1875rem]"
      >
        <h2 className="text-25 font-semibold tracking-[-.01em] text-ink">
          {view.label}
        </h2>
        <span className="font-mono text-11 font-medium text-brand-ink">
          skills
        </span>
      </div>

      {view.categories.map((category) => (
        // A named group, so the exclusivity tag beside the label describes
        // something the accessibility tree actually delimits.
        <div key={category.id} role="group" aria-label={category.displayName}>
          <div className="flex items-center gap-[0.5625rem] px-0.5 pt-9 pb-2">
            <span className="font-mono text-9_5 font-semibold tracking-[.12em] whitespace-nowrap text-ink uppercase">
              {category.displayName}
            </span>
            <Badge variant="outline">
              {category.exclusive ? "one of" : "multi"}
            </Badge>
          </div>

          <Lattice columns={COLUMNS}>
            {category.cells.map((cell, index) => (
              <SkillCell
                key={cell.skill.id}
                view={cell}
                column={index % COLUMNS}
                columns={COLUMNS}
              />
            ))}
          </Lattice>
        </div>
      ))}
    </section>
  )
}
