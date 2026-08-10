import { cookies } from "next/headers"
import { scryptSync, randomBytes, createHmac, timingSafeEqual } from "node:crypto"
import { createSessionToken, verifySessionToken } from "@/lib/session-token"
import { prisma } from "@/lib/prisma"

const SESSION_COOKIE = "microstudio_session"
const SESSION_MAX_AGE = 7 * 24 * 3600

export function getSecret(): string {
  return process.env.ADMIN_SESSION_SECRET || ""
}

export function getAdminEmail(): string {
  return (process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME || "admin")
    .trim().toLowerCase()
}

// ── password hashing (scrypt, <salt>:<hex>) ────────────────────────────────
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex")
  const hex = scryptSync(password, salt, 64).toString("hex")
  return `${salt}:${hex}`
}

function verifyHash(hash: string, password: string): boolean {
  const [salt, hex] = hash.split(":")
  if (!salt || !hex) return false
  const given = scryptSync(password, salt, 64)
  const expected = Buffer.from(hex, "hex")
  return given.length === expected.length && timingSafeEqual(given, expected)
}

// ── seeding ────────────────────────────────────────────────────────────────
// On first auth access, ensure the admin user exists in the DB, seeded from the
// env-provided email + password hash (keeps the current admin working).
export async function ensureAdminUser(): Promise<{ email: string; exists: boolean }> {
  const email = getAdminEmail()
  const envHash = process.env.ADMIN_PASSWORD_HASH || ""
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return { email, exists: true }
  if (!envHash) return { email, exists: false }
  await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash: envHash },
    update: {},
  })
  return { email, exists: false }
}

// ── credential verification against the DB ────────────────────────────────
export async function verifyCredentials(email: string, password: string): Promise<boolean> {
  const norm = email.trim().toLowerCase()
  if (norm !== getAdminEmail()) return false // unregistered email blocked
  const user = await prisma.user.findUnique({ where: { email: norm } })
  if (!user) return false
  return verifyHash(user.passwordHash, password)
}

export function issueSessionToken(user: string): string {
  return createSessionToken(user, getSecret())
}

export function verifyCookieToken(token: string | undefined): { user: string } | null {
  return verifySessionToken(token, getSecret(), SESSION_MAX_AGE * 1000)
}

export async function verifyRequest(): Promise<boolean> {
  try {
    const store = await cookies()
    const token = store.get(SESSION_COOKIE)?.value
    return !!verifyCookieToken(token)
  } catch {
    return false
  }
}

export async function getSessionUser(): Promise<{ email: string } | null> {
  try {
    const store = await cookies()
    const token = store.get(SESSION_COOKIE)?.value
    const payload = verifyCookieToken(token)
    if (!payload) return null
    return { email: payload.user }
  } catch {
    return null
  }
}

// ── password change / reset ────────────────────────────────────────────────
export async function updatePassword(email: string, newPassword: string): Promise<boolean> {
  try {
    await prisma.user.update({
      where: { email: email.trim().toLowerCase() },
      data: {
        passwordHash: hashPassword(newPassword),
        resetTokenHash: null,
        resetTokenExpires: null,
      },
    })
    return true
  } catch {
    return false
  }
}

// ── reset token (HMAC, URL-safe, expires) ──────────────────────────────────
export function createResetToken(email: string, ttlMs = 30 * 60 * 1000): string {
  const secret = getSecret() || "insecure-reset-secret"
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + ttlMs })).toString("base64url")
  const sig = createHmac("sha256", secret).update(payload).digest("base64url")
  return `${payload}.${sig}`
}

export function verifyResetToken(token: string): string | null {
  const [payload, sig] = token.split(".")
  if (!payload || !sig) return null
  const secret = getSecret() || "insecure-reset-secret"
  const expected = createHmac("sha256", secret).update(payload).digest("base64url")
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { email: string; exp: number }
    if (!data.email || !data.exp || Date.now() > data.exp) return null
    return data.email
  } catch {
    return null
  }
}

export { SESSION_COOKIE, SESSION_MAX_AGE, verifyHash }