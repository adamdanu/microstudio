import { NextResponse } from 'next/server'
import { getStoredConfig, getEnabledProviders } from '@/lib/ai/stored-config'
import { generateMetadataDual } from '@/lib/ai/stock'
import { getSessionUser, updateLastActive } from '@/lib/auth'
import { recordActivity } from '@/lib/activity'
import type { AIProvider } from '@/lib/ai/adapter'

export async function POST(req: Request) {
  try {
    const user = await getSessionUser()
    if (!user || user.blocked) {
      return NextResponse.json({ error: 'Access expired or account disabled' }, { status: 403 })
    }
    updateLastActive(user.email)
    recordActivity(user.id, 'analyze', 'Ran image analysis')

    const body = await req.json()
    const { image, mimeType, provider } = body as { image: string; mimeType: string; provider?: AIProvider }

    if (!image) return NextResponse.json({ error: 'image required' }, { status: 400 })

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
    return NextResponse.json({ ...result, provider: prov })
  } catch (e) {
    console.error(e)
    const msg = e instanceof Error ? e.message : 'Failed to analyze'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}