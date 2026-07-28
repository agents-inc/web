# Configurator — Implementation Spec

Scope: the **Configure** screen. Docs, Share and Settings get a route + empty shell.
Design source of truth: `.claude-design/README.md` + `.claude-design/design/Configurator v5.dc.html`,
with `.claude-design/design/DESIGN_DECISIONS.md` as the rationale log.

> **v5 supersedes v2.** The earlier warm-paper, rounded, sliding-highlight language is gone. This
> document describes what is built now; §8 records where the implementation deliberately departs
> from the design files.

---

## 1. Architecture

### Package layout

| Package                       | Owns                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| `packages/matrix`             | Vendored CLI catalog, zod schemas, the read model, stack expansion. Pure TS — no React.  |
| `packages/ui`                 | The design system: tokens + 11 primitives. No app knowledge.                            |
| `packages/typescript-config`  | `base` / `react-library` / `vite-app` / `node` tsconfigs.                                |
| `packages/eslint-config`      | `base` / `react-library` / `react-app` flat configs.                                     |
| `packages/prettier-config`    | The single Prettier config, declared once in the root `package.json`.                     |
| `apps/web`                    | Routes, stores, feature components, derivations, the GitHub API seam.                    |

`noUnusedLocals` / `noUnusedParameters` stay unset everywhere — every workspace holds code it does
not author (vendored CLI types, generated icon map), and tsc has no per-directory escape. ESLint's
`no-unused-vars` covers it and can scope.

### Data flow

```
BUILT_IN_MATRIX + AGENT_DEFINITIONS + STACK_PRELOADS   (packages/matrix/src/{vendor,generated})
  └─ packages/matrix/src/schema           zod safeParse at module init
      └─ packages/matrix/src/read-model   domain → category → skill tree, sub-agents, stacks
          └─ export { CATALOG, SUB_AGENT_GROUPS, STACKS, expandStack } from "@workspace/matrix"
              ├─ apps/web/stores/config-store          user configuration  (persisted)
              ├─ apps/web/stores/added-skills-store    session skills      (NOT persisted)
              ├─ router search params                  view state
              └─ apps/web/features/configure/lib/derive.ts → view data
                  └─ components
```

`apps/web` imports **only** from `@workspace/matrix`. The package validates once at its own
boundary, so the app performs no second parse.

### Decisions

| Question     | Decision                                                    | Rationale                                                          |
| ------------ | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| Router       | `@tanstack/react-router` v1, code-based routes               | `validateSearch` + zod gives a typed, validated URL boundary.       |
| Table        | **Removed.** `@tanstack/react-table` is gone.                | v5 renders skills as grid cells; there is no table left to build.   |
| Server state | No react-query. One `fetch` behind `lib/api/github-skills.ts`. | Adopt on the second API call.                                     |
| Icons        | `simple-icons` (raw path data) + hand-checked map            | Drawn in `currentColor`, never brand colour — see §4 rule 4.        |

---

## 2. Design language

Five rules generate almost everything, and every primitive in `packages/ui` exists to serve one:

1. **No border radius anywhere.** `--radius: 0px`, so the whole derived shadcn ladder is 0.
2. **Borders only where they mean something.** Cell hairlines collapse into a shared lattice; the
   only real border in a group is the selected cell's amber outline.
3. **Two typefaces, strictly divided.** Inter for human names and descriptions; IBM Plex Mono for
   every label, id, badge, count and command, uppercase with wide tracking.
4. **One accent colour.** Amber marks what the user deliberately chose or changed. Hover states stay
   neutral, and skill logos render in `currentColor` rather than their brand colour.
5. **Whitespace, not rules, separates content.** Two kinds of horizontal rule exist: the full-bleed
   section divider and the collapsed cell lattice.

**The app must never restyle a primitive locally.** shadcn's semantic vars are remapped onto the v5
palette in `:root`, so generated components inherit the language without per-component overrides.

---

## 3. State

### Config store — `apps/web/src/stores/config-store.ts` (persisted, v2)

```ts
type SkillEntry = {
  model: "opus" | "sonnet" | "haiku"
  effort: "none" | "low" | "med" | "high"
  install: "plugin" | "eject"
  scope: "project" | "global"
  assignments: Record<AgentId, "lazy" | "preloaded">
}

type ConfigState = {
  stackId: string | null                    // null = "Start from scratch"
  skills: Partial<Record<SkillId, SkillEntry>>  // SPARSE — presence *is* selection
}
```

`assignments` is the **single source of truth**. Per-cell agent counts, the roster panel and the
install inventory are all derived and none of them stores a copy — the prototype duplicated these
and they drifted.

There is no `selected` boolean (presence in the map means selected) and no `targetAgentIds`
(assignment is per-skill in the options panel, not a global target set).

### Added-skills store — `apps/web/src/stores/added-skills-store.ts` (**not** persisted)

Session-only skills pulled in from GitHub. `config-store`'s `partialize` strips any selection
referencing one, so nothing reaches localStorage that the next session could not describe. Selecting
one is allowed because `toggleSkill`'s catalog guard widens to "catalog **or** session".

### UI store — `apps/web/src/stores/ui-store.ts`

`openPanelSkillId` · `pendingStackId` · `dialog` · `rosterCollapsed` (the only persisted field).

`stuck` is deliberately **not** here — see §6.

### Persistence

| Concern    | Approach                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------- |
| Key        | `agents-inc:config:v1` / `agents-inc:ui:v1`                                                 |
| Validation | `merge` → `safeParse`; on failure **return current** (silent reset, log in dev)              |
| Stale ids  | `pruneUnknownIds` drops skill/stack/agent ids absent from the regenerated catalog            |
| Migration  | `PERSIST_VERSION = 2`; v1 → v2 folds `agents[]` + `preloaded` into per-agent load states     |

### URL search params — `/`

| Param    | Zod                                              | Default | Note                                        |
| -------- | ------------------------------------------------ | ------- | ------------------------------------------- |
| `domain` | `z.enum(DOMAINS).nullable().catch(null)`         | `null`  | `null` renders every domain — the design's resting state |
| `q`      | `z.string().trim().max(64).catch("")`            | `""`    |                                             |
| `rec`    | `z.boolean().catch(false)`                       | `false` |                                             |
| `sel`    | `z.boolean().catch(false)`                       | `false` | Narrow to what you have actually chosen     |

---

## 4. Component tree

### `packages/ui` — the design system

| File                     | Provides                                                             |
| ------------------------ | -------------------------------------------------------------------- |
| `styles/globals.css`     | Tokens: surfaces, ink, amber, lines, `--spacing-gutter`, type scale   |
| `lattice.tsx`            | `Lattice` / `LatticeCell` / `LatticeRows` / `LatticeRow` — rule 2      |
| `badge.tsx`              | `state` (install/scope, `alt` = amber) · `tag` (`added`) · `outline` (`one of`) |
| `chip.tsx`               | Bordered mono toggle at two sizes: `filter`, `segment`                |
| `segmented.tsx`          | `Segmented` / `SegmentedItem` / `FieldLabel`                          |
| `matrix-grid.tsx`        | Tri-state assignment matrix, tolerates gaps                           |
| `divider.tsx`            | `Hinge` (labelled) / `Rule` — the page's only two rules               |
| `button.tsx`             | `outline` · `primary` · `block` · `full`                              |
| `input.tsx`              | Borderless mono field: `search`, `dialog`                             |
| `command-block.tsx`      | `$`-prefixed shell command                                            |
| `dialog.tsx`             | The shared square shell + panes                                       |
| `alert-dialog.tsx`       | Confirm shell (stack switch)                                          |

**Removed in v5** (superseded, no consumers): `accordion`, `table`, `sliding-toggle-group`, `toggle`,
`toggle-group`, `hover-card`, `input-group`, `scroll-area`, `separator`, `textarea`, `tooltip`,
`empty`.

### `apps/web`

| File                                | Renders                                                        |
| ----------------------------------- | -------------------------------------------------------------- |
| `routes/route-components.tsx`       | 3-column grid shell (152px / fluid / 260px)                     |
| `components/nav-rail.tsx`           | Logo, words-only nav, GitHub mark                               |
| `components/skill-icon.tsx`         | 26px logo slot: brand mark in `currentColor`, else monogram     |
| `.../configure-screen.tsx`          | Hinges, stack grid, filter bar, domain sections, dialogs, scroll observer |
| `.../stack-grid.tsx`                | 4-across stack lattice                                          |
| `.../filter-bar.tsx`                | Sticky/stuck bar + chips + `＋ add skill`                        |
| `.../domain-section.tsx`            | Sticky domain title + category groups + skill lattice           |
| `.../skill-cell.tsx`                | The core cell                                                   |
| `.../skill-options-panel.tsx`       | The `•••` popover                                               |
| `.../roster-panel.tsx`              | Available / in-use sub-agents, stats, Install                   |
| `.../install-dialog.tsx`            | Inventory panes + numbered steps                                |
| `.../add-skill-dialog.tsx`          | Staged tray, GitHub search, result lattice                      |
| `.../stack-switch-dialog.tsx`       | Confirm discard                                                 |
| `lib/api/github-skills.ts`          | The one network call                                            |

---

## 5. Sizing

**Every dimension is `rem`, and `:root { font-size }` in `globals.css` is the single knob that
scales the whole design.** It is currently `110%` — the design's native size, 10% larger. The type
scale, the arbitrary metrics and Tailwind's own spacing utilities all resolve against it, so nothing
scales independently.

Two things stay in `px` on purpose:

- **Borders and the 1px lattice hairlines.** At 1.1px they render as blurry sub-pixel lines, and the
  collapsed grid is the entire visual language.
- **Viewport units**, so the sticky rails stay exactly one screen tall.

This is also why the app is not simply CSS `zoom`, which would scale both.

`60px` is the page's structural constant — main-column padding, the air above and below every
divider, and the roster's top padding — exposed as `--spacing-gutter` so `-mx-gutter` bleeds a rule
out to touch both vertical dividers.

### Where logic lives

Four layers, in order of preference. Nothing that could sit lower sits higher.

| Layer | Holds | Files |
| ----- | ----- | ----- |
| **Pure functions** | Every derivation and transform. No React, independently testable. | `features/configure/lib/derive.ts`, `stores/persisted-schema.ts`, `lib/api/github-skills.ts`, the helpers exported from `added-skills-store.ts` |
| **Stores** | Shared mutable state and the actions that write it. | `config-store`, `ui-store`, `added-skills-store` |
| **Hooks** | Reusable *behaviour* — the only thing hooks are for here. | `lib/use-pinned.ts` |
| **Components** | Composition and event wiring only. | everything in `features/configure/components/` |

Only three components hold a `useEffect` at all: the add-skill dialog (debounced search), the filter
bar (publishing pinned state), and the skill cell (outside-press / Escape dismissal). Each is
genuinely local to that component.

**Styling variants live in `packages/ui` as exported CVAs**, never re-typed at a call site. Where a
call site needs the look but not the semantics — the add-skill stage marker sits inside an
already-clickable row, so it must not nest a button — it consumes `chipVariants` directly rather
than duplicating the class list. Same for `matrixCellVariants`, which the options panel's ragged
sub-agent list reuses so the tri-state colours cannot drift from the matrix above them.

---

## 6. Sticky behaviour

The **page** scrolls, not the middle column: both side columns are `sticky top-0 h-svh`, which is
what makes their dividers read as continuous. `items-start` on the grid is what allows that.

`use-pinned.ts` reports whether a sticky element is *currently* pinned — CSS has no selector for it.
It ships two forms, and which one to use is a performance decision, not a style one:

- **`usePinned`** returns React state. Only for elements whose own markup changes — the filter bar.
- **`usePinnedAttribute`** writes `data-pinned` straight to the DOM and never renders. For the
  domain headers, whose pinned state only drives a border but which each own a grid of skill cells.

The filter bar publishes its own state to a `data-bar-stuck` attribute on the document root, and the
headers re-pin beneath it (87px → 51px) in pure CSS — the design's own `.app.stuck .dom{top:51px}`.

**None of this may live in a store.** A shared `stuck` field puts every subscriber into the render
path for a value only a `top` offset and a border depend on. Measured with the full catalogue on
screen: an **88ms blocking task** at 240 cells (39ms at 97, none at 18), which is what made the
sticky transition read as a jump rather than an ease. Attribute-driven, it is 0ms and 60fps at every
cell count.

**The stuck state must not change the bar's height.** The design collapses a 60px top padding when
the bar sticks, which removes 78px of document height at the exact moment it pins; the browser's
scroll anchoring then compensates by moving the scroll position, un-pinning the bar and restoring
the padding — a measured oscillation (`scrollY` jumped 590 → 511). The 60px of air above the bar
therefore comes from the preceding hinge's bottom margin, only horizontal padding changes, and the
border is made transparent rather than removed. Geometry is identical; the feedback loop is gone.

Domain headers re-pin from `top: 87px` to `top: 51px` to follow the bar. The horizontal padding
transition is the **only** animation in the design.

---

## 7. Resolved decisions

Where the catalog and the design disagree, the catalog wins — the design was drawn against a smaller
snapshot of it.

| # | Question               | Decision                                                                                             |
| - | ---------------------- | ------------------------------------------------------------------------------------------------------ |
| 1 | **Domain set**         | Render all catalog domains as sections; chip only the five the design shows.                          |
| 2 | **Sub-agent taxonomy** | Real agents from the catalog (23, ragged), not the design's clean 4 × 4 of 16.                        |
| 3 | **Domain hierarchy**   | Ship `hierarchy: b` — 25px Inter title + amber `skills` suffix. The README prose describes the base rule; the prototype's default and every screenshot are `b`. |
| 4 | **Skill logos**        | Render the real mark where one exists, in `currentColor`; monogram otherwise.                         |
| 5 | **Domain colours**     | **Removed.** v5 has one accent; nine coloured dots would break rule 4.                                 |

---

## 8. Adaptations — where the implementation departs from the design files

Each of these is a place the design could not be followed literally, with the reason.

| Area | Design | Built | Why |
| ---- | ------ | ----- | --- |
| **Sub-agent matrix** | 4 domains × 4 roles = 16 agents | 4 canonical role columns over the domains that have them, plus a labelled list for the 9 ragged agents | The catalog has 23 agents across 10 distinct roles. A full domain × role grid would be 6 × 10, mostly empty, in a 296px panel — and dropping the extras would make them unassignable. |
| **`•••` on an unselected skill** | Panel opens | Selects the skill, then opens | Options only apply once a skill is selected, so the design's own rule makes this a dead click on every unselected cell — and the `•••` is drawn identically on all of them. Badge clicks behave the same way. |
| **Agent count opens on hover** | "Hover/click" | Click only | A hover-opened panel containing interactive controls is hostile to reach. Click is listed in the design too. |
| **Panel dismissal** | Click `•••` again | Also outside press and Escape | The design does not say, and a popover with no escape hatch is a trap. |
| **Panel overflow** | Always opens to the right | Flips left in the last column | At `left: calc(100% + 5px)` a last-column panel escapes the main column. |
| **Uncategorized added skills** | "lands in Uncategorized" — never mocked | Own trailing `Added` section | Appending to a real domain would imply membership of it. |
| **Cell lattice** | Border + white background on the *grid container* | Border + background on each **cell**, pulled back 1px so shared edges coincide | Equivalent only while every row is full. The mock never shows a partial row; ours do constantly, and there the container approach paints white across the empty columns and runs a rule out past the last cell. |
| **Domain chips** | Static markup, no behaviour | Toggle filter; active chip clears | Chips are hardcoded in the prototype; the README lists filter behaviour as a gap to fill. |
| **Skill descriptions** | ~25 chars describing the *library* | The catalog's skill description | The catalog describes the skill, not the library. Needs new upstream data, not a UI change. |

---

## 9. Deferred

| Item                    | State                                                                        |
| ----------------------- | ------------------------------------------------------------------------------ |
| Added-skill persistence | Session-only by explicit instruction. Needs a real marketplace entry to persist. |
| GitHub proxy            | `apps/server`. Unauthenticated search is 10 req/min, hence the 350ms debounce.  |
| Docs / Share / Settings | Route + centred heading only.                                                  |
| Empty / loading / error | Only the filter's no-match line and the dialog's error line exist. Undesigned.  |
| Responsive < 1324px     | Hard `min-w`; the page scrolls horizontally. Undesigned.                        |
| Dark mode               | Undesigned. The `.dark` block was removed rather than left stale.               |
