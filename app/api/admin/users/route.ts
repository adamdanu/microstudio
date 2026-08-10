import { NextRequest, NextResponse } from "next/server"
import { getSessionUser, getAdminEmail, hashPassword } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const DAY_MS = 86400000

function computeExpiresAt(accessType: string, customDate?: string): Date | null {
  if (accessType === "UNLIMITED") return null
  if (accessType === "CUSTOM" && customDate) {
    const d = new Date(customDate)
    return isNaN(d.getTime()) ? null : d
  }
  // default DAYS_30
  return new Date(Date.now() + 30 * DAY_MS)
}

function remainingDays(expiresAt: Date | null, accessType: string): number | null {
  if (accessType === "UNLIMITED") return null
  if (!expiresAt) return null
  return Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / DAY_MS))
}

async function requireAdmin() {
  const u = await getSessionUser()
  if (!u) return null
  if (!u.isAdmin) return null
  return u
}

// GET /api/admin/users?search=&page=&pageSize=
export async function GET(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = req.nextUrl
  const search = (searchParams.get("search") || "").trim().toLowerCase()
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1)
  const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") || "25", 10) || 25))

  const where = search
    ? { email: { contains: search, mode: "insensitive" as const } }
    : {}

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        email: true,
        status: true,
        role: true,
        accessType: true,
        expiresAt: true,
        lastActiveAt: true,
        createdAt: true,
      },
    }),
    prisma.user.count({ where }),
  ])

  return NextResponse.json({
    items: users.map(u => ({
      id: u.id,
      email: u.email,
      status: u.status,
      role: u.role,
      accessType: u.accessType,
      expiresAt: u.expiresAt,
      lastActiveAt: u.lastActiveAt,
      remainingDays: remainingDays(u.expiresAt, u.accessType),
    })),
    total,
    page,
    pageSize,
  })
}

// POST /api/admin/users { email, password, accessType, expiresAt? }
export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { email?: string; password?: string; accessType?: string; expiresAt?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const email = (body.email || "").trim().toLowerCase()
  const password = body.password || ""
  const accessType = body.accessType || "DAYS_30"

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
  }
  if (!["DAYS_30", "UNLIMITED", "CUSTOM"].includes(accessType)) {
    return NextResponse.json({ error: "Invalid access type" }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return NextResponse.json({ error: "Email already registered" }, { status: 409 })

  const expiresAt = computeExpiresAt(accessType, body.expiresAt)
  if (accessType === "CUSTOM" && !expiresAt) {
    return NextResponse.json({ error: "Custom access requires a valid expiry date" }, { status: 400 })
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: hashPassword(password),
      role: "USER",
      status: "ACTIVE",
      accessType: accessType as any,
      expiresAt,
      createdById: admin.email === getAdminEmail() ? undefined : admin.email, // simplified
    },
    select: { id: true, email: true, role: true, status: true, accessType: true, expiresAt: true },
  })

  return NextResponse.json({ user }, { status: 201 })
}