"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

// Shared sidebar drawer state: `open` is used on mobile (off-canvas drawer);
// desktop keeps the collapse behavior inside Sidebar.
const Ctx = createContext<{ open: boolean; setOpen: (v: boolean) => void }>({ open: false, setOpen: () => {} })

export function SideOverlayProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)

  // close the drawer when resizing up to desktop
  useEffect(() => {
    const onResize = () => { if (window.innerWidth > 768) setOpen(false) }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  return <Ctx.Provider value={{ open, setOpen }}>{children}</Ctx.Provider>
}

export function useSideOverlay() {
  return useContext(Ctx)
}