"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useLang } from "@/lib/i18n"
import { useAuth } from "../../../components/AuthProvider"
import { Pagination } from "../../../components/Pagination"

type Item = {
  id: string
  action: string
  detail: string | null
  ip: string | null
  createdAt: string
  user: { email: string; role: string } | null
}

export default function ActivityPage() {
  const { t } = useLang()
  const { session } = useAuth()
  const router = useRouter()
  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = async (p?: number) => {
    setLoading(true); setErr(null)
    try {
      const res = await fetch(`/api/admin/activity?page=${p ?? 1}&pageSize=${pageSize}`)
      const data = await res.json()
      if (!res.ok) { setErr(data.error || "Failed to load"); return }
      setItems(data.items || [])
      setTotal(data.total || 0)
      setPage(data.page || 1)
    } catch { setErr("Failed to load activity") }
    finally { setLoading(false) }
  }

  useEffect(() => { load(1) }, [])
  useEffect(() => {
    if (session && !session.isAdmin) router.replace("/studio")
  }, [session, router])

  return (
    <section className="card">
      <div className="results-head">
        <h3 className="m0">{t("activityLog")}</h3>
      </div>
      {err && <div className="danger" style={{ color: "var(--danger)", marginBottom: 12 }}>{err}</div>}
      {loading ? <div className="empty"><span className="spinner" /></div> : (
        <>
          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>{total} entr{total === 1 ? "y" : "ies"}</p>
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Detail</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {items.map(a => (
                  <tr key={a.id}>
                    <td className="mono">{new Date(a.createdAt).toLocaleString()}</td>
                    <td>{a.user?.email || "—"}</td>
                    <td>
                      <span className="pill-tag" style={{ color: a.action.startsWith("admin_") ? "var(--accent)" : "var(--ok)" }}>
                        {a.action}
                      </span>
                    </td>
                    <td>{a.detail || "—"}</td>
                    <td className="mono">{a.ip || "—"}</td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: 16 }}>{t("noResults")}</td></tr>}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={total} pageSize={pageSize} onChange={load} />
        </>
      )}
    </section>
  )
}