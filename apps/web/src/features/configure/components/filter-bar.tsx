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

// The five the design chips; the catalogue's other domains still render as sections.
const CHIP_DOMAINS = ["web", "api", "ai", "infra", "shared"] as const

// Sticky, and it changes shape once pinned: the border goes and the bar grows
// to the full column width. Clicking the active domain chip clears it, so the
// resting state renders every domain.
export function FilterBar({ search }: { search: ConfigureSearch }) {
  const navigate = useNavigate({ from: "/" })
  const setDialog = useUiStore((state) => state.setDialog)

  const wrapRef = useRef<HTMLDivElement>(null)

  // A filter change is a router navigation, which resets scroll by default.
  // `replace` for the query only, so typing does not fill the history stack.
  const update = (patch: Partial<ConfigureSearch>) =>
    void navigate({
      search: (prev) => ({ ...prev, ...patch }),
      resetScroll: false,
      replace: "q" in patch,
    })

  // Local, not a store field: the domain headers follow this from a root
  // attribute in CSS, and sharing it re-rendered all 240 cells on every flip.
  const stuck = usePinned(wrapRef)
  useBarStuckAttribute(stuck)

  return (
    <>
      <div
        ref={wrapRef}
        // Horizontal padding only. Collapsing the design's 60px top padding
        // removes 78px of page height exactly as the bar pins, and scroll
        // anchoring then un-pins it — measured oscillating at scrollY 590/511.
        // The air above comes from the preceding hinge's margin instead.
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
            // Equal vertical padding in both states, for the same reason: any
            // height change here perturbs scroll at the moment of pinning.
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
            // Same 150ms as the wrapper, or the pieces arrive at different times.
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
