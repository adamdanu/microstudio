"use client"

import Link from "next/link"
import { Sparkles, Languages, Download } from "lucide-react"
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
          <Link className="btn nav-signin" href="/login">{t("signIn")}</Link>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-inner">
          <h1 className="hero-h1">{t("hero1")}<br /><span className="hero-strong">{t("hero2")}</span></h1>
          <p className="hero-sub">{t("heroSub")}</p>
          <div className="hero-cta">
            <Link className="btn primary" href="/login">{t("openStudio")}</Link>
            <span className="hero-note">{t("builtNote")}</span>
          </div>
        </div>
      </section>

      <section className="features">
        <div className="feature">
          <div className="feature-ico"><Sparkles size={20} /></div>
          <h3>{t("fTags")}</h3>
          <p>{t("fTagsD")}</p>
        </div>
        <div className="feature">
          <div className="feature-ico"><Languages size={20} /></div>
          <h3>{t("fLangs")}</h3>
          <p>{t("fLangsD")}</p>
        </div>
        <div className="feature">
          <div className="feature-ico"><Download size={20} /></div>
          <h3>{t("fCsv")}</h3>
          <p>{t("fCsvD")}</p>
        </div>
      </section>

      <footer className="landing-footer">
        <span>© 2026 MicroStudio</span>
      </footer>

      <div className="landing-mobile-cta">
        <Link className="btn primary" href="/login">{t("signIn")}</Link>
      </div>
    </main>
  )
}