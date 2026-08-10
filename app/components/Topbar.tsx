"use client"

import { LangToggle } from "./LangToggle"
import { useLang } from "@/lib/i18n"
import { useAuth } from "./AuthProvider"

export function Topbar() {
  const { session } = useAuth()
  const { t } = useLang()

  return (
    <header className="topbar">
      <div className="topbar-left">{/* page context slot */}</div>
      <div className="topbar-right">
        <LangToggle />
        <div className="user-chip">
          <span className="pill-tag email-pill">{session?.email || ""}</span>
          <span className={`pill-tag role-pill${session?.isAdmin ? " admin" : ""}`}>
            {session?.isAdmin ? "admin" : "user"}
          </span>
        </div>
      </div>
    </header>
  )
}