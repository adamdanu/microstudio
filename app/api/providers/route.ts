import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const MASK = "••••••••"

function maskKey(key: string | null | undefined): string | null {
  if (!key) return null
  return MASK + key.slice(-4)
}

const isMasked = (v: string | null | undefined) => typeof v === 'string' && v.startsWith(MASK)

// All provider endpoints are scoped to the signed-in user (per-user AI settings).
async function reqUser() {
  const u = await getSessionUser()
  if (!u) return null
  return u
}

// GET all provider configs for the current user (masked)
export async function GET() {
  const user = await reqUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const configs = await prisma.aiProviderConfig.findMany({ where: { userId: user.id }, orderBy: { sortOrder: 'asc' } })
    return NextResponse.json({ configs: configs.map(c => ({ ...c, apiKey: maskKey(c.apiKey) })) })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }
}

// PUT upsert a provider config for the current user (mask-preserving)
export async function PUT(req: NextRequest) {
  const user = await reqUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    const { provider, apiKey, baseURL, model, enabled, sortOrder } = body
    if (!provider) return NextResponse.json({ error: 'provider is required' }, { status: 400 })

    const prev = await prisma.aiProviderConfig.findUnique({ where: { userId_provider: { userId: user.id, provider } } })

    const config = await prisma.aiProviderConfig.upsert({
      where: { userId_provider: { userId: user.id, provider } },
      create: {
        userId: user.id,
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

// DELETE a provider config for the current user
export async function DELETE(req: NextRequest) {
  const user = await reqUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { provider } = await req.json()
    await prisma.aiProviderConfig.deleteMany({ where: { userId: user.id, provider } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to delete provider' }, { status: 500 })
  }
}

// PATCH reorder providers for the current user (fallback priority)
export async function PATCH(req: NextRequest) {
  const user = await reqUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { orders } = await req.json()
    if (!Array.isArray(orders)) return NextResponse.json({ error: 'orders array required' }, { status: 400 })

    await prisma.$transaction(
      orders.map((item: { provider: string; sortOrder: number }) =>
        prisma.aiProviderConfig.update({
          where: { userId_provider: { userId: user.id, provider: item.provider } },
          data: { sortOrder: item.sortOrder },
        })
      )
    )

    const configs = await prisma.aiProviderConfig.findMany({ where: { userId: user.id }, orderBy: { sortOrder: 'asc' } })
    return NextResponse.json({ configs: configs.map(c => ({ ...c, apiKey: maskKey(c.apiKey) })) })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to reorder' }, { status: 500 })
  }
}