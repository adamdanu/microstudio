import { NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { recordActivity } from "@/lib/activity"

async function requireAdmin() {
  const u = await getSessionUser()
  if (!u?.isAdmin) return null
  return u
}

// PUT /api/admin/key-pools/[id]/assignment { userIds?: string[], all?: boolean }
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await ctx.params

  let body: { userIds?: string[]; all?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const pool = await prisma.geminiKeyPool.findUnique({ where: { id } })
  if (!pool) return NextResponse.json({ error: "Pool not found" }, { status: 404 })

  // clear current assignments, then assign
  await prisma.user.updateMany({ where: { geminiPoolId: id }, data: { geminiPoolId: null } })

  let userIds: string[]
  if (body.all) {
    const users = await prisma.user.findMany({ where: { status: "ACTIVE" }, select: { id: true } })
    userIds = users.map(u => u.id)
  } else {
    userIds = body.userIds || []
  }

  if (userIds.length > 0) {
    await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { geminiPoolId: id } })
  }

  await recordActivity(admin.id, "pool_assign", `Assigned pool ${pool.name} to ${userIds.length} user(s)`)
  return NextResponse.json({ ok: true, assigned: userIds.length })
}