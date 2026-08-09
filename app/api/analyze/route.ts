import { NextResponse } from 'next/server'
import { getStoredConfig, getEnabledProviders } from '@/lib/ai/stored-config'
import { generateMetadataDual } from '@/lib/ai/stock'
import type { AIProvider } from '@/lib/ai/adapter'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { image, mimeType, provider } = body as { image: string; mimeType: string; provider?: AIProvider }

    if (!image) return NextResponse.json({ error: 'image required' }, { status: 400 })

    // Auto-pick the active provider by fallback priority when none specified
    let prov = provider
    if (!prov) {
      const enabled = await getEnabledProviders()
      if (enabled.length === 0) {
        return NextResponse.json({ error: 'No AI provider enabled. Add one in AI Settings first.' }, { status: 400 })
      }
      prov = enabled[0].provider
    }

    const config = await getStoredConfig(prov)
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