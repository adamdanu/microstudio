import { NextRequest, NextResponse } from "next/server"
import { verifyCredentials, issueSessionToken, SESSION_COOKIE, SESSION_MAX_AGE, ensureAdminUser } from "@/lib/auth"

const MAX_FAILURES = 5
const LOCKOUT_MS = 60_000
const WINDOW_MS = 60_000
const attempts = new Map<string, { count: number; resetAt: number }>()

function clientKey(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for")
  const ip = fwd ? fwd.split(",")[0].trim() : (req.headers.get("x-real-ip") || "unknown")
  const ua = req.headers.get("user-agent") || ""
  return `${ip}|${ua}`
}

function isLocked(key: string): { locked: boolean; retryAfterSec?: number } {
  const rec = attempts.get(key)
  if (!rec) return { locked: false }
  if (rec.count >= MAX_FAILURES) {
    if (Date.now() >= rec.resetAt) {
      attempts.delete(key)
      return { locked: false }
    }
    return { locked: true, retryAfterSec: Math.ceil((rec.resetAt - Date.now()) / 1000) }
  }
  if (Date.now() >= rec.resetAt) {
    attempts.delete(key)
    return { locked: false }
  }
  return { locked: false }
}

function recordFailure(key: string) {
  const now = Date.now()
  const rec = attempts.get(key)
  if (!rec || now >= rec.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return
  }
  rec.count += 1
  if (rec.count >= MAX_FAILURES) rec.resetAt = now + LOCKOUT_MS
  attempts.set(key, rec)
}

export async function POST(req: NextRequest) {
  const key = clientKey(req)
  const lock = isLocked(key)
  if (lock.locked) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${lock.retryAfterSec}s.` },
      { status: 429, headers: { "Retry-After": String(lock.retryAfterSec) } }
    )
  }

  let body: { email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const email = (body.email || "").trim().toLowerCase()
  const password = body.password || ""
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 })
  }

  // Email format validation + unregistered email blocked (handled in verifyCredentials)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 })
  }

  // Seamless first-run: ensure the admin row exists (seeded from env on first access).
  await ensureAdminUser()

  const session = await verifyCredentials(email, password)
  if (!session) {
    recordFailure(key)
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
  }
  if (session.blocked) {
    recordFailure(key)
    return NextResponse.json({ error: "Access expired or account disabled" }, { status: 403 })
  }

  attempts.delete(key)
  const proto = req.headers.get("x-forwarded-proto") || "http"
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, issueSessionToken(email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && proto === "https",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  })
  return res
}