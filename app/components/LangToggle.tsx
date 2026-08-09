"use client"

import { useLang } from "@/lib/i18n"

export function LangToggle({ dark = false }: { dark?: boolean }) {
  const { lang, set } = useLang()
  const base: React.CSSProperties = {
    display: "inline-flex",
    gap: 2,
    border: "1px solid var(--border)",
    borderRadius: 9,
    overflow: "hidden",
    fontFamily: "inherit",
  }
  const btn = (active: boolean): React.CSSProperties => ({
    background: active ? "var(--accent)" : "var(--panel2)",
    color: active ? "#062a30" : "var(--muted)",
    border: "none",
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  })
  return (
    <span style={base} role="group" aria-label="Language">
      {(["en", "id"] as const).map(l => (
        <button key={l} onClick={() => set(l)} style={btn(lang === l)}>
          {l === "en" ? "EN" : "ID"}
        </button>
      ))}
    </span>
  )
}