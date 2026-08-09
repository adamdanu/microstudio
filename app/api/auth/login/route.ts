import { NextRequest, NextResponse } from "next/server"
import { verifyCredentials, issueSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth"

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

  let body: { username?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const username = (body.username || "").trim()
  const password = body.password || ""
  if (!username || !password) {
    return NextResponse.json({ error: "Username and password required" }, { status: 400 })
  }

  if (!verifyCredentials(username, password)) {
    recordFailure(key)
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 })
  }

  attempts.delete(key)
  const proto = req.headers.get("x-forwarded-proto") || "http"
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, issueSessionToken(username), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && proto === "https",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  })
  return res
}