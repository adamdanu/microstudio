"use client"

import { Sun, Moon, Menu, X } from "lucide-react"
import { LangToggle } from "./LangToggle"
import { useTheme } from "./ThemeProvider"
import { useSideOverlay } from "./SideOverlay"

export function Topbar() {
  const { theme, toggle } = useTheme()
  const { open, setOpen } = useSideOverlay()

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="menu-btn" onClick={() => setOpen(!open)} title={open ? "Close menu" : "Open menu"}>
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
        <span className="topbar-title">Microstock Tag Optimizer</span>
      </div>
      <div className="topbar-right">
        <LangToggle />
        <button className="topbar-theme" onClick={toggle} title={theme === "dark" ? "Light mode" : "Dark mode"}>
          {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </div>
    </header>
  )
}