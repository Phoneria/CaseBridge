"use client";

import Link from "next/link";
import { cloneElement, isValidElement, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import { ModalFrame } from "@/components/ModalFrame";
import { userMessage } from "@/lib/userMessages";
import { BUTTON, CARD, FINANCE_LABELS, INPUT, KIND_LABELS, KIND_STATES, SECONDARY, STATE_LABELS, localDate, mgmt, type AccessGrant, type ChecklistStep, type DataValue, type ManagementRecord, type RecordKind, type RecordWrite } from "@/lib/management";
import type { Case, DocumentWithCase, ManagedUser } from "@/types";

export interface RecordContext { cases: Case[]; users: ManagedUser[]; documents: DocumentWithCase[]; records: ManagementRecord[]; grants: AccessGrant[] }

function defaults(kind: RecordKind): Record<string, DataValue> {
  const today = localDate();
  const bodies: Record<RecordKind, Record<string, DataValue>> = {
    finance: {entry_type:"fee",amount:"",currency:"TRY",entry_date:today,note:""},
    time: {work_date:today,minutes:60,hourly_cost:"0",currency:"TRY",note:""},
    client: {case_ids:[],email:null,phone:"",company:"",contact_date:null,next_contact_date:null,note:""},
    communication: {client_id:"",contact_date:today,channel:"meeting",promise:"",note:""},
    lead: {client_name:"",opposing_party:"",email:null,waiting_reason:"",conflict_decision:"pending",conflict_reason:"",note:""},
    approval: {document_id:null,revision:1,content:"",review_note:""},
    deadline: {source:"",backup_id:"",verified:false,reminder_days: [7,3,1,0] as unknown as DataValue,note:""},
    checklist: {template:"custom",items:[{title:"",done:false,depends_on:null}],note:""},
    leave: {starts_on:today,ends_on:today,backup_id:"",note:""},
    publication: {audience_ids:[],document_ids:[],message:"",request:"",appointment:null,financial_summary:""},
    support: {priority:"normal",contact_name:"",note:""},
  };
  return bodies[kind];
}

export function Field({label, children}: {label: string; children: ReactNode}) {
  const id=useId();
  return <div><label htmlFor={id} className="block text-xs font-medium text-navy-600">{label}</label>{isValidElement(children)?cloneElement(children as ReactElement<{id?:string}>,{id}):children}</div>;
}

const TEMPLATES: Record<string, string[]> = {
  opening:["Taraf bilgilerini doğrula", "Çıkar çatışması kontrolünü değerlendir", "Vekâlet ve sözleşmeyi kontrol et", "Belgeleri topla", "Sorumluyu ve kritik süreleri belirle"],
  hearing:["Dosyadaki son gelişmeleri incele", "Delil ve belgeleri kontrol et", "Beyan ve soruları hazırla", "Müvekkili bilgilendir", "Duruşma sonucunu kaydet"],
  closing:["Karar ve sonuç bilgisini doğrula", "Devam eden süreleri kontrol et", "Müvekkili bilgilendir", "Ücret ve masraf bakiyesini kontrol et", "Dosya teslimi ve arşivlemeyi tamamla"],
};

export function RecordEditor({kind, row, context, onClose, onSaved, base}: {kind: RecordKind; row?: ManagementRecord; context: RecordContext; onClose: () => void; onSaved: () => Promise<void>; base?: string}) {
  const [body, setBody] = useState<RecordWrite>(() => row ? {kind:row.kind,title:row.title,status:row.status,case_id:row.case_id,owner_id:row.owner_id,due_date:row.due_date,data:{...row.data},version:row.version} : {kind,title:"",status:KIND_STATES[kind][0],case_id:null,owner_id:null,due_date:null,data:defaults(kind)});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [conflict, setConflict] = useState<Awaited<ReturnType<typeof mgmt.conflicts>> | null>(null);
  const [checking, setChecking] = useState(false);
  const [query, setQuery] = useState("");
  const activeUsers = context.users.filter(u => u.status === "active" && !context.grants.some(g => g.user_id === u.id && g.position === "client"));
  const docs = context.documents.filter(d => d.case_id === body.case_id);
  const clients = context.grants.filter(g => g.position === "client" && !!body.case_id && g.case_ids.includes(body.case_id));
  const data = body.data;
  function value(key: string) { return String(data[key] ?? ""); }
  function update(key: string, val: DataValue) { setBody(b => ({...b,data:{...b.data,[key]:val,...(kind === "deadline" && key === "source" ? {verified:false} : {})}})); }
  function text(key: string, label: string, required = false, type = "text", nullable = false) {
    return <Field label={label}><input className={INPUT} type={type} required={required} value={value(key)} onChange={e => update(key, nullable && !e.target.value ? null : e.target.value)} /></Field>;
  }
  function note(key: string, label: string, required = false) {
    return <Field label={label}><textarea className={INPUT} rows={3} required={required} maxLength={10000} value={value(key)} onChange={e => update(key,e.target.value)} /></Field>;
  }
  function select(key: string, label: string, options: Record<string,string>, nullable = false) {
    return <Field label={label}><select className={INPUT} value={value(key)} onChange={e => update(key,nullable && !e.target.value ? null : e.target.value)}>{nullable && <option value="">Seçilmedi</option>}{Object.entries(options).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></Field>;
  }
  function backup() { return select("backup_id","Yedek sorumlu *",Object.fromEntries([["","Kişi seçin"], ...activeUsers.filter(u=>u.id!==body.owner_id).map(u=>[u.id,u.full_name]) ])); }
  function currency() { return select("currency","Para birimi",{TRY:"Türk lirası",USD:"ABD doları",EUR:"Euro"}); }
  function moneyInput(key:string,label:string,required=true) { return <Field label={label}><input type="number" min={key==="amount"?"0.01":"0"} max="999999999999.99" step="0.01" required={required} className={INPUT} value={value(key)} onChange={e=>update(key,e.target.value)} /></Field>; }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      await mgmt.save(body,row?.id,base);
      await onSaved(); onClose();
    } catch (err) { setError(userMessage(err,"Kayıt kaydedilemedi.")); }
    finally { lock.current=false; setBusy(false); }
  }
  async function searchConflicts() {
    if (query.trim().length < 3) return setError("Taraf kontrolü için en az üç karakter yazın.");
    setChecking(true); setError(null);
    try { setConflict(await mgmt.conflicts(query)); } catch(err) { setError(userMessage(err,"Taraf kontrolü yapılamadı.")); }
    finally { setChecking(false); }
  }

  const steps = (data.items ?? []) as ChecklistStep[];
  function stepChange(index:number, patch:Partial<ChecklistStep>) {
    const next=steps.map((s,i)=>i===index?{...s,...patch}:{...s});
    if(patch.done===false) for(let i=index+1;i<next.length;i++) {
      const dependency=next[i].depends_on;
      if(dependency!==null&&!next[dependency].done) next[i].done=false;
    }
    update("items",next);
  }
  const requiredCase = ["finance","time","approval","deadline","checklist","publication"].includes(kind);
  return <ModalFrame title={`${row ? "Kaydı düzenle" : "Yeni kayıt"} · ${KIND_LABELS[kind]}`} onClose={onClose} busy={busy} wide>
    <form onSubmit={save} className="space-y-4">
      <Field label={kind === "client" ? "Müvekkil adı *" : "Başlık *"}><input className={INPUT} required maxLength={255} value={body.title} onChange={e=>setBody({...body,title:e.target.value})}/></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        {kind !== "support" && <Field label={`Dava${requiredCase?" *":""}`}><select className={INPUT} required={requiredCase} value={body.case_id??""} onChange={e=>setBody({...body,case_id:e.target.value||null,data:{...body.data,...(kind==="approval"?{document_id:null}:{}),...(kind==="publication"?{document_ids:[],audience_ids:[]}: {})}})}><option value="">Dava seçin</option>{context.cases.filter(c=>!c.is_archived||c.id===body.case_id).map(c=><option value={c.id} key={c.id}>{c.case_number} · {c.case_name}</option>)}</select></Field>}
        {kind !== "support" && <Field label={`Sorumlu${["time","leave","approval","deadline"].includes(kind)?" *":""}`}><select className={INPUT} required={["time","leave","approval","deadline"].includes(kind)} value={body.owner_id??""} onChange={e=>setBody({...body,owner_id:e.target.value||null})}><option value="">Sorumlu seçin</option>{activeUsers.map(u=><option key={u.id} value={u.id}>{u.full_name}</option>)}</select></Field>}
        <Field label="Durum"><select className={INPUT} value={body.status} onChange={e=>setBody({...body,status:e.target.value})}>{KIND_STATES[kind].filter(s=>row || !["approval","deadline"].includes(kind) || s===KIND_STATES[kind][0]).map(s=><option key={s} value={s}>{STATE_LABELS[s]}</option>)}</select></Field>
        <Field label={kind==="deadline"?"Son tarih *":"Takip tarihi"}><input type="date" className={INPUT} required={kind==="deadline"} value={body.due_date??""} onChange={e=>setBody({...body,due_date:e.target.value||null,data:kind==="deadline"?{...body.data,verified:false}:body.data})}/></Field>
      </div>

      {kind==="finance" && <><div className="grid gap-4 sm:grid-cols-2">{select("entry_type","İşlem türü",FINANCE_LABELS)}{moneyInput("amount","Tutar *")}{currency()}{text("entry_date","İşlem tarihi *",true,"date")}</div><p className="text-xs leading-5 text-navy-500">Dava değeri mali kayıt sayılmaz. Ücret, tahsilat, büro masrafı ve müvekkil avansı ayrı izlenir. Avanstan ödenen masrafı ikinci kez büro masrafı olarak kaydetmeyin.</p></>}
      {kind==="time" && <div className="grid gap-4 sm:grid-cols-2">{text("work_date","Çalışma tarihi *",true,"date")}<Field label="Süre (dakika) *"><input className={INPUT} type="number" min={1} max={1440} required value={value("minutes")} onChange={e=>update("minutes",Number(e.target.value))}/></Field>{moneyInput("hourly_cost","Saatlik iç maliyet *")}{currency()}</div>}
      {kind==="client" && <div className="grid gap-4 sm:grid-cols-2">{text("email","E-posta",false,"email",true)}{text("phone","Telefon")}{text("company","Şirket")}{text("contact_date","Son iletişim tarihi",false,"date",true)}{text("next_contact_date","Sonraki iletişim",false,"date",true)}<fieldset className="sm:col-span-2"><legend className="text-xs text-navy-600">Müvekkilin dosyaları</legend>{context.cases.map(c=><label key={c.id} className="mt-2 flex gap-2 text-sm text-navy-700"><input type="checkbox" checked={((data.case_ids??[]) as string[]).includes(c.id)} onChange={e=>update("case_ids",e.target.checked?[...((data.case_ids??[]) as string[]),c.id]:((data.case_ids??[]) as string[]).filter(id=>id!==c.id))}/>{c.case_number} · {c.case_name}</label>)}</fieldset></div>}
      {kind==="communication" && <><div className="grid gap-4 sm:grid-cols-2">{select("client_id","Müvekkil *",Object.fromEntries([["","Müvekkil seçin"],...context.records.filter(r=>r.kind==="client").map(r=>[r.id,r.title])]))}{text("contact_date","Görüşme tarihi *",true,"date")}{select("channel","Kanal",{phone:"Telefon",email:"E-posta",meeting:"Görüşme",other:"Diğer"})}</div>{note("promise","Verilen söz / sonraki adım")}</>}
      {kind==="lead" && <><div className="grid gap-4 sm:grid-cols-2">{text("client_name","Başvuran / müvekkil *",true)}{text("opposing_party","Karşı taraf")}{text("email","E-posta",false,"email",true)}{text("waiting_reason","Bekleme nedeni")}</div><div className="rounded-xl border border-accent-200 bg-accent-50 p-4"><p className="text-sm font-semibold text-navy-800">Taraf kontrolü</p><p className="mt-1 text-xs text-navy-600">Müvekkil ve karşı taraf adlarını ayrı ayrı arayın; benzerlikler avukat değerlendirmesi gerektirir.</p><div className="mt-3 flex flex-wrap gap-2"><input className={`${INPUT} min-w-0 flex-1`} aria-label="Taraf adı ara" value={query} onChange={e=>setQuery(e.target.value)} /><button type="button" className={SECONDARY} disabled={checking} onClick={searchConflicts}>{checking?"Aranıyor…":"Kayıtlarda ara"}</button></div>{conflict && <div className="mt-3 space-y-2 text-xs">{conflict.matches.length?conflict.matches.map((m,i)=><Link key={i} href={`/davalar/${m.case_id}`} className="block rounded-lg bg-white p-2 text-accent-800">{m.name} · {m.is_client?"Müvekkil":"Diğer taraf"} · {m.case_name}</Link>):<p>Eşleşen kayıt bulunamadı.</p>}<p>{conflict.notice}</p></div>}</div>{select("conflict_decision","Avukat değerlendirmesi",{pending:"Henüz değerlendirilmedi",clear:"İşleme devam edilebilir",blocked:"İşleme devam edilmemeli"})}{note("conflict_reason","Değerlendirme gerekçesi")}{<Link href="/davalar/yeni" className="inline-block text-sm font-medium text-accent-700 hover:underline">Yeni dava oluştur →</Link>}<p className="text-xs text-navy-500">Dava oluşturulduktan sonra bu kayda bağlayıp “Dava açıldı” aşamasını seçin.</p></>}
      {kind==="approval" && <>{select("document_id","İncelenecek belge",Object.fromEntries(docs.map(d=>[d.id,d.filename])),true)}{note("content","İncelenecek taslak / açıklama",true)}{note("review_note","İnceleyici notu")}<p className="text-xs text-navy-500">Sürüm {value("revision")} · İnceleyici, sorumlu olarak seçilen kişidir. İncelemedeki içerik sabittir; onaylanan sürüm değiştirilemez.</p></>}
      {kind==="deadline" && <>{text("source","Sürenin dayanağı *",true)}{backup()}<label className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><input type="checkbox" className="mt-1" checked={!!data.verified} onChange={e=>update("verified",e.target.checked)}/>Süre dayanağını ve son tarihi kontrol ettim.</label><Field label="Hatırlatma günleri (son tarihten önce)"><input className={INPUT} value={((data.reminder_days??[]) as unknown as number[]).join(", ")} onChange={e=>update("reminder_days",e.target.value.split(",").map(x=>Number(x.trim())).filter(x=>Number.isInteger(x)&&x>=0&&x<=365) as unknown as DataValue)}/></Field><p className="text-xs text-navy-500">Doğrulanan süreler için sorumluya ve yedeğine hatırlatma gönderilir. Geciken tamamlanmamış süreler yöneticilere bildirilir. E-posta için büro bildirim servisinin açık olması gerekir.</p></>}
      {kind==="checklist" && <>{<Field label="Şablon"><select className={INPUT} value={value("template")} onChange={e=>setBody(b=>({...b,data:{...b.data,template:e.target.value,items:(TEMPLATES[e.target.value]??[""]).map((title,index)=>({title,done:false,depends_on:index?index-1:null}))}}))}><option value="custom">Özel liste</option><option value="opening">Dosya açılışı</option><option value="hearing">Duruşma hazırlığı</option><option value="closing">Dosya kapanışı</option></select></Field>}<div className="space-y-3">{steps.map((step,index)=><div key={index} className="rounded-xl border border-surface-border p-3"><div className="flex gap-2"><input aria-label={`${index+1}. adım tamamlandı`} type="checkbox" className="mt-4" checked={step.done} disabled={step.depends_on!==null&&!steps[step.depends_on]?.done} onChange={e=>stepChange(index,{done:e.target.checked})}/><input aria-label={`${index+1}. adım başlığı`} required className={INPUT} value={step.title} onChange={e=>stepChange(index,{title:e.target.value})}/></div><Field label={`${index+1}. adımın ön koşulu`}><select className={INPUT} value={step.depends_on??""} onChange={e=>stepChange(index,{depends_on:e.target.value===""?null:Number(e.target.value),done:false})}><option value="">Ön koşul yok</option>{steps.slice(0,index).map((s,i)=><option key={i} value={i}>{i+1}. {s.title}</option>)}</select></Field></div>)}</div><button className={SECONDARY} type="button" onClick={()=>update("items",[...steps,{title:"",done:false,depends_on:null}])}>Adım ekle</button></>}
      {kind==="leave" && <><div className="grid gap-4 sm:grid-cols-2">{text("starts_on","Başlangıç *",true,"date")}{text("ends_on","Bitiş *",true,"date")}</div>{backup()}<p className="text-xs text-navy-500">İzin onayı dosya sahipliğini otomatik değiştirmez. Ekip ekranındaki “İşleri devret” akışıyla işi gözden geçirip açıkça devredebilirsiniz.</p></>}
      {kind==="publication" && <><p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">Yayımlandığında seçtiğiniz alıcılar bu mesajı ve seçili belgeleri portalda görebilir. İç notlar ve seçilmeyen belgeler paylaşılmaz.</p><fieldset><legend className="text-xs font-medium text-navy-600">Alıcılar *</legend>{clients.length?clients.map(g=><label key={g.user_id} className="mt-2 flex gap-2 text-sm"><input type="checkbox" checked={(data.audience_ids as string[]).includes(g.user_id)} onChange={e=>update("audience_ids",e.target.checked?[...(data.audience_ids as string[]),g.user_id]:(data.audience_ids as string[]).filter(id=>id!==g.user_id))}/>{context.users.find(u=>u.id===g.user_id)?.full_name??"Müvekkil"}</label>):<p className="mt-2 text-xs text-navy-500">Önce Erişim sekmesinden bu davaya bir müvekkil hesabı davet edin.</p>}</fieldset>{note("message","Müvekkile durum mesajı",true)}{note("request","İstenen belge / yapılacak iş")}{text("appointment","Randevu tarihi",false,"date",true)}{note("financial_summary","Paylaşılacak mali özet")}<fieldset><legend className="text-xs font-medium text-navy-600">Paylaşılacak belgeler</legend>{docs.map(d=><label className="mt-2 flex gap-2 text-sm" key={d.id}><input type="checkbox" checked={(data.document_ids as string[]).includes(d.id)} onChange={e=>update("document_ids",e.target.checked?[...(data.document_ids as string[]),d.id]:(data.document_ids as string[]).filter(id=>id!==d.id))}/>{d.filename}</label>)}</fieldset></>}
      {kind==="support" && <>{select("priority","Öncelik",{low:"Düşük",normal:"Normal",high:"Yüksek",urgent:"Acil"})}{text("contact_name","İrtibat / takip sorumlusu")}</>}
      {!["approval","publication"].includes(kind) && note("note","Not")}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-surface-border pt-4"><button type="button" disabled={busy} className={SECONDARY} onClick={onClose}>Vazgeç</button><button className={BUTTON} disabled={busy} type="submit">{busy?"Kaydediliyor…":kind==="publication"&&body.status==="published"?"Kaydet ve yayımla":"Kaydet"}</button></div>
    </form>
  </ModalFrame>;
}
