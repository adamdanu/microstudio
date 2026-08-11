import { prisma } from "@/lib/prisma"
import type { AIProviderConfig } from "./adapter"

// ── Gemini Key Pool ────────────────────────────────────────────────────────
// Admin-managed pool of Gemini API keys. The app round-robins across active keys
// and routes the call through a Vercel relay (pool.relayUrl) so traffic egresses
// from Vercel's rotating IPs instead of the box. Keys are cooldown-marked on
// 429/5xx and skipped until the cooldown expires; consecutive failures back off
// exponentially. When a user is assigned a pool (User.geminiPoolId), /api/analyze
// uses this instead of the user's own AI provider config.

export type PoolSelection = {
  key: { id: string; apiKey: string; model: string }
  config: AIProviderConfig
} | null

const COOLDOWN_BASE_MS = 30_000

// Pick the next usable key (least-recently-used, skipping cooled-down/inactive),
// and return it together with an openai-compatible config routed through the relay.
export async function selectKey(poolId: string): Promise<PoolSelection> {
  const pool = await prisma.geminiKeyPool.findUnique({
    where: { id: poolId },
    include: {
      keys: {
        where: { isActive: true },
        orderBy: [{ lastUsedAt: "asc" }, { createdAt: "asc" }],
      },
    },
  })
  if (!pool) return null

  const now = Date.now()
  const usable = pool.keys.filter(k => !k.cooldownUntil || k.cooldownUntil.getTime() <= now)
  if (usable.length === 0) return null

  const key = usable[0]
  // The app's chatCompletions appends "/chat/completions". The Vercel relay
  // serves that at "/api/chat/completions", so ensure the relay baseURL ends
  // with "/api" (unless the admin already included it or provided a custom path).
  const relayBase = (pool.relayUrl || "").replace(/\/+$/, "")
  const baseURL = relayBase
    ? relayBase.endsWith("/api")
      ? relayBase
      : relayBase + "/api"
    : "https://generativelanguage.googleapis.com/v1beta"
  return {
    key: { id: key.id, apiKey: key.apiKey, model: key.model },
    config: {
      provider: "openai-compatible",
      model: key.model,
      baseURL,
      apiKey: key.apiKey,
      relayToken: pool.relayToken || undefined,
    },
  }
}

// Mark a key as failed (429/5xx): back off exponentially and increment the counter.
// Mark a key as failed. Transient errors (5xx) get cooldown so traffic shifts to
// another key. Quota/authorization errors (429 quota, 403, 400 invalid key) are
// project-wide, not per-key blips — cooldown is pointless, so leave the key active
// and surface the real error instead of masking it as "no usable keys".
export async function markKeyFailure(keyId: string, errMsg?: string): Promise<void> {
  try {
    const key = await prisma.geminiKey.findUnique({ where: { id: keyId } })
    if (!key) return

    const transient = !/\b(429|403|400|quota|denied|PERMISSION_DENIED|RESOURCE_EXHAUSTED)\b/i.test(errMsg || "")
    if (!transient) return // quota/denied: keep key usable, don't cooldown

    const fails = key.consecutiveFails + 1
    const backoff = COOLDOWN_BASE_MS * Math.pow(2, Math.min(fails, 6))
    await prisma.geminiKey.update({
      where: { id: keyId },
      data: {
        consecutiveFails: fails,
        cooldownUntil: new Date(Date.now() + backoff),
      },
    })
  } catch { /* best-effort */ }
}

// Mark a key as used successfully.
export async function markKeySuccess(keyId: string): Promise<void> {
  try {
    await prisma.geminiKey.update({
      where: { id: keyId },
      data: { lastUsedAt: new Date(), consecutiveFails: 0, cooldownUntil: null },
    })
  } catch { /* best-effort */ }
}

// Whether a user is assigned to a Gemini key pool.
export async function getUserPool(userId: string): Promise<{ id: string; name: string } | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { geminiPool: { select: { id: true, name: true } } },
  })
  return user?.geminiPool || null
}