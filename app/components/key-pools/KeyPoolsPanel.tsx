"use client"

import { useEffect, useState } from "react"
import { ChevronDown, ChevronRight, Plus, Trash2, UserPlus } from "lucide-react"
import { useLang } from "@/lib/i18n"

type PoolKey = {
  id: string
  maskedKey: string | null
  model: string
  isActive: boolean
  lastUsedAt: string | null
  consecutiveFails: number
  cooldownUntil: string | null
}
type Pool = {
  id: string
  name: string
  relayUrl: string | null
  createdAt: string
  assignedUsers: number
  keys: PoolKey[]
}

export function KeyPoolsPanel() {
  const { t } = useLang()
  const [pools, setPools] = useState<Pool[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  // create form
  const [name, setName] = useState("")
  const [relayUrl, setRelayUrl] = useState("")
  const [keysText, setKeysText] = useState("")
  const [model, setModel] = useState("gemini-2.5-flash")
  const [creating, setCreating] = useState(false)

  // expand + assign per pool
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [assignPool, setAssignPool] = useState<Pool | null>(null)
  const [assignAll, setAssignAll] = useState(false)
  const [assignIds, setAssignIds] = useState<string[]>([])
  const [users, setUsers] = useState<{ id: string; email: string }[]>([])

  const load = async () => {
    setLoading(true); setErr(null)
    try {
      const res = await fetch("/api/admin/key-pools")
      const d = await res.json()
      if (!res.ok) { setErr(d.error || "Failed to load"); return }
      setPools(d.pools || [])
    } catch { setErr("Failed to load key pools") }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function createPool(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true); setErr(null); setMsg(null)
    try {
      const res = await fetch("/api/admin/key-pools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, relayUrl, keys: keysText.split("\n"), model }),
      })
      const d = await res.json()
      if (res.ok) { setMsg(`Created pool ${d.pool.name}`); setName(""); setRelayUrl(""); setKeysText(""); await load() }
      else setErr(d.error || "Create failed")
    } catch { setErr("Create failed") }
    finally { setCreating(false) }
  }

  async function deletePool(p: Pool) {
    if (!window.confirm(`Delete pool "${p.name}"? Keys are removed and users unassigned.`)) return
    const res = await fetch(`/api/admin/key-pools/${p.id}`, { method: "DELETE" })
    if (res.ok) { setMsg(`Deleted ${p.name}`); await load() }
    else { const d = await res.json().catch(() => ({})); setErr(d.error || "Failed") }
  }

  async function toggleKey(poolId: string, keyId: string) {
    const res = await fetch(`/api/admin/key-pools/${poolId}/keys/${keyId}`, { method: "PATCH" })
    if (res.ok) await load()
    else { const d = await res.json().catch(() => ({})); setErr(d.error || "Failed") }
  }

  async function removeKey(poolId: string, keyId: string) {
    const res = await fetch(`/api/admin/key-pools/${poolId}/keys/${keyId}`, { method: "DELETE" })
    if (res.ok) { setMsg("Key removed"); await load() }
    else { const d = await res.json().catch(() => ({})); setErr(d.error || "Failed") }
  }

  async function openAssign(p: Pool) {
    setAssignPool(p); setAssignAll(false); setAssignIds([])
    const res = await fetch("/api/admin/users?pageSize=200")
    const d = await res.json()
    setUsers(d.items?.map((u: any) => ({ id: u.id, email: u.email })) || [])
  }

  async function saveAssign() {
    if (!assignPool) return
    const res = await fetch(`/api/admin/key-pools/${assignPool.id}/assignment`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: assignAll, userIds: assignAll ? undefined : assignIds }),
    })
    const d = await res.json()
    if (res.ok) { setMsg(`Assigned to ${d.assigned} user(s)`); setAssignPool(null); await load() }
    else setErr(d.error || "Failed")
  }

  return (
    <section className="card">
      <div className="results-head">
        <h3 className="m0">Gemini Key Pools</h3>
      </div>

      {/* create pool */}
      <form onSubmit={createPool} style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20, padding: 14, border: "1px dashed var(--border)", borderRadius: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>Pool name</label>
            <input className="login-input" value={name} onChange={e => setName(e.target.value)} placeholder="Production Gemini" required />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>Relay URL (Vercel)</label>
            <input className="login-input" value={relayUrl} onChange={e => setRelayUrl(e.target.value)} placeholder="https://microstudio-relay.vercel.app" />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>Model</label>
            <input className="login-input" value={model} onChange={e => setModel(e.target.value)} placeholder="gemini-2.5-flash" />
          </div>
        </div>
        <div>
          <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>API keys (one per line)</label>
          <textarea className="login-input" rows={4} value={keysText} onChange={e => setKeysText(e.target.value)} placeholder={"AIza...\nAIza...\nAIza..."} required />
        </div>
        <div><button className="primary" type="submit" disabled={creating}><Plus size={16} /> {creating ? "Creating…" : "Create pool"}</button></div>
      </form>

      {msg && <p style={{ color: "var(--ok)", fontSize: 13, marginBottom: 10 }}>{msg}</p>}
      {err && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 10 }}>{err}</p>}

      {loading ? <div className="empty"><span className="spinner" /></div> : pools.map(p => (
        <div key={p.id} className="card" style={{ marginBottom: 12, padding: 14 }}>
          <div className="results-head" style={{ marginBottom: 0 }}>
            <button className="link" onClick={() => setExpanded(prev => ({ ...prev, [p.id]: !prev[p.id] }))} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "var(--text)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              {expanded[p.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              {p.name}
              <span className="pill-tag">{p.keys.filter(k => k.isActive).length}/{p.keys.length} keys</span>
              <span className="pill-tag">{p.assignedUsers} user{p.assignedUsers === 1 ? "" : "s"}</span>
              {p.relayUrl && <span className="pill-tag" style={{ color: "var(--accent)" }}>relay</span>}
            </button>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={{ fontSize: 12 }} onClick={() => openAssign(p)}><UserPlus size={14} /> Assign</button>
              <button style={{ fontSize: 12, color: "var(--danger)" }} onClick={() => deletePool(p)}><Trash2 size={14} /> Delete</button>
            </div>
          </div>

          {expanded[p.id] && (
            <div style={{ marginTop: 10 }}>
              <table className="admin-table">
                <thead><tr><th>Key</th><th>Model</th><th>Status</th><th>Last used</th><th>Fails</th><th></th></tr></thead>
                <tbody>
                  {p.keys.map(k => (
                    <tr key={k.id}>
                      <td className="mono">{k.maskedKey}</td>
                      <td>{k.model}</td>
                      <td>
                        <span className="pill-tag" style={{
                          color: !k.isActive ? "var(--muted)" : k.cooldownUntil && new Date(k.cooldownUntil).getTime() > Date.now() ? "var(--danger)" : "var(--ok)",
                        }}>
                          {!k.isActive ? "disabled" : k.cooldownUntil && new Date(k.cooldownUntil).getTime() > Date.now() ? "cooldown" : "active"}
                        </span>
                      </td>
                      <td className="mono">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "—"}</td>
                      <td>{k.consecutiveFails}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button style={{ fontSize: 12, marginRight: 6 }} onClick={() => toggleKey(p.id, k.id)}>{k.isActive ? "Disable" : "Enable"}</button>
                        <button style={{ fontSize: 12, color: "var(--danger)" }} onClick={() => removeKey(p.id, k.id)}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
      {!loading && pools.length === 0 && <div className="empty">No Gemini key pools yet. Create one above.</div>}

      {assignPool && (
        <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) setAssignPool(null) }}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <h2>Assign pool: {assignPool.name}</h2>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginBottom: 12 }}>
              <input type="checkbox" checked={assignAll} onChange={e => setAssignAll(e.target.checked)} /> All active users
            </label>
            {!assignAll && (
              <div className="field">
                <label>Users</label>
                <select multiple className="login-input" style={{ minHeight: 140 }} value={assignIds} onChange={e => setAssignIds(Array.from(e.target.selectedOptions).map(o => o.value))}>
                  {users.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
                </select>
              </div>
            )}
            <div className="actions" style={{ justifyContent: "flex-end" }}>
              <button onClick={() => setAssignPool(null)}>Cancel</button>
              <button className="primary" onClick={saveAssign}>Assign</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}