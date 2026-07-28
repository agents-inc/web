# Configurator — build tracker

Working checklist. Spec: [`configurator-spec.md`](./configurator-spec.md).
Mark items `[x]` as they land.

---

## Outstanding

| # | Item | Why it matters |
| - | ---- | -------------- |
| 1 | **No component tests** | Unit and E2E both exist; the gap between them is a single component rendered in isolation. Low priority — the primitives are presentational and the browser covers them in composition. |
| 2 | **Bundle is one 958 KB chunk** (259 KB gzip), dominated by the 420 KB catalog | First paint on a cold cache |
| 3 | **Backend** — a GitHub search proxy | The dialog talks to GitHub directly today at 10 req/min unauthenticated. A token cannot ship in a bundle. |
| 4 | **Added skills are session-only** | By explicit instruction. Persisting means giving them real catalog entries — a marketplace concern. |
| 5 | **Config sharing undecided** | Blocks the Share destination. URL-encoded needs no backend; a hosted id does. |
| 6 | **Skill descriptions describe the skill, not the library** | The design wants ~25 chars about the library ("JavaScript UI library"). Needs upstream catalog data. |

## v5 redesign ✅

The whole visual language changed: warm-paper / rounded / shadowed / sliding-highlight → white,
square, hairline-lattice, mono-labelled, single-amber-accent. Design system first, then the app.

- [x] **Tokens** — rewrote `:root` + `@theme` in `packages/ui`: v5 surfaces, ink, amber, line
      colours, `--radius: 0px`, `--spacing-gutter`, a 15-step type scale (7 → 25px). Removed the
      nine domain colours, the five sliding-highlight shadows and the `.dark` block.
      - Caught: `--color-muted` would have shadowed shadcn's *surface* token inside the same
        `@theme` block, silently turning every `bg-muted` dark. #7a7669 is reached via
        `muted-foreground` instead.
- [x] **Primitives** — `lattice`, `badge`, `chip`, `segmented`, `matrix-grid`, `divider`,
      `command-block`; rewrote `button`, `input`, `dialog`, `alert-dialog`.
- [x] **Retired** 12 components the v5 language has no place for (accordion, table,
      sliding-toggle-group, toggle, toggle-group, hover-card, input-group, scroll-area, separator,
      textarea, tooltip, empty) and dropped `@tanstack/react-table` + `@tabler/icons-react`.
- [x] **Stores** — `model` + `effort` added; `agents[]` + `preloaded` folded into
      `assignments: Record<AgentId, "lazy" | "preloaded">`; `PERSIST_VERSION` 2 with a v1 migration;
      non-persisted `added-skills-store`; ui store gains `openPanelSkillId` / `dialog` /
      `rosterCollapsed`.
- [x] **Layout** — 3-column grid, sticky nav rail and roster, 60px gutter constant.
- [x] **Main column** — stack lattice, hinge dividers with dynamic copy, sticky/stuck filter bar,
      domain sections (hierarchy `b`), 4-across skill cells, `•••` options panel.
- [x] **Roster** — available / in-use sections, load state as a word, derived stats, Install.
- [x] **Dialogs** — Install (inventory + numbered commands, no install button) and Add skill
      (staged tray, GitHub search, match highlighting).
- [x] **Verification** — typecheck, lint, build clean. Driven in Chromium at 1644px: computed
      styles checked against the v5 CSS declarations (body, main, nav, domain title, lattice cell,
      grid, badge, chip all match); stack apply, options panel, badge flips, stuck bar, both
      dialogs and the full add-skill flow exercised with no console errors.

### Sizing

- [x] Every dimension moved to `rem` — the type scale, the 60px gutter and all 87 arbitrary metrics.
      `:root { font-size: 110% }` in `globals.css` is now the single knob for global scale; borders
      and viewport units deliberately stay in px. Verified: 64/64 explicitly-set properties scale
      exactly 1.1×, borders unchanged at 1px, sticky rails still exactly one screen tall.

### Fixed during the visual pass

- Filter bar was missing the `-60px` top margin that cancels its own sticky padding, leaving a
  120px gap under the second hinge
- `•••` and the state badges were dead clicks on unselected skills — they now select first
- No way to dismiss the options panel except the `•••` itself; added outside-press and Escape
- Install dialog's Agents pane had no scope heading and reshuffled as skills were toggled
  (Set insertion order); now grouped under `Project` and ordered by the catalog
- Language labels read `typescript`; the design's result rows use `ts`
- The lattice put its border and white background on the *grid container*, so a category with fewer
  than 4 skills drew a white bordered strip across the empty columns and a rule past the last cell.
  Both now belong to the cell
- The filter bar flipped to its stuck styling at `scrollY > 60` (the prototype's hardcoded value),
  losing its border while still ~600px down the page. It now flips exactly when it pins
- Sticking collapsed 78px of the bar's height, which triggered browser scroll anchoring and
  oscillated the bar across the boundary (`scrollY` jumped 590 → 511). Its height is now constant
- Domain headers had no bottom edge while pinned, so content scrolled flush against the title
- **Every filter change scrolled the page to the top.** TanStack Router defaults `resetScroll: true`
  and a search-param update *is* a navigation. Now `resetScroll: false`, plus `replace` for the
  query so typing "react" no longer pushes five history entries
- The stack-switch confirm fired whenever *anything* was selected, so browsing Next.js → T3 → Remix
  prompted every time. It now tests `isStackCustom` — real edits, not a stack's own expansion
- Skill icon slot had a `#f4f2ec` fill, which read as a second surface competing with the cell
- **Deselecting a skill destroyed its configuration.** A dozen clicks of sub-agent assignments could
  be lost to one stray toggle, with no undo and no warning. Deselected entries now move to
  `remembered` and are restored on re-select; `PERSIST_VERSION` 3
- **Sticking the filter bar blocked the main thread for 88ms.** `stuck` lived in the UI store and
  `DomainSection` subscribed to it, so flipping it re-rendered all 240 skill cells for a value only
  a `top` offset needed. Now attribute-driven (`data-bar-stuck` / `data-pinned`) with CSS doing the
  styling: 0ms, 60fps at every cell count. `stuck` is gone from the store
- The add button's gap collapsed to 0 on stick while the wrapper's padding eased, so the pieces
  arrived at different times. Gap is now constant and all three padding changes share one 150ms
- Added a **`selected`** filter chip beside `recommended` (`?sel=true`)

## Testing ✅

- [x] Playwright E2E in `apps/web/e2e` — 77 tests across 9 specs, page objects, a
      GitHub route mock, and `catalog.spec.ts` guarding the fixture values against
      catalogue drift. Runs in ~15s.
- [x] Verified non-vacuous: three regressions injected (router `resetScroll`, the
      stack-confirm condition, exclusive-sibling eviction) each failed exactly the
      tests that name them and nothing else.
- [x] Verified stable: 2 × 385 runs (`--repeat-each=5`) with no flakes. Two earlier
      versions of the scroll assertion *did* flake; see `e2e/README.md`.
- [x] Building the suite surfaced missing accessible names — the skill cell's name
      was its whole text content, the state badges announced a bare "plugin", and
      the options panel had none. All now labelled.
- [x] `skill-memory.spec.ts` — 11 tests covering deselect/re-select, exclusive swap, the
      stack-provided case and the boundaries. Verified non-vacuous: disabling `isWorthRemembering`
      fails 7 of them and leaves the 4 that assert the *absence* of memory passing.
- [x] Unit tests — 94 across `derive.ts`, `persisted-schema.ts`, the added-skill helpers, the
      GitHub formatters and the `packages/matrix` read model. Run in ~20ms.
- [x] `packages/vitest-config` — the shared node preset the tracker anticipated
- [x] Verified non-vacuous: blanking `isStackCustom`'s option comparison and miscounting
      `summarize`'s agents failed exactly the 5 tests naming those behaviours. Only one of the
      five would have been caught end-to-end.

## Phase 6 — Monorepo hygiene

- [x] `packages/typescript-config` · `packages/eslint-config` · `packages/prettier-config`
- [x] `syncpack` — `bun run deps:check` / `deps:fix`
- [x] `packages/vitest-config` — node preset for pure logic; no shared `testUtils` needed yet
- [ ] Code-split the bundle

## Phase 7 — Backend, only if the deferred features land

- [ ] `apps/server` — GitHub search proxy, behind the existing `lib/api/github-skills.ts` seam
- [ ] `packages/api` + `packages/api-mocks` — typed client and MSW handlers
- [ ] Decide config sharing: URL-encoded vs hosted id

## Not designed yet

Confirm dialog visuals (built in the dialog language, never mocked) · Share, Docs, Settings pages ·
empty / loading / error states · responsive below 1324px · dark mode.
