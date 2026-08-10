"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useLang } from "@/lib/i18n"
import { useAuth } from "../../../components/AuthProvider"
import { Pagination } from "../../../components/Pagination"

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
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
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

  // edit-user modal per user
  const [editTarget, setEditTarget] = useState<Row | null>(null)
  const [editRole, setEditRole] = useState("USER")
  const [editStatus, setEditStatus] = useState("ACTIVE")
  const [editAccess, setEditAccess] = useState("DAYS_30")
  const [editExpires, setEditExpires] = useState("")

  // delete confirmation modal per user
  const [delTarget, setDelTarget] = useState<Row | null>(null)

  const load = useCallback(async (p?: number, q?: string) => {
    setLoading(true); setErr(null)
    try {
      const url = `/api/admin/users?page=${p ?? 1}&pageSize=${pageSize}${q ? `&search=${encodeURIComponent(q)}` : ""}`
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok) { setErr(data.error || "Failed to load"); return }
      setRows(data.items || [])
      setTotal(data.total || 0)
      setPage(data.page || 1)
    } catch { setErr("Failed to load users") }
    finally { setLoading(false) }
  }, [pageSize])

  useEffect(() => {
    if (session && !session.isAdmin) router.replace("/studio")
  }, [session, router])

  useEffect(() => { load(1, search) }, [load])

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
        await load(1, search)
      } else setErr(data.error || "Create failed")
    } catch { setErr("Create failed") }
    finally { setCreating(false) }
  }

  function openEdit(u: Row) {
    setEditTarget(u)
    setEditRole(u.role)
    setEditStatus(u.status)
    setEditAccess(u.accessType)
    // Only prefill the date when the user is already CUSTOM and the date is still in
    // the future. Otherwise leave it blank so the admin consciously picks the real
    // date instead of accidentally keeping the old (often ~30-day-out) expiry.
    setEditExpires(u.accessType === "CUSTOM" && u.expiresAt && new Date(u.expiresAt).getTime() > Date.now()
      ? u.expiresAt.slice(0, 10)
      : "")
  }

  async function saveEdit() {
    if (!editTarget) return
    if (editAccess === "CUSTOM" && !editExpires) {
      setErr("Custom access requires picking an expiry date")
      return
    }
    const patch: Record<string, unknown> = { role: editRole, status: editStatus, accessType: editAccess }
    if (editAccess === "CUSTOM") patch.expiresAt = new Date(editExpires).toISOString()
    const res = await fetch(`/api/admin/users/${editTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
    const data = await res.json()
    if (res.ok) {
      setMsg(`Updated ${editTarget.email}`)
      setEditTarget(null)
      await load(1, search)
    } else setErr(data.error || "Update failed")
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

  async function doDelete() {
    if (!delTarget) return
    const res = await fetch(`/api/admin/users/${delTarget.id}`, { method: "DELETE" })
    if (res.ok) { setMsg(`Deleted ${delTarget.email}`); setDelTarget(null); await load(1, search) }
    else { const d = await res.json().catch(() => ({})); setErr(d.error || "Failed"); setDelTarget(null) }
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
          onKeyDown={e => { if (e.key === "Enter") load(1, search) }}
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
                      <span className="pill-tag" style={{ color: r.role === "ADMIN" ? "var(--accent)" : "var(--muted)", borderColor: "var(--border)" }}>
                        {r.role.toLowerCase()}
                      </span>
                    </td>
                    <td>
                      <span className="pill-tag" style={{ color: r.status === "ACTIVE" ? "var(--ok)" : "var(--danger)" }}>
                        {r.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="mono">{r.accessType.toLowerCase().replace("_", " ")}</td>
                    <td>{r.remainingDays === null ? "Unlimited" : `${r.remainingDays}d`}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button style={{ fontSize: 12, marginRight: 6 }} onClick={() => { setPwTarget(r); setPwValue("") }}>{t("changePw")}</button>
                      <button style={{ fontSize: 12, marginRight: 6 }} onClick={() => openEdit(r)}>Edit</button>
                      {r.email !== "adamdanu@gmail.com" && (
                        <button style={{ fontSize: 12, color: "var(--danger)" }} onClick={() => setDelTarget(r)}>Delete</button>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 16 }}>{t("noResults")}</td></tr>}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={total} pageSize={pageSize} onChange={p => load(p, search)} />
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

      {editTarget && (
        <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) setEditTarget(null) }}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <h2>Edit user</h2>
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>{editTarget.email}</p>
            <div className="field">
              <label>Role</label>
              <select className="login-input" value={editRole} onChange={e => setEditRole(e.target.value)} disabled={editTarget.email === "adamdanu@gmail.com"}>
                <option value="USER">user</option>
                <option value="ADMIN">admin</option>
              </select>
            </div>
            <div className="field">
              <label>Status</label>
              <select className="login-input" value={editStatus} onChange={e => setEditStatus(e.target.value)} disabled={editTarget.email === "adamdanu@gmail.com"}>
                <option value="ACTIVE">active</option>
                <option value="DISABLED">disabled</option>
              </select>
            </div>
            <div className="field">
              <label>Access</label>
              <select className="login-input" value={editAccess} onChange={e => setEditAccess(e.target.value)} disabled={editTarget.email === "adamdanu@gmail.com"}>
                {ACCESS_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            {editAccess === "CUSTOM" && (
              <div className="field">
                <label>Expires</label>
                <input className="login-input" type="date" value={editExpires} onChange={e => setEditExpires(e.target.value)} disabled={editTarget.email === "adamdanu@gmail.com"} />
              </div>
            )}
            <div className="actions" style={{ justifyContent: "flex-end" }}>
              <button onClick={() => setEditTarget(null)}>Cancel</button>
              <button className="primary" onClick={saveEdit}>Save changes</button>
            </div>
          </div>
        </div>
      )}

      {delTarget && (
        <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) setDelTarget(null) }}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <h2>Delete user</h2>
            <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, marginBottom: 16 }}>
              Delete <strong style={{ color: "var(--text)" }}>{delTarget.email}</strong>? This removes the account permanently.
            </p>
            <div className="actions" style={{ justifyContent: "flex-end" }}>
              <button onClick={() => setDelTarget(null)}>Cancel</button>
              <button className="primary" style={{ background: "var(--danger)", borderColor: "var(--danger)", color: "#fff" }} onClick={doDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}