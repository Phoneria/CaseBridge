export function StatCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
      <p className="text-sm text-navy-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${accent ? "text-accent-600" : "text-navy-900"}`}>
        {value}
      </p>
    </div>
  );
}
