import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

const PROVIDER_MODEL_ENDPOINTS: Record<string, string> = {
  openai: 'https://api.openai.com/v1/models',
  anthropic: 'https://api.anthropic.com/v1/models',
  google: 'https://generativelanguage.googleapis.com/v1/models',
  deepseek: 'https://api.deepseek.com/v1/models',
}

export async function POST(req: Request) {
  try {
    let body: { provider?: string; apiKey?: string; baseURL?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    const provider = body.provider
    let apiKey = body.apiKey
    const baseURL = body.baseURL

    if (!provider || !apiKey) {
      return NextResponse.json({ error: 'provider and apiKey are required' }, { status: 400 })
    }

    if (apiKey.startsWith('••••')) {
      const me = await getSessionUser()
      if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      const stored = await prisma.aiProviderConfig.findUnique({ where: { userId_provider: { userId: me.id, provider } } })
      apiKey = stored?.apiKey || apiKey
    }

    let modelsEndpoint: string
    let headers: Record<string, string> = {}

    switch (provider) {
      case 'openai':
      case 'deepseek':
        modelsEndpoint = PROVIDER_MODEL_ENDPOINTS[provider]
        headers = { Authorization: `Bearer ${apiKey}` }
        break
      case 'anthropic':
        modelsEndpoint = PROVIDER_MODEL_ENDPOINTS[provider]
        headers = { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
        break
      case 'google':
        modelsEndpoint = `${PROVIDER_MODEL_ENDPOINTS[provider]}?key=${apiKey}`
        headers = {}
        break
      case 'openai-compatible':
        modelsEndpoint = `${baseURL || 'https://api.openai.com/v1'}/models`
        headers = { Authorization: `Bearer ${apiKey}` }
        break
      default:
        return NextResponse.json({ error: 'Unknown provider' }, { status: 400 })
    }

    const res = await fetch(modelsEndpoint, { headers })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return NextResponse.json({ error: `API error: ${res.status} ${text}` }, { status: 502 })
    }

    const data = await res.json()
    let models: string[] = []

    switch (provider) {
      case 'openai':
      case 'deepseek':
      case 'openai-compatible':
        models = ((data.data as Record<string, unknown>[]) || []).map(m => m.id as string).filter(Boolean)
        break
      case 'anthropic':
        models = ((data.data as Record<string, unknown>[]) || []).map(m => (m.id || m.name) as string).filter(Boolean)
        break
      case 'google':
        models = ((data.models as Record<string, unknown>[]) || []).map(m => m.name as string).filter(Boolean)
        break
    }

    models.sort()
    return NextResponse.json({ models })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to fetch models' }, { status: 500 })
  }
}