import type { FilterChip } from "@/lib/filters";

export function FilterChips({
  chips,
  onRemove,
  onClear,
  resultCount,
}: {
  chips: FilterChip[];
  onRemove: (key: string) => void;
  onClear: () => void;
  resultCount?: number;
}) {
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" aria-label="Aktif filtreler">
      {chips.map((chip) => (
        <span key={chip.key} className="inline-flex items-center gap-1 rounded-full bg-accent-50 py-1 pl-3 pr-1 font-medium text-accent-700">
          {chip.label}
          <button
            type="button"
            onClick={() => onRemove(chip.key)}
            aria-label={`${chip.label} filtresini kaldır`}
            className="grid h-5 w-5 place-items-center rounded-full hover:bg-accent-100"
          >
            ✕
          </button>
        </span>
      ))}
      <button type="button" onClick={onClear} className="font-medium text-navy-500 underline-offset-2 hover:text-navy-800 hover:underline">
        Filtreleri temizle
      </button>
      {resultCount !== undefined && <span className="ml-auto text-navy-500">{resultCount} sonuç</span>}
    </div>
  );
}

export function NoFilterResults({ onClear }: { onClear: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-surface-border bg-white p-8 text-center text-sm text-navy-500">
      <p>Bu filtrelere uyan kayıt yok.</p>
      <button
        type="button"
        onClick={onClear}
        className="mt-3 rounded-lg border border-surface-border px-3 py-1.5 font-medium text-navy-700 hover:bg-surface-muted"
      >
        Filtreleri temizle
      </button>
    </div>
  );
}
