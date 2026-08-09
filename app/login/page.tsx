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
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      if (res.ok) {
        router.push("/studio")
        router.refresh()
        return
      }
      const data = await res.json().catch(() => ({}))
      if (res.status === 429) setError(t("tooMany"))
      else setError(t("invalidCreds"))
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
        <label className="login-label">{t("username")}</label>
        <input
          className="login-input"
          autoComplete="username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="admin"
          required
        />
        <label className="login-label">{t("password")}</label>
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
        <button className="login-submit" type="submit" disabled={loading}>
          {loading ? t("signingIn") : t("signInBtn")}
        </button>
        <Link className="login-back" href="/">{t("backLanding")}</Link>
      </form>
    </main>
  )
}