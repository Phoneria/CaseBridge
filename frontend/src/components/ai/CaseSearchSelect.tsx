"use client";

import { useState } from "react";

import type { Case } from "@/types";

export function CaseSearchSelect({
  cases,
  value,
  onChange,
}: {
  cases: Case[];
  value: string | null;
  onChange: (caseId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase("tr-TR");
  const visible = needle
    ? cases.filter((c) =>
        [c.case_name, c.case_number, c.client_name].some((text) => text.toLocaleLowerCase("tr-TR").includes(needle)),
      )
    : cases;
  const selected = cases.find((c) => c.id === value) ?? null;

  return (
    <div className="space-y-2">
      <label htmlFor="ai-case-search" className="block text-xs font-medium text-navy-600">
        Dava ara
      </label>
      <input
        id="ai-case-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Dava adı, numarası veya müvekkil..."
        className="w-full rounded-xl border border-surface-border px-3 py-2 text-sm text-navy-800 outline-none focus:border-accent-400"
      />
      <ul aria-label="Davalar" className="max-h-64 divide-y divide-surface-border overflow-y-auto rounded-xl border border-surface-border">
        {visible.length === 0 ? (
          <li className="px-3 py-2 text-sm text-navy-500">Eşleşen dava yok.</li>
        ) : (
          visible.map((c) => {
            const active = c.id === value;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange(c.id)}
                  className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm transition ${
                    active ? "bg-accent-50 text-accent-800" : "text-navy-800 hover:bg-surface-muted"
                  }`}
                >
                  <span className="font-medium">{c.case_name}</span>
                  <span className="text-xs text-navy-500">
                    {c.case_number} · {c.client_name}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
      {selected && (
        <p className="text-xs text-navy-600">
          Seçili dava: <strong>{selected.case_name}</strong>
        </p>
      )}
    </div>
  );
}
