"use client"

import Link from "next/link"
import { useState } from "react"
import { usePathname } from "next/navigation"
import { Image as ImageIcon, Settings, UserCircle, LayoutDashboard, Users, LogOut, Activity, BarChart3, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { Logo } from "./Logo"
import { Wordmark } from "./Wordmark"
import { useLang } from "@/lib/i18n"
import { useAuth } from "./AuthProvider"

export function Sidebar() {
  const pathname = usePathname()
  const { t } = useLang()
  const { session, logout } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)

  const initial = (session?.email || "?").trim().charAt(0).toUpperCase()

  const item = (href: string, label: string, icon: React.ReactNode) => {
    const active = pathname === href || pathname.startsWith(href + "/")
    return (
      <Link href={href} className={`nav-item${active ? " active" : ""}${collapsed ? " collapsed" : ""}`} prefetch={false} title={collapsed ? label : undefined}>
        <span className="nav-ico">{icon}</span>
        {!collapsed && <span className="nav-lbl">{label}</span>}
      </Link>
    )
  }

  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
      <div className="sidebar-head">
        <div className="logo sb-logo">
          <Logo size={38} />
          {!collapsed && (
            <div>
              <div><Wordmark size={20} /></div>
            </div>
          )}
        </div>
      </div>

      <span className={`collapse-handle${collapsed ? " collapsed" : ""}`} onClick={() => setCollapsed(c => !c)}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
        {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
      </span>

      <nav className="side-nav">
        {item("/studio", t("studio"), <ImageIcon size={18} />)}
        {item("/profile", t("profile"), <UserCircle size={18} />)}
        {item("/settings", t("aiSettings"), <Settings size={18} />)}

        {session?.isAdmin && (
          <>
            {!collapsed && <div className="side-sec">{t("adminSec")}</div>}
            {item("/admin/dashboard", t("adminDashboard"), <LayoutDashboard size={18} />)}
            {item("/admin/analytics", t("adminAnalytics"), <BarChart3 size={18} />)}
            {item("/admin/activity", t("activityLog"), <Activity size={18} />)}
            {item("/admin/users", t("adminUtilities"), <Users size={18} />)}
          </>
        )}
      </nav>

      <div className="side-foot">
        <div className="side-user">
          <span className="user-avatar">{initial}</span>
          {!collapsed && (
            <div className="user-meta">
              <span className="user-email">{session?.email}</span>
              <span className={`pill-tag role-pill${session?.isAdmin ? " admin" : ""}`}>
                {session?.isAdmin ? "admin" : "user"}
              </span>
              <span className="user-access">
                {session?.remainingDays === null || session?.remainingDays === undefined
                  ? "Access: Unlimited"
                  : `Access: ${session.remainingDays} day${session.remainingDays === 1 ? "" : "s"}`}
              </span>
            </div>
          )}
        </div>
        <button className="nav-item nav-quit" onClick={() => setConfirmLogout(true)} title={collapsed ? t("logOut") : undefined}>
          <span className="nav-ico"><LogOut size={18} /></span>
          {!collapsed && <span className="nav-lbl">{t("logOut")}</span>}
        </button>
      </div>

      {confirmLogout && (
        <div className="modal-bg" onClick={() => setConfirmLogout(false)}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <h2>{t("logOut")}</h2>
            <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, marginBottom: 16 }}>Are you sure you want to log out?</p>
            <div className="actions" style={{ justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmLogout(false)}>Cancel</button>
              <button className="primary" onClick={logout}>Log out</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}