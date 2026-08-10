"use client"

import { useEffect, useState } from "react"
import { Logo } from "../../components/Logo"
import { Wordmark } from "../../components/Wordmark"
import { LangToggle } from "../../components/LangToggle"
import { useLang } from "@/lib/i18n"

export default function ProfilePage() {
  const { t } = useLang()
  const [email, setEmail] = useState("")
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch("/api/auth/profile").then(r => r.json()).then(d => {
      if (d.email) setEmail(d.email)
    }).catch(() => {})
  }, [])

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setMsg(null)
    if (newPassword.length < 8) { setError("New password must be at least 8 characters"); return }
    if (newPassword !== confirm) { setError("Passwords do not match"); return }
    setLoading(true)
    try {
      const res = await fetch("/api/auth/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setMsg("Password changed. A notification was sent to your email.")
        setCurrentPassword(""); setNewPassword(""); setConfirm("")
      } else {
        setError(data.error || "Failed to change password")
      }
    } catch {
      setError(t("oops"))
    } finally {
      setLoading(false)
    }
  }

  async function logout() {
    try { await fetch("/api/auth/logout", { method: "POST" }) } catch { /* ignore */ }
    window.location.href = "/login"
  }

  return (
    <section className="card" style={{ maxWidth: 520, margin: "0 auto" }}>
        <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--muted)", marginBottom: 14 }}>Profile</h3>

        <div className="field">
          <label>Email</label>
          <input type="email" value={email} readOnly style={{ opacity: .7 }} />
        </div>

        <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--muted)", margin: "20px 0 14px" }}>Change password</h3>
        <form onSubmit={changePassword}>
          <div className="field">
            <label>Current password</label>
            <input type="password" autoComplete="current-password" value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          <div className="field">
            <label>New password</label>
            <input type="password" autoComplete="new-password" value={newPassword}
              onChange={e => setNewPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          <div className="field">
            <label>Confirm new password</label>
            <input type="password" autoComplete="new-password" value={confirm}
              onChange={e => setConfirm(e.target.value)} placeholder="••••••••" required />
          </div>
          {error && <div className="danger" style={{ marginBottom: 12, color: "var(--danger)" }}>{error}</div>}
          {msg && <div style={{ marginBottom: 12, color: "var(--ok)" }}>{msg}</div>}
          <div className="actions" style={{ justifyContent: "flex-end" }}>
            <button className="primary" type="submit" disabled={loading}>{loading ? "Updating…" : "Update password"}</button>
          </div>
        </form>
      </section>
  )
}