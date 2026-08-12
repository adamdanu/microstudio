import { NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { recordActivity } from "@/lib/activity"

async function requireAdmin() {
  const u = await getSessionUser()
  if (!u?.isAdmin) return null
  return u
}

// POST /api/admin/key-pools/[id]/keys { keys: string[], model? }
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await ctx.params

  const pool = await prisma.geminiKeyPool.findUnique({
    where: { id },
    include: { keys: { orderBy: { createdAt: "asc" }, take: 1 } },
  })
  if (!pool) return NextResponse.json({ error: "Pool not found" }, { status: 404 })

  let body: { keys?: string[]; model?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }
  const keys = (body.keys || []).map(k => k.trim()).filter(Boolean)
  if (keys.length === 0) return NextResponse.json({ error: "Add at least one API key" }, { status: 400 })
  const model = (body.model || "").trim() || pool.keys[0]?.model || "gemini-2.5-flash"

  await prisma.geminiKey.createMany({
    data: keys.map(apiKey => ({ poolId: id, apiKey, model })),
  })

  await recordActivity(admin.id, "pool_key_add", `Added ${keys.length} key(s) to pool ${pool.name}`)
  return NextResponse.json({ ok: true, added: keys.length }, { status: 201 })
}