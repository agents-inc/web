# Web ↔ CLI integration

How a config built in this app becomes an installed project via `npx agents-inc init --from <id>`.
The CLI source lives at `claude-collective/cli` (locally `~/dev/cli`); the skills catalog at `agents-inc/skills` (locally `~/dev/skills`).

## Decision: hosted short id (2026-07-28)

Configs are stored server-side on a **Cloudflare Worker + KV**; the shareable id is ~8 chars (nanoid).
A self-contained encoded string was rejected: the information floor for a realistic config is ~80–120
base64 chars, over the ~50-char usability bar. No encoded-blob fallback will be maintained.

- `POST /configs` → validates body against the seed schema, stores it, returns the id.
- `GET /configs/:id` → returns the payload.
- Free-tier limits (100k reads/day, 1k writes/day) are the abuse cap; add a WAF rate rule if needed.

## The contract

`packages/matrix/src/seed.ts` — `SeedPayload` v3, exported from `@workspace/matrix`:

- `{ v: 3, matrixVersion, stackId, skills, agents }`; each skill: `install` (plugin/eject),
  `scope` (project/global), `assignments` (agent id → lazy/preloaded). Each agent: `on?`
  (boolean), `model?` (opus/fable/sonnet/haiku), `effort?` (low/medium/high/xhigh/max), `scope?`
  (project/global) — all four optional.
- **v2 moved model and effort off the skill and onto the agent**, and gave agents their own
  top-level map. **v3 (2026-08-02) added the agent's `scope`** — the CLI has carried one on every
  `AgentScopeConfig` all along, but with no web surface the `--from` mapper wrote `project` for
  everyone. Additive-optional, so the bump was not strictly forced; it happened because the CLI's
  vendored copy of this object strips keys it does not know, which would let a v2 id decode clean and
  drop the field silently. The version is what proves it arrived.
- The schema accepts `v: 3` and nothing else: pre-release policy is discard-don't-migrate, so an id
  minted against v1 or v2 fails to decode loudly rather than being guessed at. Nothing has ever
  installed from an id, so breaking it is free — and stops being free the moment one does.
- The `agents` map is sparse, and presence means "installs":

  | Entry                                | Meaning                                                                     |
  | ------------------------------------ | --------------------------------------------------------------------------- |
  | `{ on: true }`                       | Pinned on. With no assignments anywhere this is the bare **base agent** — the capability v1 could not express at all, since agents were only ever implied by assignments. |
  | `{ model?, effort?, scope? }`, no `on` | Switched on by its assignments already; only the overrides travel, because repeating `on` is the one place the payload could contradict itself. A resting `scope` is dropped exactly as a resting model is, so absent means `project` — the CLI's default. |
  | `on: false`                          | **Never sent.** A pinned-off agent is excluded from every count on the sharer's screen, so neither it nor the assignment rows naming it may travel — the CLI must never install what the sharer's own counts exclude. |
  | absent                               | Resting on its own `metadata.yaml` model with medium effort and no pin — nothing to say. |

- Ids are full catalog slugs, never indices — payloads survive catalog churn; consumers warn-and-skip
  unknown ids (same policy as `pruneUnknownIds`, which now prunes the `agents` map too — it is the
  one place a retired agent can arrive without an assignment). `matrixVersion` is diagnostics only,
  never a decode gate.
- `remembered` never leaves the browser.
- Canonical home is the CLI's shared package once it exists (CLI todo D-239); until then this file is
  the source of truth and the CLI will vendor it.

### Decision: vendor, do not extract a package yet (2026-08-01)

A shared package across two repos is not a file move — it is publishing, versioning and a release
step in the loop for every change. `seed.ts` is ~40 lines of Zod that no real consumer has exercised
yet, so extracting a package now means version churn in both repos while the contract is still
learning what it is wrong about.

There is also a wrinkle one package handles badly: **the two shared things flow in opposite
directions.** The seed contract originates here and the CLI consumes it; the matrix originates in
the CLI and this repo already vendors it under `packages/matrix/src/vendor/generated`. One package
serving both is either circular or actually two packages — a decision worth making once `init --from <id>`
exists rather than in anticipation of it.

So: **vendor the contract, and add a CI drift guard** comparing the vendored copy against the
canonical one. Most of the safety, none of the release machinery. Extract a package when the
contract stops moving, or when a third consumer appears.

## Status

Done:

- [x] Seed schema (`packages/matrix/src/seed.ts`)
- [x] Store on the contract's scales — persist v7 (model gained `fable`; effort is the five-level
      scale, and both now sit on the sub-agent rather than the skill).
      Pre-release policy: no migrations — older persisted blobs are discarded, not upgraded.

- [x] Serializer: `toSeedPayload` (`apps/web/src/features/configure/lib/seed.ts`) — builds the payload
      from the selection; `remembered` stays local; parse-on-build strips anything the contract doesn't know

- [x] Worker (`apps/server`): Hono + `@hono/zod-openapi` on Cloudflare Workers + KV. Content-addressed
      ids (first 8 base64url chars of the payload's SHA-256) — same config, same id, idempotent POSTs,
      immutable GETs. CORS is a single-origin allowlist (`WEB_ORIGIN` var). Tests run in the real
      runtime via `@cloudflare/vitest-pool-workers`. The KV namespace exists and its id is wired into
      `wrangler.jsonc`; to go live: set the production `WEB_ORIGIN`, then `bun run deploy`.

- [x] Browser round trip for testing: the roster's Share button POSTs the payload and copies a
      `?fromId=<id>` URL; the configure route consumes `fromId` (fetch → validate → prune → import into
      the store → strip the param). A dead or unreadable link reports itself and leaves the config alone.

- [x] Deployed: `agentsinc.sh` (assets Worker, no script) and `api.agentsinc.sh` (the API), both
      attached by `wrangler deploy` via `custom_domain` routes. CI deploys on push to main.

- [x] **The install dialog hands out the id** (2026-08-01). It mints on open and shows
      `npx agents-inc init --from <id>`, the id in amber, click-to-copy. This replaced the planned `/share`
      screen, which is gone along with its nav entry and route — there was never a second thing for
      it to do. Minting is cheap because the worker reads before writing: ids are content-addressed,
      so re-opening the same configuration costs a read rather than one of the free tier's 1000
      daily writes.

Next, in order:

- [x] **Catalog drift — the receiving half** (2026-08-01).
      `.github/workflows/sync-catalog.yml` regenerates from the CLI and opens a PR when the output
      moved. Listens for a `catalog-changed` `repository_dispatch`, plus manual dispatch and a Monday
      backstop. It runs the suite itself rather than relying on the PR, because a PR opened with the
      default `GITHUB_TOKEN` does not trigger other workflows — and `catalog.spec.ts`'s fixture guard
      is the one check that matters here. Not auto-merged: a changed `requires` alters which skills
      the grid puts out of reach, which is behaviour. **Still needs the emitting half in the CLI
      repo — see CLI TODO 6.** Until that lands the Monday backstop is the only trigger, so the
      catalog can be up to a week stale.

- [ ] Phase 3 attribution (worker side): count `GET /configs/:id` split by whether the caller is the
      CLI. Blocked only on the CLI sending a distinct `User-Agent` — see below.

---

# CLI TODO

**Everything below is work in the CLI repo (`~/dev/cli`), not this one.** The web side is done and
deployed: `agentsinc.sh` hands a user `npx agents-inc init --from <id>`, and `api.agentsinc.sh/configs/:id`
serves the payload. Nothing here is blocked on further web work.

## 1. `init --from <id>` — the actual integration

**Start here.** `src/cli/commands/init.tsx` is an oclif command with no positional args today, only
flags (`--refresh`, `--source`). It needs an optional positional.

**A flag, `--from <id>`, not a positional** (decided 2026-08-01). Nobody types this line — the
install dialog copies itself — so the brevity a positional buys is worth nothing, while a named flag
says what the id is and leaves room to accept a file or a URL later without inventing a second one.
The web app emits the flag form and is deployed, so the two already agree.

```ts
static flags = {
  ...BaseCommand.baseFlags,
  refresh: Flags.boolean({ description: "Force refresh from remote source", default: false }),
  from: Flags.string({
    description: "Config id from agentsinc.sh — installs that configuration directly",
  }),
}
```

Optional, so a bare `init` keeps starting the wizard exactly as it does now.

Then: fetch `https://api.agentsinc.sh/configs/<id>` → validate against the vendored seed schema →
map to `WizardResultV2` → reuse the existing pipeline (`writeProjectConfig` → skill install →
`compileAgentsAllScopes`). Headless, or landing on the wizard's confirm step. **No TTY-size gate on
this path** — a CI or scripted install has no terminal to measure.

Two things in the current implementation to decide about rather than trip over:

- `showDashboardIfInitialized()` returns early in an already-initialised project. **With an id it
  must not: `init --from <id>` overrides an existing agents-inc install at the root** (decided 2026-08-01).
  A bare `init` keeps today's dashboard behaviour untouched — the divergence is the id, not the
  command.

  What "override" means is the part still open, and the two readings differ materially. Writing the
  config and installing what the payload names leaves behind any skill the _previous_ config
  installed and this one omits, so the project ends up as the union of both — which is not the
  configuration that was shared, and the difference is invisible until someone wonders why an agent
  has a skill nobody picked. Making the project actually match the payload means removing those,
  which is destructive and wants either a confirmation or an explicit flag. `uninstall` already
  exists, so the machinery is probably there.

  Non-interactive runs are the wrinkle: there is nobody to confirm to, and the whole point of the id
  path is that it works headless. Prompting when a TTY exists and requiring a flag when it does not
  is the usual shape.

- The command renders an Ink wizard immediately. The id path should not, or should render only the
  confirm step.

Decode policy, which is not negotiable because it is what makes ids survive catalog churn:
**warn and skip unknown ids, never fail the whole payload.** `matrixVersion` is diagnostics only and
must never gate a decode.

Suggested order, since item 4 is the dependency: vendor the schema, then the positional, then the
mapping.

## 2. Send a distinct `User-Agent`

One line, easy to miss, and it is the whole of Phase 3. `GET /configs/:id` is the only place either
side can observe a config being _installed_ rather than merely built, and the worker can only
separate that from a browser load if the CLI identifies itself. Without it there is no conversion
signal at all — configs created versus configs actually used stays permanently unanswerable.

Note the GET is served `cache-control: immutable, max-age=1y`, so a re-run may be answered by a
proxy and never reach the worker. The number undercounts by design; it is a floor, not a census.

## 3. `AgentScopeConfig` gains `model` and `effort`

Per **agent**, not per skill — v2 moved them (proposals §1: in plugin mode a skill's `SKILL.md`
frontmatter belongs to the marketplace and any model we wrote there would be undone by the next
update, whereas we always generate the agent file). So `AgentScopeConfig` gains `model?`/`effort?`,
`agent.schema.json` gains `effort`, the template emits both, and the compiler prefers a config value
over the `metadata.yaml` default — silently, because a warning on every compile for a deliberate
setting is noise. Until the CLI carries them, the model and effort a user chose per agent are
silently dropped on install.

## 4. Vendor the seed contract, with a drift guard

Copy `packages/matrix/src/seed.ts`; do not re-derive it by hand. Add a CI check comparing the
vendored copy against the canonical one so divergence fails loudly rather than at decode time. See
the decision above for why this is not a shared package yet.

## 5. Publish the matrix as data (D-239)

An `export:matrix` script emitting `matrix.json` plus an `AGENT_DEFINITIONS` export. This is the
reverse direction to items 1–4: here the CLI is the source of truth and the web consumes.

Worth being clear about what this does and does not buy. The web can already regenerate from a local
CLI checkout, so a published artifact is not what unblocks catalog sync — it removes the _checkout_
from the loop, which is what makes automating it in CI clean rather than awkward. Do the scheduled
regeneration first with what exists; this makes it tidier, not possible.

## 6. Fire the catalog-sync dispatch

The receiving workflow already exists here (`.github/workflows/sync-catalog.yml`). This is the eight
lines that trigger it. Scope the paths **generously** rather than precisely: they duplicate knowledge
that lives in `generate-from-cli.mjs` and can drift apart, and the asymmetry matters — a false
positive costs one run that finds no diff and exits, a false negative costs silent staleness until
somebody notices.

```yaml
# .github/workflows/notify-web.yml, in the CLI repo
name: Notify web of catalog changes

on:
  push:
    branches: [main]
    paths:
      - "src/cli/types/**"
      - "src/agents/**"
      - "src/cli/lib/configuration/default-stacks.ts"

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - env:
          GH_TOKEN: ${{ secrets.WEB_REPO_DISPATCH_TOKEN }}
        run: |
          gh api repos/agents-inc/web/dispatches \
            -f event_type=catalog-changed \
            -F client_payload[sha]=${{ github.sha }}
```

`WEB_REPO_DISPATCH_TOKEN` is the one unavoidable credential: cross-repo triggering needs a token that
can write to this repo. Use a fine-grained PAT scoped to `agents-inc/web` alone with **contents:
write** and nothing else, or a GitHub App if you would rather not have a personal token in the loop.

### Testing it

The two halves fail independently, so test them separately — otherwise a broken run tells you
nothing about which end is at fault.

**1. The receiving half, no token needed.** Runs the regenerate → diff → suite → PR path end to end:

```
gh workflow run sync-catalog.yml -R agents-inc/web
gh run watch -R agents-inc/web
```

Expect either "Catalog is already in sync" or a `catalog-sync` PR. Both are passes; the first just
means the vendored copy is current.

**2. The dispatch path, still no token.** Your own `gh` auth stands in for the PAT, so this proves
the event wiring without waiting on the secret:

```
gh api repos/agents-inc/web/dispatches \
  -f event_type=catalog-changed \
  -F client_payload[sha]=test
```

A run should appear within seconds. If nothing fires, the `types:` filter and the event name have
drifted apart.

**3. The whole chain.** Only once `WEB_REPO_DISPATCH_TOKEN` exists: touch a watched path in the CLI
repo, push to main, and watch `notify-web` succeed there and `sync-catalog` start here.

A 403 on step 3 with a valid-looking token usually means the fine-grained PAT is pending **org
approval** rather than mis-scoped — `agents-inc` owns the target repo, and orgs can gate PATs.

## 7. Later

- Seed the web UI from an existing project (`edit --ui` round trip). **The install dialog's footer
  already advertises `npx agents-inc edit --ui`** — either that exists or the line should come out.
- `agents-inc share`: map an installed `ProjectConfig` to a `SeedPayload` and POST it to the same
  endpoint, so the CLI can mint ids too. Until then only the web creates them — an accepted
  pre-release limitation; the endpoint itself is client-agnostic.
