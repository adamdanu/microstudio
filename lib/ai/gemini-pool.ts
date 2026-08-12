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
const QUOTA_COOLDOWN_MS = 60_000

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

// Classify a key failure and react accordingly:
//   fatal    (403 denied, 401, 400 invalid key) → auto-disable the key so the
//            pool stops selecting it; it can be re-enabled by the admin after
//            the key is fixed/replaced.
//   quota    (429 / RESOURCE_EXHAUSTED / quota) → each key is its own Google
//            project/quota, so cooldown (~60s) + bump lastUsedAt so LRU rotates
//            to another key that still has capacity.
//   transient (5xx, timeouts) → cooldown with exponential backoff.
export async function markKeyFailure(keyId: string, errMsg?: string): Promise<void> {
  try {
    const key = await prisma.geminiKey.findUnique({ where: { id: keyId } })
    if (!key) return

    const m = (errMsg || "").replace(/\s+/g, " ").slice(0, 500)
    const isFatal = /\b(403|401|400)\b/.test(m) || /(denied|invalid api key|API_KEY_INVALID|PERMISSION_DENIED|UNAUTHENTICATED|INVALID_ARGUMENT)/i.test(m)
    const isQuota = /\b429\b/.test(m) || /(quota|RESOURCE_EXHAUSTED|exceeded your current quota)/i.test(m)

    if (isFatal) {
      // Permanently bad key — stop selecting it so the batch doesn't burn time.
      await prisma.geminiKey.update({
        where: { id: keyId },
        data: { isActive: false, requestCount: { increment: 1 } },
      })
      return
    }

    if (isQuota) {
      // Per-key quota: cooldown briefly so selectKey rotates to the next key
      // (bumping lastUsedAt pushes it to the LRU back), then retry there.
      await prisma.geminiKey.update({
        where: { id: keyId },
        data: {
          consecutiveFails: key.consecutiveFails + 1,
          cooldownUntil: new Date(Date.now() + QUOTA_COOLDOWN_MS),
          lastUsedAt: new Date(),
          requestCount: { increment: 1 },
        },
      })
      return
    }

    const fails = key.consecutiveFails + 1
    const backoff = COOLDOWN_BASE_MS * Math.pow(2, Math.min(fails, 6))
    await prisma.geminiKey.update({
      where: { id: keyId },
      data: {
        consecutiveFails: fails,
        cooldownUntil: new Date(Date.now() + backoff),
        requestCount: { increment: 1 },
      },
    })
  } catch { /* best-effort */ }
}

// Mark a key as used successfully.
export async function markKeySuccess(keyId: string): Promise<void> {
  try {
    await prisma.geminiKey.update({
      where: { id: keyId },
      data: { lastUsedAt: new Date(), consecutiveFails: 0, cooldownUntil: null, successCount: { increment: 1 }, requestCount: { increment: 1 } },
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