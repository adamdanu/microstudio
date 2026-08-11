"use client"

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts"
import { useLang } from "@/lib/i18n"

export default function TokensChart({ data }: { data: Array<{ bucket: string; tokensIn: number; tokensOut: number }> }) {
  const { t } = useLang()
  const rows = data.map((d, i) => ({ ...d, name: fmtBucket(d.bucket, i) }))
  if (rows.length === 0) return <div className="card"><div className="empty">{t("noResults")}</div></div>
  return (
    <div className="card">
      <h3 style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 8 }}>{t("tokensChart")}</h3>
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
            <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
            <Tooltip contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="tokensIn" name={t("totalTokensIn")} stroke="var(--accent)" strokeWidth={2} dot={{ r: 2 }} />
            <Line type="monotone" dataKey="tokensOut" name={t("totalTokensOut")} stroke="var(--ok)" strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function fmtBucket(bucket: string, i: number): string {
  const d = new Date(bucket)
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}