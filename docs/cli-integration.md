# Web ↔ CLI integration

How a config built in this app becomes an installed project via `npx agents-inc init <id>`.
The CLI source lives at `claude-collective/cli` (locally `~/dev/cli`); the skills catalog at `agents-inc/skills` (locally `~/dev/skills`).

## Decision: hosted short id (2026-07-28)

Configs are stored server-side on a **Cloudflare Worker + KV**; the shareable id is ~8 chars (nanoid).
A self-contained encoded string was rejected: the information floor for a realistic config is ~80–120
base64 chars, over the ~50-char usability bar. No encoded-blob fallback will be maintained.

- `POST /configs` → validates body against the seed schema, stores it, returns the id.
- `GET /configs/:id` → returns the payload.
- Free-tier limits (100k reads/day, 1k writes/day) are the abuse cap; add a WAF rate rule if needed.

## The contract

`packages/matrix/src/seed.ts` — `SeedPayload` v1, exported from `@workspace/matrix`:

- `{ v: 1, matrixVersion, stackId, skills }`; each skill: `model` (opus/fable/sonnet/haiku),
  `effort` (low/medium/high/xhigh/max/ultra), `install`, `scope`, `assignments` (agent id → lazy/preloaded).
- Ids are full catalog slugs, never indices — payloads survive catalog churn; consumers warn-and-skip
  unknown ids (same policy as `pruneUnknownIds`). `matrixVersion` is diagnostics only, never a decode gate.
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
serving both is either circular or actually two packages — a decision worth making once `init <id>`
exists rather than in anticipation of it.

So: **vendor the contract, and add a CI drift guard** comparing the vendored copy against the
canonical one. Most of the safety, none of the release machinery. Extract a package when the
contract stops moving, or when a third consumer appears.

## Status

Done:

- [x] Seed schema (`packages/matrix/src/seed.ts`)
- [x] Store on the contract's scales — persist v4 (model gained `fable`; effort is the six-level scale).
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
      `npx agents-inc init <id>`, the id in amber, click-to-copy. This replaced the planned `/share`
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
deployed: `agentsinc.sh` hands a user `npx agents-inc init <id>`, and `api.agentsinc.sh/configs/:id`
serves the payload. Nothing here is blocked on further web work.

## 1. `init <id>` — the actual integration

Fetch `https://api.agentsinc.sh/configs/<id>` → validate against the vendored seed schema → map to
`WizardResultV2` → reuse the existing pipeline (`writeProjectConfig` → skill install →
`compileAgentsAllScopes`). Headless, or landing on the wizard's confirm step. **No TTY-size gate on
this path** — a CI or scripted install has no terminal to measure.

Decode policy, which is not negotiable because it is what makes ids survive catalog churn:
**warn and skip unknown ids, never fail the whole payload.** `matrixVersion` is diagnostics only and
must never gate a decode.

## 2. Send a distinct `User-Agent`

One line, easy to miss, and it is the whole of Phase 3. `GET /configs/:id` is the only place either
side can observe a config being _installed_ rather than merely built, and the worker can only
separate that from a browser load if the CLI identifies itself. Without it there is no conversion
signal at all — configs created versus configs actually used stays permanently unanswerable.

Note the GET is served `cache-control: immutable, max-age=1y`, so a re-run may be answered by a
proxy and never reach the worker. The number undercounts by design; it is a floor, not a census.

## 3. `SkillConfig` gains per-skill `model` and `effort`

The web has emitted both since persist v4 — `model` (opus/fable/sonnet/haiku) and the six-level
`effort` scale (low/medium/high/xhigh/max/ultra). Until the CLI carries them, half of what a user
configures is silently dropped on install.

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

## 7. Later

- Seed the web UI from an existing project (`edit --ui` round trip). **The install dialog's footer
  already advertises `npx agents-inc edit --ui`** — either that exists or the line should come out.
- `agentsinc share`: map an installed `ProjectConfig` to a `SeedPayload` and POST it to the same
  endpoint, so the CLI can mint ids too. Until then only the web creates them — an accepted
  pre-release limitation; the endpoint itself is client-agnostic.
