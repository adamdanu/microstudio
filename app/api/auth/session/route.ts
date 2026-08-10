import { NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json({
    email: user.email,
    role: user.role,
    isAdmin: user.isAdmin,
    accessType: user.accessType,
    remainingDays: user.accessType === "UNLIMITED" ? null : Math.max(0, Math.floor(((user.expiresAt?.getTime() || 0) - Date.now()) / 86400000)),
    blocked: user.blocked,
  })
}