"use client"

import { Sun, Moon } from "lucide-react"
import { LangToggle } from "./LangToggle"
import { useTheme } from "./ThemeProvider"

export function Topbar() {
  const { theme, toggle } = useTheme()

  return (
    <header className="topbar">
      <div className="topbar-left">
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