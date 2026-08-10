import { prisma } from "@/lib/prisma"
import type { AIProvider, AIProviderConfig } from "./adapter"

const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
  google: 'gemini-3.5-flash-lite',
  deepseek: 'deepseek-v4-flash',
  'openai-compatible': 'gpt-4o-mini',
}

// Per-user AI provider config. The signed-in user's own API keys are used for
// analysis — never another user's (e.g. the admin's).
export async function getStoredConfig(userId: string, provider: AIProvider): Promise<AIProviderConfig | null> {
  try {
    const stored = await prisma.aiProviderConfig.findUnique({ where: { userId_provider: { userId, provider } } })
    if (!stored || !stored.enabled) return null
    return {
      provider,
      model: stored.model || DEFAULT_MODELS[provider],
      baseURL: stored.baseURL || undefined,
      apiKey: stored.apiKey || undefined,
    }
  } catch {
    return null
  }
}

export async function getEnabledProviders(userId: string): Promise<AIProviderConfig[]> {
  try {
    const stored = await prisma.aiProviderConfig.findMany({
      where: { userId, enabled: true },
      orderBy: { sortOrder: 'asc' },
    })
    return stored.map(s => ({
      provider: s.provider as AIProvider,
      model: s.model || DEFAULT_MODELS[s.provider as AIProvider],
      baseURL: s.baseURL || undefined,
      apiKey: s.apiKey || undefined,
    }))
  } catch {
    return []
  }
}