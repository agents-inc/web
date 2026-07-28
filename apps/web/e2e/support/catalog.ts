// Fixed points in the generated catalogue that the specs rely on.
//
// The catalogue is regenerated from the agents-inc CLI, so these will drift
// eventually. `catalog.spec.ts` asserts every one of them still exists, which
// turns "the whole suite went red" into one obvious failure naming the value
// that moved.

export const STACKS = {
  scratch: "Start from scratch",
  nextjs: "Next.js Full-Stack",
  t3: "Next.js T3 Stack",
  remix: "Remix Full-Stack",
} as const

export const DOMAINS = {
  web: "Web",
  api: "API",
  ai: "AI",
} as const

// Picking one deselects the sibling.
export const EXCLUSIVE_CATEGORY = {
  name: "Framework",
  tag: "one of",
  first: "React",
  second: "Vue",
} as const

// Several may be held at once.
export const MULTI_CATEGORY = {
  name: "Styling",
  tag: "multi",
  first: "Tailwind CSS",
  second: "CVA",
} as const

// In the Next.js stack's expansion, so it is selected after applying it.
export const STACK_MEMBER_SKILL = "React"

export const SKILL_OPTIONS = {
  models: ["opus", "fable", "sonnet", "haiku"],
  efforts: ["low", "medium", "high", "xhigh", "max", "ultra"],
  defaultModel: "sonnet",
  defaultEffort: "medium",
} as const
