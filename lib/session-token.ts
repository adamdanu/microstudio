import { createHmac, timingSafeEqual } from "node:crypto"

export interface SessionToken {
  user: string
  iat: number
}

export function createSessionToken(user: string, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ user, iat: Date.now() })).toString("base64url")
  const sig = createHmac("sha256", secret).update(payload).digest("base64url")
  return `${payload}.${sig}`
}

export function verifySessionToken(token: string | undefined, secret: string, maxAgeMs = 7 * 24 * 3600 * 1000): SessionToken | null {
  if (!token) return null
  const parts = token.split(".")
  if (parts.length !== 2) return null
  const [payload, sig] = parts
  const expected = createHmac("sha256", secret).update(payload).digest("base64url")
  const sigBuf = Buffer.from(sig)
  const expBuf = Buffer.from(expected)
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as SessionToken
    const age = Date.now() - data.iat
    if (age < 0 || age > maxAgeMs || typeof data.user !== "string") return null
    return data
  } catch {
    return null
  }
}