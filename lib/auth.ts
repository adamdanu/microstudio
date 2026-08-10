import { cookies } from "next/headers"
import { scryptSync, randomBytes, createHmac, timingSafeEqual } from "node:crypto"
import { createSessionToken, verifySessionToken } from "@/lib/session-token"
import { prisma } from "@/lib/prisma"
import type { Role, Status, AccessType } from "@prisma/client"

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

export function verifyHash(hash: string, password: string): boolean {
  const [salt, hex] = hash.split(":")
  if (!salt || !hex) return false
  const given = scryptSync(password, salt, 64)
  const expected = Buffer.from(hex, "hex")
  return given.length === expected.length && timingSafeEqual(given, expected)
}

// ── seeding ────────────────────────────────────────────────────────────────
// On first access, ensure the admin user exists (role ADMIN, unlimited access).
export async function ensureAdminUser(): Promise<{ email: string; exists: boolean }> {
  const email = getAdminEmail()
  const envHash = process.env.ADMIN_PASSWORD_HASH || ""
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return { email, exists: true }
  if (!envHash) return { email, exists: false }
  await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash: envHash, role: "ADMIN", accessType: "UNLIMITED", status: "ACTIVE" },
    update: {},
  })
  return { email, exists: false }
}

export type SessionUser = {
  id: string
  email: string
  role: Role
  status: Status
  accessType: AccessType
  expiresAt: Date | null
  isAdmin: boolean
  blocked: boolean
}

// ── access gate ────────────────────────────────────────────────────────────
// Blocked iff status=DISABLED OR (accessType ≠ UNLIMITED AND expired).
export function isUserBlocked(u: { status: Status; accessType: AccessType; expiresAt: Date | null }): boolean {
  if (u.status === "DISABLED") return true
  if (u.accessType === "UNLIMITED") return false
  if (u.expiresAt && u.expiresAt.getTime() <= Date.now()) return true
  return false
}

// ── credential verification against the DB ────────────────────────────────
export async function verifyCredentials(email: string, password: string): Promise<SessionUser | null> {
  const norm = email.trim().toLowerCase()
  if (norm !== getAdminEmail() && !(await userExists(norm))) return null // only registered emails
  const user = await prisma.user.findUnique({ where: { email: norm } })
  if (!user) return null
  if (!verifyHash(user.passwordHash, password)) return null
  return sessionUserOf(user)
}

async function userExists(email: string): Promise<boolean> {
  return (await prisma.user.findUnique({ where: { email } })) !== null
}

function sessionUserOf(u: { id: string; email: string; role: Role; status: Status; accessType: AccessType; expiresAt: Date | null }) {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    status: u.status,
    accessType: u.accessType,
    expiresAt: u.expiresAt,
    isAdmin: u.role === "ADMIN",
    blocked: isUserBlocked(u),
  } as SessionUser
}

export function issueSessionToken(user: string): string {
  return createSessionToken(user, getSecret())
}

export function verifyCookieToken(token: string | undefined): { user: string } | null {
  return verifySessionToken(token, getSecret(), SESSION_MAX_AGE * 1000)
}

export async function verifyRequest(): Promise<boolean> {
  const user = await getSessionUser()
  return !!user
}

// Re-queries DB each request so role/status/expiry changes apply immediately.
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const store = await cookies()
    const token = store.get(SESSION_COOKIE)?.value
    const payload = verifyCookieToken(token)
    if (!payload?.user) return null
    const user = await prisma.user.findUnique({ where: { email: payload.user.toLowerCase() } })
    if (!user) return null
    return sessionUserOf(user)
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

export function updateLastActive(email: string): void {
  // best-effort, fire in background
  prisma.user.updateMany({
    where: { email: email.toLowerCase() },
    data: { lastActiveAt: new Date() },
  }).catch(() => {})
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

export { SESSION_COOKIE, SESSION_MAX_AGE }