"use client"

import { useEffect, useRef, useState } from "react"
import { useLang } from "@/lib/i18n"
import { PROVIDER_META } from "@/lib/provider-meta"

type Config = { provider: string; apiKey: string | null; baseURL: string | null; model: string | null; enabled: boolean; sortOrder: number }

export function SettingsPanel() {
  const { t } = useLang()
  const [configs, setConfigs] = useState<Record<string, Config>>({})
  const configsRef = useRef<Record<string, Config>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState("openai")
  const [draft, setDraft] = useState<Config | null>(null)
  const [editing, setEditing] = useState(true)
  const [models, setModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [pool, setPool] = useState<{ id: string; name: string } | null>(null)

  const defaultCfg = (prov: string): Config => ({ provider: prov, apiKey: null, baseURL: null, model: null, enabled: false, sortOrder: 0 })

  const loadConfigs = async () => {
    const d = await fetch("/api/providers").then(r => r.json())
    if (d.configs) {
      const map: Record<string, Config> = {}
      for (const c of d.configs) map[c.provider] = c
      configsRef.current = map
      setConfigs(map)
      setDraft(map[selected] || defaultCfg(selected))
      setEditing(map[selected] ? !map[selected].apiKey : true)
    }
  }

  useEffect(() => { loadConfigs().then(() => setLoading(false)) }, [])

  useEffect(() => {
    fetch("/api/key-pools/assigned").then(r => r.json()).then(d => {
      if (d.pool) setPool(d.pool)
    }).catch(() => {})
  }, [])

  const p = PROVIDER_META.find(x => x.id === selected)!
  const c: Config = draft || defaultCfg(selected)

  const savedList = PROVIDER_META.filter(x => configs[x.id]).sort((a, b) => configs[a.id].sortOrder - configs[b.id].sortOrder)
  const enabledList = savedList.filter(x => configs[x.id].enabled)

  async function save() {
    setSaving(true)
    try {
      const res = await fetch("/api/providers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: selected, apiKey: c.apiKey || undefined, baseURL: c.baseURL || undefined, model: c.model || undefined, enabled: c.enabled }),
      })
      if (res.ok) {
        await loadConfigs()
        setEditing(false)
      }
    } finally { setSaving(false) }
  }

  function update(field: string, value: unknown) {
    if (!editing) return
    setDraft(prev => prev ? { ...prev, [field]: value } : null)
  }

  function handleSaveOrEdit() {
    if (editing) save()
    else setEditing(true)
  }

  async function loadModels() {
    if (!c.apiKey) return
    setLoadingModels(true)
    setModels([])
    try {
      const body: Record<string, string> = { provider: selected, apiKey: c.apiKey }
      if (c.baseURL) body.baseURL = c.baseURL
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.models && data.models.length > 0) setModels(data.models)
    } finally { setLoadingModels(false) }
  }

  async function moveProvider(id: string, dir: -1 | 1) {
    const existingRaw = PROVIDER_META.filter(x => configs[x.id]).map(x => ({ id: x.id, order: configs[x.id].sortOrder })).sort((a, b) => a.order - b.order).map(x => x.id)
    const existing: string[] = existingRaw
    if (existing.length < 2) return
    const idx = existing.indexOf(id)
    if (idx === -1) return
    const swap = idx + dir
    if (swap < 0 || swap >= existing.length) return
    const tmp = existing[idx]; existing[idx] = existing[swap]; existing[swap] = tmp
    const orders = existing.map((providerId, i) => ({ provider: providerId, sortOrder: i }))
    const res = await fetch("/api/providers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orders }) })
    if (res.ok) await loadConfigs()
  }

  return (
    <section className="card" style={{ maxWidth: 860, margin: "0 auto" }}>
      <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--muted)", marginBottom: 16 }}>{t("settingsTitle")}</h3>
      {pool && (
        <div className="batchbar" style={{ marginBottom: 16, borderColor: "var(--accent)", color: "var(--accent)" }}>
          Using Gemini Key Pool: <strong>{pool.name}</strong> (admin-managed)
        </div>
      )}
      {loading ? <div className="empty"><span className="spinner" /></div> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20, opacity: pool ? 0.45 : 1, pointerEvents: pool ? "none" : "auto" }}>
          <div>
            <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 8 }}>{t("fallbackPriority")}</label>
            <div className="card" style={{ padding: 12, minHeight: 320 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {savedList.map((x, i) => (
                  <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8, fontSize: 13, color: configs[x.id].enabled ? "var(--text)" : "var(--muted)" }}>
                    <span style={{ width: 18, fontSize: 12, color: "var(--muted)" }}>{i + 1}</span>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: configs[x.id].enabled ? "var(--ok)" : "var(--muted)" }} />
                    <span style={{ flex: 1 }}>{x.label}</span>
                    {configs[x.id].enabled && (
                      <span style={{ display: "flex", gap: 2 }}>
                        <button onClick={() => moveProvider(x.id, -1)} disabled={i === 0} style={{ border: "none", padding: 2 }} title="up">↑</button>
                        <button onClick={() => moveProvider(x.id, 1)} disabled={i === savedList.length - 1} style={{ border: "none", padding: 2 }} title="down">↓</button>
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 12 }}>
                {enabledList.length === 0 ? t("enableAtLeast") : `${t("fallsBack")} ${enabledList.map(x => x.label).join(" → ")}`}
              </p>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 8 }}>{t("provider")}</label>
            <select value={selected} onChange={v => { const cur = configsRef.current[v.target.value]; setSelected(v.target.value); setModels([]); setDraft(cur || defaultCfg(v.target.value)); setEditing(!cur?.apiKey) }} style={{ width: "100%", marginBottom: 14 }}>
              {PROVIDER_META.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>

            <div className="card" style={{ padding: 14, minHeight: 320 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <span style={{ fontWeight: 600 }}>{p.label} <small style={{ color: "var(--muted)", marginLeft: 6 }}>{p.defaultModel}</small></span>
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                  <input type="checkbox" checked={c.enabled} disabled={!editing} onChange={e => update("enabled", e.target.checked)} /> {t("enabled")}
                </label>
              </div>

              <div style={{ opacity: editing ? 1 : 0.4, pointerEvents: editing ? "auto" : "none" }} className="space">
                <div className="field">
                  <label>{t("apiKey")} ({p.envVar})</label>
                  <input type="password" value={c.apiKey || ""} placeholder={c.apiKey?.startsWith("••••") ? t("enterNewKey") : "sk-..."} onChange={e => update("apiKey", e.target.value)} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                  {models.length > 0 ? (
                    <div className="field">
                      <label>{t("model")}</label>
                      <select value={c.model || p.defaultModel} onChange={e => update("model", e.target.value)}>
                        {models.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  ) : (
                    <div className="field">
                      <label>{t("modelOverride")}</label>
                      <input type="text" value={c.model || ""} placeholder={p.defaultModel} onChange={e => update("model", e.target.value)} />
                    </div>
                  )}
                  {p.id === "openai-compatible" && (
                    <div className="field">
                      <label>{t("baseUrl")}</label>
                      <input type="text" value={c.baseURL || ""} placeholder="https://api.example.com/v1" onChange={e => update("baseURL", e.target.value)} />
                    </div>
                  )}
                </div>
                <button onClick={loadModels} disabled={loadingModels || !c.apiKey}>{loadingModels ? t("loadingDots") : t("loadModels")}</button>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                <button onClick={handleSaveOrEdit} disabled={saving}>
                  {saving ? t("savingDots") : editing ? t("save") : t("edit")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}