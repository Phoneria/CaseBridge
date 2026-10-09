"use client";

import { useState } from "react";

import { AiBadge } from "@/components/ai/AiBadge";
import { Field, INPUT_CLASS } from "@/components/case-form/Field";
import { DOCUMENT_EXTENSIONS, EVENT_TYPE_LABELS, checkDocumentFile, type SuggestedEvent } from "@/lib/caseIntake";
import { formatDate } from "@/lib/labels";
import type { AppUser } from "@/types";

interface Props {
  nextHearingDate: string;
  ai: ReadonlySet<string>;
  onNextHearingDate: (value: string) => void;
  /** Active lawyers for the admin's "Sorumlu avukat" select; null hides it (lawyers are assigned to themselves). */
  lawyers: Pick<AppUser, "id" | "full_name" | "department">[] | null;
  lawyerId: string;
  lawyerError?: string;
  onLawyer: (id: string) => void;
  files: File[];
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  /** The document the draft was read from (file name or "Yapıştırılan metin"), if any. */
  source: { label: string } | null;
  includeSource: boolean;
  onIncludeSource: (include: boolean) => void;
  events: SuggestedEvent[];
  onToggleEvent: (key: string, checked: boolean) => void;
}

/** "Belgeler ve takip" fields. */
export function FollowUpFields(props: Props) {
  const { files, onAddFiles, onRemoveFile, source, includeSource, onIncludeSource, events, onToggleEvent } = props;
  const [rejections, setRejections] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);

  function addFiles(list: FileList | File[] | null | undefined) {
    const incoming = Array.from(list ?? []);
    if (!incoming.length) return;
    const messages: string[] = [];
    const accepted: File[] = [];
    for (const file of incoming) {
      const problem = checkDocumentFile(file);
      if (problem) messages.push(problem);
      else accepted.push(file);
    }
    setRejections(messages);
    if (accepted.length) onAddFiles(accepted);
  }

  return (
    <div className="space-y-5">
      <div>
        <div
          data-testid="belge-birakma-alani"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer?.files);
          }}
          className={`rounded-xl border-2 border-dashed p-5 text-center text-sm ${dragging ? "border-accent-400 bg-accent-50" : "border-surface-border"}`}
        >
          <p className="text-navy-700">Belgeleri buraya sürükleyip bırakın veya seçin.</p>
          <p className="mt-1 text-xs text-navy-500">pdf, docx veya txt · her biri en fazla 10 MB</p>
          <input
            type="file"
            multiple
            accept={DOCUMENT_EXTENSIONS.join(",")}
            aria-label="Belge ekle"
            className="mt-3 text-xs"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
        {rejections.length > 0 && (
          <div role="alert" className="mt-2 space-y-1 text-xs text-red-600">
            {rejections.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        )}
        {files.length > 0 && (
          <ul aria-label="Eklenecek belgeler" className="mt-3 divide-y divide-surface-border rounded-xl border border-surface-border">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="truncate text-navy-800">{file.name}</span>
                <button
                  type="button"
                  aria-label={`${file.name} dosyasını çıkar`}
                  onClick={() => onRemoveFile(index)}
                  className="text-xs text-navy-500 hover:text-red-600"
                >
                  Çıkar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {source && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-navy-700">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeSource}
              onChange={(e) => onIncludeSource(e.target.checked)}
              className="h-4 w-4 rounded border-surface-border text-accent-600"
            />
            Kaynak belgeyi davaya ekle
          </label>
          <span className="text-xs text-navy-500">({source.label})</span>
        </div>
      )}

      {events.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-navy-800">
            AI olay önerileri <AiBadge />
          </h3>
          <p className="mb-2 text-xs text-navy-500">İşaretli olaylar dava oluşturulunca gelişmeler listesine eklenir.</p>
          <ul aria-label="Önerilen olaylar" className="space-y-1">
            {events.map((event) => (
              <li key={event.key}>
                <label className="flex items-center gap-2 text-sm text-navy-700">
                  <input
                    type="checkbox"
                    checked={event.checked}
                    onChange={(e) => onToggleEvent(event.key, e.target.checked)}
                    className="h-4 w-4 rounded border-surface-border text-accent-600"
                  />
                  {`${formatDate(event.event_date)} · ${EVENT_TYPE_LABELS[event.event_type] ?? event.event_type} · ${event.title}`}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="next_hearing_date" label="Sonraki duruşma tarihi" ai={props.ai.has("next_hearing_date")}>
          {(a11y) => (
            <input {...a11y} type="date" className={INPUT_CLASS} value={props.nextHearingDate} onChange={(e) => props.onNextHearingDate(e.target.value)} />
          )}
        </Field>
        {props.lawyers && (
          <Field id="assigned_lawyer_id" label="Sorumlu avukat" required error={props.lawyerError}>
            {(a11y) => (
              <select {...a11y} className={INPUT_CLASS} value={props.lawyerId} onChange={(e) => props.onLawyer(e.target.value)}>
                <option value="">Avukat seçin</option>
                {props.lawyers!.map((lawyer) => (
                  <option key={lawyer.id} value={lawyer.id}>
                    {lawyer.full_name} · {lawyer.department}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
      </div>
    </div>
  );
}
