"use client"

import Link from "next/link"
import { useState } from "react"
import { usePathname } from "next/navigation"
import { Image as ImageIcon, Settings, UserCircle, Sun, Moon, PanelRightClose, PanelRightOpen, LayoutDashboard, Users, LogOut } from "lucide-react"
import { Logo } from "./Logo"
import { Wordmark } from "./Wordmark"
import { useLang } from "@/lib/i18n"
import { useAuth } from "./AuthProvider"
import { useTheme } from "./ThemeProvider"

export function Sidebar() {
  const pathname = usePathname()
  const { t } = useLang()
  const { session, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const [collapsed, setCollapsed] = useState(false)

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
              <span className="tagline">Microstock Tag Optimizer</span>
            </div>
          )}
        </div>
        <button className="collapse-btn" onClick={() => setCollapsed(c => !c)} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <PanelRightOpen size={18} /> : <PanelRightClose size={18} />}
        </button>
      </div>

      <nav className="side-nav">
        {item("/studio", t("studio"), <ImageIcon size={18} />)}
        {item("/profile", t("profile"), <UserCircle size={18} />)}
        {item("/settings", t("aiSettings"), <Settings size={18} />)}

        {session?.isAdmin && (
          <>
            {!collapsed && <div className="side-sec">{t("adminSec")}</div>}
            {item("/admin/dashboard", t("adminDashboard"), <LayoutDashboard size={18} />)}
            {item("/admin/users", t("adminUtilities"), <Users size={18} />)}
          </>
        )}
      </nav>

      <div className="side-foot">
        <button className={`nav-item nav-quit${collapsed ? " collapsed" : ""}`} onClick={logout} title={collapsed ? t("logOut") : undefined}>
          <span className="nav-ico"><LogOut size={18} /></span>
          {!collapsed && <span className="nav-lbl">{t("logOut")}</span>}
        </button>
        <button className="nav-item theme-btn" onClick={toggle} title={theme === "dark" ? "Light mode" : "Dark mode"}>
          <span className="nav-ico">{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</span>
          {!collapsed && <span className="nav-lbl">{theme === "dark" ? "Light" : "Dark"}</span>}
        </button>
      </div>
    </aside>
  )
}