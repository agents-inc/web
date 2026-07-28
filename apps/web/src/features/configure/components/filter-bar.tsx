import { useNavigate } from "@tanstack/react-router"
import { DOMAIN_LABELS, type Domain } from "@workspace/matrix"
import { Button } from "@workspace/ui/components/button"
import { Chip } from "@workspace/ui/components/chip"
import { Input } from "@workspace/ui/components/input"
import { useRef } from "react"

import {
  useBarStuckAttribute,
  usePinned,
} from "@/features/configure/lib/use-pinned"
import type { ConfigureSearch } from "@/routes/search"
import { useUiStore } from "@/stores/ui-store"

/** The five the design chips; the catalogue's other domains still render as sections. */
const CHIP_DOMAINS = ["web", "api", "ai", "infra", "shared"] as const

/**
 * Search · domain chips · recommended · `＋ add skill`.
 *
 * Sticky, and it changes shape when it sticks: unstuck it is an inset bordered
 * bar sitting inside the 60px gutter; stuck it loses its border, grows to the
 * full column width and sits flush with the top of the page, becoming a
 * page-wide toolbar. That padding change is the only animated transition in
 * the whole design, which is why `transition` appears here and nowhere else.
 *
 * A domain chip narrows the page to that domain and clicking the active chip
 * clears it, so the resting state renders every domain — which is what the
 * design's full-page screenshot shows.
 */
export function FilterBar({ search }: { search: ConfigureSearch }) {
  const navigate = useNavigate({ from: "/" })
  const setDialog = useUiStore((state) => state.setDialog)

  const wrapRef = useRef<HTMLDivElement>(null)

  /**
   * `resetScroll: false` because the router scrolls to the top on every
   * navigation by default, and a filter change *is* a navigation here — so
   * ticking a chip from halfway down the page threw you back to the stack grid.
   * Filtering narrows what you are already looking at; it should not move you.
   *
   * `replace` for the query only: typing "react" would otherwise push five
   * history entries and take five back presses to undo. A chip is a discrete
   * choice and stays worth a history entry.
   */
  const update = (patch: Partial<ConfigureSearch>) =>
    void navigate({
      search: (prev) => ({ ...prev, ...patch }),
      resetScroll: false,
      replace: "q" in patch,
    })

  /**
   * The bar changes shape the moment CSS pins it — not at a fixed scroll
   * offset. The prototype hardcodes `scrollY > 60` because its stack section is
   * two rows tall; ours is five, so the bar lives ~650px down the page and that
   * threshold made it shed its border while still sitting mid-column.
   *
   * Kept local. The domain headers pin *beneath* this bar and move with it
   * (87px → 51px), but they read that from a document-root attribute in CSS
   * rather than from a store field — a shared field put all 240 skill cells
   * into the render path for a value only a `top` offset depends on.
   */
  const stuck = usePinned(wrapRef)
  useBarStuckAttribute(stuck)

  return (
    <>
      <div
        ref={wrapRef}
        /**
         * Only the *horizontal* padding changes when this sticks. The design
         * collapses a 60px top padding as well, which removes 78px of document
         * height at the exact moment the bar pins — and the browser's scroll
         * anchoring then compensates by moving the scroll position, which
         * un-pins the bar, which restores the padding. Measured: scrollY jumped
         * 590 → 511 and the bar oscillated across the boundary.
         *
         * The 60px of air above the bar comes from the preceding hinge's bottom
         * margin instead, so the geometry is identical while the wrapper's
         * height is now constant and nothing perturbs the scroll position.
         */
        className={`sticky top-0 z-60 -mx-gutter bg-column pb-3 transition-[padding] duration-150 ${
          stuck ? "px-0" : "px-gutter"
        }`}
      >
        {/* The gap is constant. The design collapses it to 0 when stuck so the
            two blocks butt together as one toolbar, but that snaps the add
            button sideways at the same instant the bar is already changing
            width and losing its border — three simultaneous shifts read as a
            jump. Holding the gap costs nothing and the transition stays calm. */}
        <div className="flex items-stretch gap-2.5">
          <div
            // Vertical padding is identical in both states for the same reason
            // the wrapper's is: any height change here perturbs the scroll
            // position at the moment of pinning. The design differs by 1px.
            className={`flex min-w-0 flex-1 items-center gap-3 border bg-cell py-[0.9375rem] transition-[padding] duration-150 ${
              stuck
                ? "border-transparent pr-0 pl-gutter"
                : "border-field-border px-[0.9375rem]"
            }`}
          >
            <Input
              value={search.q}
              placeholder="search skills"
              aria-label="Search skills"
              onChange={(event) => update({ q: event.target.value })}
            />

            <div className="flex shrink-0 gap-[0.125rem]">
              {CHIP_DOMAINS.map((domain) => (
                <Chip
                  key={domain}
                  active={search.domain === domain}
                  onClick={() =>
                    update({
                      domain:
                        search.domain === domain ? null : (domain as Domain),
                    })
                  }
                >
                  {DOMAIN_LABELS[domain]}
                </Chip>
              ))}
            </div>

            <div className="flex shrink-0 gap-[0.125rem]">
              <Chip
                active={search.rec}
                onClick={() => update({ rec: !search.rec })}
              >
                Recommended
              </Chip>
              <Chip
                active={search.sel}
                onClick={() => update({ sel: !search.sel })}
              >
                Selected
              </Chip>
            </div>
          </div>

          <Button
            variant="block"
            // Same 150ms as the wrapper and the bar. Without it the wrapper's
            // padding eased while these two snapped, so the pieces arrived at
            // different times — which is what reads as jumpiness.
            className={`transition-[padding] duration-150 ${
              stuck ? "pr-gutter pl-5" : ""
            }`}
            onClick={() => setDialog("add")}
          >
            ＋ Add skill
          </Button>
        </div>
      </div>
    </>
  )
}
