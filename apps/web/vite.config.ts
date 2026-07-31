import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

import { parseEnv } from "./src/env.schema"

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Vite inlines env at build time, so an unset variable is not a startup
  // error — it is a bundle that silently points somewhere wrong. Parsing here,
  // in Node before anything is emitted, turns that into a failed build.
  parseEnv(loadEnv(mode, __dirname, "VITE_"), mode === "production")

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  }
})
