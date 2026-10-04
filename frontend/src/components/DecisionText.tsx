type DecisionBlock =
  | { kind: "heading"; text: string }
  | { kind: "metadata"; label: string; value: string }
  | { kind: "numbered"; number: string; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "paragraph"; text: string };

function parseDecisionText(text: string): DecisionBlock[] {
  return text.replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const heading = line.match(/^(?:#{1,4}\s*)?((?:[IVXLC]+\.\s+)?[A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜ\s/&()'.-]{1,89})$/u);
    if (heading) return { kind: "heading", text: heading[1].trim() };

    const metadata = line.match(/^([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜ\s/().-]{1,39})\s*:\s*(.+)$/u);
    if (metadata) return { kind: "metadata", label: metadata[1].trim(), value: metadata[2].trim() };

    const numbered = line.match(/^(\d{1,3})[.)]\s+(.+)$/u);
    if (numbered) return { kind: "numbered", number: numbered[1], text: numbered[2] };

    const bullet = line.match(/^[-•]\s+(.+)$/u);
    if (bullet) return { kind: "bullet", text: bullet[1] };

    return { kind: "paragraph", text: line };
  });
}

export function DecisionText({ text }: { text: string }) {
  const blocks = parseDecisionText(text);
  if (blocks.length === 0) return <p className="text-sm text-navy-500">Bu kaydın okunabilir metni bulunmuyor.</p>;

  return <div className="space-y-4 break-words text-[15px] leading-8 text-navy-800">
    {blocks.map((block, index) => {
      if (block.kind === "heading") return <h4 key={index} className="mt-8 border-b border-surface-border pb-2 text-base font-bold tracking-wide text-navy-900 first:mt-0">{block.text}</h4>;
      if (block.kind === "metadata") return <div key={index} className="grid gap-1 border-l-2 border-accent-300 bg-accent-50/60 px-4 py-2 sm:grid-cols-[150px_1fr]">
        <span className="text-xs font-semibold uppercase tracking-wide text-navy-500">{block.label}</span>
        <span className="font-medium text-navy-800">{block.value}</span>
      </div>;
      if (block.kind === "numbered") return <div key={index} className="flex gap-3">
        <span className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-50 text-xs font-bold leading-none text-accent-700">{block.number}</span>
        <p>{block.text}</p>
      </div>;
      if (block.kind === "bullet") return <div key={index} className="flex gap-3"><span aria-hidden="true" className="text-accent-600">•</span><p>{block.text}</p></div>;
      return <p key={index}>{block.text}</p>;
    })}
  </div>;
}
