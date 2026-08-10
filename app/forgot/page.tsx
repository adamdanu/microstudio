"use client"

import { useState } from "react"
import Link from "next/link"
import { Wordmark } from "../components/Wordmark"
import { LangToggle } from "../components/LangToggle"
import { useLang } from "@/lib/i18n"

export default function ForgotPage() {
  const { t } = useLang()
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  function validateEmail(v: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!validateEmail(email)) {
      setError(t("invalidEmail"))
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
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
    <main className="login-page">
      <div style={{ position: "absolute", top: 20, right: 20 }}><LangToggle /></div>
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo"><Wordmark size={26} /></div>
        <p className="login-tagline">{t("adminTag")}</p>
        {done ? (
          <p className="login-success">Reset link sent. Check your inbox (temporarily logged to the server console if email isn't connected).</p>
        ) : (
          <>
            <label className="login-label">{t("email")}</label>
            <input
              className="login-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
            {error && <p className="login-error">{error}</p>}
            <div className="login-actions">
              <button className="login-submit" type="submit" disabled={loading}>
                {loading ? "…" : "Send reset link"}
              </button>
            </div>
          </>
        )}
        <Link className="login-back" href="/login">{t("backOnly")}</Link>
      </form>
    </main>
  )
}