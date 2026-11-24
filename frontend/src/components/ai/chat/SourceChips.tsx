"use client";

import Link from "next/link";

import type { ChatSource } from "@/types";

const SOURCE_ICONS: Record<ChatSource["kind"], string> = {
  case: "⚖",
  document: "📄",
  precedent: "📚",
  client: "👤",
  calendar: "📅",
};

/** The records a CaseBridge AI answer used, as links into the app. */
export function SourceChips({ sources, onNavigate }: { sources: ChatSource[]; onNavigate?: () => void }) {
  if (sources.length === 0) return null;
  return (
    <ul aria-label="Kaynaklar" className="mt-2 flex flex-wrap gap-1.5">
      {sources.map((source) => (
        <li key={`${source.kind}:${source.id}`} className="max-w-full">
          <Link
            href={source.href}
            onClick={onNavigate}
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-accent-200 bg-accent-50 px-2.5 py-1 text-xs font-medium text-accent-800 hover:bg-accent-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
          >
            <span aria-hidden="true">{SOURCE_ICONS[source.kind] ?? "•"}</span>
            <span className="truncate">{source.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
