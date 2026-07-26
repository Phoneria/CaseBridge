"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Bell, BriefcaseBusiness, ChevronDown, FileText, Globe2, LayoutDashboard, LogOut, Menu, MessageSquare, Search, Settings, Sparkles, Users, X } from "lucide-react";
import { dictionaries, type Locale } from "@/lib/i18n";
import { Logo } from "./ui";

export function PublicHeader() {
  const [locale, setLocale] = useState<Locale>("en");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("casebridge-language") as Locale | null;
    if (saved === "tr" || saved === "en") setLocale(saved);
  }, []);
  const switchLocale = (next: Locale) => { setLocale(next); localStorage.setItem("casebridge-language", next); window.dispatchEvent(new CustomEvent("casebridge-language", { detail: next })); };
  const d = dictionaries[locale].nav;
  return (
    <header className="public-header">
      <div className="container nav-wrap">
        <Logo />
        <nav className={open ? "open" : ""} aria-label="Main navigation">
          <a href="/#how">{d.how}</a><a href="/#individuals">{d.individuals}</a><a href="/#lawyers">{d.lawyers}</a>
          <a href="/#cross-border">{d.cross}</a><a href="/pricing">{d.pricing}</a>
        </nav>
        <div className="nav-actions">
          <div className="language-control"><Globe2 size={16} /><button onClick={() => switchLocale(locale === "en" ? "tr" : "en")}>{locale.toUpperCase()}</button></div>
          <a className="signin-link" href="/sign-in">{d.signin}</a>
          <a className="button button-primary nav-cta" href="/register">{d.start}</a>
          <button className="menu-button" aria-label="Toggle menu" onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
        </div>
      </div>
    </header>
  );
}

const userLinks = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/new-case", label: "New case", icon: Sparkles },
  { href: "/report", label: "Case reports", icon: FileText },
  { href: "/messages", label: "Messages", icon: MessageSquare, count: 3 },
  { href: "/settings", label: "Settings", icon: Settings },
];
const lawyerLinks = [
  { href: "/lawyer/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/lawyer/marketplace", label: "Case marketplace", icon: Search, count: 12 },
  { href: "/lawyer/dashboard#offers", label: "My offers", icon: BriefcaseBusiness },
  { href: "/messages", label: "Messages", icon: MessageSquare, count: 2 },
  { href: "/lawyer/profile", label: "Profile", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children, role = "individual", active }: { children: ReactNode; role?: "individual" | "lawyer"; active: string }) {
  const [sidebar, setSidebar] = useState(false);
  const links = role === "lawyer" ? lawyerLinks : userLinks;
  return (
    <div className="app-layout">
      <aside className={`app-sidebar ${sidebar ? "open" : ""}`}>
        <div className="sidebar-brand"><Logo /><button onClick={() => setSidebar(false)} aria-label="Close menu"><X size={20} /></button></div>
        <div className="workspace-switch"><span className="avatar">{role === "lawyer" ? "AD" : "EA"}</span><div><strong>{role === "lawyer" ? "Aylin Demir" : "Elif Arslan"}</strong><small>{role === "lawyer" ? "Verified lawyer" : "Individual workspace"}</small></div><ChevronDown size={16} /></div>
        <nav className="side-nav" aria-label={`${role} navigation`}>
          <span className="side-label">Workspace</span>
          {links.map(({ href, label, icon: Icon, count }) => <a key={label} href={href} className={active === label ? "active" : ""}><Icon size={18} /><span>{label}</span>{count && <b>{count}</b>}</a>)}
        </nav>
        <div className="sidebar-secure"><ShieldBlock /><div><strong>Private workspace</strong><small>Documents encrypted</small></div></div>
        <a className="logout-link" href="/"><LogOut size={17} /> Exit demo</a>
      </aside>
      <div className="app-content">
        <header className="app-topbar">
          <button className="mobile-side-toggle" onClick={() => setSidebar(true)} aria-label="Open menu"><Menu /></button>
          <div className="global-search"><Search size={17} /><input aria-label="Search CaseBridge" placeholder="Search cases, reports or lawyers..." /></div>
          <div className="top-actions"><span className="sync-status"><span /> All changes saved</span><button className="icon-button" aria-label="Notifications"><Bell size={19} /><i /></button><span className="avatar">{role === "lawyer" ? "AD" : "EA"}</span></div>
        </header>
        <main className="app-main">{children}</main>
        <nav className="mobile-bottom" aria-label="Mobile navigation">{links.slice(0, 4).map(({ href, label, icon: Icon }) => <a key={label} href={href} className={active === label ? "active" : ""}><Icon size={20} /><span>{label.split(" ")[0]}</span></a>)}</nav>
      </div>
    </div>
  );
}

function ShieldBlock() {
  return <div className="shield-block"><span /><span /></div>;
}
