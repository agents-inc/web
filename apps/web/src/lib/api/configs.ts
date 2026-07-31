import { seedPayloadSchema, type SeedPayload } from "@workspace/matrix"
import { z } from "zod"

// The config-sharing worker (apps/server). Dev talks to `wrangler dev` on its
// default port; a deployment points VITE_API_URL at the real thing.
const API_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:8787"

const createdSchema = z.object({ id: z.string().min(1) })

export type ShareResult =
  { ok: true; id: string } | { ok: false; error: string }

export type SharedConfigResult =
  { ok: true; payload: SeedPayload } | { ok: false; error: string }

export const createSharedConfig = async (
  payload: SeedPayload
): Promise<ShareResult> => {
  try {
    const response = await fetch(`${API_URL}/configs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      return { ok: false, error: `sharing failed (${response.status})` }
    }

    const parsed = createdSchema.safeParse(await response.json())
    if (!parsed.success) {
      return { ok: false, error: "sharing failed (unreadable response)" }
    }

    return { ok: true, id: parsed.data.id }
  } catch {
    return { ok: false, error: "sharing service unreachable" }
  }
}

// The response is revalidated against the contract even though the worker
// validated it on the way in — this client has no reason to trust a URL
// someone typed by hand any further than it trusts localStorage.
export const fetchSharedConfig = async (
  id: string
): Promise<SharedConfigResult> => {
  try {
    const response = await fetch(`${API_URL}/configs/${encodeURIComponent(id)}`)
    if (response.status === 404) {
      return { ok: false, error: "this share link points to nothing" }
    }
    if (!response.ok) {
      return {
        ok: false,
        error: `loading the shared config failed (${response.status})`,
      }
    }

    const parsed = seedPayloadSchema.safeParse(await response.json())
    if (!parsed.success) {
      return { ok: false, error: "this share link holds an unreadable config" }
    }

    return { ok: true, payload: parsed.data }
  } catch {
    return { ok: false, error: "sharing service unreachable" }
  }
}
