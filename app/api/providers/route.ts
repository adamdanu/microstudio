import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function maskKey(key: string | null | undefined): string | null {
  if (!key) return null
  return '••••••••' + key.slice(-4)
}

const isMasked = (v: string | null | undefined) => typeof v === 'string' && v.startsWith('••••')

// GET all provider configs (masked) — mirrors smartest /api/settings
export async function GET() {
  try {
    const configs = await prisma.aiProviderConfig.findMany({ orderBy: { sortOrder: 'asc' } })
    return NextResponse.json({ configs: configs.map(c => ({ ...c, apiKey: maskKey(c.apiKey) })) })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }
}

// PUT upsert a provider config — mirrors smartest /api/settings (mask-preserving)
export async function PUT(req: Request) {
  try {
    const body = await req.json()
    const { provider, apiKey, baseURL, model, enabled, sortOrder } = body
    if (!provider) return NextResponse.json({ error: 'provider is required' }, { status: 400 })

    const prev = await prisma.aiProviderConfig.findUnique({ where: { provider } })

    const config = await prisma.aiProviderConfig.upsert({
      where: { provider },
      create: {
        provider,
        apiKey: apiKey || null,
        baseURL: baseURL || null,
        model: model || null,
        enabled: enabled === undefined ? true : enabled,
        sortOrder: sortOrder ?? ((prev?.sortOrder ?? -1) + 1),
      },
      update: {
        ...(apiKey !== undefined && !isMasked(apiKey) ? { apiKey: apiKey || null } : {}),
        ...(baseURL !== undefined ? { baseURL: baseURL || null } : {}),
        ...(model !== undefined ? { model: model || null } : {}),
        ...(enabled !== undefined ? { enabled } : {}),
      },
    })

    return NextResponse.json({ config: { ...config, apiKey: maskKey(config.apiKey) } })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to save provider' }, { status: 500 })
  }
}

// DELETE a provider config
export async function DELETE(req: Request) {
  try {
    const { provider } = await req.json()
    await prisma.aiProviderConfig.deleteMany({ where: { provider } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to delete provider' }, { status: 500 })
  }
}

// PATCH reorder providers (fallback priority)
export async function PATCH(req: Request) {
  try {
    const { orders } = await req.json()
    if (!Array.isArray(orders)) return NextResponse.json({ error: 'orders array required' }, { status: 400 })

    await prisma.$transaction(
      orders.map((item: { provider: string; sortOrder: number }) =>
        prisma.aiProviderConfig.update({
          where: { provider: item.provider },
          data: { sortOrder: item.sortOrder },
        })
      )
    )

    const configs = await prisma.aiProviderConfig.findMany({ orderBy: { sortOrder: 'asc' } })
    return NextResponse.json({ configs: configs.map(c => ({ ...c, apiKey: maskKey(c.apiKey) })) })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to reorder' }, { status: 500 })
  }
}