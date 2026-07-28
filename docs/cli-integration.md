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

Next, in order:

- [ ] `/share` screen: POST on demand, show `npx agents-inc init <id>` with copy
- [ ] Matrix sync: regenerate `packages/matrix` from a CLI-published artifact + CI drift check

## CLI changes required (not started — CLI repo deliberately untouched)

1. `SkillConfig` gains per-skill `model` and `effort` (the web already emits them).
2. `init <id>`: fetch payload → validate (Zod, warn-and-skip unknown ids) → map to `WizardResultV2` →
   reuse the existing pipeline (`writeProjectConfig` → skill install → `compileAgentsAllScopes`),
   headless or landing on the wizard's confirm step. No TTY-size gate on this path.
3. Publish the matrix as data: an `export:matrix` script emitting `matrix.json` + an `AGENT_DEFINITIONS`
   export (D-239), so this repo's vendored copy regenerates instead of drifting.
4. Later: seed the web UI from an existing project (`edit --ui` round trip), and `agentsinc share` —
   map the installed `ProjectConfig` to a `SeedPayload` and POST it to the same worker endpoint, so the
   CLI can mint ids too. Until then, only the web creates ids (accepted pre-release limitation; the
   endpoint itself is client-agnostic).
