# Configurator — build tracker

Working checklist. Spec: [`configurator-spec.md`](./configurator-spec.md).
Mark items `[x]` as they land.

---

## Outstanding

| #   | Item                                                                                                       | Why it matters                                                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **No component tests**                                                                                     | Unit and E2E both exist; the gap between them is a single component rendered in isolation. Low priority — the primitives are presentational and the browser covers them in composition. |
| 2   | **Bundle is one 958 KB chunk** (259 KB gzip), dominated by the 420 KB catalog                              | First paint on a cold cache                                                                                                                                                             |
| 3   | **Backend** — a GitHub search proxy                                                                        | The dialog talks to GitHub directly today at 10 req/min unauthenticated. A token cannot ship in a bundle.                                                                               |
| 4   | **Added skills are session-only**                                                                          | By explicit instruction. Persisting means giving them real catalog entries — a marketplace concern.                                                                                     |
| 5   | **Catalog drift** — the vendored matrix goes stale the moment a skill or a `requires` is authored upstream | `bun run generate` in `packages/matrix` already regenerates it; nothing triggers or checks it. See [`cli-integration.md`](./cli-integration.md).                                        |
| 6   | **Skill descriptions describe the skill, not the library**                                                 | The design wants ~25 chars about the library ("JavaScript UI library"). Needs upstream catalog data.                                                                                    |
| 7   | **Half the catalogue states no relationships at all** — see below                                          | 123 of 222 skills are invisible to the incompatibility rule, and the data cannot say whether that is correct. Needs upstream authoring.                                                 |

### 7 · Every skill should carry conflicts, or trace to one that does

The invariant worth holding: a skill either states its own `conflictsWith`, or reaches one that does
by following `requires`. Today, of 222 skills — 80 carry their own conflicts, 19 trace to one, and
**123 do neither**, which makes them invisible to the incompatibility rule.

Most of those 123 are legitimately unconstrained: Zod, Tailwind and GitHub Actions really do work
with anything. The problem is that **the data cannot tell "genuinely universal" from "nobody has
audited this yet"** — both read as two empty arrays. So the ask is not to author 123 conflict lists;
it is to make that distinction explicit, so an empty pair means _audited and universal_.

Worth starting with `web` (26 of the 123) and `mobile` (22): a framework-bound skill that forgot to
declare `requires` is invisible to the rule below, so it stays clickable beside a framework it cannot
run on and nothing anywhere says so.

Seven of the orphans also sit in **exclusive** categories (PlanetScale, Turso, Gel (EdgeDB),
SurrealDB, Email Setup, pnpm Workspaces, Server-Sent Events). Those are not bugs — the pick-one swap
already covers a category's own members — but they are a useful check that the category, rather than
the conflict list, is what is doing that work.

Blocked on the CLI repo reopening; the audit itself runs against the vendored copy any time.

## Sub-agent scope ✅ (2026-08-02)

Where a sub-agent's front-matter gets written is now the web's to say. The CLI carried `scope` on
every `AgentScopeConfig` all along; with no surface for it the `--from` mapper wrote `project` for
everyone, so a global agent was unshareable rather than merely unsupported.

- [x] **Store** — the `agents` record gained `scope?: "project" | "global"`. Absent means `project`
      — the CLI's installer default, not anything `metadata.yaml` names — and the store keeps only
      the non-resting choice, the same drop-on-resting rule model and effort follow. `PERSIST_VERSION`
      7 → 8.
- [x] **Roster UI** — a `ScopeWord` on the agent's own row, third in the control cluster after the
      model word and the effort meter. Two values, so it is a toggle, but it steps through
      `nextInCycle(AGENT_SCOPES, …)` rather than negating: one rule for all three controls on the
      row, and a third value later costs nothing.
- [x] **Wire** — `seedAgentSchema` gained optional `scope`, and `SEED_VERSION` went 2 → 3. The
      bump-or-not question the item left open is decided **bumped**: additive-optional survives on
      paper, but the CLI's vendored zod object strips what it does not know, so a v2 id would decode
      clean and silently drop the field. The version is the only thing that proves it arrived.
- [x] **CLI tail, in lockstep** — the vendored schema and `agentScopeConfig` landed with it: scope
      maps through, defaults to `project`, and `compileAgentsAllScopes` splits the compiled agents by
      it. Live-verified end to end, not just typechecked.
- [x] **Install dialog** — the Agents pane groups `Project` / `Global`. Its lone `Project` heading was
      decoration while front-matter went to the project unconditionally; scope is what turns it into
      the statement the skills pane's headings already were, and `Global` appears only once an agent
      is.
- [x] 11 E2E in `agent-scope.spec.ts` — the row control and its resting value, that choosing a scope
      does not switch the agent on, the per-agent boundary, reload survival, the v3 payload with and
      without the key, and the dialog grouping.

## Save your stack ✅ (2026-08-02)

A selection now outlives the config state it was built in.

- [x] **Save** in the roster footer, above Share, disabled at zero skills — the same nothing-to-send
      rule Share follows. The label never moves: the grid cell appearing is the feedback, and a button
      that renames itself cannot be clicked twice in a row.
- [x] **Storage** — `toSeedPayload` into its own localStorage slice (`agents-inc:saved-stack:v1`),
      read back through `seedPayloadSchema`. The same serialization sharing sends, so a saved stack
      and a shared link can never restore different things. Deliberately not a field of the config
      store: that one is discarded wholesale on a `PERSIST_VERSION` bump, and a snapshot made on
      purpose must not go with the browser state it happened to be saved from.
- [x] **Its own version seam** — the payload's `v`, not `PERSIST_VERSION`. Stricter, and honestly so:
      a `SEED_VERSION` bump empties the slot **by design**, because a payload minted under an older
      contract fails to decode rather than being guessed at. An empty slot and an unreadable one give
      the same answer — there is nothing to restore either way, and nothing on screen to explain it
      with.
- [x] **Grid** — the `Saved stack` cell renders straight after "Start from scratch" and only while a
      snapshot exists; it is drawn as the current stack exactly when the selection _is_ the
      snapshot. Applying is `fromSeedPayload` through the existing stack-switch confirm, with the
      same skip-and-report pruning as `--from`.
- [x] **One dispatch site** — `useApplyStackRequest`. The grid applies directly when there is nothing
      to lose and the dialog applies once confirmed: two routes to the same dispatch, not two.
- [x] The three open questions resolved: **one slot** (not a list), **auto-named**, **update-in-place**
      on re-save.
- [x] 9 E2E in `save-stack.spec.ts` — the disabled boundary (including a pinned bare agent, which is
      not enough to save), footer order, the cell's position in the grid, restoring the selection,
      the confirm over real edits, and re-saving into the one slot.
- [x] **Applied is a comparison** — the baseline this section left open was decided the same day:
      a selection equal to the snapshot — just saved, or just applied — is clean, and presses the
      saved cell while scratch and the catalogue cells stay unpressed. Not by repointing
      `isStackCustom` but by subtracting from it (`edited && !savedApplied`), so no new state is
      stored: `matchesSavedStack` compares serialized payloads — the identity `useInstallCommand`
      keys on — derived on every change and again from whatever rehydrates. Order-sensitive, so a
      reordered-but-unchanged selection reads as a difference: one confirm too many, never work
      discarded. 5 E2E in `saved-stack-applied.spec.ts`.

## Incompatibility ✅ (2026-07-30)

Selecting a skill now rules out what it makes unusable: dimmed to 40% with `aria-disabled`, never
hidden. `selectReachability` in `derive.ts` is the whole rule, and it reads
`requires` — the only field that can express a cross-category incompatibility, since `conflictsWith`
never leaves its own category and `compatibleWith` claims React is compatible with SvelteKit.

- [x] **Forward** — a skill whose requirements can no longer be met goes with them. Transitive, so
      picking React takes SvelteKit (needs Svelte), then Nuxt (needs Vue), then Pinia (needs Vue or
      Nuxt): 14 skills, only 4 of them by direct conflict.
- [x] **Backward** — what the selection implies counts as selected. Next.js is built on React, so
      choosing it rules out Angular, Vue, Svelte and SolidJS even though Next.js names none of them.
      Only unambiguous groups propagate; "needs Vue or Nuxt" implies neither.
- [x] Two exemptions keep it from trapping the user: a **selected** skill is never disabled, and an
      exclusive sibling is never disabled for conflicting with something **actually selected** in its
      own category — that is the swap. The exemption deliberately does _not_ extend to an implied
      conflict, because clicking the sibling would not evict whatever implies it.
- [x] Reason strings come from the data: `Conflicts with React`, `Needs Svelte`,
      `Needs one of Vue, Nuxt`. Carried on `title`, which is also the accessible description — so the
      cell keeps pointer events rather than `pointer-events-none`, or the reason would be
      unreachable.
- [x] 19 unit tests over the derivation, 12 E2E over the drawing and the disabling, and a fixture
      guard in `catalog.spec.ts` so a future re-authoring of the requirement chain fails once, named.
- Parked: a red outline (`#b0392c`, the amber hue rotated) was built and pulled — dimming alone is
  the design's own treatment, and red would have been the language's only non-amber signal. If it
  comes back it belongs on the `disabled` variant in `packages/ui/lattice.tsx`, with the token
  restored beside `--color-brand-*`.

## v5 redesign ✅

The whole visual language changed: warm-paper / rounded / shadowed / sliding-highlight → white,
square, hairline-lattice, mono-labelled, single-amber-accent. Design system first, then the app.

- [x] **Tokens** — rewrote `:root` + `@theme` in `packages/ui`: v5 surfaces, ink, amber, line
      colours, `--radius: 0px`, `--spacing-gutter`, a 15-step type scale (7 → 25px). Removed the
      nine domain colours, the five sliding-highlight shadows and the `.dark` block. - Caught: `--color-muted` would have shadowed shadcn's _surface_ token inside the same
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
- The lattice put its border and white background on the _grid container_, so a category with fewer
  than 4 skills drew a white bordered strip across the empty columns and a rule past the last cell.
  Both now belong to the cell
- The filter bar flipped to its stuck styling at `scrollY > 60` (the prototype's hardcoded value),
  losing its border while still ~600px down the page. It now flips exactly when it pins
- Sticking collapsed 78px of the bar's height, which triggered browser scroll anchoring and
  oscillated the bar across the boundary (`scrollY` jumped 590 → 511). Its height is now constant
- Domain headers had no bottom edge while pinned, so content scrolled flush against the title
- **Every filter change scrolled the page to the top.** TanStack Router defaults `resetScroll: true`
  and a search-param update _is_ a navigation. Now `resetScroll: false`, plus `replace` for the
  query so typing "react" no longer pushes five history entries
- The stack-switch confirm fired whenever _anything_ was selected, so browsing Next.js → T3 → Remix
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

- [x] Playwright E2E in `apps/web/e2e` — 177 tests across 17 specs, page objects, a
      GitHub route mock, and `catalog.spec.ts` guarding the fixture values against
      catalogue drift. Runs in ~37s.
- [x] Verified non-vacuous: three regressions injected (router `resetScroll`, the
      stack-confirm condition, exclusive-sibling eviction) each failed exactly the
      tests that name them and nothing else.
- [x] Verified stable: 2 × 385 runs (`--repeat-each=5`) with no flakes. Two earlier
      versions of the scroll assertion _did_ flake; see `e2e/README.md`.
- [x] Building the suite surfaced missing accessible names — the skill cell's name
      was its whole text content, the state badges announced a bare "plugin", and
      the options panel had none. All now labelled.
- [x] `skill-memory.spec.ts` — 11 tests covering deselect/re-select, exclusive swap, the
      stack-provided case and the boundaries. Verified non-vacuous: disabling `isWorthRemembering`
      fails 7 of them and leaves the 4 that assert the _absence_ of memory passing.
- [x] Unit tests — 184 across seven files in `apps/web` (`derive.ts`, `persisted-schema.ts`, the
      seed round-trip, the saved-stack slot, default assignments, the added-skill helpers and the
      GitHub formatters) plus the `packages/matrix` read model. Run in ~80ms.
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
