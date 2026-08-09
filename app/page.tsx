"use client"

import Link from "next/link"
import { Logo } from "./components/Logo"
import { Wordmark } from "./components/Wordmark"
import { LangToggle } from "./components/LangToggle"
import { useLang } from "@/lib/i18n"

export default function LandingPage() {
  const { t } = useLang()
  return (
    <main className="landing">
      <nav className="landing-nav">
        <div className="logo">
          <Logo size={40} />
          <div>
            <div><Wordmark size={22} /></div>
            <span className="tagline">Microstock Tag Optimizer</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <LangToggle />
          <Link className="btn" href="/login">{t("signIn")}</Link>
        </div>
      </nav>

      <section className="hero">
        <h1 className="hero-h1">{t("hero1")}<br /><span className="hero-strong">{t("hero2")}</span></h1>
        <p className="hero-sub">{t("heroSub")}</p>
        <div className="hero-cta">
          <Link className="btn primary" href="/login">{t("openStudio")}</Link>
          <span className="hero-note">{t("builtNote")}</span>
        </div>
        <div className="hero-preview">
          <div className="preview-card">
            <div className="preview-top">
              <span className="preview-pill active">Adobe Stock</span>
              <span className="preview-pill">Shutterstock</span>
            </div>
            <div className="preview-body">
              <div className="preview-img">
                <div className="preview-photo">△</div>
              </div>
              <div className="preview-meta">
                <span className="preview-label">{t("titleLabel")} · EN</span>
                <div className="preview-title">Bright coastal landscape at golden hour</div>
                <span className="preview-label">{t("keywordsLabel")}</span>
                <div className="preview-chips">
                  <span className="chip hot">sunset</span>
                  <span className="chip">coast</span>
                  <span className="chip">beach</span>
                  <span className="chip">horizon</span>
                  <span className="chip">warm light</span>
                </div>
                <span className="preview-label">{t("categoryReq")}</span>
                <span className="preview-cat">Travel</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="features">
        <div className="feature">
          <div className="feature-ico">◎</div>
          <h3>{t("fTags")}</h3>
          <p>{t("fTagsD")}</p>
        </div>
        <div className="feature">
          <div className="feature-ico">Aأ</div>
          <h3>{t("fLangs")}</h3>
          <p>{t("fLangsD")}</p>
        </div>
        <div className="feature">
          <div className="feature-ico">⇣</div>
          <h3>{t("fCsv")}</h3>
          <p>{t("fCsvD")}</p>
        </div>
      </section>

      <footer className="landing-footer">
        <span>© 2026 MicroStudio</span>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <LangToggle />
          <Link href="/login">{t("adminSignIn")}</Link>
        </div>
      </footer>
    </main>
  )
}