import { NextRequest, NextResponse } from "next/server"
import { getSessionUser, hashPassword } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const DAY_MS = 86400000

function computeExpiresAt(accessType: string, current?: Date | null, customDate?: string): Date | null {
  if (accessType === "UNLIMITED") return null
  if (accessType === "CUSTOM" && customDate) {
    const d = new Date(customDate)
    return isNaN(d.getTime()) ? null : d
  }
  if (accessType === "DAYS_30") return new Date(Date.now() + 30 * DAY_MS)
  return current ?? null
}

async function requireAdmin() {
  const u = await getSessionUser()
  if (!u?.isAdmin) return null
  return u
}

// PATCH /api/admin/users/[id] { role?, status?, accessType?, expiresAt? }
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await ctx.params

  let body: { role?: string; status?: string; accessType?: string; expiresAt?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const target = await prisma.user.findUnique({ where: { id } })
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 })

  // do not let admin disable/demote themselves into lockout
  if (target.email === admin.email && (body.status === "DISABLED" || body.role === "USER" && target.role === "ADMIN")) {
    return NextResponse.json({ error: "You cannot disable or demote your own account" }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (body.role === "ADMIN" || body.role === "USER") data.role = body.role
  if (body.status === "ACTIVE" || body.status === "DISABLED") data.status = body.status
  if (["DAYS_30", "UNLIMITED", "CUSTOM"].includes(body.accessType || "")) {
    data.accessType = body.accessType
    data.expiresAt = computeExpiresAt(body.accessType!, target.expiresAt, body.expiresAt)
    if (body.accessType === "CUSTOM" && !data.expiresAt) {
      return NextResponse.json({ error: "Custom access requires a valid expiry date" }, { status: 400 })
    }
  }

  const user = await prisma.user.update({ where: { id }, data })
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      accessType: user.accessType,
      expiresAt: user.expiresAt,
      lastActiveAt: user.lastActiveAt,
    },
  })
}

// DELETE /api/admin/users/[id] -> hard delete (removes the user row + their provider configs)
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await ctx.params

  const target = await prisma.user.findUnique({ where: { id } })
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 })
  if (target.email === admin.email) {
    return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 })
  }

  await prisma.user.delete({ where: { id } })
  return NextResponse.json({ ok: true, deleted: true })
}

// POST /api/admin/users/[id]/password { password }
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await ctx.params

  let body: { password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }
  const password = body.password || ""
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
  }

  const target = await prisma.user.findUnique({ where: { id } })
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 })

  await prisma.user.update({
    where: { id },
    data: { passwordHash: hashPassword(password), resetTokenHash: null, resetTokenExpires: null },
  })
  return NextResponse.json({ ok: true })
}