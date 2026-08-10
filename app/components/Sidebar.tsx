"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Logo } from "./Logo"
import { Wordmark } from "./Wordmark"
import { useLang } from "@/lib/i18n"
import { useAuth } from "./AuthProvider"

export function Sidebar() {
  const pathname = usePathname()
  const { t } = useLang()
  const { session, logout } = useAuth()

  const item = (href: string, label: string) => {
    const active = pathname === href || pathname.startsWith(href + "/")
    return (
      <Link href={href} className={`nav-item${active ? " active" : ""}`} prefetch={false}>
        {label}
      </Link>
    )
  }

  return (
    <aside className="sidebar">
      <div className="logo sb-logo">
        <Logo size={38} />
        <div>
          <div><Wordmark size={20} /></div>
          <span className="tagline">Microstock Tag Optimizer</span>
        </div>
      </div>

      <nav className="side-nav">
        {item("/studio", t("studio"))}
        {item("/profile", t("profile"))}
        {item("/settings", t("aiSettings"))}

        {session?.isAdmin && (
          <>
            <div className="side-sec">{t("adminSec")}</div>
            {item("/admin/dashboard", t("adminDashboard"))}
            {item("/admin/users", t("adminUtilities"))}
          </>
        )}
      </nav>

      <div className="side-foot">
        <a className="nav-item nav-quit" onClick={e => { e.preventDefault(); logout() }} role="button">
          {t("logOut")}
        </a>
      </div>
    </aside>
  )
}