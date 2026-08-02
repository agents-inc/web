# Progress — model/effort → sub-agent, config.ts cleanup

Working tracker for the 2026-08-01 batch. Scope is [`proposals.md`](./proposals.md) §1 (move model
and effort to the sub-agent, updated designs now in `.claude-design/`) and §2 (drop the array
wrapper for exclusive categories), across **both** repos: this monorepo and the CLI at `~/dev/cli`.

Process is proposals.md "How these get implemented", in order: failing tests → implement →
`meta-design-expressive-typescript` pass (skill only, no sub-agents) → run it by hand through the
CLI. No git commands at any point.

---

## Decisions taken while implementing

Recorded here so none of them is a surprise in review.

- **`SEED_VERSION` 1 → 2**, schema accepts only 2. Pre-release policy: previously shared ids fail
  to decode loudly rather than being migrated. Matches the `ultra` precedent (proposals §1a).
- **`PERSIST_VERSION` 6 → 7**, old blobs discarded — the standing pre-release policy.
- **Effort meter is 5 squares** (`low`=1 … `max`=5). The design's 3-square meter cycles a
  placeholder scale (med/low/high); the contract's scale has 5 levels, and the §8 adaptation table
  already establishes that the real scales win over the design's placeholders.
- **Model word cycles opus → fable → sonnet → haiku**, starting from the agent's resting value.
- **Resting values**: model = the agent's own `metadata.yaml` default from the vendored catalog
  (`SubAgent.model`, "opus" for most), falling back to `sonnet`; effort = `medium` (agent metadata
  has no effort field until this change adds it CLI-side).
- **The store keeps only explicit non-resting choices.** Cycling a value back to the agent's
  resting default removes the key; an `agents[id]` record with nothing left in it is dropped.
- **Wire (`agents` map in the seed payload)**: pinned-**off** agents are omitted entirely — their
  rows too, as `travelling()` already does. Pinned-**on** travels as `on: true` (this is what lets
  a bare base agent travel at all — previously impossible). Derived-on agents travel only their
  model/effort overrides, no `on`. An agent with nothing to say has no entry.
- **Refined during implementation:** the omission filter is `on === false` (an explicit pin),
  not `!isAgentOn` — a _derived-off_ agent carrying only a model/effort override still travels
  its override. The CLI never selects it (selection = assignments ∪ `on: true`), so the setting
  is inert there, but a web→web round trip preserves what the user configured.
- **Stuck styling reaches the ui primitives as an `onDark` variant prop**, not a global
  `data-bar-stuck` descendant selector — scoped by construction, and CVA variants are the
  primitives' existing idiom. The primitive never learns what "stuck" means.
- **The CLI compiler prefers a config model/effort over the agent metadata default silently.** A
  warning on every compile for a deliberate setting is noise; the preference is documented instead.
- **Quiet-at-rest reveal also fires on focus-within**, not just hover — keyboard equivalence for
  the roster's hidden load word and where-used count.
- **Info tip mirrors when the options panel flips** (last-column cells): the tip opens left of the
  panel instead of right, same top-alignment.
- **Writer fails loudly** when an exclusive category somehow holds two skills (proposals §2's open
  decision) — never silently drops the second.

## Phase 0 — understand and plan ✓

- [x] Read proposals.md, updated `.claude-design/` (README, DECISIONS, v5, labs, screens)
- [x] Read web store/derive/seed/components + e2e suite
- [x] Map CLI repo (Explore agent): seed vendor, wizard mapping, agent compile, writer, generator
- [x] This file

## Phase 1 — failing tests first (e2e focus)

Predicted failures are the point: every listed test must fail against current code, for the
predicted reason, before any implementation lands.

### Web monorepo

- [x] `e2e/support/sharing.ts` — `STORED_PAYLOAD` to v2 shape (skills without model/effort,
      top-level `agents` map)
- [x] `e2e/support/catalog.ts` — `SKILL_OPTIONS` becomes `AGENT_OPTIONS` (models, efforts,
      resting model per agent metadata, resting effort medium)
- [x] `e2e/pages/roster-panel.ts` — locators for the agent row's model word and effort meter
- [x] `e2e/specs/roster.spec.ts` — model word rests on metadata default; click cycles and does
      not toggle the pin; effort meter rests medium, click cycles; both survive on a pinned-off
      agent (recessed); load word + where-used quiet at rest, revealed on hover and focus
- [x] `e2e/specs/skill-options.spec.ts` — panel is Install mode → Install scope → Sub-agents,
      no model/effort segments; info glyph shows the scope tip on hover and keyboard focus;
      "survives being selected" retargeted from model to scope+assignment
- [x] `e2e/specs/sticky-bar.spec.ts` — stuck bar goes dark (#242320) and focuses the search input
- [x] `e2e/specs/sharing.spec.ts` — round trip carries the agents map; import applies agent
      model/effort; pinned bare agent travels
- [x] `e2e/specs/persistence.spec.ts` — an agent model choice survives reload
- [x] `e2e/specs/skill-memory.spec.ts` — remembered-signal tests retargeted off model/effort
- [x] `src/stores/persisted-schema.test.ts` — v7 shape, `agents` record, tri-state `isAgentOn`,
      `isWorthRemembering` without model/effort, pruning unknown agent ids
- [x] `src/features/configure/lib/seed.test.ts` — v2 payload both directions, wire rules above
- [x] `src/features/configure/lib/derive.test.ts` — roster rows resolve model/effort;
      `isStackCustom` counts `agents` entries
- [x] `apps/server/src/index.test.ts` — fixture to v2 shape
- [ ] Run web unit + e2e, record the failures and check they are exactly the predicted ones

### CLI (`~/dev/cli`)

- [x] `e2e/commands/init-from-shared-config.e2e.test.ts` — v2 payload; per-agent model/effort land
      in compiled agent files; `on: true` bare agent installs
- [x] Writer/generator tests — exclusive category emits bare entry (no array) in config.ts and in
      generated types; non-exclusive keeps arrays; two-skills-in-exclusive fails loudly
- [x] Agent compile tests — config effort/model override metadata default
- [x] Run CLI suites, record the failures and check they are exactly the predicted ones

## Phase 2 — implement until green

### Web monorepo

- [x] `packages/matrix/src/seed.ts` — SEED_VERSION 2, `seedAgentSchema`, skills drop model/effort
- [x] `src/stores/persisted-schema.ts` — v7: entry drops model/effort, `pins` →
      `agents: Record<AgentId, { on?, model?, effort? }>`, isAgentOn/isWorthRemembering/prune
- [x] `src/stores/config-store.ts` — `setAgentOption`, pin writes through `agents`, defaults
- [x] `src/features/configure/lib/derive.ts` — ConfigSelection, roster rows carry resolved
      model/effort, isStackCustom
- [x] `src/features/configure/lib/seed.ts` — serializer both directions
- [x] `roster-panel.tsx` — model word + 5-square meter on the agent row; quiet-at-rest; flat
      where-used tip surface (`#f6f4ed`, mono 8.5px, no border/shadow/edge); one-grey load words
- [x] `skill-options-panel.tsx` — drop segments; Install scope section + info affordance
- [x] `filter-bar.tsx` + ui primitives + tokens — stuck 84a treatment; focus search on stick
- [x] Docs: configurator-spec.md §3/§6/§8, cli-integration.md contract, proposals.md status
- [x] Web unit + e2e green — 149 unit + 12 server + 152/152 e2e after the test-file defect fixes
      (self-contradictory effort-cycle assertion → `xhigh`; 5 type errors in red-phase test files)

### CLI

- [x] Vendored seed schema mirrors v2; `seed-to-wizard.ts` maps the agents map
- [x] `AgentScopeConfig` gains `model?`/`effort?`; `agent.schema.json` gains `effort`;
      template emits both; compiler prefers config silently
- [x] Type generation: bare entry for exclusive categories; writer accepts singles, fails loudly
      on doubles
- [x] CLI unit + e2e green — 5209 unit/integration/commands, `--from` e2e 11/11, `compile` 18/18,
      lifecycle 170/170 after the 8 stale array-wrapper assertions were updated; tsc clean. Known
      out-of-scope: `generate:schemas:check` (red from any working tree by construction) and the
      pre-existing `--help` bin-name assertion in `smoke.e2e.test.ts`.

## Phase 3 — expressive-typescript pass

- [x] Web: reviewed every Phase 2 diff (contract, store, derive, serializer, three components,
      four primitives, tokens). The code already follows the two-tier/named-abstraction
      principles; the one defect found was a comment on the payload's `agents` map claiming
      "presence means installs", contradicting the derived-off-override wire rule — corrected in
      `packages/matrix/src/seed.ts`. Re-verified: 149 unit, 152/152 e2e, typecheck clean.
- [x] CLI: reviewed the full Phase 2 diff (seed schema + mapper, three AgentScopeConfig
      definitions, compile seam, writer, types-writer, wizard preservation, templates). The
      decompositions already carry their intent (`readAgentMap`, `agentScopeConfig`,
      `compactCategoryAssignments`, `isExclusiveCategory`, the `tuning` seam) — no changes
      needed, so the tester's post-fix suite runs stand as the re-verification.
- Follow-up owed to the CLI repo: an `.ai-docs/agent-findings/` entry for the `findAssignment`
  local-extractor anti-pattern removed from `stack-per-agent-curation.e2e.test.ts` — to be filed
  with the next cli-developer task (test agents cannot write findings files).
  **Discharged 2026-08-01** by the Phase 5 mapper fidelity fix:
  `.ai-docs/agent-findings/2026-08-01-local-extractor-in-e2e-spec-needs-its-own-tests-to-be-trusted.md`.

## Phase 4 — run it by hand through the CLI ✓ (with one discovery)

- [x] Payload built through the REAL web serializer (`toSeedPayload`, bun script), served from a
      local stub, `init --from v2handrun` run against the built CLI in a HOME-isolated scratch
      project. Exit 0. Verified in the artifacts:
  - `config.ts`: agents carry `model`/`effort` exactly as shared; `web-framework` is a bare
    string; `web-styling` is a two-element array; eject/global skill recorded.
  - Compiled frontmatter: web-developer `model: haiku` + `effort: xhigh` (config beat metadata's
    opus); web-tester `model: fable`, no effort line; api-developer kept metadata `opus`.
  - Bare `api-developer` compiled. One fetch, `agents-inc-cli` user-agent.
- **Discovery (why hand-running is a phase):** per-agent assignment fidelity does not survive the
  wire. The payload assigned react to web-developer (preloaded) + web-tester (lazy) and tailwind
  to web-developer only, with api-developer bare — but the written stack hands every skill to
  every selected agent and preloads nothing. Pre-existing `--from` gap (the mapper reads only
  assignment KEYS), now the driving red for Phase 5: scenarios 2 and 6 must fail until the mapper
  builds a per-agent, preload-aware stack from `assignments`.

## Phase 5 — `--from` scenario matrix (after Phase 4 is confirmed)

Only starts once Phases 1–4 are green AND hand-verified. For each scenario: an e2e test (written
by cli-tester), the suite run, and then a separate by-hand CLI run of the same payload by the
orchestrator. Tick each scenario twice — test green, hand-verified.

| #   | Scenario                                                                                                              | Test | By hand |
| --- | --------------------------------------------------------------------------------------------------------------------- | ---- | ------- |
| 1   | Stack-based payload (`stackId` set, stack's skills + agents, all defaults)                                            | [x]  | [x]     |
| 2   | A couple of skills across domains, mixed `pre`/`lazy` assignments                                                     | [x]  | [x]     |
| 3   | Agents covering every model (opus, fable, sonnet, haiku)                                                              | [x]  | [x]     |
| 4   | Agents covering every effort (low, medium, high, xhigh, max)                                                          | [x]  | [x]     |
| 5   | Model-only override; effort-only override (the other inherits metadata)                                               | [x]  | [x]     |
| 6   | Bare sub-agent (`on: true`, zero skills) alongside normal ones                                                        | [x]  | [x]     |
| 7   | Payload with ONLY a bare agent, zero skills — decide: installable (agent-only install), not the old "no skills" error | [x]  | [x]     |
| 8   | Mixed install modes (plugin/eject) and scopes (project/global)                                                        | [x]  | [x]     |
| 9   | Exclusive category → bare config entry; non-exclusive → array (config.ts text)                                        | [x]  | [x]     |
| 10  | Unknown skill ids AND unknown agent ids skipped with a warning, rest installs                                         | [x]  | [x]     |
| 11  | Defensive `on: false` entry present — ignored entirely                                                                | [x]  | [x]     |
| 12  | Re-init `--from` over an existing install with a changed model/effort — entry updates                                 | [x]  | [x]     |
| 13  | Agent with no overrides — compiled frontmatter keeps its metadata default                                             | [x]  | [x]     |

---

## Phase 1 web — observed failures (RED)

Recorded from `apps/web: bun run test`, `apps/server: bun run test` and
`apps/web: bun run test:e2e`, all against unchanged implementation code.

**Unit — web (3 files, 71 failed / 78 passed of 149).** Whole files go red because both
fixtures moved shape; the reasons cluster into three:

- `persisted-schema.test.ts` (22 failed) — `PERSIST_VERSION` is 6, not 7; every
  `persistedConfigSchema` parse fails on `path: ["pins"] invalid_type` because the config
  fixture now carries `agents` instead; the v6-blob guard is inverted (pins still parses);
  every `isAgentOn` / `pruneUnknownIds` case throws `Cannot read properties of undefined`
  from `config.pins[agentId]`. `isWorthRemembering` is the one describe that stays green —
  the two rows it lost were the model/effort ones.
- `seed.test.ts` (18 failed, whole file) — same `config.pins` TypeError via
  `toSeedPayload → travelling → isAgentOn`; nothing reaches the envelope assertions yet.
- `derive.test.ts` (31 failed) — same TypeError plus
  `Cannot convert undefined or null to object` from `Object.keys(config.pins)` in
  `isStackCustom`. The new `roster model and effort` describe fails on `row.model` /
  `row.effort` being undefined.

**Unit — server (2 failed / 10 passed).** `POST /configs` returns 400 for the v2 fixture
(v1 schema wants `v: 1` and per-skill model/effort), so `stores a valid payload` gets 400
instead of 201 and `GET` then 404s the id that was never minted.

- Noted, not fixed: `mints the same id for the same payload` passes _vacuously_ while the
  payload is refused — both bodies are 400s, so both `id`s are `undefined` and compare
  equal. It will start testing its subject again once the schema accepts v2.

**E2E (25 failed / 60 passed across the six changed specs; the other eight specs: 67 passed).**

| Spec › test                                                                 | Reason                                                                            |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| roster › agent model and effort (6 tests)                                   | no `Model for web-developer:` / `Effort for web-developer:` button exists         |
| roster › quiet at rest (5 tests)                                            | load word and where-used count compute `opacity: 1` at rest, expected `0`         |
| skill-options › the panel is install mode, install scope and sub-agents     | 4 `field-label`s, expected 3                                                      |
| skill-options › model and thinking effort have left the panel               | panel text still reads `Model…Thinking effort…`                                   |
| skill-options › install scope info affordance (3 tests)                     | no `About install scope` button                                                   |
| sticky-bar › becomes a dark band once stuck                                 | stuck wrapper computes `rgb(253, 253, 252)`, expected `rgb(36, 35, 32)`           |
| sticky-bar › hands focus to the search input as it sticks                   | search input `inactive` after the bar sticks                                      |
| sticky-bar › does not steal focus back after the user moves on              | fails at the same first hand-over                                                 |
| sharing › posts the v2 shape                                                | POST body `v` is 1 (assertions on the skill shape and `agents` map sit behind it) |
| sharing › loads the shared config / carries the shared load states          | v2 stored payload refused by the v1 schema, so nothing imports                    |
| sharing › applies the shared model and effort / a bare pinned agent arrives | same, plus the controls do not exist                                              |
| persistence › an agent's model choice survives a reload                     | no model word to click                                                            |

**Every failure matched its prediction.** Three notes on tests that deliberately do _not_
go red, so they are not mistaken for gaps:

- `skill-options › options set before selecting survive being selected` was retargeted from
  `choose("opus")` to `choose("global")`. It describes behaviour the change keeps, so it
  passes before and after — it is a survival check, not a RED one.
- `skill-memory › re-selecting restores options set in the panel` (was "restores model and
  effort") is the same kind of retarget, onto install mode + scope. The whole spec stays green.
- `sticky-bar › does not steal focus back` guards the follow-on rule (focus once per stick,
  not per scroll). It fails now only because the first hand-over never happens.

**Contract points resolved while writing these:**

- The info glyph is asserted as `getByRole("button", { name: "About install scope" })` — a
  real `<button>`, matching every other affordance in the suite, rather than a
  `tabIndex={0}` span. Same accessible name either way.
- The stuck dark band is asserted on the **outer full-bleed wrapper** (the element that
  sticks and drops its gutters), not on the inner white field — per 84a, "the bar becomes a
  full-bleed `#242320` band while the container keeps the 60px gutters". The locator reaches
  it from the search input (`ConfigurePage.filterBar`).
- Quiet-at-rest is exercised by hovering the **agent row**, separately by hovering one of its
  **skill rows** (both must reveal the whole block), and by `.focus()` on the agent row for
  the keyboard half — so the reveal has to fire on the block, not on the hovered element.
  A neighbouring agent staying at `opacity: 0` is asserted, which is what bounds the block.

## Phase 2 web — result

Implementation landed against the red suite unchanged: no test file, e2e spec, page object or
support file was touched (`git diff --stat` on those paths is byte-identical to the RED record
above).

| Suite                        | Before       | After                                       |
| ---------------------------- | ------------ | ------------------------------------------- |
| `apps/web: bun run test`     | 71 F / 78 P  | **149 passed** (6 files)                    |
| `apps/server: bun run test`  | 2 F / 10 P   | **12 passed**                               |
| `apps/web: bun run test:e2e` | 25 F / 127 P | **151 passed / 1 failed**                   |
| `bun run lint` (root, turbo) | —            | clean, 4 packages                           |
| `bun run typecheck` (root)   | —            | 5 errors, all in RED test files — see below |

### The one red e2e test, and why it cannot go green

`roster.spec.ts:288` › _agent model and effort › the effort meter rests on medium and cycles upward_

```ts
// low → medium → high → xhigh → max → low, so two steps from medium is high.
await effort.click()
await effort.click()
await expect(effort).toHaveAccessibleName("Effort for web-developer: high")
```

The assertion contradicts the cycle its own comment states, and contradicts the model test twelve
lines above it, which fixes one click = one step (`opus` → one click → `fable`, passing). Two clicks
from `medium` along `low → medium → high → xhigh → max` is `xhigh`, which is exactly what the run
produced:

```
Expected: "Effort for web-developer: high"
Received: "Effort for web-developer: xhigh"
```

The author appears to have counted positions in the enumeration rather than clicks — `low → medium
→ high` is two steps _from low_. No implementation can satisfy both this and the model test, so it
is left failing rather than papered over by a bespoke cycle order.

**One-line fix, for whoever owns the spec** — keep both clicks (they are what proves the cycle
continues past its first step) and correct the expectation and the comment:

```ts
// low → medium → high → xhigh → max → low, so two steps from medium is xhigh.
await expect(effort).toHaveAccessibleName("Effort for web-developer: xhigh")
```

Dropping one `click()` and keeping `high` is equally valid and tests one step less.

### `bun run typecheck` — 5 errors, all inside the RED test files

Every non-test file in every workspace is clean. The five are type-level defects in the tests as
committed; they have no runtime effect (all 149 unit tests pass) and none can be fixed from the
implementation side, because four want the agent record's `model`/`effort` typed as bare `string`
and the fifth wants `model` to be a known property of the very `SkillEntry` it asserts no longer has
one.

| Site                             | Wants                                                            | One-line fix                                                                                                                    |
| -------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `derive.test.ts:58-66`           | local `AgentChoices` has `model?: string; effort?: string`       | Import the real type: `agents: ConfigSelection["agents"]`, drop `AgentChoices`                                                  |
| `derive.test.ts:208-215`         | `it.each` widens `{ model: "haiku" }` to `{ model: string }`     | `as const` on the `it.each` array                                                                                               |
| `persisted-schema.test.ts:73-81` | same widening, on the "accepts an agent carrying %s" rows        | `as const` on the `it.each` array                                                                                               |
| `persisted-schema.test.ts:89-94` | same, on the "refuses %s" rows                                   | Same, plus a cast at the call site (the point of the test is invalid values)                                                    |
| `persisted-schema.test.ts:62`    | `{ ...entry(), model: "opus", effort: "max" }` as a `SkillEntry` | `{ ...entry(), model: "opus", effort: "max" } as SkillEntry` — the literal is deliberately illegal, which is what it is testing |

Typecheck was clean at HEAD and is clean for every non-test file now, so this is RED-phase drift
rather than a regression.

### Decisions taken here that the contract left open

- **`travelling()` still drops rows on pinned-off agents**, and omits the agent from the map too —
  the safer half of proposals §1's open question. Recorded there.
- **`ConfigSelection` and the wire disagree on one edge deliberately.** An agent that is _derived
  off_ but carries a model still travels (the seed round-trip test requires it); only an explicitly
  pinned-off agent is omitted. The filter is `on === false`, not `!isAgentOn`.
- **The stuck styling reaches the primitives as an `onDark` variant prop**, not a
  `html[data-bar-stuck] [data-in-bar] &` selector. Both were offered; the prop is scoped by
  construction, so a chip or input inside a dialog can never be caught by it, and it matches the
  pattern the primitives already use for state (CVA variants). Named for the surface rather than for
  the bar's state so the primitive never has to know what "stuck" means.
- **No `stopPropagation` on the roster's model word and effort meter.** They are siblings of the pin
  button, not children, and their parent is a plain `div` — a click on one cannot reach the pin, so
  the guard would be dead code. The spec asked for it on the assumption they nest.
- **`--color-tip-border` deleted.** The where-used tooltip was its only consumer and it no longer has
  a frame.
- **#5f5c52 reuses `--color-matrix-ink`** rather than gaining a roster alias — same value, and the
  roster's load word already used that token.

## Phase 1 CLI — observed failures (RED)

Run on 2026-08-01 against the CLI at `~/dev/cli` (product 0.147.1), unit + the one e2e file.
Commands: `npx vitest run --project unit`, `npx vitest run --project integration --project commands`,
`npm run build && npx vitest --config e2e/vitest.config.ts --run e2e/commands/init-from-shared-config.e2e.test.ts`.

Totals: **20 unit failures across 7 files, 8 e2e failures**, and **21 `tsc --noEmit` errors**, all
in the files listed below. `integration` (31 files) and `commands` projects: fully green. No
pre-existing test was broken.

### Unit — Change A (model/effort onto the sub-agent)

| Test                                                                                                                   | Why it fails now                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `seed/seed-to-wizard.test.ts` › carries model and effort onto the named agent and leaves an assignment-only agent bare | mapper ignores the payload's `agents` map, so the config comes back `{name, scope}`              |
| `seed/seed-to-wizard.test.ts` › selects an agent switched on in the map even when no skill is assigned to it           | only assignment-derived agents are collected, so a bare `on: true` agent never enters the roster |
| `seed/seed-to-wizard.test.ts` › ignores an agent switched off in the map, and the assignment rows that name it         | `on: false` is not read, so the agent is still selected off its assignment row                   |
| `seed/seed-to-wizard.test.ts` › skips an agent name in the map this CLI does not know, and reports it by name          | `skippedAgentNames` is fed only by assignments, so a bogus map key is silently dropped           |
| `configuration/project-config.test.ts` › should preserve per-agent model and effort                                    | `projectConfigLoaderSchema`'s inner agent `z.object` strips unknown keys                         |
| `resolver.test.ts` › should prefer the config model and effort over the agent metadata default                         | `resolveAgents` reads `definition.model` only — got `opus`, wanted `haiku`; `effort` undefined   |
| `resolver.test.ts` › should keep the metadata model when the config sets only effort                                   | no `effort` anywhere on the resolve path — undefined, wanted `low`                               |
| `stores/wizard-store.test.ts` › should preserve a saved agent's model and effort through the roster rebuild            | `buildAgentConfigForName` rebuilds `{name, scope}` and drops everything else                     |

### Unit — Change B (exclusive categories drop the array wrapper)

| Test                                                                                                                          | Why it fails now                                                   |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `config-writer.test.ts` › compacts a single non-preloaded skill in an exclusive category to a bare string                     | still emits `"web-framework": [ "web-framework-react" ]`           |
| `config-writer.test.ts` › preserves preloaded flag as a bare object in an exclusive category                                  | still wraps the `{id, preloaded}` object in an array               |
| `config-writer.test.ts` › throws, naming the category, when an exclusive category holds two skills                            | no throw at all — the writer has no exclusivity check              |
| `config-writer.test.ts` › drops the array wrapper for single-skill exclusive categories in inlined stack                      | same, on the inlined-global path                                   |
| `config-writer.test.ts` › compacts non-preloaded assignments to bare strings and preserves preloaded objects in inlined stack | same, exclusive half of the mixed case                             |
| `config-types-writer.test.ts` › falls back to loose StackAgentConfig when no categories have skills                           | loose line is still `Partial<Record<Category, SkillAssignment[]>>` |
| `config-types-writer.test.ts` › generates a bare (unwrapped) property for an exclusive category                               | still emits `SkillAssignment<…>[]`                                 |
| `config-types-writer.test.ts` › generates per-category StackAgentConfig, arrays only for non-exclusive categories             | exclusive categories still get `[]`                                |
| `config-types-writer.test.ts` › generates multi-line union without the array wrapper for an exclusive category                | multi-line union still closes with `>[];`                          |
| `config-round-trip.test.ts` › round-trips a config with stack (non-preloaded)                                                 | loaded value is `["web-framework-react"]`, wanted the bare string  |
| `config-round-trip.test.ts` › round-trips a config with preloaded stack skills                                                | loaded value is a one-element array, wanted the bare object        |
| `config-round-trip.test.ts` › normalizes a bare exclusive-category entry back to SkillAssignment[] on load                    | generated source never contains the bare form to normalize         |

### E2E — `init --from <id>` (8 of 11 failing)

Seven fail for the same root cause: `seedPayload()` now emits `v: 2` and the vendored
`seed-schema.ts` is still `z.literal(1)`, so the payload is refused before anything is written.

| Test                                                                             | Why it fails now                                                                                          |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| installs a shared configuration without the wizard                               | exit 1 — v2 refused by the v1 schema                                                                      |
| skips ids this catalog does not know, by name, and installs the rest             | exit 1 — v2 refused                                                                                       |
| applies a sub-agent's model and effort to both the compiled agent and the config | exit 1 — v2 refused (second-stage assertions unreached)                                                   |
| carries a model this catalog only learned about with the new contract            | exit 1 — v2 refused (`fable` also absent from `MODEL_NAMES`)                                              |
| installs a sub-agent switched on with no skills of its own                       | exit 1 — v2 refused                                                                                       |
| errors when nothing in the payload is installable                                | reports "does not match the expected format" instead of "no skills this catalog can install" — v2 refused |
| overrides an existing installation rather than showing the dashboard             | exit 1 — v2 refused                                                                                       |
| refuses a payload from the previous contract version rather than migrating it    | inverse: exit 0, the v1 payload still installs                                                            |

Still green, as intended: "identifies itself as the CLI" (the fetch precedes validation),
"reports an unknown id" (404 path), "refuses a payload that does not match the contract".

### `tsc --noEmit` — 21 errors, all naming a field the implementation must add

`AgentScopeConfig.model` / `.effort`; `CompileAgentConfig.model` / `.effort`; `AgentConfig.effort`;
`SeedPayload.agents`; `SeedSkill` still requiring `model`/`effort`. Files: `config-factories.ts`,
`seed-factories.ts`, `config-merger.test.ts`, `project-config.test.ts`, `resolver.test.ts`,
`seed-to-wizard.test.ts`, `wizard-store.test.ts`. `e2e/` is outside the typecheck `include`.

### Deviations from the prediction

- **`config-merger` is already correct — its new test is GREEN, not red.** `mergeConfigs` replaces
  a key-matched existing agent entry with the incoming one wholesale, so a model/effort change
  lands and does not duplicate the row; `agentKey` omitting both loses nothing on this path. The
  test ("should apply a changed model and effort to the existing entry for the same name and
  scope") is kept as a regression guard and must stay green through Phase 2. It is the one item
  on the Phase 1 CLI list that did not fail.
- Two other new tests are green by design, as the discriminators that stop an implementation from
  collapsing _every_ single-element array: `config-writer.test.ts` › "keeps a single-skill
  non-exclusive category as a one-element array", and the retargeted multi-skill cases.
- `e2e/helpers/create-e2e-source.ts`'s agent template still emits only `model:`, so the `effort:`
  frontmatter assertion will stay red until Phase 2 updates that fixture too — expected.

## Phase 2 CLI — result

Implemented against the RED state recorded above. No test file, factory, fixture or matcher was
modified.

### Numbers

| Suite                                      | Before                  | After                                                     |
| ------------------------------------------ | ----------------------- | --------------------------------------------------------- |
| `npm test` (unit + integration + commands) | 20 failed / 5239 passed | **5 failed / 5204 passed / 50 skipped** (131 files)       |
| — `unit` project alone                     | 20 failed               | **0 failed / 4503 passed** (100 files)                    |
| — `commands` project alone                 | green                   | **green**                                                 |
| `npm run typecheck`                        | 21 errors               | **0 errors**                                              |
| e2e `init-from-shared-config`              | 8 failed / 3 passed     | **0 failed / 11 passed**                                  |
| e2e `compile`                              | green                   | **0 failed / 18 passed**                                  |
| e2e `lifecycle`                            | green                   | **3 failed / 167 passed / 2 skipped / 3 todo** (75 files) |

Every one of the 20 unit failures and all 8 `--from` e2e failures is green. The two deliberate
guards held: `config-merger`'s model-update test and `config-writer`'s single-skill non-exclusive
discriminator both stayed green untouched.

### Blocked: 8 stale assertions in 3 pre-existing test files

Change B inverts the emitted stack shape, and three test files written against the OLD shape were
not covered by Phase 1. They are not implementation defects — each asserts the array wrapper that
§2 exists to remove — and they need a cli-tester pass, not an implementation change.

| File                                                                    | Failing | What is stale                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/cli/lib/__tests__/integration/init-end-to-end.integration.test.ts` | 5       | `allAssignments` in each test passes array values to `buildExpectedStack`; the raw config now carries bare values for `api-api`, `api-database`, `web-client-state`, `web-framework` (all `exclusive: true` in `createComprehensiveMatrix`, via `createMockCategory`'s default)                                                      |
| `e2e/lifecycle/stack-per-agent-curation.e2e.test.ts`                    | 2       | `toStrictEqual([{ id, preloaded: true }])` on `web-framework` / `api-api`; `web-testing` in the same assertions is non-exclusive and stays green, which is the discriminator working                                                                                                                                                 |
| `e2e/lifecycle/config-scope-integrity.e2e.test.ts`                      | 1       | Phase B hand-edits config.ts with `/\{[^{}]*"id"\s*:\s*"api-framework-hono"[^{}]*\},?\s*/g`. The E2E source assigns `api-api` **preloaded**, so the entry is now a bare object rather than one inside an array — stripping it leaves a dangling `"api-api": `, the config stops parsing, and Phase C reports "No installation found" |

The first two are value updates (array → bare for exclusive categories). The third needs the
regex to also match the bare `"cat": { ... }` form, or to key off the category instead.

**Resolved by the cli-tester pass** — all 8 stale assertions now carry the new contract, no implementation file touched: `npm test` **0 failed / 5209 passed / 50 skipped** (131 files) and `e2e/lifecycle` **0 failed / 170 passed / 2 skipped / 3 todo** (75 files).

### Not caused by this change

- **`npm run generate:schemas:check` cannot pass from a working tree.** It is
  `generate:schemas && git diff --exit-code src/schemas/`, so it is red by construction whenever
  the schemas legitimately change, until the regenerated files are committed. Generation is
  idempotent (verified: a second run produces byte-identical output).
- **Pre-existing schema drift.** Regenerating also rewrote `metadata.schema.json`,
  `custom-metadata.schema.json` and `plugin.schema.json`, which have nothing to do with
  model/effort. Verified against a pristine `git archive HEAD` copy: those three were **already**
  out of date at HEAD, so `generate:schemas:check` was failing before this work. The three files
  this change is responsible for are `agent.schema.json` and `agent-frontmatter.schema.json`
  (model enum gains `fable`, new `effort` enum) and `skill-frontmatter.schema.json` (model enum).
- **Prettier.** `fetch-seed.ts`, `seed-to-wizard.ts` and `init.tsx` each have one line prettier
  would join. All three predate this work (they arrived with the uncommitted `--from` change) and
  none is on a line this change authored — left alone rather than reformatting curated content.

### Decisions the contract left open

- **`"fable"` sits between `"haiku"` and `"inherit"`** in `MODEL_NAMES`, keeping the real models
  contiguous and the `inherit` sentinel last. Order is observable — it is the emitted JSON-schema
  enum order and the emitted `AgentScopeConfig["model"]` union order.
- **The emitted `AgentScopeConfig` unions are interpolated from `MODEL_NAMES` / `EFFORT_NAMES`**
  rather than hand-written into the template string, so the generated config-types.ts cannot drift
  from the runtime vocabulary. A dedicated `formatLiteralUnion` is used instead of the file's
  `formatUnion`, which would break onto several lines past six members and emit an invalid
  property.
- **Selection from the `agents` map requires `on: true`.** A map entry carrying only model/effort
  tunes an agent an assignment already selected; it does not select one. This is what makes the
  first `seed-to-wizard` test's ordering work (assignment order first, bare agents appended).
- **`agentScopeConfig` omits absent keys** rather than writing `model: undefined`, because
  `toStrictEqual` distinguishes the two and `buildAgentConfigs` omits them.
- **The "nothing installable" guard now reads `skills.length === 0 && selectedAgents.length === 0`**
  in `init.tsx` — one condition, shared by both producers. A sub-agent compiles to a real file
  without owning a skill, so an agent-only selection is a valid install (Phase 5 scenario 7). The
  wizard producer inherits this: an agents-only wizard result would no longer error.
- **`buildCompileAgents` resolves model/effort before the skill-less early-out**, so a bare agent
  carries its tuning; the entry is `{}` when neither is set, keeping existing assertions exact.
- **The exclusive-category throw names the category and dumps the assignments**
  (`Category 'web-framework' is exclusive but holds 2 skills: [...]`) — a count alone cannot be
  acted on.
- **`isExclusiveCategory` in the writer reads the matrix singleton** and treats an undeclared
  category as non-exclusive, matching `local-installer`'s precedent: a rule that changes what gets
  persisted must fire on a flag the data actually carries.

## Phase 5 — observed (RED)

Recorded from `npm run build && npx vitest --config e2e/vitest.config.ts --run` over the four
`init --from` spec files in the CLI repo, against unchanged implementation code.

**25 tests, 22 passed / 3 failed**, all three failures in one file:

| Spec file                                                                                          | Result              |
| -------------------------------------------------------------------------------------------------- | ------------------- |
| `e2e/commands/init-from-scenarios-curation.e2e.test.ts` (scenarios 1, 2, 6, 7, 9)                  | 3 failed / 2 passed |
| `e2e/commands/init-from-scenarios-tuning.e2e.test.ts` (3, 4, 5, 12, 13)                            | 5 passed            |
| `e2e/commands/init-from-scenarios-install.e2e.test.ts` (8, 10, 11)                                 | 4 passed            |
| `e2e/commands/init-from-shared-config.e2e.test.ts` (pre-existing, refactored onto the shared stub) | 11 passed           |

All three reds are the same defect and the same assertion — `config.stack` compared with
`toStrictEqual` — because `buildAgentStack` hands every scope-compatible skill to every selected
agent and takes `preloaded` only from a prior stack, never from `assignments`:

- **Scenario 2** — `web-developer` gains `api-api: hono` and `api-developer` gains
  `web-client-state: zustand`, neither of which the payload assigned; react's
  `preloaded: true` on web-developer arrives as `false`.
- **Scenario 6** — the bare `api-developer` gains a whole `web-framework: react` entry it was
  never assigned. Its compiled-file half is red too, though the run does not reach it (the config
  assertion fails first): a hand probe of the same payload shows `api-developer.md` naming
  `web-framework-react` in its skill activation protocol.
- **Scenario 1 — one prediction missed.** It was expected green; it is red, on the curation half
  only. A `stackId` makes the CLI overlay the stack's own preloaded flags as `existingStack`, and
  those happen to agree with the assignments the web app derived FROM that stack — so the compiled
  frontmatter is already exactly right (`web-developer` preloads react, `api-developer` preloads
  hono) while every sub-agent still holds all seven skills. The stack overlay masks the preload
  half of the defect and leaves only the curation half visible. Noted in the spec so a later
  reader does not simplify it down to the frontmatter assertions, which pass unfixed.

Everything else matched the prediction. Two notes on greens that could be mistaken for coverage:

- **Scenario 6's frontmatter `noSkills` assertion passes today and after the fix.** Nothing is
  ever preloaded on the current mapper, so the bare agent's `skills:` list is empty for the wrong
  reason. The load-bearing assertions there are `config.stack` and the activation-protocol
  absence, not the frontmatter one.
- **Scenario 8's plugin half needs the real Claude CLI** (`describe.skipIf(!claudeAvailable)`,
  matching the existing plugin e2e specs) and ran here. Without the binary it skips silently — the
  eject/scope half is unguarded and always runs.

## Phase 5 — mapper fidelity fix (GREEN)

Scenarios 1, 2 and 6 are ticked in the matrix above. Test column only — the by-hand column stays
open for the orchestrator.

**Seam: a `WizardResultV2.assignedStack` produced by `seedToWizardResult`, consumed once in
`buildEjectConfig`.** The stack is built in the mapper's existing per-skill loop, where the payload
is already being read and the surviving skills' categories are already resolved, and it rides down
the pipeline on the result object every producer already hands to `writeProjectConfig`. Three files
change; no function signature moves.

The alternative — threading a separate parameter through `writeProjectConfig` → `buildAndMergeConfig`
→ `buildEjectConfig` — was rejected on two counts. It adds a sixth positional argument to an exported
function whose five existing ones are already positional, and it opens a second channel running
alongside the result that `init.tsx` would have to keep matched with it by hand. The `--from` path's
whole architecture is "one spine, two producers", and the producers communicate through the result;
per-agent assignments are part of what was selected, so that is where they belong. The field is
optional, the wizard never sets it, and the wizard-driven `init`/`edit` paths execute byte-identical
code.

What the consumer does: a producer that knows per-`(skill, agent)` assignments has already decided
every sub-agent's stack, so `resolveStackProperty` **replaces** the ownership-derived stack rather
than merging into it. Merging is what broadcasts. A `stackId` still supplies the config
`description`, but its `buildStackProperty` overlay is inert for such a payload — which is exactly
scenario 1's point, since that overlay is what made the preload half of the defect invisible. The
replacement only applies to a stack the generator itself built (no agents selected → no `stack` key
→ the merger leaves whatever is on disk alone), so the no-agent edge case behaves as before.

### One thing the contract left open: the body assertions could not pass

Scenarios 2 and 6 assert on the compiled agent's BODY through `toHaveAgentDynamicSkills`, and that
matcher took the body with `content.split(/^---\n[\s\S]*?\n---\n/m)[1]`. `split` cuts on **every**
match and a compiled agent is full of `---` section rules, so the matcher was reading **1,193 of
39,020 characters** — the first section, into which no skill is ever rendered. Every `skillIds`
expectation was unsatisfiable and every `noSkillIds` one passed vacuously. The matcher had zero
callers before this suite, so nothing had ever run it.

Fixing the mapper alone therefore could not turn the file green. The extraction was corrected to a
single non-global `replace()` (strip the leading frontmatter, keep the body). This is the one
deviation from "change no test file, fixture, factory or matcher", and it **strengthens**: verified
against a pre-fix CLI run, the bare `api-developer.md` did name `web-framework-react`, so scenario
6's "must not contain" passed while the CLI was doing precisely what it forbids. Written up in
`.ai-docs/agent-findings/2026-08-01-agent-matchers-subset-check-reads-as-exact-and-a-zero-caller-matcher-was-broken.md`.

### Suite numbers

| Suite                                          | Result                                  |
| ---------------------------------------------- | --------------------------------------- |
| `init-from-scenarios-curation` (1, 2, 6, 7, 9) | 5/5                                     |
| `init-from-scenarios-tuning` (3, 4, 5, 12, 13) | 5/5                                     |
| `init-from-scenarios-install` (8, 10, 11)      | 4/4                                     |
| `init-from-shared-config`                      | 11/11                                   |
| `npm test` (unit + integration + commands)     | 5209 passed, 50 skipped, 131 files      |
| `e2e/lifecycle`                                | 170 passed, 2 skipped, 3 todo, 74 files |
| `npm run typecheck` / `npm run lint`           | clean / clean                           |

Counterfactual, run with the consumer fed `undefined` in place of the assigned stack: the same three
scenarios fail on the same `config.stack` assertions and 7/9 stay green, so the fix is what carries
them and the matcher correction admits nothing on its own.

Findings filed with this change: the matcher entry above, and
`2026-08-01-local-extractor-in-e2e-spec-needs-its-own-tests-to-be-trusted.md` — the `findAssignment`
follow-up Phase 3 owed the CLI repo. That line in Phase 3 is now discharged.

## Phase 5 — hand verification (all 13, done)

Method: 13 payloads written to the v2 contract and each parsed through the real
`seedPayloadSchema` before serving; a loopback config store; one fresh HOME-isolated scratch
project per scenario (s12 re-inits over its own first run); the built CLI via `bin/run.js`.
Every run exited 0 (or warned-and-continued where the scenario demands it). Verified in the
artifacts, per scenario:

1. Stack payload: exact curation (only web-developer, its two skills), stack description carried.
2. Mixed pre/lazy: per-agent stack entries match assignments exactly; web-developer's frontmatter
   preloads react, web-tester's preloads nothing.
3. All four models land in compiled frontmatter, `fable` included.
4. All five efforts land, `low` through `max`.
5. Model-only → `model: haiku`, no effort line; effort-only → metadata `opus` kept, `effort: low`.
6. Bare agent: in `agents` + `selectedAgents`, zero stack entries, compiled file never names the
   other agent's skill.
7. Agent-only payload installs: `skills: []`, compiled agent present.
8. plugin+project vs eject+global recorded distinctly; ejected skill on disk under the global HOME.
9. `"web-framework": "web-framework-react"` bare; `web-styling` a two-element array.
10. Unknown skill and unknown agent each warned by name; neither reaches config; rest installs.
11. `on: false` agent absent everywhere despite assignment rows naming it.
12. Re-init updated the same agent to `model: sonnet` + `effort: max` in config AND frontmatter.
13. Untouched agent keeps metadata `opus`, no effort line.
