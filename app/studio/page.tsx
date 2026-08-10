"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Logo } from "../components/Logo"
import { Wordmark } from "../components/Wordmark"
import { LangToggle } from "../components/LangToggle"
import { AdobeStockLogo, ShutterstockLogo } from "../components/PlatformLogos"
import { ADOBE_CATEGORIES, SHUTTERSTOCK_CATEGORIES } from "@/lib/ai/stock"
import { useLang } from "@/lib/i18n"

type ProviderName = "openai" | "anthropic" | "google" | "deepseek" | "openai-compatible"

const PROVIDER_LABELS: Record<ProviderName, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google Gemini",
  deepseek: "DeepSeek",
  "openai-compatible": "OpenAI Compatible",
}

const PROVIDER_META = [
  { id: "openai", label: "OpenAI", defaultModel: "gpt-4o", envVar: "OPENAI_API_KEY" },
  { id: "anthropic", label: "Anthropic", defaultModel: "claude-sonnet-4-20250514", envVar: "ANTHROPIC_API_KEY" },
  { id: "google", label: "Google Gemini", defaultModel: "gemini-3.5-flash-lite", envVar: "GOOGLE_GENERATIVE_AI_API_KEY" },
  { id: "deepseek", label: "DeepSeek", defaultModel: "deepseek-v4-flash", envVar: "DEEPSEEK_API_KEY" },
  { id: "openai-compatible", label: "OpenAI Compatible", defaultModel: "gpt-4o-mini", envVar: "OPENAI_API_KEY" },
] as const

type Meta = {
  title: Record<string, string>
  description: Record<string, string>
  keywords: Record<string, string[]>
  category?: string
  categories?: string[]
}

type DualResult = {
  adobe: Meta
  shutterstock: Meta
}

type GalleryItem = {
  fileName: string
  dataUrl: string
  result: DualResult
}

type CsvTarget = "adobe" | "shutterstock" | null

const MAX_BATCH_ROWS = 5000

export default function Home() {
  const { t } = useLang()
  const [image, setImage] = useState<{ dataUrl: string; mime: string; fileName: string; provider?: string } | null>(null)
  const [result, setResult] = useState<DualResult | null>(null)
  const [lang, setLang] = useState<"en" | "de" | "ar">("en")
  const [gallery, setGallery] = useState<GalleryItem[]>([])
  const [galleryIdx, setGalleryIdx] = useState(0)
  const [step, setStep] = useState<1 | 2>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [selected, setSelected] = useState<{ dataUrl: string; mime: string; fileName: string }[]>([])
  const [queue, setQueue] = useState<{ dataUrl: string; mime: string; fileName: string }[]>([])
  const [queueDone, setQueueDone] = useState(0)
  const [queueTotal, setQueueTotal] = useState(0)
  const [failedFiles, setFailedFiles] = useState<{ fileName: string; reason: string }[]>([])
  const queueRef = useRef<{ dataUrl: string; mime: string; fileName: string }[]>([])
  const runningRef = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [csvTarget, setCsvTarget] = useState<CsvTarget>(null)

  // Keep queue in a ref so the processor loop reads the live list
  useEffect(() => { queueRef.current = queue }, [queue])

  const analyze = useCallback(async (dataUrl: string, mime: string, fileName?: string): Promise<boolean> => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl.split(",")[1], mimeType: mime }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Analysis failed")
      const newResult: DualResult = {
        adobe: data.adobe || { title: {}, description: {}, keywords: {}, category: "" },
        shutterstock: data.shutterstock || { title: {}, description: {}, keywords: {}, categories: [] },
      }
      setResult(newResult)
      setImage(prev => prev ? { ...prev, provider: data.provider } : prev)
      // Always collect into the gallery (one row per image) so Step 2 shows results for both platforms
      if (fileName) {
        setGallery(prev => {
          const arr = prev.filter(g => g.fileName !== fileName)
          return [...arr, { fileName, dataUrl, result: newResult }]
        })
      }
      if (fileName) {
        setFailedFiles(prev => prev.filter(f => f.fileName !== fileName))
      }
      return true
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Analysis failed"
      setError(msg)
      if (fileName) {
        setFailedFiles(prev => prev.some(f => f.fileName === fileName) ? prev : [...prev, { fileName, reason: msg }])
      }
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  // Sequential queue processor: one file at a time, compress, analyze (retry up to 3× on failure)
  useEffect(() => {
    if (runningRef.current) return
    ;(async () => {
      runningRef.current = true
      try {
        while (queueRef.current.length > 0) {
          const next = queueRef.current[0]
          const comp = await compressImage(next.dataUrl, next.mime)
          setQueue(q => q.slice(1))
          setImage({ dataUrl: comp.dataUrl, mime: comp.mime, fileName: next.fileName })
          let ok = await analyze(comp.dataUrl, comp.mime, next.fileName)
          let attempt = 0
          while (!ok && attempt < 3) {
            attempt += 1
            ok = await analyze(comp.dataUrl, comp.mime, next.fileName)
          }
          setQueueDone(d => d + 1)
        }
      } finally {
        runningRef.current = false
      }
    })()
  }, [queue, analyze])

  // Auto-advance to Step 2 (results) once a fresh upload finishes
  const pendingAdvanceRef = useRef(false)
  useEffect(() => {
    if (pendingAdvanceRef.current && queue.length === 0 && (gallery.length > 0 || failedFiles.length > 0) && step === 1) {
      pendingAdvanceRef.current = false
      setStep(2)
    }
  }, [queue.length, gallery.length, step, failedFiles.length])

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return
    const images = Array.from(files).filter(f => f.type === "image/jpeg" || f.type === "image/png")
    if (images.length === 0) return
    const readers = images.map(file => new Promise<{ dataUrl: string; mime: string; fileName: string }>(resolve => {
      const r = new FileReader()
      r.onload = () => resolve({ dataUrl: r.result as string, mime: file.type, fileName: file.name })
      r.readAsDataURL(file)
    }))
    Promise.all(readers).then(items => {
      setSelected(prev => [...prev, ...items])
      if (items.length === 1) {
        setImage(items[0])
      }
    })
  }, [])

  const startGenerate = useCallback(() => {
    if (selected.length === 0) return
    setQueueTotal(selected.length)
    setQueueDone(0)
    setFailedFiles([])
    pendingAdvanceRef.current = true
    setQueue(prev => [...prev, ...selected])
    setSelected([])
  }, [selected])

  const removeSelected = useCallback((fileName: string) => {
    setSelected(prev => prev.filter(s => s.fileName !== fileName))
    setImage(prev => prev && prev.fileName === fileName ? null : prev)
  }, [])

  function compressImage(dataUrl: string, mime: string): Promise<{ dataUrl: string; mime: string }> {
    return new Promise(resolve => {
      const img = new Image()
      img.onload = () => {
        const MAX = 1024
        let { width, height } = img
        if (width > MAX || height > MAX) {
          const scale = MAX / Math.max(width, height)
          width = Math.round(width * scale)
          height = Math.round(height * scale)
        }
        if (width === img.naturalWidth && height === img.naturalHeight) {
          const rawBytes = Math.round((dataUrl.split(",")[1]?.length || 0) * 3 / 4)
          if (rawBytes <= 5 * 1024 * 1024) return resolve({ dataUrl: dataUrl, mime })
        }
        const canvas = document.createElement("canvas")
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext("2d")
        if (!ctx) return resolve({ dataUrl: dataUrl, mime })
        ctx.drawImage(img, 0, 0, width, height)
        let quality = 0.85
        let out = canvas.toDataURL("image/jpeg", quality)
        while (out.length * 3 / 4 > 1024 * 1024 && quality > 0.3) {
          quality -= 0.1
          out = canvas.toDataURL("image/jpeg", quality)
        }
        resolve({ dataUrl: out, mime: "image/jpeg" })
      }
      img.onerror = () => resolve({ dataUrl: dataUrl, mime })
      img.src = dataUrl
    })
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text)
  }

  function esc(v: string | number) { return `"${String(v ?? "").replace(/"/g, '""')}"` }

  function langVal(bundle: Record<string, string>, target: string): string {
    return bundle[target] || bundle.en || Object.values(bundle)[0] || ""
  }

  function langKw(bundle: Record<string, string[]>, target: string): string {
    return (bundle[target] || bundle.en || []).join(", ")
  }

  // Build a CSV for one platform using the chosen language, from ALL processed images.
  function exportCsv(platform: "adobe" | "shutterstock", langToUse: "en" | "de" | "ar") {
    const l = langToUse
    const isAd = platform === "adobe"
    const header = isAd
      ? "Filename,Title,Keywords,Category,Releases"
      : "Filename,Description,Keywords,Categories,Illustration,Mature Content,Editorial"
    const lines = [header, ...gallery.map(g => {
      const meta = isAd ? g.result.adobe : g.result.shutterstock
      if (isAd) return [g.fileName, langVal(meta.title, l), langKw(meta.keywords, l), meta.category || "", ""].map(esc).join(",")
      return [g.fileName, langVal(meta.description, l), langKw(meta.keywords, l), (meta.categories || []).join(","), "No", "No", "No"].map(esc).join(",")
    })]
    const csv = "\uFEFF" + lines.join("\r\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = isAd ? `microstudio_adobe_${l}.csv` : `microstudio_shutterstock_${l}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setCsvTarget(null)
  }

  // Update the editable result AND keep gallery / result in sync so CSV exports reflect edits.
  // `next` is a partial patch against the current platform sub-object.
  const applyResult = useCallback((platform: "adobe" | "shutterstock", next: Partial<Meta>) => {
    if (!result) return
    const newResult: DualResult = {
      ...result,
      [platform]: { ...result[platform], ...next },
    }
    setResult(newResult)
    const fn = image?.fileName
    if (fn) {
      setGallery(prev => prev.map(g => g.fileName === fn ? { ...g, result: newResult } : g))
    }
  }, [result, image?.fileName])

  async function logout() {
    try { await fetch("/api/auth/logout", { method: "POST" }) } catch { /* ignore */ }
    window.location.href = "/login"
  }

  return (
    <div className="wrap">
      <header>
        <div className="logo">
          <Logo size={40} />
          <div>
            <div><Wordmark size={22} /></div>
            <span className="tagline">Microstock Tag Optimizer</span>
          </div>
        </div>
        <div className="top-right">
          <LangToggle />
          <button onClick={() => setShowSettings(true)}>{t("aiSettings")}</button>
          <Link className="btn" href="/profile">{t("profile")}</Link>
          <button onClick={logout} title={t("logOut")} style={{ borderColor: "var(--border)" }}>{t("logOut")}</button>
        </div>
      </header>

      {queueTotal > 0 && queueDone < queueTotal && (
        <div className="batchbar">
          {t("processing")} <strong>{queueDone}/{queueTotal}</strong>…
          {queueDone > 0 && queueTotal > 0 && (
            <div className="progbar"><div className="progfill" style={{ width: `${Math.round(queueDone / queueTotal * 100)}%` }} /></div>
          )}
        </div>
      )}

      <div className="stepper">
        <button className={`stepper-item ${step === 1 ? "active" : ""} ${gallery.length > 0 ? "done" : ""}`} onClick={() => setStep(1)} disabled={loading || queue.length > 0}>
          <span className="step-num">1</span>
          <span className="step-label">{t("uploadPhotos")}</span>
        </button>
        <div className="stepper-line" />
        <button className={`stepper-item ${step === 2 ? "active" : ""}`} onClick={() => gallery.length > 0 && setStep(2)} disabled={loading || queue.length > 0 || gallery.length === 0}>
          <span className="step-num">{gallery.length > 0 ? "✓" : "2"}</span>
          <span className="step-label">{t("optimizedMeta")} <span className={`pill ${gallery.length ? "pill-good" : ""}`}>{gallery.length} · Adobe + Shutterstock</span></span>
        </button>
      </div>

      {step === 1 && (
        <section className="card upload-card">
          <h3>{t("uploadPhoto1")}</h3>
          <div
            className={`drop ${drag ? "drag" : ""}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files) }}
          >
            {image && selected.length === 0 ? (
              <>
                <img src={image.dataUrl} alt="preview" />
                <span className="preview-hint">{t("dropReplace")}</span>
              </>
            ) : (
              <>
                <div className="ico">+</div>
                <div><strong>{t("dropHere")}</strong></div>
                <small>{t("dropOrBrowse")}</small>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png" multiple hidden onChange={e => { handleFiles(e.target.files); e.target.value = "" }} />

          {selected.length > 0 && (
            <div className="selected-row">
              {selected.map(s => (
                <div className="selected-thumb" key={s.fileName + s.dataUrl}>
                  <img src={s.dataUrl} alt="" />
                  <span title={s.fileName}>{s.fileName}</span>
                  <button onClick={() => removeSelected(s.fileName)} title={t("remove")}>✕</button>
                </div>
              ))}
            </div>
          )}

          {selected.length > 0 && (
            <button className="primary generate-btn" onClick={startGenerate} disabled={loading}>
              <span className="gen-icon">✦</span> {t("generateMeta")} ({selected.length})
            </button>
          )}

          {(loading || queue.length > 0) && (
            <div className="processing">
              <div className="spinner" />
              <span>{t("generatingMeta")} {queueDone}/{queueTotal}</span>
              {queueTotal > 0 && (
                <div className="progbar"><div className="progfill" style={{ width: `${Math.round(queueDone / queueTotal * 100)}%` }} /></div>
              )}
            </div>
          )}

          <div className="hint">{t("hintGenerate")}</div>
        </section>
      )}

      {step === 2 && (
        <section className="card">
          <div className="results-head">
            <h3 className="m0">2 · {t("optimizedMeta")} <span className="pill">{gallery.length} {t("uploadPhotos")}</span></h3>
            <button className="link" onClick={() => { setStep(1); setQueueTotal(0) }} disabled={loading || queue.length > 0}>{t("addMorePhotos")}</button>
          </div>

          {gallery.length > 1 && (
            <div className="hgallery">
              {gallery.map((g, idx) => (
                <button
                  key={g.fileName}
                  className={`hcard ${idx === galleryIdx ? "active" : ""}`}
                  onClick={() => { setGalleryIdx(idx); setImage({ dataUrl: g.dataUrl, mime: "image/jpeg", fileName: g.fileName }); setResult(g.result); setLang("en") }}
                >
                  <div className="hthumb"><img src={g.dataUrl} alt="" /></div>
                  <strong title={g.fileName}>{g.fileName}</strong>
                  <span title={g.result.adobe.title.en}>{g.result.adobe.title.en}</span>
                  <small>{g.result.adobe.category || ""} · {g.result.adobe.keywords.en.length} kw · {idx + 1}</small>
                </button>
              ))}
            </div>
          )}

          {loading && <div className="empty"><span className="spinner" /><div style={{ marginTop: 10 }}>{t("analyzingImage")}</div></div>}

          {error && !gallery.length && <div className="danger">{error}</div>}

          {failedFiles.length > 0 && (
            <div className="failed-note">
              <strong>{failedFiles.length} image{failedFiles.length > 1 ? "s" : ""}{t("failedNote1")}</strong>{' '}
              {failedFiles.map(f => (
                <div key={f.fileName} className="failed-row">
                  <code>{f.fileName}</code> — {f.reason}
                </div>
              ))}
            </div>
          )}

          {!loading && !error && !result && (
            <div className="empty">
              <div className="big">✦</div>
              <strong>{t("emptyDrop")}</strong>
              <div className="steps">
                <div><b>1</b>{t("sAnalyze")}</div>
                <div><b>2</b>{t("sTitle")}</div>
                <div><b>3</b>{t("sKeywords")}</div>
                <div><b>4</b>{t("sCategory")}</div>
              </div>
            </div>
          )}

          {!loading && result && (
            <>
              {image?.provider && (
                <div className="hint" style={{ marginBottom: 10 }}>{t("analyzedBy")} <strong>{PROVIDER_LABELS[image.provider as ProviderName] || image.provider}</strong></div>
              )}

              {/* Language tabs — dimension of edit + CSV */}
              <div className="langtabs">
                {(["en", "de", "ar"] as const).map(l => (
                  <button
                    key={l}
                    className={lang === l ? "active" : ""}
                    onClick={() => setLang(l)}
                  >
                    {l === "en" ? "English" : l === "de" ? "Deutsch" : "العربية"}
                    <small>{l.toUpperCase()}</small>
                  </button>
                ))}
                <span className="langtabs-note" style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)" }}>
                  {t("csvLangNote")}
                </span>
              </div>

              <div className="dual-grid">

                {/* ---- Adobe Stock ---- */}
                <div className="card dual-panel">
                  <div className="dual-head">
                    <span className="platform-mini"><AdobeStockLogo />Adobe Stock</span>
                    <span className="pill">{t("downloadCsv")}</span>
                  </div>
                  <div className="field">
                    <label>{t("titleLabel")} <b>{(result.adobe.title[lang] || "").length} / 70</b></label>
                    <input
                      type="text"
                      value={result.adobe.title[lang] || ""}
                      maxLength={70}
                      onChange={e => applyResult("adobe", { title: { ...result.adobe.title, [lang]: e.target.value } })}
                    />
                  </div>
                  <div className="field">
                    <label>{t("descriptionLabel")}</label>
                    <textarea
                      rows={2}
                      value={result.adobe.description[lang] || ""}
                      onChange={e => applyResult("adobe", { description: { ...result.adobe.description, [lang]: e.target.value } })}
                    />
                  </div>
                  <div className="field">
                    <label>{t("keywordsLabel")} ({(result.adobe.keywords[lang] || []).length}) — {t("kwFirst10")}</label>
                    <div className="chips">
                      {(result.adobe.keywords[lang] || []).map((k, i) => (
                        <span key={i} className={`chip ${i < 10 ? "hot" : ""}`}>
                          {k}
                          <button onClick={() => {
                            const arr = result.adobe.keywords[lang] || []
                            applyResult("adobe", { keywords: { ...result.adobe.keywords, [lang]: arr.filter((_, j) => j !== i) } })
                          }}>✕</button>
                        </span>
                      ))}
                    </div>
                    <div className="add-row">
                      <input
                        placeholder={t("addKeyword")}
                        onKeyDown={e => {
                          if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) {
                            applyResult("adobe", { keywords: { ...result.adobe.keywords, [lang]: [...(result.adobe.keywords[lang] || []), (e.target as HTMLInputElement).value.trim()] } })
                            ;(e.target as HTMLInputElement).value = ""
                          }
                        }}
                      />
                      <button onClick={() => {
                        const inp = document.querySelector<HTMLInputElement>(".add-row input")
                        if (inp?.value.trim()) {
                          applyResult("adobe", { keywords: { ...result.adobe.keywords, [lang]: [...(result.adobe.keywords[lang] || []), inp.value.trim()] } })
                          inp.value = ""
                        }
                      }}>+</button>
                    </div>
                  </div>
                  <div className="field">
                    <label>{t("categoryReq")}</label>
                    <select value={result.adobe.category || ""} onChange={e => applyResult("adobe", { category: e.target.value })}>
                      <option value="" disabled>{t("selectCategory")}</option>
                      {ADOBE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="actions">
                    <button className="primary" onClick={() => copy(result.adobe.title[lang] || "")}>{t("copyTitle", { L: lang.toUpperCase() })}</button>
                    <button onClick={() => copy((result.adobe.keywords[lang] || []).join(", "))}>{t("copyKw", { L: lang.toUpperCase() })}</button>
                    <button className="primary" onClick={() => setCsvTarget("adobe")}>⇩ {t("downloadCsv")}</button>
                  </div>
                </div>

                {/* ---- Shutterstock ---- */}
                <div className="card dual-panel">
                  <div className="dual-head">
                    <span className="platform-mini"><ShutterstockLogo />Shutterstock</span>
                    <span className="pill">{t("downloadCsv")}</span>
                  </div>
                  <div className="field">
                    <label>{t("titleLabel")} <b>{(result.shutterstock.title[lang] || "").length} / 70</b></label>
                    <input
                      type="text"
                      value={result.shutterstock.title[lang] || ""}
                      maxLength={70}
                      onChange={e => applyResult("shutterstock", { title: { ...result.shutterstock.title, [lang]: e.target.value } })}
                    />
                  </div>
                  <div className="field">
                    <label>{t("descriptionLabel")}</label>
                    <textarea
                      rows={2}
                      value={result.shutterstock.description[lang] || ""}
                      onChange={e => applyResult("shutterstock", { description: { ...result.shutterstock.description, [lang]: e.target.value } })}
                    />
                  </div>
                  <div className="field">
                    <label>{t("keywordsLabel")} ({(result.shutterstock.keywords[lang] || []).length}) — {t("kwRequired")}</label>
                    <div className="chips">
                      {(result.shutterstock.keywords[lang] || []).map((k, i) => (
                        <span key={i} className="chip">
                          {k}
                          <button onClick={() => {
                            const arr = result.shutterstock.keywords[lang] || []
                            applyResult("shutterstock", { keywords: { ...result.shutterstock.keywords, [lang]: arr.filter((_, j) => j !== i) } })
                          }}>✕</button>
                        </span>
                      ))}
                    </div>
                    <div className="add-row">
                      <input
                        placeholder={t("addKeyword")}
                        onKeyDown={e => {
                          if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) {
                            applyResult("shutterstock", { keywords: { ...result.shutterstock.keywords, [lang]: [...(result.shutterstock.keywords[lang] || []), (e.target as HTMLInputElement).value.trim()] } })
                            ;(e.target as HTMLInputElement).value = ""
                          }
                        }}
                      />
                      <button onClick={() => {
                        const inp = document.querySelector<HTMLInputElement>(".add-row input")
                        if (inp?.value.trim()) {
                          applyResult("shutterstock", { keywords: { ...result.shutterstock.keywords, [lang]: [...(result.shutterstock.keywords[lang] || []), inp.value.trim()] } })
                          inp.value = ""
                        }
                      }}>+</button>
                    </div>
                  </div>
                  <div className="field">
                    <label>{t("categoriesReq")}</label>
                    <select value={(result.shutterstock.categories || [])[0] || ""} onChange={e => applyResult("shutterstock", { categories: [e.target.value, (result.shutterstock.categories || [])[1]].filter(Boolean) })}>
                      <option value="" disabled>{t("selectFirst")}</option>
                      {SHUTTERSTOCK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select
                      style={{ marginTop: 8 }}
                      value={(result.shutterstock.categories || [])[1] || ""}
                      onChange={e => applyResult("shutterstock", { categories: [(result.shutterstock.categories || [])[0], e.target.value].filter(Boolean) })}
                    >
                      <option value="">{t("noSecond")}</option>
                      {SHUTTERSTOCK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="actions">
                    <button className="primary" onClick={() => copy(result.shutterstock.title[lang] || "")}>{t("copyTitle", { L: lang.toUpperCase() })}</button>
                    <button onClick={() => copy((result.shutterstock.keywords[lang] || []).join(", "))}>{t("copyKw", { L: lang.toUpperCase() })}</button>
                    <button className="primary" onClick={() => setCsvTarget("shutterstock")}>⇩ {t("downloadCsv")}</button>
                  </div>
                </div>
              </div>

              <div className="actions centered" style={{ marginTop: 18 }}>
                <button onClick={() => image && analyze(image.dataUrl, image.mime, image.fileName)} disabled={loading}>
                  {loading ? t("regenerating") : t("regenerate")}
                </button>
                <span className="hint" style={{ marginLeft: 12 }}>{t("csvPerSecond")}</span>
              </div>
              <div className="hint">{t("hintAuto")} {t("hintSS")} · {t("hintAdobe")}</div>
            </>
          )}
        </section>
      )}

      <div className="cap">{t("capabilities")}</div>
      <span className="pill-tag">{t("capAdobe21")}</span>
      <span className="pill-tag">{t("cap70")}</span>
      <span className="pill-tag">{t("cap1545")}</span>
      <span className="pill-tag">{t("capSS26")}</span>
      <span className="pill-tag">{t("capSSkw")}</span>
      <span className="pill-tag">{t("capCSV")}</span>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {csvTarget && (
        <CsvLangModal target={csvTarget} current={lang} onSelect={l => exportCsv(csvTarget, l)} onClose={() => setCsvTarget(null)} />
      )}
    </div>
  )
}

function CsvLangModal({ target, current, onSelect, onClose }: {
  target: "adobe" | "shutterstock"
  current: "en" | "de" | "ar"
  onSelect: (l: "en" | "de" | "ar") => void
  onClose: () => void
}) {
  const { t } = useLang()
  const subtitle = target === "adobe" ? "Filename,Title,Keywords,Category,Releases" : "Filename,Description,Keywords,Categories,Illustration,Mature Content,Editorial"
  return (
    <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 420, minHeight: 220 }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>{target === "adobe" ? <AdobeStockLogo /> : <ShutterstockLogo />} {t("downloadCsv")}</h2>
        <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>{subtitle}</p>
        <p style={{ fontSize: 13, color: "var(--text)", marginTop: 10 }}>{t("csvPickLang")}</p>
        <div className="actions" style={{ flexWrap: "wrap", marginTop: 16 }}>
          {(["en", "de", "ar"] as const).map(l => (
            <button key={l} className={current === l ? "active" : ""} onClick={() => onSelect(l)} style={{ minWidth: 90, justifyContent: "center" }}>
              {l === "en" ? "English" : l === "de" ? "Deutsch" : "العربية"}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const { t } = useLang()
  type Config = { provider: string; apiKey: string | null; baseURL: string | null; model: string | null; enabled: boolean; sortOrder: number }
  const [configs, setConfigs] = useState<Record<string, Config>>({})
  const configsRef = useRef<Record<string, Config>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState("openai")
  const [draft, setDraft] = useState<Config | null>(null)
  const [editing, setEditing] = useState(true)
  const [models, setModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)

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
    if (editing) { save() } else { setEditing(true) }
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
    if (res.ok) { await loadConfigs() }
  }

  return (
    <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 720, minHeight: 420 }}>
        <h2>{t("settingsTitle")}</h2>
        {loading ? <div className="empty"><span className="spinner" /></div> : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 20 }}>
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
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
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
      </div>
    </div>
  )
}