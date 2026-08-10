# MicroStudio

AI microstock metadata optimizer for **Adobe Stock** and **Shutterstock** contributors. Drop a photo — get submission-ready titles, descriptions, ordered keywords (≥35 per platform) and categories in **English, Deutsch & العربية**, then download a per-platform, per-language CSV.

Live at [https://app.microstudio.web.id](https://app.microstudio.web.id).

## Highlights

- **One analysis pass, both platforms** — each image is analyzed once and produces both an Adobe Stock pack _and_ a Shutterstock pack at the same time (no double-upload, ~half the tokens/latency).
- **Blind-see two-stage generation** — a fast vision model describes the image (small output, no truncation), then a text model generates the metadata from that description. Adobe and Shutterstock packs are produced **in parallel**.
- **Model fallback chains** — vision describe and stage-2 generation each try a chain of models (gemma → deepseek → mimo) with a hard per-call timeout, so a slow or rate-limited model never stalls a batch.
- **Batch-always flow** — every upload (1 image or 100) is treated as a batch; CSV is always downloadable.
- **Per-image error isolation + auto-retry** — a failing image is retried 3× and reported by filename with the reason; the rest of the batch still completes.
- **Dual-panel results** — Adobe Stock and Shutterstock metadata side by side, editable (title, description, keywords chips, categories).
- **Per-platform, per-language CSV** — two download buttons (Adobe CSV / Shutterstock CSV), each asking which language (EN / DE / AR) before download.
- **Single-admin auth** — scrypt-hashed password (from env), signed HttpOnly session cookie, brute-force lockout (5 fails / 60s).

## Stack

- Next.js 16 (App Router, Turbopack), React 19, TypeScript
- Prisma 7 + PostgreSQL (provider configs only)
- AI SDK (`ai`) + `@ai-sdk/*` adapters; also raw OpenAI-compatible calls for gateways like [9Router](https://github.com/9router/9router)

## Getting started

```bash
npm install
cp .env.example .env   # then fill in real values
npm run dev
```

Environment variables:

| Var | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Prisma) |
| `ADMIN_USERNAME` | Admin username (default `admin`) |
| `ADMIN_PASSWORD_HASH` | `scrypt` hash, `<salt>:<64-byte-hex>` (see `.env.example`) |
| `ADMIN_SESSION_SECRET` | 64-char random secret signing the session cookie |
| `MICROSTUDIO_TEXT_MODEL` | Override the stage-2 text model (default `oc/deepseek-v4-flash-free`) |
| `MICROSTUDIO_VISION_MODEL` | Override the vision describe model (default `oc/mimo-v2.5-free`) |

The app stores AI provider configs (API key, base URL, model, fallback priority) in the database, managed in the **AI Settings** modal. Analysis auto-picks the first enabled provider by fallback priority.

## Routes

| Route | Description |
|---|---|
| `/` | Marketing landing page |
| `/login` | Admin sign-in |
| `/studio` | The tool (auth-gated) |
| `POST /api/analyze` | Returns `{ adobe, shutterstock }` for an image (auth-gated) |
| `GET/PUT/PATCH /api/providers` | Provider configs |
| `POST /api/models` | List models for a provider |

The `/studio` page and all `/api/*` routes except auth are protected by a route guard (`proxy.ts`) using the signed session cookie.

## Development notes

- This app runs locally or on a self-hosted box; there is no user-account SaaS backend. Admin auth is single-user (the founder).
- `oc/*` models served through an OpenAI-compatible gateway (e.g. 9Router) are **not** exposed in the `/v1/models` list — set a model directly in the DB/API if it's not selectable in the dropdown.
- **Do not run `next build` while users are analyzing on a low-memory server** — a memory-heavy build starves the model gateway and causes gateway timeouts (HTTP 524 through the tunnel).

## Design

Versioned self-contained HTML mockups live in [`design/`](design/), including the dual-panel results + language picker flow (`design/dual-panel-mockup.html`).