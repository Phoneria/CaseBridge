"use client";

import { useEffect, useState } from "react";
import { ArrowRight, BadgeCheck, BriefcaseBusiness, Check, ChevronRight, FileCheck2, FileLock2, Globe2, Languages, LockKeyhole, MapPin, MessageSquareText, Scale, ShieldCheck, Sparkles, UploadCloud, UserRoundCheck, Users } from "lucide-react";
import { dictionaries, type Locale } from "@/lib/i18n";
import { Button, Disclaimer, Logo } from "@/components/ui";
import { PublicHeader } from "@/components/app-shell";

export function LandingPage() {
  const [locale, setLocale] = useState<Locale>("en");
  useEffect(() => {
    const update = (event?: Event) => {
      const fromEvent = (event as CustomEvent<Locale>)?.detail;
      const saved = localStorage.getItem("casebridge-language") as Locale | null;
      setLocale(fromEvent || saved || "en");
    };
    update();
    window.addEventListener("casebridge-language", update);
    return () => window.removeEventListener("casebridge-language", update);
  }, []);
  const d = dictionaries[locale];
  return (
    <>
      <PublicHeader />
      <main>
        <section className="hero">
          <div className="container hero-grid">
            <div className="hero-copy">
              <div className="eyebrow"><span /><Globe2 size={15} /> {d.hero.eyebrow}</div>
              <h1>{d.hero.title}</h1>
              <p className="hero-lede">{d.hero.text}</p>
              <div className="hero-actions"><Button href="/new-case">{d.hero.primary}<ArrowRight size={17} /></Button><Button href="/sign-in?role=lawyer" variant="secondary">{d.hero.secondary}</Button></div>
              <div className="hero-proof"><span><ShieldCheck size={16} /> Anonymous by default</span><span><BadgeCheck size={16} /> Verified lawyer network</span></div>
            </div>
            <ProductPreview />
          </div>
        </section>

        <section className="trust-strip"><div className="container trust-grid">
          {[[FileLock2, "Secure document handling"], [MapPin, "Jurisdiction-aware analysis"], [UserRoundCheck, "Verified lawyer network"], [LockKeyhole, "User-controlled privacy"], [Languages, "English & Turkish"]].map(([Icon, label]) => <div key={String(label)}><Icon size={20} /><span>{String(label)}</span></div>)}
        </div></section>

        <section className="section" id="how"><div className="container">
          <SectionHead eyebrow="A clearer first step" title="From uncertainty to an organized case" text="CaseBridge helps you prepare before the first lawyer conversation—without claiming to decide your legal outcome." />
          <div className="steps-grid">
            {[
              ["01", "Describe your case", "Answer plain-language questions about what happened, where and when.", MessageSquareText],
              ["02", "Upload your evidence", "Securely add contracts, letters, screenshots, invoices and messages.", UploadCloud],
              ["03", "Receive your report", "Review a structured preliminary assessment, gaps and possible next steps.", FileCheck2],
              ["04", "Connect with lawyers", "Publish anonymously and hear from verified, relevant lawyers.", Users],
            ].map(([n, title, text, Icon], i) => <div className="step-card" key={String(title)}><span className="step-number">{String(n)}</span><div className="step-icon"><Icon size={21} /></div><h3>{String(title)}</h3><p>{String(text)}</p>{i < 3 && <ChevronRight className="step-arrow" />}</div>)}
          </div>
        </div></section>

        <section className="section section-tint" id="cross-border"><div className="container split-section">
          <div><div className="eyebrow">Built for connected jurisdictions</div><h2>Legal problems do not always stop at a border.</h2><p>Start with what you know. CaseBridge organizes country connections, flags possible jurisdiction questions and finds lawyers with the right coverage.</p>
            <div className="jurisdiction-chips">{["Turkey", "Germany", "United Kingdom", "United States", "European Union", "International"].map((x) => <span key={x}>{x}</span>)}</div>
          </div>
          <div className="scope-stack">
            <ScopeCard icon={<MapPin />} title="Local case" text="One primary country and a locally licensed lawyer." example="Employment dispute · Turkey" />
            <ScopeCard icon={<Globe2 />} title="Cross-border case" text="Two or more connected countries with jurisdiction-aware matching." example="Consumer dispute · Turkey + Germany" featured />
            <ScopeCard icon={<Scale />} title="International matter" text="Global commercial, treaty or arbitration questions." example="Software contract · UK + US" />
          </div>
        </div></section>

        <section className="section" id="individuals"><div className="container audience-grid">
          <AudienceCard eyebrow="For individuals · Always free" title="Walk into the conversation prepared." icon={<Sparkles />} items={["Understand possible rights in plain language", "See what evidence may still be missing", "Organize documents and important dates", "Control exactly what lawyers can access"]} action="Start free case analysis" href="/new-case" />
          <AudienceCard eyebrow="For legal professionals" title="Spend less time on initial screening." icon={<BriefcaseBusiness />} items={["Receive structured, qualified case leads", "Filter by jurisdiction and specialization", "Review AI-organized case summaries", "Build trusted cross-border networks"]} action="Explore the lawyer experience" href="/lawyer/marketplace" dark />
        </div></section>

        <section className="section privacy-section"><div className="container privacy-grid">
          <div className="privacy-lock"><LockKeyhole size={34} /><span className="orbit orbit-one" /><span className="orbit orbit-two" /></div>
          <div><div className="eyebrow">Privacy before publicity</div><h2>You decide what lawyers can see.</h2><p>Publish an anonymized summary while your identity, company names and source documents remain private. Document access requires your explicit approval.</p>
            <div className="privacy-list"><span><Check /> Anonymous publishing</span><span><Check /> Encrypted documents</span><span><Check /> Permission history</span><span><Check /> Sensitive-data warnings</span></div>
          </div>
          <div className="visibility-card"><div className="visibility-head"><span>Lawyer visibility preview</span><b>Protected</b></div><div className="redacted"/><div className="redacted short"/><div className="visible-row"><span>Case summary</span><strong>Visible</strong></div><div className="visible-row"><span>Identity</span><strong className="hidden-status">Hidden</strong></div><div className="visible-row"><span>Original documents</span><strong className="hidden-status">Approval needed</strong></div></div>
        </div></section>

        <section className="final-cta"><div className="container"><div><span className="eyebrow light">A better place to begin</span><h2>Your legal problem should not begin with confusion.</h2><p>Organize the facts, understand the open questions and meet the right professional.</p></div><Button href="/new-case" variant="secondary">Start case analysis <ArrowRight size={17} /></Button></div></section>
        <footer className="footer"><div className="container"><Logo /><p>AI-powered legal triage and lawyer matching across jurisdictions.</p><div><a href="/pricing">Pricing</a><a href="/settings">Privacy</a><a href="/sign-in">Demo sign in</a></div></div><div className="container"><Disclaimer compact /></div></footer>
      </main>
    </>
  );
}

function ProductPreview() {
  return <div className="product-preview">
    <div className="preview-top"><div><span className="dot red"/><span className="dot amber"/><span className="dot green"/></div><span>Case workspace · CB-1048</span><span className="secure-label"><LockKeyhole size={12}/> Encrypted</span></div>
    <div className="preview-body"><aside><div className="mini-logo">CB</div>{[0,1,2,3,4].map(x=><i key={x} className={x===1?"selected":""}/>)}</aside>
      <div className="preview-main"><div className="preview-title"><div><small>EMPLOYMENT · TURKEY</small><h3>Unpaid salary & termination</h3></div><span>Report ready</span></div>
        <div className="preview-progress"><span style={{width:"92%"}} /></div>
        <div className="preview-grid"><div className="preview-summary"><b>Preliminary case overview</b><p>The available documents may support unpaid salary and notice-period questions.</p><div className="signal-row"><span><i className="signal good"/>4 supporting files</span><span><i className="signal warn"/>2 items missing</span></div></div>
          <div className="preview-jurisdiction"><small>POSSIBLE JURISDICTION</small><strong><span>TR</span> Turkey</strong><p>Requires lawyer verification</p></div></div>
        <div className="doc-list"><div><FileCheck2/><span><b>Employment contract.pdf</b><small>Relevant · 96%</small></span><Check/></div><div><FileCheck2/><span><b>Termination email.pdf</b><small>Relevant · 91%</small></span><Check/></div></div>
        <div className="match-strip"><div className="avatar-stack"><span>AD</span><span>SK</span><span>JW</span></div><div><b>6 matched lawyers</b><small>Employment · Turkish + English</small></div><button>View matches <ArrowRight size={13}/></button></div>
      </div>
    </div>
  </div>;
}

function SectionHead({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) { return <div className="section-head"><div className="eyebrow">{eyebrow}</div><h2>{title}</h2><p>{text}</p></div>; }
function ScopeCard({ icon, title, text, example, featured }: { icon: React.ReactNode; title: string; text: string; example: string; featured?: boolean }) { return <div className={`scope-card ${featured ? "featured":""}`}><div className="scope-icon">{icon}</div><div><h3>{title}{featured&&<span>Most selected</span>}</h3><p>{text}</p><small>{example}</small></div><ChevronRight/></div>; }
function AudienceCard({ eyebrow, title, icon, items, action, href, dark }: { eyebrow:string;title:string;icon:React.ReactNode;items:string[];action:string;href:string;dark?:boolean}) { return <article className={`audience-card ${dark?"dark":""}`}><div className="audience-icon">{icon}</div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><ul>{items.map(x=><li key={x}><Check/> {x}</li>)}</ul><a href={href}>{action}<ArrowRight/></a></article>; }

export function SignInPage() {
  const [role, setRole] = useState<"individual"|"lawyer">("individual");
  const login = () => { localStorage.setItem("casebridge-role", role); window.location.href = role === "lawyer" ? "/lawyer/dashboard" : "/dashboard"; };
  return <AuthLayout title="Welcome back" text="Continue your case or professional workspace.">
    <div className="role-tabs"><button className={role==="individual"?"active":""} onClick={()=>setRole("individual")}>Individual</button><button className={role==="lawyer"?"active":""} onClick={()=>setRole("lawyer")}>Lawyer</button></div>
    <label>Email<input type="email" defaultValue={role==="lawyer"?"lawyer@casebridge.demo":"user@casebridge.demo"}/></label>
    <label>Password<input type="password" defaultValue="demo123"/></label>
    <div className="form-row"><label className="checkbox"><input type="checkbox"/> Remember me</label><a href="#">Forgot password?</a></div>
    <Button onClick={login} className="full">Sign in to demo <ArrowRight/></Button>
    <div className="demo-box"><Sparkles/><div><strong>Quick demo access</strong><p>No verification or email confirmation required.</p></div><button onClick={login}>Use {role} demo</button></div>
    <p className="auth-foot">New to CaseBridge? <a href="/register">Create an account</a></p>
  </AuthLayout>;
}

export function RegisterPage() {
  const [role, setRole] = useState<"individual"|"lawyer">("individual");
  return <AuthLayout title="Create your CaseBridge account" text="Individuals use CaseBridge free. Lawyers can complete verification later.">
    <div className="account-cards"><button className={role==="individual"?"active":""} onClick={()=>setRole("individual")}><Users/><strong>I need legal help</strong><span>Organize a case and find a lawyer</span></button><button className={role==="lawyer"?"active":""} onClick={()=>setRole("lawyer")}><BriefcaseBusiness/><strong>I am a lawyer</strong><span>Find qualified cases and clients</span></button></div>
    <div className="form-grid"><label>Full name<input placeholder="Your full name"/></label><label>Email<input type="email" placeholder="you@example.com"/></label><label>Country<select><option>Turkey</option><option>Germany</option><option>United Kingdom</option><option>United States</option></select></label><label>Preferred language<select><option>English</option><option>Turkish</option><option>German</option></select></label></div>
    {role==="lawyer"&&<div className="form-grid lawyer-fields"><label>Licensing authority<input placeholder="Bar association"/></label><label>License number<input placeholder="Can be added later"/></label><label>Areas of practice<input placeholder="Employment, contracts..."/></label><label>Languages<input placeholder="English, Turkish..."/></label></div>}
    <label>Password<input type="password" placeholder="At least 8 characters"/></label>
    <label className="checkbox terms"><input type="checkbox"/> I agree to the Terms and acknowledge that CaseBridge does not provide legal advice.</label>
    <Button href={role==="lawyer"?"/lawyer/dashboard":"/dashboard"} className="full">Create demo account <ArrowRight/></Button>
    <p className="auth-foot">Already have an account? <a href="/sign-in">Sign in</a></p>
  </AuthLayout>;
}

export function PricingPage() {
  const plans = [
    { name: "Starter", price: "$49", text: "For building a focused local practice.", items: ["Basic professional profile", "Limited case access", "Standard matching"], action: "Start with Starter" },
    { name: "Professional", price: "$99", text: "For active specialists growing their pipeline.", items: ["More case access", "Advanced jurisdiction filters", "Profile visibility", "AI case summaries", "Case management tools"], action: "Choose Professional", featured: true },
    { name: "International", price: "$199", text: "For cross-border and collaborative practices.", items: ["Cross-border case access", "Multiple jurisdiction profiles", "International collaboration", "Priority matching", "Advanced analytics"], action: "Choose International" },
  ];
  return <><PublicHeader/><main className="pricing-page"><section className="pricing-hero"><div className="container"><BadgeCheck/><span className="eyebrow">Simple prototype pricing</span><h1>Free for individuals.<br/>Built to pay for itself for lawyers.</h1><p>Explore the full CaseBridge demo. Lawyer prices are placeholders for product validation and do not represent a final offer.</p></div></section><section className="container pricing-individual"><div><span className="eyebrow">Individuals</span><h2>Organize your case at no cost.</h2><p>Get from an unclear legal problem to a structured preliminary report and relevant lawyer matches.</p></div><div className="free-plan"><div><strong>Free</strong><span>$0 · no card required</span></div><div>{["AI-assisted case intake","Document organization","Preliminary case report","Lawyer matching","Anonymous case publishing"].map(x=><span key={x}><Check/>{x}</span>)}</div><Button href="/new-case">Analyze my case <ArrowRight/></Button></div></section><section className="container lawyer-pricing"><div className="section-head"><span className="eyebrow">Lawyer subscriptions</span><h2>Choose the reach your practice needs.</h2><p>All prices shown are monthly prototype placeholders.</p></div><div className="pricing-grid">{plans.map(p=><article key={p.name} className={p.featured?"featured":""}>{p.featured&&<span className="popular">Most popular</span>}<h3>{p.name}</h3><p>{p.text}</p><div className="price"><strong>{p.price}</strong><span>/ month<br/><small>prototype price</small></span></div><hr/><ul>{p.items.map(x=><li key={x}><Check/>{x}</li>)}</ul><Button href="/register" variant={p.featured?"primary":"secondary"} className="full">{p.action}</Button></article>)}</div></section><section className="pricing-note container"><ShieldCheck/><div><strong>Prototype terms</strong><p>These plans, limits and prices are illustrative for early product testing. No payment is collected in this prototype.</p></div></section></main><footer className="footer"><div className="container"><Logo/><p>Understand your case. Find the right lawyer.</p></div><div className="container"><Disclaimer compact/></div></footer></>;
}

function AuthLayout({ title, text, children }: { title:string;text:string;children:React.ReactNode }) {
  return <main className="auth-page"><section className="auth-brand-panel"><Logo/><div><div className="eyebrow light">Private legal workspace</div><h1>Clarity begins with the right questions.</h1><p>Organize your case, understand what may matter and choose when to connect with a lawyer.</p><div className="auth-trust"><span><ShieldCheck/>Encrypted documents</span><span><LockKeyhole/>Permission-based access</span><span><Globe2/>Cross-border support</span></div></div><Disclaimer compact/></section><section className="auth-form-panel"><div className="auth-mobile-logo"><Logo/></div><div className="auth-card"><h2>{title}</h2><p>{text}</p>{children}</div></section></main>;
}
