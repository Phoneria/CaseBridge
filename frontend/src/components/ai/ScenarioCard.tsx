"use client";

import { useState } from "react";

import type { CourtroomRole, CourtroomScenario } from "@/types";

const DIFFICULTY = {
  beginner: { label: "Başlangıç", className: "bg-emerald-50 text-emerald-700" },
  intermediate: { label: "Orta", className: "bg-amber-50 text-amber-700" },
  advanced: { label: "İleri", className: "bg-rose-50 text-rose-700" },
};

export function ScenarioCard({
  scenario,
  busy,
  onStart,
}: {
  scenario: CourtroomScenario;
  busy: boolean;
  onStart: (role: CourtroomRole) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const difficulty = DIFFICULTY[scenario.difficulty];

  return (
    <article className="flex h-full flex-col rounded-2xl border border-surface-border bg-white p-5 shadow-card">
      <div className="mb-3 flex items-start justify-between gap-3">
        <span className="rounded-full bg-accent-50 px-2.5 py-1 text-xs font-semibold text-accent-700">{scenario.category}</span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${difficulty.className}`}>{difficulty.label}</span>
      </div>
      <h2 className="text-base font-semibold text-navy-900">{scenario.title}</h2>
      <p className="mt-1 text-xs font-medium text-navy-600">
        {scenario.plaintiff_name} <span className="text-navy-400">/</span> {scenario.defendant_name}
      </p>
      <p className="mt-2 flex-1 text-sm leading-6 text-navy-500">{scenario.summary}</p>
      <div className="mt-4 flex items-center gap-4 border-t border-surface-border pt-4 text-xs text-navy-500">
        <span>{scenario.estimated_rounds} aşama</span>
        <button type="button" className="font-medium text-accent-700 hover:text-accent-800" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Detayı gizle" : "Davayı incele"}
        </button>
      </div>
      {expanded && (
        <div className="mt-4 space-y-3 rounded-xl bg-surface-muted p-4 text-xs leading-5 text-navy-600">
          <div>
            <p className="font-semibold text-navy-800">Tartışılacak konular</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {scenario.disputed_issues.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-semibold text-navy-800">Bu çalışmada</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {scenario.learning_objectives.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onStart("plaintiff")}
          className="rounded-xl bg-accent-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-accent-700 disabled:opacity-50"
        >
          {busy ? "Hazırlanıyor…" : "Davacı ol"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onStart("defendant")}
          className="rounded-xl border border-surface-border px-3 py-2.5 text-sm font-semibold text-navy-700 hover:bg-surface-muted disabled:opacity-50"
        >
          Davalı ol
        </button>
      </div>
    </article>
  );
}
