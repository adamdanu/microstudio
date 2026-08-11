import { NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { recordActivity } from "@/lib/activity"

async function requireAdmin() {
  const u = await getSessionUser()
  if (!u?.isAdmin) return null
  return u
}

// PATCH /api/admin/key-pools/[id]/keys/[kid] { isActive? }
export async function PATCH(_req: NextRequest, ctx: { params: Promise<{ id: string; kid: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id, kid } = await ctx.params

  const key = await prisma.geminiKey.findFirst({ where: { id: kid, poolId: id } })
  if (!key) return NextResponse.json({ error: "Key not found" }, { status: 404 })

  await prisma.geminiKey.update({ where: { id: kid }, data: { isActive: !key.isActive } })
  await recordActivity(admin.id, "pool_key_toggle", `Toggled key in pool`)
  return NextResponse.json({ ok: true, isActive: !key.isActive })
}

// DELETE /api/admin/key-pools/[id]/keys/[kid]
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; kid: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id, kid } = await ctx.params

  const key = await prisma.geminiKey.findFirst({ where: { id: kid, poolId: id } })
  if (!key) return NextResponse.json({ error: "Key not found" }, { status: 404 })

  await prisma.geminiKey.delete({ where: { id: kid } })
  await recordActivity(admin.id, "pool_key_delete", `Removed key from pool`)
  return NextResponse.json({ ok: true })
}