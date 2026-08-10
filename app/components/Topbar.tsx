"use client"

import { LangToggle } from "./LangToggle"
import { useLang } from "@/lib/i18n"
import { useAuth } from "./AuthProvider"

export function Topbar() {
  const { session, logout } = useAuth()
  const { t } = useLang()

  return (
    <header className="topbar">
      <div className="topbar-left">{/* page context slot */}</div>
      <div className="topbar-right">
        <LangToggle />
        <span className={`pill-tag role-pill${session?.isAdmin ? " admin" : ""}`}>
          {session?.isAdmin ? "admin" : "user"}
        </span>
        <span className="pill-tag email-pill">{session?.email || ""}</span>
        <button onClick={logout} className="topbar-logout">{t("logOut")}</button>
      </div>
    </header>
  )
}