import { NextResponse } from 'next/server'
import { getStoredConfig, getEnabledProviders } from '@/lib/ai/stored-config'
import { generateMetadataDual } from '@/lib/ai/stock'
import { getSessionUser, updateLastActive } from '@/lib/auth'
import { recordActivity } from '@/lib/activity'
import { recordAnalysis } from '@/lib/analysis'
import { getUserPool, selectKey, markKeySuccess, markKeyFailure } from '@/lib/ai/gemini-pool'
import type { AIProvider } from '@/lib/ai/adapter'

export async function POST(req: Request) {
  let userId: string | null = null
  let activeKeyId: string | null = null
  try {
    const user = await getSessionUser()
    if (!user || user.blocked) {
      return NextResponse.json({ error: 'Access expired or account disabled' }, { status: 403 })
    }
    userId = user.id
    updateLastActive(user.email)
    recordActivity(user.id, 'analyze', 'Ran image analysis')

    const body = await req.json()
    const { image, mimeType, provider } = body as { image: string; mimeType: string; provider?: AIProvider }

    if (!image) return NextResponse.json({ error: 'image required' }, { status: 400 })

    // If the user is assigned to a Gemini key pool, use it (round-robin + relay).
    const pool = await getUserPool(user.id)
    if (pool) {
      const sel = await selectKey(pool.id)
      if (!sel) {
        return NextResponse.json({ error: 'Gemini key pool has no usable keys. Contact admin.' }, { status: 503 })
      }
      activeKeyId = sel.key.id
      try {
        const result = await generateMetadataDual(image, mimeType || 'image/png', sel.config)
        await markKeySuccess(sel.key.id)
        const { usage, ...packs } = result
        await recordAnalysis(user.id, 'SUCCESS', usage?.tokensIn ?? 0, usage?.tokensOut ?? 0).catch(() => {})
        return NextResponse.json({ ...packs, provider: 'gemini-pool' })
      } catch (e) {
        await markKeyFailure(sel.key.id)
        console.error(e)
        const msg = e instanceof Error ? e.message : 'Failed to analyze'
        return NextResponse.json({ error: msg }, { status: 500 })
      }
    }

    // Auto-pick the active provider by fallback priority when none specified
    let prov = provider
    if (!prov) {
      const enabled = await getEnabledProviders(user.id)
      if (enabled.length === 0) {
        return NextResponse.json({ error: 'No AI provider enabled. Add one in AI Settings first.' }, { status: 400 })
      }
      prov = enabled[0].provider
    }

    const config = await getStoredConfig(user.id, prov)
    if (!config) {
      return NextResponse.json({
        error: `Provider "${prov}" is not configured. Add your API key in Settings first.`,
      }, { status: 400 })
    }

    const result = await generateMetadataDual(image, mimeType || 'image/png', config)
    const { usage, ...packs } = result
    // Per-analysis success + token usage, best-effort (never blocks the response)
    const { adobe, shutterstock } = packs
    const success = !!adobe?.title?.en && !!shutterstock?.title?.en
    await recordAnalysis(user.id, success ? 'SUCCESS' : 'FAIL', usage?.tokensIn ?? 0, usage?.tokensOut ?? 0).catch(() => {})
    return NextResponse.json({ ...packs, provider: prov })
  } catch (e) {
    console.error(e)
    // Record the failure for analytics (tokens unavailable on error path)
    if (userId) await recordAnalysis(userId, 'FAIL', 0, 0).catch(() => {})
    if (activeKeyId) await markKeyFailure(activeKeyId)
    const msg = e instanceof Error ? e.message : 'Failed to analyze'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}