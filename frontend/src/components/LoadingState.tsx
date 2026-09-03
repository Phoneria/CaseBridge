export function LoadingState({ label = "Yükleniyor..." }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-12 text-sm text-navy-500" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent-300 border-t-accent-600" />
      {label}
    </div>
  );
}
