import { NextRequest, NextResponse } from "next/server"
import { verifyResetToken, updatePassword } from "@/lib/auth"
import { sendMail } from "@/lib/mail"

export async function POST(req: NextRequest) {
  let body: { token?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const token = body.token || ""
  const password = body.password || ""
  if (!token || !password) {
    return NextResponse.json({ error: "Token and new password required" }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
  }

  const email = verifyResetToken(token)
  if (!email) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 })
  }

  const ok = await updatePassword(email, password)
  if (!ok) return NextResponse.json({ error: "Reset failed" }, { status: 500 })

  await sendMail({
    to: email,
    subject: "MicroStudio password was reset",
    text: "Your MicroStudio password was successfully reset. If you did not do this, contact support immediately.",
  })

  return NextResponse.json({ ok: true })
}