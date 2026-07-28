import { z } from "zod"

/**
 * The one network call in the app. GitHub's search endpoint is CORS-enabled
 * and works unauthenticated, so release one talks to it directly from the
 * browser; the rate limit is 10 requests/minute, which is why the dialog
 * debounces rather than searching per keystroke.
 *
 * A token cannot ship in a bundle, so raising that limit means the
 * `apps/server` proxy the spec has queued — this module is the seam it will
 * slot behind, and nothing above it needs to change.
 */

const githubRepoSchema = z.object({
  full_name: z.string(),
  description: z.string().nullable(),
  stargazers_count: z.number(),
  language: z.string().nullable(),
})

const githubSearchSchema = z.object({
  items: z.array(githubRepoSchema),
})

export type SkillRepo = {
  fullName: string
  description: string
  stars: number
  language: string | null
}

export type SearchResult =
  { ok: true; repos: SkillRepo[] } | { ok: false; error: string }

/**
 * The design labels languages `ts` / `js`, not `TypeScript` / `JavaScript` —
 * anything longer breaks the result row's single line. Unknown languages fall
 * back to their first two letters rather than being hidden.
 */
const LANGUAGE_ABBREVIATIONS: Record<string, string> = {
  typescript: "ts",
  javascript: "js",
  python: "py",
  ruby: "rb",
  rust: "rs",
  go: "go",
  java: "java",
  kotlin: "kt",
  swift: "swift",
  "c++": "cpp",
  "c#": "cs",
  shell: "sh",
  html: "html",
  css: "css",
  mdx: "mdx",
  svelte: "svelte",
  vue: "vue",
}

export const abbreviateLanguage = (language: string) =>
  LANGUAGE_ABBREVIATIONS[language.toLowerCase()] ??
  language.slice(0, 2).toLowerCase()

/** `9100` → `9.1k`, `23000` → `23k`. */
export const formatStars = (stars: number) => {
  if (stars < 1000) return String(stars)
  const thousands = stars / 1000
  return thousands < 10
    ? `${thousands.toFixed(1).replace(/\.0$/, "")}k`
    : `${Math.round(thousands)}k`
}

const RESULT_LIMIT = 8

export const searchSkillRepos = async (
  query: string,
  signal?: AbortSignal
): Promise<SearchResult> => {
  const trimmed = query.trim()
  if (!trimmed) return { ok: true, repos: [] }

  try {
    const response = await fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(
        trimmed
      )}&sort=stars&order=desc&per_page=${RESULT_LIMIT}`,
      { signal, headers: { Accept: "application/vnd.github+json" } }
    )

    if (response.status === 403 || response.status === 429) {
      return {
        ok: false,
        error: "GitHub rate limit reached — try again in a minute.",
      }
    }
    if (!response.ok) {
      return { ok: false, error: `GitHub search failed (${response.status}).` }
    }

    const parsed = githubSearchSchema.safeParse(await response.json())
    if (!parsed.success) {
      return { ok: false, error: "GitHub returned an unexpected response." }
    }

    return {
      ok: true,
      repos: parsed.data.items.map((item) => ({
        fullName: item.full_name,
        description: item.description ?? "",
        stars: item.stargazers_count,
        language: item.language,
      })),
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: true, repos: [] }
    }
    return { ok: false, error: "Could not reach GitHub." }
  }
}
