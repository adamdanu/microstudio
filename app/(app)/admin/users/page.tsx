"use client"

import { useCallback, useEffect, useState } from "react"
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

const ACCESS_TYPES = ["DAYS_30", "UNLIMITED", "CUSTOM"]

export default function AdminUsers() {
  const { t } = useLang()
  const { session } = useAuth()
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // create form
  const [createEmail, setCreateEmail] = useState("")
  const [createPass, setCreatePass] = useState("")
  const [createAccess, setCreateAccess] = useState("DAYS_30")
  const [createExpires, setCreateExpires] = useState("")
  const [creating, setCreating] = useState(false)

  // password-change modal per user
  const [pwTarget, setPwTarget] = useState<Row | null>(null)
  const [pwValue, setPwValue] = useState("")

  const load = useCallback(async (q?: string) => {
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
  }, [])

  useEffect(() => {
    if (session && !session.isAdmin) router.replace("/studio")
  }, [session, router])

  useEffect(() => { load() }, [load])

  async function createUser(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true); setErr(null); setMsg(null)
    try {
      const body: Record<string, string> = { email: createEmail, password: createPass, accessType: createAccess }
      if (createAccess === "CUSTOM") body.expiresAt = new Date(createExpires).toISOString()
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) {
        setMsg(`Created ${data.user.email} (${data.user.accessType}).`)
        setCreateEmail(""); setCreatePass(""); setCreateAccess("DAYS_30"); setCreateExpires("")
        await load(search)
      } else setErr(data.error || "Create failed")
    } catch { setErr("Create failed") }
    finally { setCreating(false) }
  }

  async function patchUser(u: Row, patch: Record<string, unknown>) {
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
    const data = await res.json()
    if (res.ok) { setMsg(`Updated ${u.email}`); await load(search) }
    else setErr(data.error || "Update failed")
  }

  async function changeAccess(u: Row, accessType: string) {
    const expires = accessType === "CUSTOM"
      ? window.prompt("Custom expiry date (YYYY-MM-DD):", u.expiresAt ? u.expiresAt.slice(0, 10) : "")
      : undefined
    if (accessType === "CUSTOM" && !expires) return
    await patchUser(u, { accessType, expiresAt: expires })
  }

  async function resetPassword() {
    if (!pwTarget || pwValue.length < 8) return
    const res = await fetch(`/api/admin/users/${pwTarget.id}/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pwValue }),
    })
    const data = await res.json()
    if (res.ok) { setMsg(`Password updated for ${pwTarget.email}`); setPwTarget(null); setPwValue("") }
    else setErr(data.error || "Failed")
  }

  async function deleteUser(u: Row) {
    if (!window.confirm(`Disable ${u.email}? They will lose access immediately.`)) return
    const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" })
    if (res.ok) { setMsg(`Disabled ${u.email}`); await load(search) }
    else { const d = await res.json().catch(() => ({})); setErr(d.error || "Failed") }
  }

  return (
    <section className="card">
      <div className="results-head">
        <h3 className="m0">{t("adminUtilities")}</h3>
        <input
          type="search"
          placeholder={t("searchEmail")}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") load(search) }}
          style={{ padding: "8px 12px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--panel2)", color: "var(--text)", fontSize: 13, width: 260 }}
        />
      </div>

      {/* create user */}
      <form onSubmit={createUser} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", marginBottom: 18, padding: 14, border: "1px dashed var(--border)", borderRadius: 12 }}>
        <div>
          <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>Email</label>
          <input type="email" required value={createEmail} onChange={e => setCreateEmail(e.target.value)} placeholder="user@example.com"
            style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--panel2)", color: "var(--text)", fontSize: 13 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>Password (≥8)</label>
          <input type="password" required minLength={8} value={createPass} onChange={e => setCreatePass(e.target.value)} placeholder="••••••••"
            style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--panel2)", color: "var(--text)", fontSize: 13 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>Access</label>
          <select value={createAccess} onChange={e => setCreateAccess(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--panel2)", color: "var(--text)", fontSize: 13 }}>
            {ACCESS_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        {createAccess === "CUSTOM" && (
          <div>
            <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>Expires</label>
            <input type="date" required value={createExpires} onChange={e => setCreateExpires(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--panel2)", color: "var(--text)", fontSize: 13 }} />
          </div>
        )}
        <button className="primary" type="submit" disabled={creating}>{creating ? "Creating…" : "Create user"}</button>
      </form>

      {msg && <p style={{ color: "var(--ok)", fontSize: 13, marginBottom: 10 }}>{msg}</p>}
      {err && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 10 }}>{err}</p>}

      {loading ? <div className="empty"><span className="spinner" /></div> : (
        <>
          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>{total} user{total === 1 ? "" : "s"}</p>
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Access</th>
                  <th>Remaining</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td>{r.email}</td>
                    <td>
                      <select value={r.role} onChange={e => patchUser(r, { role: e.target.value })} disabled={r.email === "adamdanu@gmail.com"}
                        style={{ padding: "4px 6px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--panel2)", color: "var(--text)", fontSize: 12 }}>
                        <option value="USER">user</option>
                        <option value="ADMIN">admin</option>
                      </select>
                    </td>
                    <td>
                      <select value={r.status} onChange={e => patchUser(r, { status: e.target.value })} disabled={r.email === "adamdanu@gmail.com"}
                        style={{ padding: "4px 6px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--panel2)", color: "var(--text)", fontSize: 12 }}>
                        <option value="ACTIVE">active</option>
                        <option value="DISABLED">disabled</option>
                      </select>
                    </td>
                    <td>
                      <select value={r.accessType} onChange={e => changeAccess(r, e.target.value)} disabled={r.email === "adamdanu@gmail.com"}
                        style={{ padding: "4px 6px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--panel2)", color: "var(--text)", fontSize: 12 }}>
                        {ACCESS_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </td>
                    <td>{r.remainingDays === null ? "Unlimited" : `${r.remainingDays}d`}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button style={{ fontSize: 12, marginRight: 6 }} onClick={() => { setPwTarget(r); setPwValue("") }}>{t("changePw")}</button>
                      {r.email !== "adamdanu@gmail.com" && (
                        <button style={{ fontSize: 12, color: "var(--danger)" }} onClick={() => deleteUser(r)}>Delete</button>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 16 }}>{t("noResults")}</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {pwTarget && (
        <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) setPwTarget(null) }}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <h2>Change password</h2>
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>New password for {pwTarget.email}</p>
            <input className="login-input" type="password" minLength={8} value={pwValue} onChange={e => setPwValue(e.target.value)} placeholder="••••••••" />
            <div className="actions" style={{ justifyContent: "flex-end" }}>
              <button onClick={() => setPwTarget(null)}>Cancel</button>
              <button className="primary" onClick={resetPassword} disabled={pwValue.length < 8}>Set password</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}