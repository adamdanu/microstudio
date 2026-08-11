import { NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { recordActivity } from "@/lib/activity"

async function requireAdmin() {
  const u = await getSessionUser()
  if (!u?.isAdmin) return null
  return u
}

function mask(k: string | null | undefined): string | null {
  if (!k) return null
  return k.length > 8 ? "••••••••" + k.slice(-4) : "••••"
}

// PATCH /api/admin/key-pools/[id] { name?, relayUrl? }
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await ctx.params

  let body: { name?: string; relayUrl?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const pool = await prisma.geminiKeyPool.findUnique({ where: { id } })
  if (!pool) return NextResponse.json({ error: "Pool not found" }, { status: 404 })

  const data: Record<string, unknown> = {}
  if (body.name !== undefined) data.name = body.name.trim() || pool.name
  if (body.relayUrl !== undefined) data.relayUrl = body.relayUrl.trim() || null

  await prisma.geminiKeyPool.update({ where: { id }, data })
  await recordActivity(admin.id, "pool_edit", `Edited Gemini key pool ${pool.name}`)
  return NextResponse.json({ ok: true })
}

// POST /api/admin/key-pools/[id]/keys { keys: string[], model } -> add keys
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await ctx.params

  let body: { keys?: string[]; model?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }
  const keys = (body.keys || []).map(k => k.trim()).filter(Boolean)
  const model = (body.model || "gemini-2.5-flash").trim()
  if (keys.length === 0) return NextResponse.json({ error: "No keys provided" }, { status: 400 })

  const pool = await prisma.geminiKeyPool.findUnique({ where: { id } })
  if (!pool) return NextResponse.json({ error: "Pool not found" }, { status: 404 })

  await prisma.geminiKey.createMany({ data: keys.map(apiKey => ({ poolId: id, apiKey, model })) })
  await recordActivity(admin.id, "pool_keys", `Added ${keys.length} key(s) to pool ${pool.name}`)
  return NextResponse.json({ ok: true }, { status: 201 })
}

// DELETE /api/admin/key-pools/[id] -> delete pool (cascades keys; unassigns users)
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await ctx.params

  const pool = await prisma.geminiKeyPool.findUnique({ where: { id } })
  if (!pool) return NextResponse.json({ error: "Pool not found" }, { status: 404 })

  await prisma.$transaction([
    prisma.user.updateMany({ where: { geminiPoolId: id }, data: { geminiPoolId: null } }),
    prisma.geminiKeyPool.delete({ where: { id } }),
  ])
  await recordActivity(admin.id, "pool_delete", `Deleted Gemini key pool ${pool.name}`)
  return NextResponse.json({ ok: true })
}

