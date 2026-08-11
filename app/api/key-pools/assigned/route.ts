import { NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/key-pools/assigned -> the signed-in user's Gemini key pool (if any)
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { geminiPool: { select: { id: true, name: true } } },
  })
  if (!me?.geminiPool) return NextResponse.json({ pool: null })

  return NextResponse.json({ pool: { id: me.geminiPool.id, name: me.geminiPool.name } })
}