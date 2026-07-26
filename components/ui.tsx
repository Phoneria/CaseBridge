"use client";

import type { ReactNode } from "react";
import { Check, ChevronRight, Globe2, ShieldCheck } from "lucide-react";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <a className="logo" href="/" aria-label="CaseBridge home">
      <span className="logo-mark"><span /></span>
      {!compact && <span>CaseBridge</span>}
    </a>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "amber" | "red" | "blue" | "teal" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Button({ children, href, variant = "primary", type = "button", onClick, disabled, className = "" }: {
  children: ReactNode; href?: string; variant?: "primary" | "secondary" | "ghost" | "danger"; type?: "button" | "submit";
  onClick?: () => void; disabled?: boolean; className?: string;
}) {
  const classes = `button button-${variant} ${className}`;
  if (href) return <a href={href} className={classes}>{children}</a>;
  return <button type={type} onClick={onClick} disabled={disabled} className={classes}>{children}</button>;
}

export function Progress({ value }: { value: number }) {
  return <div className="progress" aria-label={`${value}% complete`}><span style={{ width: `${value}%` }} /></div>;
}

export function PageTitle({ eyebrow, title, text, action }: { eyebrow?: string; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="page-title">
      <div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{text && <p>{text}</p>}</div>
      {action}
    </div>
  );
}

export function Disclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`disclaimer ${compact ? "compact" : ""}`}>
      <ShieldCheck size={19} />
      <p><strong>Preliminary information only.</strong> CaseBridge does not replace a lawyer or provide definitive legal advice. A licensed lawyer must verify conclusions, deadlines and jurisdiction.</p>
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><Globe2 size={24} /></div><h3>{title}</h3><p>{text}</p>{action}</div>;
}

export function StepPill({ number, label, active, complete }: { number: number; label: string; active?: boolean; complete?: boolean }) {
  return <div className={`step-pill ${active ? "active" : ""} ${complete ? "complete" : ""}`}><span>{complete ? <Check size={13} /> : number}</span><em>{label}</em><ChevronRight size={14} /></div>;
}
