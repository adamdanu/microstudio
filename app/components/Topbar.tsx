"use client"

import { Sun, Moon } from "lucide-react"
import { LangToggle } from "./LangToggle"
import { useTheme } from "./ThemeProvider"

export function Topbar() {
  const { theme, toggle } = useTheme()

  return (
    <header className="topbar">
      <div className="topbar-left">{/* page context slot */}</div>
      <div className="topbar-right">
        <LangToggle />
        <button className="topbar-theme" onClick={toggle} title={theme === "dark" ? "Light mode" : "Dark mode"}>
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  )
}