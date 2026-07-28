import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config"

// Tests run inside the actual Workers runtime with a simulated KV binding, so
// what passes here is what runs at the edge — no mocked platform.
export default defineWorkersConfig({
  test: {
    include: ["src/**/*.test.ts"],
    globals: false,
    clearMocks: true,
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
      },
    },
  },
})
