"use client"

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts"
import { useLang } from "@/lib/i18n"

export default function RequestsChart({ data }: { data: Array<{ bucket: string; requests: number; success: number; failed: number }> }) {
  const { t } = useLang()
  const rows = data.map((d, i) => ({ ...d, name: fmtBucket(d.bucket, i) }))
  if (rows.length === 0) return <div className="card"><div className="empty">{t("noResults")}</div></div>
  return (
    <div className="card">
      <h3 style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 8 }}>{t("requestsChart")}</h3>
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
            <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={false} width={34} />
            <Tooltip contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="requests" name={t("totalRequests")} fill="var(--accent)" radius={[3, 3, 0, 0]} />
            <Bar dataKey="success" name={t("totalImagesSuccess")} fill="var(--ok)" radius={[3, 3, 0, 0]} />
            <Bar dataKey="failed" name={t("totalImagesFailed")} fill="var(--danger)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function fmtBucket(bucket: string, i: number): string {
  const d = new Date(bucket)
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}