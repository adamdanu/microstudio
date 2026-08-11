"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import { useLang } from "@/lib/i18n"
import { useAuth } from "../../../components/AuthProvider"

const RequestsChart = dynamic(() => import("../../../components/charts/RequestsChart"), { ssr: false })
const TokensChart = dynamic(() => import("../../../components/charts/TokensChart"), { ssr: false })

type Agg = {
  requests: number; success: number; failed: number; tokensIn: number; tokensOut: number
  successRate: number | null; avgTokensPerReq: number | null; avgTokensOutPerReq: number | null
  avgRequestsPerUser: number | null; avgSuccessPerUser: number | null
  avgFailedPerUser: number | null; avgTokensPerUser: number | null; activeUsers: number
}
type SeriesRow = { bucket: string; requests: number; success: number; failed: number; tokensIn: number; tokensOut: number }
type PerUserRow = { userId: string; email: string; requests: number; success: number; failed: number; tokensIn: number; tokensOut: number; avgTokensPerReq: number }

const RANGES = [
  { id: "all", label: "All time" }, { id: "7d", label: "7 days" }, { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" }, { id: "1y", label: "1 year" },
]
const INTERVALS = [
  { id: "daily", label: "Daily" }, { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" }, { id: "yearly", label: "Yearly" },
]

export default function AdminAnalytics() {
  const { t } = useLang()
  const { session } = useAuth()
  const router = useRouter()
  const [range, setRange] = useState("all")
  const [interval, setInterval] = useState("daily")
  const [agg, setAgg] = useState<Agg | null>(null)
  const [series, setSeries] = useState<SeriesRow[]>([])
  const [perUser, setPerUser] = useState<PerUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (session && !session.isAdmin) router.replace("/studio")
  }, [session, router])

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true); setErr(null)
    fetch(`/api/admin/analytics?from=${range}&interval=${interval}`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setErr(d.error); return }
        setAgg(d.aggregate)
        setSeries(d.series || [])
        setPerUser(d.perUser || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [range, interval])

  const cards = agg ? [
    { label: t("totalRequests"), val: agg.requests },
    { label: t("totalImagesSuccess"), val: agg.success },
    { label: t("totalImagesFailed"), val: agg.failed },
    { label: t("totalTokensIn"), val: agg.tokensIn.toLocaleString() },
    { label: t("totalTokensOut"), val: agg.tokensOut.toLocaleString() },
  ] : []

  return (
    <section className="card">
      <div className="results-head">
        <h3 className="m0">{t("adminAnalytics")}</h3>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {RANGES.map(r => (
            <button key={r.id} className={range === r.id ? "active" : ""} onClick={() => setRange(r.id)}
              style={{ fontSize: 12 }}>{r.label}</button>
          ))}
          <select value={interval} onChange={e => setInterval(e.target.value)}
            style={{ marginLeft: 8, padding: "6px 8px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--panel2)", color: "var(--text)", fontSize: 12.5 }}>
            {INTERVALS.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
          </select>
        </div>
      </div>

      {err && <div className="danger" style={{ color: "var(--danger)", marginBottom: 12 }}>{err}</div>}
      {loading ? <div className="empty"><span className="spinner" /></div> : agg && (
        <>
          {/* stat cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 16 }}>
            {cards.map(c => (
              <div key={c.label} className="card" style={{ padding: 14 }}>
                <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px" }}>{c.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{c.val}</div>
              </div>
            ))}
          </div>

          {/* charts */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <RequestsChart data={series} />
            <TokensChart data={series} />
          </div>

          {/* averages */}
          {agg.activeUsers > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 10 }}>{t("averages")}</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, fontSize: 13 }}>
                <div><span style={{ color: "var(--muted)" }}>Success rate:</span> <b>{agg.successRate ?? "—"}%</b></div>
                <div><span style={{ color: "var(--muted)" }}>Avg tokens/req:</span> <b>{agg.avgTokensPerReq?.toLocaleString() ?? "—"}</b></div>
                <div><span style={{ color: "var(--muted)" }}>Avg req/user:</span> <b>{agg.avgRequestsPerUser ?? "—"}</b></div>
                <div><span style={{ color: "var(--muted)" }}>Avg success/user:</span> <b>{agg.avgSuccessPerUser ?? "—"}</b></div>
                <div><span style={{ color: "var(--muted)" }}>Avg failed/user:</span> <b>{agg.avgFailedPerUser ?? "—"}</b></div>
                <div><span style={{ color: "var(--muted)" }}>Avg tokens/user:</span> <b>{agg.avgTokensPerUser?.toLocaleString() ?? "—"}</b></div>
              </div>
            </div>
          )}

          {/* per-user table */}
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th><th>Requests</th><th>Success</th><th>Failed</th>
                  <th>Tokens in</th><th>Tokens out</th><th>Avg tokens/req</th>
                </tr>
              </thead>
              <tbody>
                {perUser.map(r => (
                  <tr key={r.userId}>
                    <td>{r.email}</td>
                    <td>{r.requests}</td>
                    <td style={{ color: "var(--ok)" }}>{r.success}</td>
                    <td style={{ color: "var(--danger)" }}>{r.failed}</td>
                    <td>{r.tokensIn.toLocaleString()}</td>
                    <td>{r.tokensOut.toLocaleString()}</td>
                    <td>{r.avgTokensPerReq.toLocaleString()}</td>
                  </tr>
                ))}
                {perUser.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--muted)", padding: 16 }}>{t("noResults")}</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}