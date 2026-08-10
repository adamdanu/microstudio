"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useLang } from "@/lib/i18n"
import { useAuth } from "../../../components/AuthProvider"

type Row = {
  id: string
  email: string
  status: string
  role: string
  accessType: string
  expiresAt: string | null
  lastActiveAt: string | null
  remainingDays: number | null
}

export default function AdminDashboard() {
  const { t } = useLang()
  const { session } = useAuth()
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = async (q?: string) => {
    setLoading(true); setErr(null)
    try {
      const url = `/api/admin/users?pageSize=200${q ? `&search=${encodeURIComponent(q)}` : ""}`
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok) { setErr(data.error || "Failed to load"); return }
      setRows(data.items || [])
      setTotal(data.total || 0)
    } catch { setErr("Failed to load users") }
    finally { setLoading(false) }
  }

  useEffect(() => {
    if (session && !session.isAdmin) router.replace("/studio")
  }, [session, router])

  useEffect(() => { load() }, [])

  const fmt = (d: string | null) => d ? new Date(d).toLocaleString() : "—"

  return (
    <section className="card">
      <div className="results-head">
        <h3 className="m0">{t("adminDashboard")}</h3>
        <input
          type="search"
          placeholder={t("searchEmail")}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") load(search) }}
          style={{ padding: "8px 12px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--panel2)", color: "var(--text)", fontSize: 13, width: 260 }}
        />
      </div>

      {err && <div className="danger" style={{ color: "var(--danger)", marginBottom: 12 }}>{err}</div>}
      {loading ? <div className="empty"><span className="spinner" /></div> : (
        <>
          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>{total} user{total === 1 ? "" : "s"}</p>
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last active</th>
                  <th>Remaining access</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td className="mono">{r.id.slice(0, 8)}</td>
                    <td>{r.email}</td>
                    <td><span className={`pill-tag role-pill${r.role === "ADMIN" ? " admin" : ""}`}>{r.role.toLowerCase()}</span></td>
                    <td>
                      <span className="pill-tag" style={r.status === "ACTIVE" ? { color: "var(--ok)" } : { color: "var(--danger)" }}>
                        {r.status.toLowerCase()}
                      </span>
                    </td>
                    <td>{fmt(r.lastActiveAt)}</td>
                    <td>{r.remainingDays === null ? "Unlimited" : `${r.remainingDays} day${r.remainingDays === 1 ? "" : "s"}`}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 16 }}>{t("noResults")}</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}