"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AdobeStockLogo, ShutterstockLogo } from "../../components/PlatformLogos"
import { ADOBE_CATEGORIES, SHUTTERSTOCK_CATEGORIES } from "@/lib/ai/stock"
import { useLang } from "@/lib/i18n"
import { PROVIDER_LABELS, type ProviderName } from "@/lib/provider-meta"

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
              {image && (
                <div className="result-img">
                  <img src={image.dataUrl} alt={image.fileName} />
                  <span className="result-img-name">{image.fileName}</span>
                </div>
              )}
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
