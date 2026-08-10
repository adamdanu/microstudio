"use client"

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"

export type SessionInfo = {
  email: string
  role: "ADMIN" | "USER"
  isAdmin: boolean
  accessType?: string
  remainingDays?: number | null
  blocked?: boolean
} | null

const AuthCtx = createContext<{ session: SessionInfo; setSession: (s: SessionInfo) => void; logout: () => void }>({
  session: null,
  setSession: () => {},
  logout: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionInfo>(null)

  useEffect(() => {
    fetch("/api/auth/session")
      .then(r => (r.ok ? r.json() : null))
      .then(d => setSession(d as SessionInfo))
      .catch(() => setSession(null))
  }, [])

  const logout = useCallback(async () => {
    try { await fetch("/api/auth/logout", { method: "POST" }) } catch { /* ignore */ }
    window.location.href = "/login"
  }, [])

  return (
    <AuthCtx.Provider value={{ session, setSession, logout }}>
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth() {
  return useContext(AuthCtx)
}