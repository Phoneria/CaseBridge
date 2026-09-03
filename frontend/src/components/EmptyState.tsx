export function EmptyState({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-surface-border bg-surface-muted px-4 py-10 text-center">
      <span className="text-sm font-medium text-navy-700">{message}</span>
      {hint && <span className="text-xs text-navy-500">{hint}</span>}
    </div>
  );
}
