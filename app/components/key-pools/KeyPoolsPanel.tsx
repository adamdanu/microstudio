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
  successCount: number
  requestCount: number
}
type Pool = {
  id: string
  name: string
  relayUrl: string | null
  createdAt: string
  assignedUsers: number
  users: { id: string; email: string }[]
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
  const [relayToken, setRelayToken] = useState("")
  const [keysText, setKeysText] = useState("")
  const [model, setModel] = useState("gemini-2.5-flash")
  const [creating, setCreating] = useState(false)

  // expand + assign per pool
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [assignPool, setAssignPool] = useState<Pool | null>(null)
  const [assignAll, setAssignAll] = useState(false)
  const [assignIds, setAssignIds] = useState<string[]>([])
  const [users, setUsers] = useState<{ id: string; email: string }[]>([])

  // add key to existing pool
  const [addKeyPool, setAddKeyPool] = useState<Pool | null>(null)
  const [addKeysText, setAddKeysText] = useState("")
  const [addKeyModel, setAddKeyModel] = useState("")

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
        body: JSON.stringify({ name, relayUrl, relayToken, keys: keysText.split("\n"), model }),
      })
      const d = await res.json()
      if (res.ok) { setMsg(`Created pool ${d.pool.name}`); setName(""); setRelayUrl(""); setRelayToken(""); setKeysText(""); await load() }
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

  async function unassignUsers(poolId: string, userIds: string[], label: string) {
    if (!window.confirm(`Unassign ${label} from this pool? They will use their own AI connection.`)) return
    const res = await fetch(`/api/admin/key-pools/${poolId}/assignment`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds }),
    })
    const d = await res.json()
    if (res.ok) { setMsg(`Unassigned ${d.unassigned} user(s)`); await load() }
    else setErr(d.error || "Failed")
  }

  async function saveAddKeys() {
    if (!addKeyPool) return
    const res = await fetch(`/api/admin/key-pools/${addKeyPool.id}/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys: addKeysText.split("\n"), model: addKeyModel || addKeyPool.keys[0]?.model || "" }),
    })
    const d = await res.json()
    if (res.ok) { setMsg(`Added ${d.added} key(s)`); setAddKeyPool(null); setAddKeysText(""); setAddKeyModel(""); await load() }
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
            <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>Relay token (x-relay-token)</label>
            <input className="login-input" value={relayToken} onChange={e => setRelayToken(e.target.value)} placeholder="RELAY_AUTH_TOKEN" />
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
              <button style={{ fontSize: 12 }} onClick={() => { setAddKeyPool(p); setAddKeysText(""); setAddKeyModel("") }}><Plus size={14} /> Add key</button>
              {p.users.length > 0 && <button style={{ fontSize: 12, color: "var(--danger)" }} onClick={() => unassignUsers(p.id, [], "all users")}>Unassign all</button>}
              <button style={{ fontSize: 12, color: "var(--danger)" }} onClick={() => deletePool(p)}><Trash2 size={14} /> Delete</button>
            </div>
          </div>

          {expanded[p.id] && (
            <div style={{ marginTop: 10 }}>
              {p.users.length > 0 && (
                <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>Assigned to:</span>
                  {p.users.map(u => (
                    <span key={u.id} className="pill-tag" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {u.email}
                      <button title="Unassign" style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", padding: 0, lineHeight: 1 }} onClick={() => unassignUsers(p.id, [u.id], u.email)}>×</button>
                    </span>
                  ))}
                </div>
              )}
              {p.users.length === 0 && <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>No users assigned — users with this pool use their own AI connection.</p>}
              <table className="admin-table">
                <thead><tr><th>Key</th><th>Model</th><th>Status</th><th>Last used</th><th>Success</th><th>Fails</th><th></th></tr></thead>
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
                      <td className="mono" title={`${k.successCount}/${k.requestCount} requests succeeded`}>
                        {k.successCount}
                        {k.requestCount > 0 && <span style={{ color: "var(--muted)", fontSize: 11 }}> · {Math.round((k.successCount / k.requestCount) * 100)}%</span>}
                      </td>
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

      {addKeyPool && (
        <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) setAddKeyPool(null) }}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <h2>Add keys to: {addKeyPool.name}</h2>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>API keys (one per line)</label>
              <textarea className="login-input" rows={4} value={addKeysText} onChange={e => setAddKeysText(e.target.value)} placeholder={"AIza...\nAIza..."} required />
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Model (optional, defaults to pool model)</label>
              <input className="login-input" value={addKeyModel} onChange={e => setAddKeyModel(e.target.value)} placeholder={addKeyPool.keys[0]?.model || "gemini-2.5-flash"} />
            </div>
            <div className="actions" style={{ justifyContent: "flex-end" }}>
              <button onClick={() => setAddKeyPool(null)}>Cancel</button>
              <button className="primary" onClick={saveAddKeys} disabled={!addKeysText.trim()}>Add keys</button>
            </div>
          </div>
        </div>
      )}

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