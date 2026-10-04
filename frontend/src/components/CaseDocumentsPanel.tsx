"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { deleteDocument, downloadDocument } from "@/lib/api";
import { saveBlob } from "@/lib/download";
import { formatDate } from "@/lib/labels";
import { OUTCOME_LABELS, parseDocument, splitMatches, type DocOutcome } from "@/lib/documentParse";
import type { DocumentItem } from "@/types";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";

const OUTCOME_STYLE: Record<Exclude<DocOutcome, null>, string> = {
  bozma: "bg-rose-50 text-rose-700 ring-rose-200",
  onama: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  kaldirma: "bg-amber-50 text-amber-700 ring-amber-200",
  red: "bg-slate-100 text-slate-700 ring-slate-200",
};

const FONT_SIZES = ["text-[13px]", "text-sm", "text-[15px]", "text-base", "text-lg"];

interface Props {
  documents: DocumentItem[];
  uploading: boolean;
  uploadError: string | null;
  onUpload: (file: File) => void;
  onDeleted: (id: string) => void;
}

export function CaseDocumentsPanel({ documents, uploading, uploadError, onUpload, onDeleted }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(documents[0]?.id ?? null);
  const [listFilter, setListFilter] = useState("");
  const [query, setQuery] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);
  const [fontIdx, setFontIdx] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<"download" | "delete" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const viewerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!documents.some((d) => d.id === selectedId)) setSelectedId(documents[0]?.id ?? null);
  }, [documents, selectedId]);

  const parsedById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof parseDocument>>();
    documents.forEach((d) => map.set(d.id, parseDocument(d.extracted_text)));
    return map;
  }, [documents]);

  const selected = documents.find((d) => d.id === selectedId) ?? null;
  const parsed = selected ? parsedById.get(selected.id)! : null;

  const totalMatches = useMemo(() => {
    if (!selected?.extracted_text || !query.trim()) return 0;
    return splitMatches(selected.extracted_text, query).filter((s) => s.match).length;
  }, [selected, query]);

  useEffect(() => {
    setActiveMatch(0);
  }, [query, selectedId]);

  useEffect(() => {
    setConfirmDelete(false);
    setActionError(null);
    setActiveSection(null);
    viewerRef.current?.scrollTo({ top: 0 });
  }, [selectedId]);

  useEffect(() => {
    if (!totalMatches) return;
    const el = viewerRef.current?.querySelector(`[data-match="${activeMatch}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeMatch, totalMatches]);

  const visibleDocs = documents.filter((d) =>
    d.filename.toLocaleLowerCase("tr").includes(listFilter.trim().toLocaleLowerCase("tr")),
  );

  function step(dir: 1 | -1) {
    if (!totalMatches) return;
    setActiveMatch((i) => (i + dir + totalMatches) % totalMatches);
  }

  function jumpTo(id: string) {
    setActiveSection(id);
    const container = viewerRef.current;
    const el = container?.querySelector(`#${id}`) as HTMLElement | null;
    if (container && el) container.scrollTo({ top: el.offsetTop - container.offsetTop - 8, behavior: "smooth" });
  }

  async function handleDownload() {
    if (!selected) return;
    setBusy("download");
    setActionError(null);
    try {
      saveBlob(await downloadDocument(selected.id), selected.filename);
    } catch {
      setActionError("Belge indirilemedi. Lütfen tekrar deneyin.");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (!selected) return;
    setBusy("delete");
    setActionError(null);
    try {
      await deleteDocument(selected.id);
      onDeleted(selected.id);
    } catch {
      setActionError("Belge silinemedi. Lütfen tekrar deneyin.");
    } finally {
      setBusy(null);
      setConfirmDelete(false);
    }
  }

  async function handleCopy() {
    if (!selected?.extracted_text) return;
    try {
      await navigator.clipboard.writeText(selected.extracted_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setActionError("Metin kopyalanamadı.");
    }
  }

  // Running index so each highlighted match gets a stable data-match id.
  let matchCounter = 0;
  function renderText(text: string) {
    return splitMatches(text, query).map((seg, i) => {
      if (!seg.match) return <span key={i}>{seg.text}</span>;
      const idx = matchCounter++;
      return (
        <mark
          key={i}
          data-match={idx}
          className={`rounded px-0.5 ${idx === activeMatch ? "bg-accent-400 text-white" : "bg-amber-200 text-navy-900"}`}
        >
          {seg.text}
        </mark>
      );
    });
  }

  const uploadZone = (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onUpload(file);
      }}
      className={`rounded-xl border border-dashed p-3 text-center transition ${
        dragging ? "border-accent-500 bg-accent-100" : "border-accent-300 bg-accent-50"
      }`}
    >
      <label htmlFor="document-upload" className="block cursor-pointer text-sm font-medium text-accent-700">
        {uploading ? "Yükleniyor..." : "Belge Yükle (PDF, DOCX, TXT)"}
      </label>
      <p className="mt-0.5 text-[11px] text-navy-500">veya dosyayı buraya sürükleyin</p>
      <input
        id="document-upload"
        type="file"
        accept=".pdf,.docx,.txt"
        disabled={uploading}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
    </div>
  );

  if (documents.length === 0) {
    return (
      <div className="space-y-4 rounded-2xl border border-surface-border bg-white p-5 shadow-card">
        {uploadZone}
        {uploadError && <ErrorState message={uploadError} />}
        <EmptyState message="Henüz belge yok." hint="Bu davaya PDF, DOCX veya TXT belge yükleyin." />
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* Left: upload + document list */}
      <aside className="space-y-3 rounded-2xl border border-surface-border bg-white p-4 shadow-card lg:sticky lg:top-4 lg:self-start">
        {uploadZone}
        {uploadError && <ErrorState message={uploadError} />}
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-navy-500">Belgeler</span>
          <span className="rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-medium text-accent-700">{documents.length}</span>
        </div>
        {documents.length > 4 && (
          <input
            type="search"
            aria-label="Belge listesinde ara"
            placeholder="Dosya adı ara..."
            value={listFilter}
            onChange={(e) => setListFilter(e.target.value)}
            className="w-full rounded-lg border border-surface-border px-3 py-1.5 text-sm outline-none focus:border-accent-400"
          />
        )}
        <ul className="max-h-[60vh] space-y-1.5 overflow-y-auto">
          {visibleDocs.map((doc) => {
            const p = parsedById.get(doc.id)!;
            const active = doc.id === selectedId;
            return (
              <li key={doc.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(doc.id)}
                  aria-current={active}
                  className={`flex w-full items-start gap-3 rounded-xl border p-2.5 text-left transition ${
                    active ? "border-accent-300 bg-accent-50" : "border-transparent hover:bg-surface-muted"
                  }`}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-[10px] font-bold uppercase text-accent-700 ring-1 ring-accent-100">
                    {doc.file_type}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-navy-800">{doc.filename}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-navy-500">
                      <span>{formatDate(doc.uploaded_at)}</span>
                      <span>·</span>
                      <span>{p.wordCount.toLocaleString("tr-TR")} kelime</span>
                      {p.outcome && (
                        <span className={`rounded px-1.5 py-px font-semibold ring-1 ${OUTCOME_STYLE[p.outcome]}`}>
                          {OUTCOME_LABELS[p.outcome]}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Right: viewer */}
      {selected && parsed && (
        <section className="min-w-0 rounded-2xl border border-surface-border bg-white shadow-card">
          <header className="space-y-3 border-b border-surface-border p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-navy-900">{selected.filename}</h2>
                <p className="text-xs text-navy-500">
                  {selected.file_type.toUpperCase()} · Yüklendi {formatDate(selected.uploaded_at)} ·{" "}
                  {parsed.wordCount.toLocaleString("tr-TR")} kelime · ~{parsed.readingMinutes} dk okuma
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <ToolButton onClick={handleCopy} disabled={!selected.extracted_text}>
                  {copied ? "Kopyalandı ✓" : "Kopyala"}
                </ToolButton>
                <ToolButton onClick={handleDownload} disabled={busy === "download"}>
                  {busy === "download" ? "İndiriliyor..." : "İndir"}
                </ToolButton>
                {confirmDelete ? (
                  <span className="flex items-center gap-1 rounded-lg bg-rose-50 px-2 py-1 text-xs text-rose-700">
                    Silinsin mi?
                    <button type="button" onClick={handleDelete} disabled={busy === "delete"} className="font-semibold hover:underline">
                      {busy === "delete" ? "Siliniyor..." : "Evet"}
                    </button>
                    <span>/</span>
                    <button type="button" onClick={() => setConfirmDelete(false)} className="hover:underline">
                      Vazgeç
                    </button>
                  </span>
                ) : (
                  <ToolButton onClick={() => setConfirmDelete(true)} danger>
                    Sil
                  </ToolButton>
                )}
              </div>
            </div>

            {(parsed.meta.length > 0 || parsed.outcome || parsed.decisionDate) && (
              <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {parsed.outcome && (
                  <MetaCard label="Sonuç">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ring-1 ${OUTCOME_STYLE[parsed.outcome]}`}>
                      {OUTCOME_LABELS[parsed.outcome]}
                    </span>
                  </MetaCard>
                )}
                {parsed.decisionDate && <MetaCard label="Karar Tarihi">{parsed.decisionDate}</MetaCard>}
                {parsed.meta.map((m, i) => (
                  <MetaCard key={i} label={m.label}>
                    {m.value}
                  </MetaCard>
                ))}
              </dl>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex min-w-[220px] flex-1 items-center gap-1 rounded-lg border border-surface-border px-2 focus-within:border-accent-400">
                <input
                  type="search"
                  aria-label="Belge içinde ara"
                  placeholder="Belge içinde ara..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      step(e.shiftKey ? -1 : 1);
                    }
                  }}
                  className="w-full bg-transparent py-1.5 text-sm outline-none"
                />
                {query.trim() && (
                  <span className="shrink-0 text-[11px] text-navy-500">
                    {totalMatches ? `${activeMatch + 1}/${totalMatches}` : "0 sonuç"}
                  </span>
                )}
                <button type="button" aria-label="Önceki eşleşme" onClick={() => step(-1)} className="px-1 text-navy-500 hover:text-accent-700">
                  ↑
                </button>
                <button type="button" aria-label="Sonraki eşleşme" onClick={() => step(1)} className="px-1 text-navy-500 hover:text-accent-700">
                  ↓
                </button>
              </div>
              <div className="flex items-center rounded-lg border border-surface-border">
                <button
                  type="button"
                  aria-label="Yazıyı küçült"
                  onClick={() => setFontIdx((i) => Math.max(0, i - 1))}
                  className="px-2.5 py-1.5 text-xs text-navy-600 hover:text-accent-700"
                >
                  A−
                </button>
                <button
                  type="button"
                  aria-label="Yazıyı büyüt"
                  onClick={() => setFontIdx((i) => Math.min(FONT_SIZES.length - 1, i + 1))}
                  className="border-l border-surface-border px-2.5 py-1.5 text-sm text-navy-600 hover:text-accent-700"
                >
                  A+
                </button>
              </div>
            </div>
            {actionError && <ErrorState message={actionError} />}
          </header>

          <div className="grid xl:grid-cols-[200px_minmax(0,1fr)]">
            {parsed.sections.length > 0 && (
              <nav aria-label="Bölümler" className="border-b border-surface-border p-4 xl:border-b-0 xl:border-r">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-navy-500">Bölümler</p>
                <ol className="flex gap-1 overflow-x-auto xl:flex-col">
                  {parsed.sections.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => jumpTo(s.id)}
                        className={`w-full whitespace-nowrap rounded-lg px-2 py-1 text-left text-xs transition xl:whitespace-normal ${
                          activeSection === s.id ? "bg-accent-50 font-medium text-accent-700" : "text-navy-600 hover:bg-surface-muted"
                        }`}
                      >
                        {s.title}
                      </button>
                    </li>
                  ))}
                </ol>
              </nav>
            )}

            <div ref={viewerRef} className={`relative max-h-[70vh] overflow-y-auto p-5 leading-relaxed text-navy-800 ${FONT_SIZES[fontIdx]}`}>
              {!selected.extracted_text ? (
                <EmptyState message="Bu belge için metin çıkarılamadı." hint="Dosyayı indirerek görüntüleyebilirsiniz." />
              ) : (
                <article className="max-w-3xl space-y-3">
                  {parsed.preamble.map((line, i) => (
                    <p key={`p${i}`}>{renderText(line)}</p>
                  ))}
                  {parsed.sections.map((s) => (
                    <div key={s.id} id={s.id} className="space-y-2 pt-2">
                      <h3 className="border-l-4 border-accent-400 pl-2 text-sm font-semibold uppercase tracking-wide text-accent-700">
                        {renderText(s.title)}
                      </h3>
                      {s.lines.map((line, i) => (
                        <p key={i}>{renderText(line)}</p>
                      ))}
                    </div>
                  ))}
                </article>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function ToolButton({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border border-surface-border px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
        danger ? "text-rose-600 hover:border-rose-300 hover:bg-rose-50" : "text-navy-700 hover:border-accent-400 hover:text-accent-700"
      }`}
    >
      {children}
    </button>
  );
}

function MetaCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-muted px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-navy-500">{label}</dt>
      <dd className="mt-0.5 truncate text-xs text-navy-800">{children}</dd>
    </div>
  );
}
