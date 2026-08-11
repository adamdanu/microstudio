import { NextRequest, NextResponse } from "next/server"
import { getSessionUser, verifyCredentials, updatePassword } from "@/lib/auth"
import { sendMail } from "@/lib/mail"

// GET /api/auth/profile -> current signed-in user's email + access info
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json({
    email: user.email,
    role: user.role,
    isAdmin: user.isAdmin,
    accessType: user.accessType,
    expiresAt: user.expiresAt,
    remainingDays: user.accessType === "UNLIMITED" ? null : Math.max(0, Math.ceil(((user.expiresAt?.getTime() || 0) - Date.now()) / 86400000)),
    blocked: user.blocked,
  })
}

// POST /api/auth/profile { currentPassword, newPassword } -> change password + email notification
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { currentPassword?: string; newPassword?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const currentPassword = body.currentPassword || ""
  const newPassword = body.newPassword || ""
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "Current and new password required" }, { status: 400 })
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 })
  }

  const valid = await verifyCredentials(user.email, currentPassword)
  if (!valid) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 })
  }

  const ok = await updatePassword(user.email, newPassword)
  if (!ok) return NextResponse.json({ error: "Failed to change password" }, { status: 500 })

  await sendMail({
    to: user.email,
    subject: "MicroStudio password changed",
    text: "Your MicroStudio password was changed. If this was not you, contact support immediately.",
  })

  return NextResponse.json({ ok: true })
}