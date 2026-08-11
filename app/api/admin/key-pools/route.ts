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

// GET /api/admin/key-pools -> list pools with keys + assigned user count
export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const pools = await prisma.geminiKeyPool.findMany({
    include: {
      keys: { orderBy: { createdAt: "asc" } },
      _count: { select: { users: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({
    pools: pools.map(p => ({
      id: p.id,
      name: p.name,
      relayUrl: p.relayUrl,
      createdAt: p.createdAt,
      assignedUsers: p._count.users,
      keys: p.keys.map(k => ({
        id: k.id,
        maskedKey: mask(k.apiKey),
        model: k.model,
        isActive: k.isActive,
        lastUsedAt: k.lastUsedAt,
        consecutiveFails: k.consecutiveFails,
        cooldownUntil: k.cooldownUntil,
      })),
    })),
  })
}

// POST /api/admin/key-pools { name, relayUrl, keys: string[], model }
export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { name?: string; relayUrl?: string; relayToken?: string; keys?: string[]; model?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }
  const name = (body.name || "").trim()
  const relayUrl = (body.relayUrl || "").trim() || null
  const relayToken = (body.relayToken || "").trim() || null
  const keys = (body.keys || []).map(k => k.trim()).filter(Boolean)
  const model = (body.model || "gemini-2.5-flash").trim()

  if (!name) return NextResponse.json({ error: "Pool name is required" }, { status: 400 })
  if (keys.length === 0) return NextResponse.json({ error: "Add at least one API key" }, { status: 400 })

  const pool = await prisma.geminiKeyPool.create({
    data: {
      name,
      relayUrl,
      relayToken,
      adminId: admin.id,
      keys: { create: keys.map(apiKey => ({ apiKey, model })) },
    },
  })

  await recordActivity(admin.id, "pool_create", `Created Gemini key pool ${name} (${keys.length} keys)`)
  return NextResponse.json({ pool: { id: pool.id, name: pool.name } }, { status: 201 })
}