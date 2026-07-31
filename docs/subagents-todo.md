# Sub-agent selection — todo

Improvements noticed while working through the design mockups (2026-07-30).
Related docs: [`configurator-spec.md`](./configurator-spec.md) · [`cli-integration.md`](./cli-integration.md).

The CLI repo has fixes in flight and cannot take pushes right now, so CLI-owned items
are parked here until it reopens.

## CLI-side (parked here for now)

- [ ] **Unify the sub-agents across domains, with Meta as the exception** — see below.
- [ ] Publish the `agents-inc` npm alias (sitting ready in the CLI repo's `alias/`,
      dry-run clean) so `npx agents-inc init` resolves. Blocked on the push freeze.

### Unifying the sub-agents

The design already draws the finished state. `screens/04-skill-panel.png` is a full
`developer · pm · reviewer · tester` × `web · api · ai · cli · infra` field with every
cell present, and Meta held out beneath it behind its own `＋` fold because its five
agents are not role-shaped. Against that target, today's 23 agents are ragged in two
directions:

| Domain  | Has                                                             | Missing                     |
| ------- | --------------------------------------------------------------- | --------------------------- |
| `web`   | all four, plus `architecture`, `pattern-critique`, `researcher` | —                           |
| `api`   | all four, plus `researcher`                                     | —                           |
| `ai`    | `developer`, `reviewer`                                         | `pm`, `tester`              |
| `cli`   | `developer`, `reviewer`, `tester`                               | `pm`                        |
| `infra` | `reviewer`                                                      | `developer`, `pm`, `tester` |
| `meta`  | five non-role agents — the exception, unchanged                 | —                           |

So: **six agents to add** (`ai-pm`, `ai-tester`, `cli-pm`, `infra-developer`, `infra-pm`,
`infra-tester`) and **four extras to retire or fold into a role** (`web-architecture`,
`web-pattern-critique`, `web-researcher`, `api-researcher`).

The web side is already built against the target, so landing it is mostly a data change
here:

- the `⋮` panel renders the whole 5 × 4 grid today — the six new agents just make their
  currently-inert cells live, with no UI change;
- `default-assignments.ts` already targets the four core roles, so selecting an AI or
  Infra skill starts reaching four agents instead of two and one;
- the roster's `x of y` badges move, and the two §8 adaptation rows in
  [`configurator-spec.md`](./configurator-spec.md) covering the ragged agents and the
  inert gap cells can both be deleted.

## Skill → sub-agent auto-assignment ✅ (2026-07-30)

- [x] Selecting a skill assigns it to **all relevant sub-agents** automatically.
      The rule lives in `apps/web/.../lib/default-assignments.ts`: a skill reaches the
      **core roles** (developer · pm · reviewer · tester) of its category's domain; a
      `shared` skill reaches every implementation domain; `meta` is never assigned
      implicitly. The design's matrix columns are exactly these roles.
- [x] Each assignment knows its load mode per sub-agent, defaulted sensibly:
  - Most skills load dynamically.
  - Fundamentals are **preloaded** — read from the matrix as the `required` categories
    (web-framework, web-styling, api-api, cli-framework…) plus the `*-framework` ones.
  - A testing skill is dynamic everywhere **except** its own domain's tester.
- Note: no matrix change was needed — category → domain, `required`, and the agent roster
  were already enough. The store's shape grew to
  `assignments: Record<AgentId, { load: "lazy" | "preloaded"; enabled: boolean }>` so a
  roster row can be switched off without losing its load mode (`PERSIST_VERSION` 5).

## Stack → sub-agent selection ✅ (2026-07-30)

- [x] Selecting a stack also selects its sub-agents by default — the stack mapping already
      keys skills by agent, and an agent holding an enabled skill derives **on**.
- [x] The default sub-agent set lives **in the stack mapping itself** (`ResolvedStack.skills`
      is keyed by agent id — no data change was needed after all).
- [x] UI: the right sidebar is interactive — click an agent to pin it on/off, click a skill
      row to switch that copy off, click the load word to flip pre/lazy.

## From scratch / no stack ✅ (2026-07-30)

- [x] Start from scratch (or answering "no" to a stack) → **no sub-agents** selected.
- [x] Selecting any web skill → the web **core-role** sub-agents become enabled, with the
      skill assigned to them automatically. (Generalises per domain. The ragged agents —
      researchers, architecture, pattern critique — are reached only by a stack, and are
      switched off from the roster rather than assigned from the ••• panel, which draws
      the four core roles and nothing else. They go away with the unification item above.)
- [x] **Pulse animation** in the right sidebar: newly reached agents tint amber with a left
      bar for 2.6s (the design prototype's `flashMs`).
