import { cookies } from "next/headers"
import { scryptSync, timingSafeEqual } from "node:crypto"
import { createSessionToken, verifySessionToken } from "@/lib/session-token"

const SESSION_COOKIE = "microstudio_session"
const SESSION_MAX_AGE = 7 * 24 * 3600

export function getSecret(): string {
  return process.env.ADMIN_SESSION_SECRET || ""
}

function verifyHash(hash: string, password: string): boolean {
  const [salt, hex] = hash.split(":")
  if (!salt || !hex) return false
  const given = scryptSync(password, salt, 64)
  const expected = Buffer.from(hex, "hex")
  return given.length === expected.length && timingSafeEqual(given, expected)
}

export function verifyCredentials(username: string, password: string): boolean {
  const targetUser = process.env.ADMIN_USERNAME || "admin"
  const storedHash = process.env.ADMIN_PASSWORD_HASH || ""
  if (!storedHash) return false
  if (username !== targetUser) return false
  return verifyHash(storedHash, password)
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

export { SESSION_COOKIE, SESSION_MAX_AGE }