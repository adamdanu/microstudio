import { NextRequest, NextResponse } from "next/server"
import { getAdminEmail, createResetToken, ensureAdminUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendMail } from "@/lib/mail"

// Forgot password: generate a signed, expiring reset token and "send" a link.
// TEMP: email delivery is a stub that logs to the server console/journald —
// swap lib/mail.ts sendMail body when a real provider is wired up.
export async function POST(req: NextRequest) {
  let body: { email?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const email = (body.email || "").trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 })
  }

  // Do not reveal whether the email is registered — always answer OK.
  if (email === getAdminEmail()) {
    await ensureAdminUser()
    const token = createResetToken(email)
    await prisma.user.update({
      where: { email },
      data: { resetTokenHash: token, resetTokenExpires: new Date(Date.now() + 30 * 60 * 1000) },
    })
    const origin = req.headers.get("x-forwarded-proto") || "http"
    const host = req.headers.get("host") || "localhost:3000"
    const link = `${origin}://${host}/reset?token=${encodeURIComponent(token)}`
    await sendMail({
      to: email,
      subject: "Reset your MicroStudio password",
      text: `Click this link to reset your MicroStudio password (valid 30 minutes):\n\n${link}`,
    })
  }

  return NextResponse.json({ ok: true })
}