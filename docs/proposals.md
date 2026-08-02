# Proposals — scoped, not started

Work discussed and shaped but deliberately **not implemented**. Each entry records what it is, why,
what it would cost, and what still has to be decided before anyone writes code.

Sibling docs: [`cli-integration.md`](./cli-integration.md) (the web↔CLI contract and the CLI TODO),
[`configurator-todo.md`](./configurator-todo.md) (web build tracker).

---

## How these get implemented

Agreed process. It applies to every item below, and the order is the point.

1. **Write the tests first — end-to-end plus whatever else fits — and watch them fail.** A test
   that has never failed has not been shown to test anything.
2. Implement until they pass.
3. **Then** apply the `meta-design-expressive-typescript` skill — that skill only, no sub-agents —
   and bring the code in line with its principles.
4. **Then run it by hand through the CLI** and confirm it does what it claims. Passing tests and a
   working command are different claims; the `--from` work proved that when a green-looking path
   exited 13 on an unsettled Ink render that no assertion covered.

No jumping to step 2.

---

## 1 · Move model and effort to the sub-agent

**Status: implemented on the web side 2026-08-01** — `SEED_VERSION` 2, `PERSIST_VERSION` 7, the
roster's model word and 5-square effort meter, the options panel down to install mode → install
scope → sub-agents. Designs are locked in `.claude-design/` (86d, 87a, 89a + 90j). The CLI half
below is still outstanding and is tracked in
[`progress-model-effort-and-config-cleanup.md`](./progress-model-effort-and-config-cleanup.md).
The rest of this section is the scope it was built to, kept as the record of why.

Two things the implementation settled that were left open below:

- **`travelling()` still drops rows on pinned-off agents**, and the agent itself is omitted from the
  payload entirely — the safer of the two options named under "Open", and the one that matches the
  existing comment. Presence in the `agents` map means "installs".
- **The compiler prefers a config value silently.** A warning on every compile for a deliberate
  setting is noise; the preference is documented instead.

### Why this is the right shape

Both levels are genuinely supported by Claude Code — subagent frontmatter takes `model` and
`effort`, and so does skill frontmatter. The difficulty was never the platform; it was **which file
the setting has to be written into.**

A per-skill setting lives in that skill's own `SKILL.md` frontmatter. We generate that file in
**eject** mode, but in **plugin** mode it belongs to the marketplace and any edit is undone by the
next update. So a per-skill model picker would have worked for ejected skills and silently done
nothing for plugin ones, and the UI would have had to hide the control, disable it, or let it lie.

Putting the setting on the sub-agent removes that asymmetry, because **we always generate the agent
file** regardless of how any individual skill was installed.

**Eject and plugin are untouched.** They keep deciding where a skill's files live and how it is
installed — `source: "eject"` versus the marketplace name, the two panes in the install dialog, all
exactly as today. What goes away is only the question of whether a _model setting_ can reach a file
we do not own.

### What changes

**Web store** — `skillEntrySchema` drops `model`/`effort`. They need an agent-keyed home and there
is none today: the only agent-keyed state is `pins: Record<agentId, boolean>`. Widen that to
`agents: Record<agentId, { on?, model?, effort? }>` rather than adding a second map, because two
parallel agent-keyed records will drift. **`PERSIST_VERSION` 6 → 7.**

Note `isWorthRemembering` currently counts "model or effort differs from default" as evidence an
entry is worth keeping. Losing two of its four signals makes deselect-remembers-your-work slightly
less sensitive — intended, but it should be a deliberate note rather than a surprise.

**Web UI** — the options panel loses both segmented controls, leaving install, scope and the matrix.
The roster's agent rows gain them. The roster column is 260px, so four models and five efforts will
not both fit as segmented controls; that is the design problem being solved.

**The contract** — `seedSkillSchema` drops the two fields; the payload gains a top-level `agents`
map.

**Not on `assignments`.** Assignments are per _(agent, skill)_; model and effort are per _agent_.
Putting them on assignments would duplicate the value across every skill an agent carries and let
two entries contradict each other about the same agent.

**CLI** — the vendored schema mirrors it; `seed-to-wizard.ts` maps the `agents` map onto
`AgentScopeConfig` instead of dropping two fields; `AgentScopeConfig` gains `model?`/`effort?`;
`agent.schema.json` gains `effort`; `agent.liquid` emits it; the compiler prefers a config value
over the `metadata.yaml` default.

**Tests** — `seed.test.ts`, `persisted-schema.test.ts`, `derive.test.ts`, `skill-options.spec.ts`
(two tests assert the segments directly), `roster.spec.ts`.

### The agent record — decided shape

```ts
agents: Record<AgentId, { on?: boolean; model?: Model; effort?: Effort }>
```

Replaces `pins: Record<AgentId, boolean>`. Three details that are easy to get wrong:

**`on` must stay optional.** `isAgentOn` is a genuine tri-state today —
`pins[agentId] ?? derivedFromAssignments` — where _absent_ means "derive it". Once the record also
holds model and effort, its presence no longer implies a pin: an entry may exist only because
someone chose a model. Keeping `on` optional preserves the semantics with the same `??`:

```ts
config.agents[agentId]?.on ??
  Object.values(config.skills).some((e) => e.assignments[agentId]?.enabled)
```

**This fixes an existing gap for free.** `seed.ts` states it plainly: _"Pins themselves do not
travel: the seed contract predates them… a pinned bare agent is a browser-only nicety for now."_
Today pinned-**off** is approximated by dropping those rows from the payload, and pinned-**on but
bare** is lost entirely, because agents are implied by assignments and a bare agent has none.
Putting `agents` on the wire carries both properly.

**`on: false` is NOT `excluded: true`.** `excluded` is a tombstone for dual-scope pairs
(D-223/D-227): it records that an entry exists at one scope but is deliberately inactive, so a merge
does not resurrect it and the pair can be restored. `config-generator.ts:276` states the invariant —
every _selected_ agent must have a non-excluded entry, so excluded entries are the other half of a
pair, not the off switch.

A pinned-off agent has no pair and nothing to restore. It is simply not selected:

| `on`    | Result                                                             |
| ------- | ------------------------------------------------------------------ |
| `false` | Omitted entirely — absent from `selectedAgents` and `agentConfigs` |
| `true`  | Included with zero assignments — the bare "base agent" case        |
| absent  | Derived from assignments, exactly as today                         |

The genuinely new capability is `on: true` on a **bare** agent: agents are currently implied by
assignments, so one with none cannot be expressed at all. `on: false` largely formalises what
dropping those rows already achieved.

Open: with `on` travelling, does `travelling()` still drop rows on pinned-off agents, or send them
and let the consumer honour the pin? Dropping is safer and matches the existing comment ("the CLI
must never install what the sharer's own counts exclude"); sending is more faithful to what was
configured. **Resolved: dropping.** The agent is omitted from the map as well as its rows.

### Sequencing

The contract change is **breaking**, and the CLI's uncommitted `--from` work maps the current shape.
It has to be updated before it is committed, or it ships against a contract that no longer exists.
Web and CLI must land together, or the CLI must tolerate both shapes for a while.

Breaking it now is free — nothing has ever installed from an id. That stops being true the moment
one does.

### Still open — all three now settled

- ~~**Widen `pins` or add a second agent map?**~~ Widened, as recommended.
- ~~**Does the compiler warn** when a config value overrides a `metadata.yaml` one?~~ Silently
  prefers it.
- ~~**What does the roster row look like** with two more controls in 260px?~~ 86d: the model as a
  plain mono word and the effort as a square meter, both right-aligned on the agent's name row and
  both cycling on click — no segmented control fits, and at four and five values a menu costs more
  than a second click. Their room comes from 87a: the load word and the where-used count go quiet at
  rest, so nothing on the right edge competes with the meter.

## 1a · `ultra` removed — done 2026-08-01

Verified against Claude Code's documentation: the effort levels are `low` `medium` `high` `xhigh`
`max`. `ultra` is not one of them. "ultracode" exists but the docs are explicit that it is a Claude
Code session setting which sends `xhigh` and additionally orchestrates dynamic workflows — not a
model effort level, and not something a config can name.

Removed from `packages/matrix/src/seed.ts`, `apps/web/src/stores/persisted-schema.ts`, the options
panel's `EFFORTS`, the CLI's vendored copy, both e2e fixtures, and the two docs describing the
scale. **`PERSIST_VERSION` 5 → 6**, because dropping an enum member makes older saved blobs
unparseable and the pre-release policy is to discard rather than migrate.

Consequence worth stating: any id already shared carrying `effort: "ultra"` no longer decodes. Given
nothing has installed from an id yet, that is free now and would not have been later.

### Verified: nothing to remove from skill metadata

Checked on the same pass, since the concern was that skills might already declare these:

- **`~/dev/skills`** — 222 skill metadata files. **None** declare `model` or `effort`. The fields are
  `category`, `slug`, `domain`, `author`, `displayName`, `cliDescription`, `usageGuidance`.
- **CLI repo** — only `src/agents/**` declares `model`, across 23 agent files. No skill does.

So the catalog is already clean and there is no cleanup task. The skill↔model coupling exists purely
in **the web app**, which attaches model and effort to skills in its options panel. That is the only
place it has to be undone.

### How inheritance resolves, for the record

A subagent's model resolves in this order: `CLAUDE_CODE_SUBAGENT_MODEL`, then the per-invocation
`model` parameter, then the subagent's frontmatter, then **the main conversation's model**. So a
subagent's `inherit` means the main conversation, not any calling agent.

A skill that sets nothing keeps **the active model** — inside a subagent, that is the subagent's.
The wording differs between the two docs ("the active model" versus "the main conversation's
model") and the distinction looks deliberate, but the skill-inside-subagent chain is never stated
outright, so treat this as read rather than quoted.

Separately: there is **no per-subagent extended-thinking setting**; subagents inherit the main
conversation's.

---

## 2 · Drop the array wrapper for exclusive categories

**Status:** proposed, nothing written. Cheaper than it looks.

A category that can only hold one skill should not require an array:

```ts
"web-framework": "web-framework-react"          // exclusive — one skill, no wrapper
"meta-methodology": ["a", "b"]                  // non-exclusive — array
```

**The runtime already does this.** `normalizeAgentConfig` in `stacks-loader.ts` has accepted all
three forms since long before this was discussed — bare string, single object, array — and
`loadProjectConfig` runs everything through it. So this is **not a runtime change**: no loader, no
resolver, no normalization work.

What is left:

- **Type generation** — `generateStackAgentConfig` emits `SkillAssignment<…>[]` unconditionally. It
  needs to emit the bare form for exclusive categories, which means threading an exclusivity lookup
  into a function that currently receives only `Map<Category, SkillId[]>`. The data exists on
  `CategoryDefinition.exclusive`.
- **The writer** — `config-writer.ts` always emits arrays; its `Array.isArray` filter (~line 556)
  would need to accept singles.
- **Tests** — the writer tests that assert emitted text. `config-generator.test.ts` asserts
  _post-normalization_ values, which stay arrays, so most are untouched.

**Estimate: about half a day, low risk**, because the tolerant path is already proven in production.

### Worth knowing before deciding

The type comment says exclusive is `@default true`, but the real catalog is **27 exclusive against
62 non-exclusive**. Two-thirds of categories keep their arrays, so the readability win is smaller
than the framing suggests.

### Open decision

- An exclusive category holding two skills becomes unrepresentable. That is arguably the point, but
  the writer must **fail loudly** rather than silently drop the second.

---

## 3 · Uncommitted work already on disk

Not proposals — written, tested, and sitting uncommitted. Recorded so none of it is lost.

### CLI repo (`~/dev/cli`)

- **`init --from <id>`** — vendored seed schema, fetch with a distinct `agents-inc-cli` user-agent,
  `SeedPayload` → `WizardResultV2` mapping, wired into `init`. 7 end-to-end tests, verified
  non-vacuous by injecting three breaks and confirming exactly the predicted failures. Full unit
  suite 5196 passing.
- **Single entry point for `init`** — `run()` is now one spine with two selection producers
  (wizard, shared config) rather than two parallel flows. Previously the empty-skills guard was
  duplicated with two different messages and `handleInstallation` had two call sites, which is
  precisely what drifts.
- **Headless permission notice** — `handleInstallation` took an `interactive` flag. The notice is
  an Ink app with no exit of its own, so `waitUntilExit()` only ever resolved because a person was
  there. Fine after the wizard; a hang over a pipe, which is most of why `--from` exists.
- **`agents-inc` naming** — `CLI_INVOKE_COMMAND` and `oclif.bin`, plus 87 doc references.
  Changelogs, dated agent-findings and `src/agents/**` deliberately untouched.
- **Alias release coupling** — recorded in the release checklist and `CLAUDE.md`.

**Known regression:** `e2e/interactive/smoke.e2e.test.ts:28` asserts `--help` contains
`"agentsinc"`. The `oclif.bin` rename makes it `agents-inc`, so the assertion needs updating — a
consequence of the rename, not a defect. Full e2e is otherwise 625 passing.

### Web repo

- Two stale `agentsinc` references corrected. `packages/matrix/src/vendor/config.ts` carries the
  same stale name and is **left alone on purpose**: it is vendored, so fixing it here would create
  exactly the drift the catalog sync exists to catch. It corrects itself upstream.

---

## 4 · Blocked on someone else

- **`--from` reaching users** needs both packages published at the same version. Until then the
  deployed install dialog hands out a command that resolves and then errors on an unknown flag.
- **Catalog sync** fires only on its Monday backstop until `WEB_REPO_DISPATCH_TOKEN` exists in the
  CLI repo and a commit actually touches a watched path.
- **Phase 3 attribution** (worker-side counting of `GET /configs/:id` split by caller) is unblocked
  by the CLI's user-agent, but the worker side is not written.
