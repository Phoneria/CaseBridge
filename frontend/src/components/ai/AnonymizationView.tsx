"use client";

import { useEffect, useRef, useState } from "react";
import { anonymizeText, type MaskedTextResult } from "@/lib/api";

export function AnonymizationView() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<MaskedTextResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const revision = useRef(0);
  useEffect(() => () => { revision.current++; }, []);

  function change(value: string) {
    revision.current++;
    setText(value); setResult(null); setMessage(""); setBusy(false);
  }
  async function mask() {
    const current = ++revision.current;
    setBusy(true); setMessage(""); setResult(null);
    try {
      const next = await anonymizeText(text);
      if (current === revision.current) setResult(next);
    } catch {
      if (current === revision.current) setMessage("Maskeleme tamamlanamadı. Metni kontrol edip yeniden deneyin.");
    } finally {
      if (current === revision.current) setBusy(false);
    }
  }
  async function copy() {
    if (!result) return;
    const current = revision.current;
    try {
      await navigator.clipboard.writeText(result.text);
      if (current === revision.current) setMessage("Maskelenmiş metin kopyalandı.");
    } catch {
      if (current === revision.current) setMessage("Kopyalama yapılamadı. Sonuç alanındaki metni seçerek kopyalayabilirsiniz.");
    }
  }
  return <section className="mx-auto max-w-6xl space-y-5">
    <header><h1 className="text-2xl font-semibold text-navy-900">Anonimleştirme</h1>
      <p className="mt-2 text-sm text-navy-600">Metindeki kişisel verileri etiketlerle maskeleyin. Metin dış AI sağlayıcısına gönderilmez ve bu araç tarafından kaydedilmez.</p></header>
    <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-navy-800">Otomatik tespit tüm kimlik bilgilerini bulamayabilir. Paylaşmadan önce sonucu inceleyin. Şehir, yer ve bazı kurum adları mevcut politikaya göre metinde kalır.</p>
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-2"><label className="block font-medium text-navy-900" htmlFor="mask-input">Kaynak metin</label>
        <textarea id="mask-input" value={text} onChange={e => change(e.target.value)} maxLength={30000} rows={16} className="w-full rounded-xl border border-navy-200 bg-white p-3 text-sm text-navy-900" aria-describedby="mask-limit" />
        <p id="mask-limit" className="text-xs text-navy-600">{text.length.toLocaleString("tr-TR")} / 30.000 karakter</p>
        <div className="flex flex-wrap gap-3"><button type="button" disabled={busy || !text.trim()} onClick={mask} className="rounded-lg bg-accent-700 px-4 py-2 font-medium text-white disabled:opacity-50">{busy ? "Maskeleniyor…" : "Metni maskele"}</button>
          <button type="button" onClick={() => change("")} className="rounded-lg border border-navy-200 px-4 py-2 text-navy-800">Temizle</button></div>
      </div>
      <div className="space-y-2" aria-busy={busy}><label className="block font-medium text-navy-900" htmlFor="mask-output">Maskelenmiş metin</label>
        <textarea id="mask-output" value={result?.text ?? ""} readOnly rows={16} className="w-full rounded-xl border border-navy-200 bg-white p-3 text-sm text-navy-900" />
        <button type="button" disabled={!result} onClick={copy} className="rounded-lg border border-navy-200 px-4 py-2 text-navy-800 disabled:opacity-50">Sonucu kopyala</button>
      </div>
    </div>
    <p role="status" className="text-sm text-navy-700">{message || (result ? "Maskeleme tamamlandı. Paylaşmadan önce sonucu inceleyin." : "")}</p>
    {result && <div className="rounded-xl border border-navy-200 bg-white p-4 text-sm text-navy-800">
      <p>{result.ner_available ? "Yerel isim tanıma modeli ve kurallar kullanıldı." : "Yerel isim tanıma modeli hazır değil; kurallar ve isim sezgileri kullanıldı."}</p>
      {Object.keys(result.report).length ? <ul className="mt-3 space-y-1">{Object.entries(result.report).map(([kind, row]) => <li key={kind}>{kind}: {row.adet} geçiş, {row.farkli} farklı değer — {row.mod === "maskele" ? "maskelendi" : "işaretlendi, metinde kaldı"}</li>)}</ul> : <p className="mt-3">Tespit edilen veri yok. Bu sonuç metnin kişisel veri içermediği anlamına gelmez.</p>}
    </div>}
  </section>;
}
