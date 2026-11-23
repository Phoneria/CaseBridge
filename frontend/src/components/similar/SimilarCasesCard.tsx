"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { SimilarCaseList } from "@/components/similar/SimilarCaseList";
import { getSimilarCases } from "@/lib/api";
import { AI_ROUTES } from "@/lib/ai";
import { buildHref } from "@/lib/filters";
import type { SimilarCase } from "@/types";

/** "Benzer davalar" on the case detail: the first five same-bureau cases and precedents. */
export function SimilarCasesCard({ caseId }: { caseId: string }) {
  const [items, setItems] = useState<SimilarCase[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setItems(null);
    setFailed(false);
    getSimilarCases(caseId, 5)
      .then((rows) => { if (live) setItems(rows); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [caseId]);

  return (
    <section aria-labelledby="benzer-davalar-baslik" className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="benzer-davalar-baslik" className="text-sm font-semibold text-navy-800">Benzer davalar</h2>
          <p className="mt-0.5 text-xs text-navy-500">Büronuzun davaları ve emsal arşivi; kategori, mahkeme türü, müvekkil rolü, dava değeri ve metin benzerliğine göre.</p>
        </div>
        <Link href={buildHref(AI_ROUTES.similar, { dava: caseId })} className="text-xs font-semibold text-accent-700 hover:underline">
          Tümünü gör
        </Link>
      </div>
      {failed ? (
        <p role="alert" className="text-sm text-navy-700">Benzer davalar yüklenemedi. Sayfayı yenileyip tekrar deneyin.</p>
      ) : items === null ? (
        <p role="status" className="text-sm text-navy-500">Benzer davalar aranıyor…</p>
      ) : (
        <SimilarCaseList
          items={items}
          emptyMessage="Benzer dava bulunamadı."
          emptyHint="Talep ve olay özetini doldurmak eşleşmeyi iyileştirir."
        />
      )}
    </section>
  );
}
