"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

type Theme = "dark" | "light"
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({ theme: "dark", toggle: () => {} })

function read(): Theme {
  if (typeof window === "undefined") return "dark"
  try {
    const v = localStorage.getItem("microstudio-theme")
    if (v === "light" || v === "dark") return v
  } catch { /* ignore */ }
  return "dark"
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark")

  useEffect(() => {
    setTheme(read())
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute("data-theme", theme)
    try { localStorage.setItem("microstudio-theme", theme) } catch { /* ignore */ }
  }, [theme])

  const toggle = () => setTheme(t => (t === "dark" ? "light" : "dark"))

  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>
}

export function useTheme() {
  return useContext(ThemeCtx)
}