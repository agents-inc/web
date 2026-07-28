# @workspace/matrix

The skill catalog — every skill, category, domain, stack and sub-agent the configurator can show.

## Where the data comes from

Copied out of the [agents-inc CLI](https://github.com/agents-inc/cli) repo. Nothing here is authored by hand.

| Path             | What                                                                             |
| ---------------- | -------------------------------------------------------------------------------- |
| `src/vendor/`    | Verbatim copies of the CLI's `src/cli/types/`. **Never edit.**                    |
| `src/generated/` | `AGENT_DEFINITIONS`, derived from the CLI's per-agent `metadata.yaml`             |
| `src/schema/`    | Zod schemas — the validation boundary between the raw data and the app            |
| `src/index.ts`   | The public API. `apps/web` imports from here only, never from `vendor/`           |

Regenerate after the CLI's catalog changes:

```sh
AGENTS_INC_CLI=/path/to/cli bun run generate   # defaults to ../../../cli
```

## Why it's a copy

The CLI plans to publish this as `@agents-inc/skills-matrix` (see its `todo/D-239`). Until it does, we
vendor. Keeping `vendor/` byte-identical to the CLI makes that swap a delete plus a dependency bump.
`src/generated/agents.ts` is the one thing the CLI does not yet generate — it is the gap D-239 names.
