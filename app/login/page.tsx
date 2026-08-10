"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Wordmark } from "../components/Wordmark"
import { LangToggle } from "../components/LangToggle"
import { useLang } from "@/lib/i18n"

export default function LoginPage() {
  const router = useRouter()
  const { t } = useLang()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
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
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      if (res.ok) {
        router.push("/studio")
        router.refresh()
        return
      }
      const data = await res.json().catch(() => ({}))
      if (res.status === 429) setError(t("tooMany"))
      else if (res.status === 401 && data.error === "Unregistered email") setError(t("unregisteredEmail"))
      else setError(data.error || t("invalidCreds"))
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
        <div className="login-logo">
          <Wordmark size={26} />
        </div>
        <p className="login-tagline">{t("adminTag")}</p>
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
        <label className="login-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{t("password")}</span>
          <Link className="login-forgot" href="/forgot">{t("forgotPassword")}</Link>
        </label>
        <input
          className="login-input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="••••••••"
          required
        />
        {error && <p className="login-error">{error}</p>}
        <div className="login-actions">
          <button className="login-submit" type="submit" disabled={loading}>
            {loading ? t("signingIn") : t("signInBtn")}
          </button>
        </div>
        <Link className="login-back" href="/">{t("backOnly")}</Link>
      </form>
    </main>
  )
}