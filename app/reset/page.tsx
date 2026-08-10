"use client"

import { useSearchParams, useRouter } from "next/navigation"
import { Suspense, useState } from "react"
import Link from "next/link"
import { Wordmark } from "../components/Wordmark"
import { LangToggle } from "../components/LangToggle"
import { useLang } from "@/lib/i18n"

function ResetForm() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get("token") || ""
  const { t } = useLang()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError("Password must be at least 8 characters"); return }
    if (password !== confirm) { setError("Passwords do not match"); return }
    if (!token) { setError("Missing reset token"); return }
    setLoading(true)
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      })
      if (res.ok) {
        setDone(true)
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || t("oops"))
      }
    } catch {
      setError(t("oops"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="login-card" onSubmit={submit}>
      <div className="login-logo"><Wordmark size={26} /></div>
      <p className="login-tagline">{t("adminTag")}</p>
      {done ? (
        <>
          <p className="login-success">Password updated. You can now sign in.</p>
          <div className="login-actions">
            <Link className="login-submit" href="/login" style={{ textDecoration: "none", textAlign: "center" }}>Back to sign in</Link>
          </div>
        </>
      ) : !token ? (
        <p className="login-error">This reset link is invalid or has expired.</p>
      ) : (
        <>
          <label className="login-label">New password</label>
          <input
            className="login-input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
          <label className="login-label">Confirm new password</label>
          <input
            className="login-input"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="••••••••"
            required
          />
          {error && <p className="login-error">{error}</p>}
          <div className="login-actions">
            <button className="login-submit" type="submit" disabled={loading}>
              {loading ? "…" : "Update password"}
            </button>
          </div>
        </>
      )}
      <Link className="login-back" href="/login">{t("backOnly")}</Link>
    </form>
  )
}

export default function ResetPage() {
  return (
    <main className="login-page">
      <Suspense fallback={<div className="login-card"><span>Loading…</span></div>}>
        <div style={{ display: "contents" }}>
          <div style={{ position: "absolute", top: 20, right: 20 }}><LangToggle /></div>
          <ResetForm />
        </div>
      </Suspense>
    </main>
  )
}