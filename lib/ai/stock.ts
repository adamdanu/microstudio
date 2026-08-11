import { generateObject } from 'ai'
import { z } from 'zod'
import { getModel, type AIProviderConfig } from './adapter'

export const ADOBE_CATEGORIES = [
  'Animals', 'Buildings and Architecture', 'Business', 'Drinks', 'The Environment',
  'States of Mind', 'Food', 'Graphic Resources', 'Hobbies and Leisure', 'Industry',
  'Landscape', 'Lifestyle', 'People', 'Plants and Flowers', 'Culture and Religion',
  'Science', 'Social Issues', 'Sports', 'Technology', 'Transport', 'Travel',
]

export const SHUTTERSTOCK_CATEGORIES = [
  'Abstract', 'Animals/Wildlife', 'Arts', 'Backgrounds/Textures', 'Beauty/Fashion',
  'Buildings/Landmarks', 'Business/Finance', 'Celebrities', 'Education', 'Food and Drink',
  'Healthcare/Medical', 'Holidays', 'Industrial', 'Interiors', 'Miscellaneous', 'Nature',
  'Objects', 'Parks/Outdoor', 'People', 'Religion', 'Science', 'Signs/Symbols',
  'Sports/Recreation', 'Technology', 'Transportation', 'Vintage',
]

export type Platform = 'adobe' | 'shutterstock'

export const LANGS = ['en', 'de', 'ar'] as const
export type Lang = (typeof LANGS)[number]

export interface StockMetadata {
  title: Record<Lang, string>
  description: Record<Lang, string>
  keywords: Record<Lang, string[]>
  category?: string
  categories?: string[]
}

const lang = () => z.string().describe('Human translation in this language.')

export const stockSchema = z.object({
  title: z.object({ en: lang(), de: lang(), ar: lang() }).describe('Title in English, German, Arabic'),
  description: z.object({ en: lang(), de: lang(), ar: lang() }).describe('Short image description in English, German, Arabic'),
  keywords: z.object({
    en: z.array(z.string()).min(10).max(45),
    de: z.array(z.string()).min(10).max(45),
    ar: z.array(z.string()).min(10).max(45),
  }).describe('Ordered keywords per language, most important first'),
  category: z.enum(ADOBE_CATEGORIES as [string, ...string[]]).describe('Best matching Adobe Stock category.'),
})

// Adobe schema — title ≤70, 15–45 keywords, 1 category
export const adobeSchema = stockSchema

// Shutterstock schema — description up to 2048 chars, 7–50 keywords, 1–2 categories
export const shutterstockSchema = z.object({
  title: z.object({ en: lang(), de: lang(), ar: lang() }).describe('Descriptive title per language (news-headline style: who/what/where + mood)'),
  description: z.object({ en: lang(), de: lang(), ar: lang() }).describe('Detailed description per language up to 2048 characters'),
  keywords: z.object({
    en: z.array(z.string()).min(7).max(50),
    de: z.array(z.string()).min(7).max(50),
    ar: z.array(z.string()).min(7).max(50),
  }).describe('7–50 tailored keywords per language'),
  categories: z.array(z.enum(SHUTTERSTOCK_CATEGORIES as [string, ...string[]])).min(1).max(2).describe('1–2 Shutterstock categories (2nd optional).'),
})

// Map any AI-returned category string to the closest official Adobe category.
// Falls back to a safe default when nothing matches.
export function closestCategory(raw: unknown): string {
  return closestCategoryList(raw, ADOBE_CATEGORIES)
}

function pick(obj: unknown, def: string): string {
  return typeof obj === 'string' && obj.trim() ? obj.trim() : def
}

function pickArray(obj: unknown, def: string[]): string[] {
  return Array.isArray(obj) ? obj.filter((k: unknown) => typeof k === 'string').slice(0, 50) : def
}

function pickLangBundle(obj: unknown, fallback: Record<Lang, string>): Record<Lang, string> {
  if (obj && typeof obj === 'object') {
    const o = obj as Record<string, unknown>
    const enFallback = typeof o.en === 'string' ? o.en : fallback.en
    return {
      en: pick(o.en, fallback.en),
      de: pick(o.de, enFallback),
      ar: pick(o.ar, enFallback),
    }
  }
  return { ...fallback }
}

function pickKeywordsBundle(obj: unknown, fallback: Record<Lang, string[]>): Record<Lang, string[]> {
  if (obj && typeof obj === 'object') {
    const o = obj as Record<string, unknown>
    const enArr = Array.isArray(o.en) ? o.en.filter((k: unknown) => typeof k === 'string') : fallback.en
    return {
      en: pickArray(o.en, fallback.en),
      de: pickArray(o.de, enArr),
      ar: pickArray(o.ar, enArr),
    }
  }
  return { ...fallback }
}

function pickCategoryList(obj: unknown, max: number): string[] {
  const src = Array.isArray(obj) ? obj : obj ? [obj] : []
  const list = src.filter((c: unknown) => typeof c === 'string').map(c => closestCat(c)).filter(Boolean).slice(0, max)
  return list.length ? list : ['Technology']
}

function closestCat(raw: unknown): string {
  return closestCategoryList(raw as string, SHUTTERSTOCK_CATEGORIES)
}

function closestCategoryList(raw: unknown, cats: string[]): string {
  const v = String(raw ?? '').trim()
  if (!v) return cats[13] || cats[0]
  const norm = v.toLowerCase()
  const exact = cats.find(c => c.toLowerCase() === norm)
  if (exact) return exact
  for (const c of cats) {
    const cLow = c.toLowerCase()
    if (cLow.includes(norm) || norm.includes(cLow)) return c
  }
  const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, '')
  const words = norm.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).map(stem)
  let best = cats[0], bestScore = 0
  for (const c of cats) {
    const cw = c.toLowerCase().split(/\s+/).map(stem)
    const score = cw.filter(w => words.some(word => word === w)).length
    if (score > bestScore) { bestScore = score; best = c }
  }
  return best
}

const SEO_EXPERT_SYSTEM: Record<Platform, string> = {
  adobe: `You are a world-class Adobe Stock SEO expert with 10+ years of experience maximizing photo discoverability and sales.

You follow Adobe Stock's metadata rules precisely and provide every field in THREE languages: English (en), German (de), Arabic (ar). All language versions describe the SAME content — just translated.

- TITLE (per language): a short, factual, descriptive sentence UNDER 70 characters explaining exactly what the photo shows in that language. No brand names, no camera names, no technical specs.
- DESCRIPTION (per language): 1-2 sentences giving a natural image description a buyer would read. Keep it concise; translate idiomatically.
- KEYWORDS (per language): 15 to 45 relevant keywords (aim close to 45 for strongest discoverability). First 10 carry extra weight. Cover subject, action, setting, mood, color, buyer use-case. Use terms buyers type IN THAT LANGUAGE. No irrelevant/duplicate keywords.
- CATEGORY: pick the single best match from the official Adobe Stock category list. If none is perfect, choose the closest.

Describe ONLY what is ACTUALLY in the image. Confirm each translation is a faithful equivalent of the English version.`,

  shutterstock: `You are a world-class Shutterstock contributor SEO expert with 10+ years of experience.

You follow Shutterstock's contextual-metadata rules precisely. Provide every field in English, German (de) and Arabic (ar). All versions describe the SAME content — just superior translation.

- TITLE/DESCRIPTION (per language): a detailed, unique, news-headline style fact of the content — Who/What, Where, When, mood/emotion. Up to 2048 characters is allowed; be descriptive, but no keyword lists, no trademarks, no camera info.
- KEYWORDS (per language): 7 to 50 tailored keywords (aim ~30-50 for max discovery). Broader topics, feelings, concepts and associations included. No repeats, no spam.
- CATEGORIES: pick exactly the Shutterstock category that is the STRONGEST, most LITERAL match for the subject shown. A second category is OPTIONAL — only add one if it is ALSO a strong literal match; otherwise return a single-element array. For a wedding ring alone, use "Objects", NOT "Food and Drink". Match the actual subject matter in the frame.

Describe ONLY what is ACTUALLY in the image. Confirm each translation is a faithful equivalent.`,
}

export interface AdobeMetadata extends StockMetadata {}

export interface ShutterstockMetadata extends Omit<StockMetadata, 'category'> {
  categories?: string[]
}

export interface DualMetadata {
  adobe: AdobeMetadata
  shutterstock: ShutterstockMetadata
}

const DUAL_SYSTEM = `You are a 10-year microstock expert listing your photos on BOTH Adobe Stock and Shutterstock. You analyze each image ONCE and return TWO submission-ready metadata packs in the exact JSON shape given — one for Adobe, one for Shutterstock. Every pack provides title, description and keywords in THREE languages (en, de, ar) that are faithful equivalents. Keywords are importance-ordered; the first ones carry the most search weight. Never invent content: describe only what is actually visible in the image; no camera/brand names.

ADOBE (adobe):
- title: factual descriptive sentence under 70 characters.
- description: 1-2 concise sentences a buyer would read.
- keywords: at least 35, aim ~42 (between 35 and 45). Most important first; cover subject, action, setting, mood, colors, buyer use-case. Be specific, no duplicates.
- category: single best match from the official Adobe Stock category list (21).

SHUTTERSTOCK (shutterstock):
- title: news-headline style fact (who/what, where, mood) under 70 characters.
- description: 1-2 detailed sentences, up to 2048 characters.
- keywords: at least 35, aim ~42 (between 35 and 50). Broader topics, feelings, concepts.
- categories: 1-2 Shutterstock categories. Second only when it is ALSO a strong literal match, else a single-element array.

Reply with ONLY valid JSON matching this exact structure:
{"adobe":{"title":{"en":"","de":"","ar":""},"description":{"en":"","de":"","ar":""},"keywords":{"en":[""],"de":[""],"ar":[""]},"category":"Travel"},"shutterstock":{"title":{"en":"","de":"","ar":""},"description":{"en":"","de":"","ar":""},"keywords":{"en":[""],"de":[""],"ar":[""]},"categories":["Nature"]}}`

function kwSlice(r: Record<Lang, string[]>, n: number): Record<Lang, string[]> {
  return { en: (r.en || []).slice(0, n), de: (r.de || []).slice(0, n), ar: (r.ar || []).slice(0, n) }
}

// Robust JSON extractor for model output. Handles markdown fences, prose around the
// object, duplicated blocks, trailing garbage, and partial "adobe"/"shutterstock"
// objects (one platform salvaged even if the other is malformed).
export function parseDualJson(raw: string, original?: string): { adobe?: any; shutterstock?: any } {
  const clean = raw.replace(/```json|```/g, '').trim()
  // 1) Strict full parse.
  try {
    const o = JSON.parse(clean)
    if (o && typeof o === 'object') return o
  } catch { /* fall through */ }

  const extractBalanced = (text: string, from = 0): string | null => {
    const start = text.indexOf('{', from)
    if (start === -1) return null
    let depth = 0, inStr = false, esc = false
    for (let i = start; i < text.length; i++) {
      const ch = text[i]
      if (inStr) {
        if (esc) esc = false
        else if (ch === '\\') esc = true
        else if (ch === '"') inStr = false
        continue
      }
      if (ch === '"') inStr = true
      else if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) return text.slice(start, i + 1)
      }
    }
    return null
  }

  // 2) Balanced outer object (works when braces are balanced but JSON.parse tripped on trailing comma etc).
  const outer = extractBalanced(clean)
  if (outer) {
    try { return JSON.parse(outer) } catch { /* fall through */ }
  }

  // 3) Per-platform salvage: locate each top-level key and extract its balanced value.
  //    Look within 'outer' if present (protects against duplicated blocks) else full text.
  const scope = outer || clean
  const out: { adobe?: any; shutterstock?: any } = {}
  for (const key of ['adobe', 'shutterstock']) {
    const idx = scope.indexOf(`"${key}"`)
    if (idx === -1) continue
    const colon = scope.indexOf(':', idx)
    if (colon === -1) continue
    let val: string | null = null
    // Array or object?
    let vStart = scope.indexOf('[', colon)
    let oStart = scope.indexOf('{', colon)
    if (vStart !== -1 && (oStart === -1 || vStart < oStart)) {
      let depth = 0
      for (let i = vStart; i < scope.length; i++) {
        if (scope[i] === '[') depth++
        else if (scope[i] === ']') { depth--; if (depth === 0) { val = scope.slice(vStart, i + 1); break } }
      }
    } else {
      val = extractBalanced(scope, oStart === -1 ? colon : oStart)
    }
    if (!val) continue
    try { out[key as 'adobe' | 'shutterstock'] = JSON.parse(val) } catch { /* skip */ }
  }
  if (out.adobe || out.shutterstock) return out

  // 4) Last resort — but instead of throwing, return {} so the caller can still salvage empty packs.
  if (original) {
    // Do not throw here: partial failure of one image is handled per-image upstream.
  }
  return out
}

// OT_ blind-see two-stage: a fast vision model DESCRIBES the image (small output,
// no truncation risk), then a fast text model generates both metadata packs from
// that description (no image tokens in the expensive call). Two platform calls run
// in PARALLEL so wall-time ≈ max(adobe, shutter) not the sum.
// Config: `config.model` = the vision model; the text models are fixed to the
// opencode deepseek (the flagship "text" model behind the oc/ prefix) unless
// overridden via env. Falls back to the single call when stage-2 unreachable.

const VISION_DESC_SYSTEM =
  "You are a meticulous visual analyzer. Describe the image in 4-6 accurate sentences for a professional stock-photo metadata writer: main subject, action, setting, colors, lighting, mood, composition. Factual only; no guesses about off-frame content."

const PLATFORM_FROM_DESC_SYSTEM = {
  adobe: `You are a world-class Adobe Stock SEO expert. From the image DESCRIPTION given by a vision model, produce ONE metadata pack (JSON):
- title: factual descriptive sentence UNDER 70 characters.
- description: 1-2 concise sentences a buyer would read.
- keywords: 35 to 45 (aim ~42), importance-ordered, de-duplicated, covering subject/action/setting/mood/colors/use-case.
- category: single best match from the official Adobe Stock category list.
Provide the pack in THREE languages (en, de, ar) as faithful equivalents. Return ONLY valid JSON.`,

  shutterstock: `You are a world-class Shutterstock SEO expert. From the image DESCRIPTION given by a vision model, produce ONE metadata pack (JSON):
- title: news-headline style fact (who/what/where/mood) under 70 characters.
- description: 1-3 detailed sentences, up to 2048 characters.
- keywords: 35 to 50 (aim ~42), importance-ordered, de-duplicated, broad (feelings, concepts).
- categories: 1-2 Shutterstock categories; second only when it is ALSO a strong literal match.
Provide the pack in THREE languages (en, de, ar) as faithful equivalents. Return ONLY valid JSON.`,
}

const PLATFORM_SHAPES = {
  adobe: '{"title":{"en":"","de":"","ar":""},"description":{"en":"","de":"","ar":""},"keywords":{"en":[""],"de":[""],"ar":[""]},"category":""}',
  shutterstock: '{"title":{"en":"","de":"","ar":""},"description":{"en":"","de":"","ar":""},"keywords":{"en":[""],"de":[""],"ar":[""]},"categories":[""]}',
}

function chatCompletions(baseURL: string, apiKey: string, payload: Record<string, unknown>, timeoutMs = 60000): Promise<any> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  return fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey || ''}`,
    },
    body: JSON.stringify(payload),
    signal: ctrl.signal,
  }).then(async res => {
    clearTimeout(timer)
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`Provider error ${res.status}: ${txt.slice(0, 200)}`)
    }
    return res.json()
  }).catch(e => {
    clearTimeout(timer)
    if ((e as Error)?.name === 'AbortError') throw new Error(`Provider timeout after ${timeoutMs}ms`)
    throw e
  })
}

function extractContent(d: any): string {
  const content = d?.choices?.[0]?.message?.content
  if (!content) throw new Error('No content in provider response')
  return content
}

export interface UsageAccumulator {
  tokensIn: number
  tokensOut: number
}

// Captures `usage` from an OpenAI-compatible chat completion response into the
// accumulator (best-effort; missing usage is treated as 0).
function accUsage(d: any, acc?: UsageAccumulator): any {
  if (acc && d?.usage) {
    acc.tokensIn += d.usage.prompt_tokens ?? 0
    acc.tokensOut += d.usage.completion_tokens ?? 0
  }
  return d
}

// Stage 1 — vision model reads the image → short factual description.
// Uses the user-configured `config.model` as the PRIMARY model. Fallback models are
// read from env (comma-separated, optional) — never hardcoded, so the operator can
// customize the openai-compatible chain entirely from configuration.
const VISION_FALLBACKS = (process.env.MICROSTUDIO_VISION_FALLBACKS || '')
  .split(',').map(s => s.trim()).filter(Boolean)
async function describeImage(imageBase64: string, mimeType: string, config: AIProviderConfig, acc?: UsageAccumulator): Promise<string> {
  const baseURL = (config.baseURL || 'https://api.openai.com/v1').replace(/\/$/, '')
  const chain = Array.from(new Set([config.model, ...VISION_FALLBACKS].filter(Boolean)))
  let lastErr: unknown = null
  for (const model of chain) {
    try {
      const d = accUsage(await chatCompletions(baseURL, config.apiKey || '', {
        model,
        stream: false,
        temperature: 0.2,
        max_tokens: 600,
        messages: [
          { role: 'system', content: VISION_DESC_SYSTEM },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe this image.' },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            ],
          },
        ],
      }, 45000), acc)
      const desc = extractContent(d)
      if (desc && desc.trim().length > 0) return desc
    } catch (e) {
      lastErr = e
      const msg = String((e as Error).message || e)
      if (!/429|rate.limit|FreeUsageLimit/i.test(msg)) break // hard error -> next model
      await new Promise(r => setTimeout(r, 1500))
    }
  }
  throw new Error(lastErr instanceof Error ? lastErr.message : 'Vision model returned an empty description')
}

// Stage 2 — text model turns the description into ONE platform pack.
// Uses the user-configured `config.model` as the PRIMARY model. Fallback models are
// read from env (comma-separated, optional). Each call has a 60s hard abort so a dead
// model never burns the whole Cloudflare 100s budget.
const STAGE2_FALLBACKS = (process.env.MICROSTUDIO_TEXT_FALLBACKS || '')
  .split(',').map(s => s.trim()).filter(Boolean)

function stage2Chain(config: AIProviderConfig): string[] {
  return Array.from(new Set([config.model, ...STAGE2_FALLBACKS].filter(Boolean)))
}

async function platformFromDescription(platform: Platform, description: string, config: AIProviderConfig, acc?: UsageAccumulator): Promise<StockMetadata> {
  const baseURL = (config.baseURL || 'https://api.openai.com/v1').replace(/\/$/, '')
  const isShutter = platform === 'shutterstock'
  const maxKw = isShutter ? 50 : 45
  let lastErr: unknown = null

  for (const model of stage2Chain(config)) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const d = accUsage(await chatCompletions(baseURL, config.apiKey || '', {
          model,
          stream: false,
          temperature: 0.3,
          max_tokens: 6000,
          messages: [
            { role: 'system', content: PLATFORM_FROM_DESC_SYSTEM[platform] },
            { role: 'user', content: `Image description: ${description}\n\nReturn ONLY valid JSON matching: ${PLATFORM_SHAPES[platform]}` },
          ],
        }), acc)
        const content = extractContent(d)
        let parsed: any
        try {
          parsed = JSON.parse(content.replace(/```json|```/g, '').trim())
        } catch {
          const balanced = extractSingleJson(content)
          if (!balanced) throw new Error('Text model did not return JSON. Raw reply: ' + content.slice(0, 160))
          parsed = balanced
        }
        const title = parsed?.title || {}
        const desc = parsed?.description || parsed?.body || {}
        const kw = parsed?.keywords || {}
        const enTitle = title.en || ''
        const enDesc = desc.en || ''
        const enKw = Array.isArray(kw.en) ? kw.en : []
        const out: StockMetadata = {
          title: { en: title.en || '', de: title.de || enTitle, ar: title.ar || enTitle },
          description: { en: desc.en || '', de: desc.de || enDesc, ar: desc.ar || enDesc },
          keywords: kwSlice(pickKeywordsBundle(kw, { en: enKw, de: enKw, ar: enKw }), maxKw),
        }
        if (isShutter) out.categories = pickCategoryList(parsed.categories || parsed.category, 2)
        else out.category = closestCategory(parsed.category)
        return out
      } catch (e) {
        lastErr = e
        const msg = String((e as Error).message || e)
        const rateLimited = /429|rate.limit|FreeUsageLimit/i.test(msg)
        const empty = /No content in provider response/i.test(msg)
        // On 429 wait a short backoff before the retry; on empty move to next model immediately.
        if (rateLimited) await new Promise(r => setTimeout(r, 2000 * attempt))
        if (!rateLimited && !empty) break // hard error -> next model
        if (attempt === 2) break // exhausted retries -> next model
      }
    }
  }
  throw new Error(lastErr instanceof Error ? lastErr.message : 'All text models failed to generate metadata')
}

function extractSingleJson(raw: string): any | null {
  const clean = raw.replace(/```json|```/g, '').trim()
  try { return JSON.parse(clean) } catch { /* continue */ }
  const start = clean.indexOf('{')
  if (start === -1) return null
  let depth = 0, inStr = false, esc = false
  for (let i = start; i < clean.length; i++) {
    const ch = clean[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        try { return JSON.parse(clean.slice(start, i + 1)) } catch { return null }
      }
    }
  }
  return null
}

// ONE vision call → both platform packs. Halves token cost vs calling twice per image.
// Returns the packs plus a usage accumulator for analytics (tokens in/out across all
// provider calls made for this image).
export async function generateMetadataDual(imageBase64: string, mimeType: string, config: AIProviderConfig): Promise<DualMetadata & { usage: UsageAccumulator }> {
  // openai-compatible (e.g. 9Router / DeepSeek) — blind-see two-stage: describe once, then
  // adobe + shutterstock generated IN PARALLEL from the description (text only, fast, no image tokens).
  if (config.provider === 'openai-compatible' || config.provider === 'deepseek') {
    const baseURL = (config.baseURL || 'https://api.openai.com/v1').replace(/\/$/, '')
    const usage: UsageAccumulator = { tokensIn: 0, tokensOut: 0 }
    const description = await describeImage(imageBase64, mimeType, config, usage)
    if (!description && description.length === 0) {
      throw new Error('Vision model returned an empty description. Raw reply above.')
    }
    const [adobe, shutterstock] = await Promise.all([
      platformFromDescription('adobe', description, config, usage).catch(e => { throw e }),
      platformFromDescription('shutterstock', description, config, usage).catch(e => { throw e }),
    ])
    return { adobe, shutterstock, usage }
  }

  // Native SDK providers (openai/anthropic/google) — generateObject with dual schema
  const model = getModel(config)
  const dualSchema = z.object({
    adobe: adobeSchema,
    shutterstock: shutterstockSchema,
  })
  const result = await generateObject({ model, schema: dualSchema, system: DUAL_SYSTEM, messages: [
    { role: 'user', content: [
      { type: 'text', text: 'Analyze this image and return the adobe + shutterstock packs in 3 languages (en, de, ar).' },
      { type: 'image', image: new Uint8Array(Buffer.from(imageBase64, 'base64')), mediaType: mimeType },
    ] },
  ] })
  const usage: UsageAccumulator = {
    tokensIn: (result as any).usage?.inputTokens ?? (result as any).usage?.promptTokens ?? 0,
    tokensOut: (result as any).usage?.outputTokens ?? (result as any).usage?.completionTokens ?? 0,
  }
  const o = result.object as { adobe?: any; shutterstock?: any }
  const aRes = o.adobe || {}
  const sRes = o.shutterstock || {}
  const aTitle = (aRes.title || {})
  const aDesc = (aRes.description || {})
  const aKw = (aRes.keywords || { en: [], de: [], ar: [] })
  const sTitle = (sRes.title || {})
  const sDesc = (sRes.description || {})
  const sKw = (sRes.keywords || { en: [], de: [], ar: [] })
  const aEnTitle = aTitle.en || ''
  const sEnTitle = sTitle.en || ''
  return {
    adobe: {
      title: { en: aTitle.en, de: aTitle.de || aEnTitle, ar: aTitle.ar || aEnTitle },
      description: { en: aDesc.en, de: aDesc.de || aDesc.en || '', ar: aDesc.ar || aDesc.en || '' },
      keywords: kwSlice(aKw, 45),
      category: closestCategory(aRes.category),
    },
    shutterstock: {
      title: { en: sTitle.en, de: sTitle.de || sEnTitle, ar: sTitle.ar || sEnTitle },
      description: { en: sDesc.en, de: sDesc.de || sDesc.en || '', ar: sDesc.ar || sDesc.en || '' },
      keywords: kwSlice(sKw, 50),
      categories: pickCategoryList(sRes.categories || sRes.category, 2),
    },
    usage,
  }
}

export async function generateStockMetadata(imageBase64: string, mimeType: string, config: AIProviderConfig, platform: Platform = 'adobe'): Promise<StockMetadata> {
  const isShutter = platform === 'shutterstock'
  const system = SEO_EXPERT_SYSTEM[platform]
  const jsonShape = isShutter
    ? `{"title":{"en":"...","de":"...","ar":"..."},"description":{"en":"...","de":"...","ar":"..."},"keywords":{"en":[""],"de":[""],"ar":[""]},"categories":["Technology"]}`
    : `{"title":{"en":"...","de":"...","ar":"..."},"description":{"en":"...","de":"...","ar":"..."},"keywords":{"en":[""],"de":[""],"ar":[""]},"category":"Technology"}`
  const schema = isShutter ? shutterstockSchema : adobeSchema

  // openai-compatible (e.g. 9Router) — call direct with stream:false
  if (config.provider === 'openai-compatible' || config.provider === 'deepseek') {
    const baseURL = (config.baseURL || 'https://api.openai.com/v1').replace(/\/$/, '')
    const res = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey || ''}`,
      },
      body: JSON.stringify({
        model: config.model,
        stream: false,
        temperature: 0.3,
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Analyze this image and generate optimized ${isShutter ? 'Shutterstock' : 'Adobe Stock'} metadata in 3 languages (en, de, ar). Return ONLY valid JSON matching: ${jsonShape}` },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            ],
          },
        ],
      }),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`Provider error ${res.status}: ${txt.slice(0, 200)}`)
    }
    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content
    if (!content) throw new Error('No content in provider response')
    const cleaned = content.replace(/```json|```/g, '').trim()
    let parsed: any
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      const start = cleaned.indexOf('{')
      const end = cleaned.lastIndexOf('}')
      if (start === -1 || end <= start) throw new Error('Provider did not return JSON. Raw reply: ' + content.slice(0, 120))
      try {
        parsed = JSON.parse(cleaned.slice(start, end + 1))
      } catch {
        throw new Error('Provider returned malformed JSON. Raw reply: ' + content.slice(0, 120))
      }
    }
    const enTitle = parsed?.title?.en || parsed?.title || ''
    const enDesc = parsed?.description?.en || parsed?.body?.en || parsed?.description || ''
    const enKw = parsed?.keywords?.en || parsed?.keywords || []
    const fallback: Record<Lang, string> = { en: enTitle, de: enTitle, ar: enTitle }
    const maxKw = isShutter ? 50 : 45
    const keywords = pickKeywordsBundle(parsed.keywords, { en: pickArray(enKw, []).slice(0, maxKw), de: pickArray(enKw, []).slice(0, maxKw), ar: pickArray(enKw, []).slice(0, maxKw) })
    const kwSliceFn = (r: Record<Lang, string[]>, n: number) => ({ en: r.en.slice(0, n), de: r.de.slice(0, n), ar: r.ar.slice(0, n) })
    const base: StockMetadata = {
      title: pickLangBundle(parsed.title, fallback),
      description: pickLangBundle(parsed.description || parsed.body, { en: enDesc, de: enDesc, ar: enDesc }),
      keywords: kwSliceFn(keywords, maxKw),
    }
    if (isShutter) base.categories = pickCategoryList(parsed.categories || parsed.category, 2)
    else base.category = closestCategory(parsed.category)
    return base
  }

  const model = getModel(config)
  const result = await generateObject({ model, schema, system, messages: [
    { role: 'user', content: [
      { type: 'text', text: `Analyze this image and generate optimized ${isShutter ? 'Shutterstock' : 'Adobe'} metadata in 3 languages (en, de, ar).` },
      { type: 'image', image: new Uint8Array(Buffer.from(imageBase64, 'base64')), mediaType: mimeType },
    ] },
  ] })
  const o = result.object as Record<string, unknown>
  const title = o.title as Record<Lang, string>
  const desc = o.description as Record<Lang, string>
  const kw = o.keywords as Record<Lang, string[]>
  const enTitle = title?.en || ''
  const enDesc = desc?.en || ''
  const out: StockMetadata = {
    title: { en: title.en, de: title.de || enTitle, ar: title.ar || enTitle },
    description: { en: desc.en, de: desc.de || enDesc, ar: desc.ar || enDesc },
    keywords: { en: (kw.en || []).slice(0, isShutter ? 50 : 45), de: (kw.de || []).slice(0, isShutter ? 50 : 45), ar: (kw.ar || []).slice(0, isShutter ? 50 : 45) },
  }
  if (isShutter) out.categories = pickCategoryList(o.categories, 2)
  else out.category = closestCategory(o.category)
  return out
}