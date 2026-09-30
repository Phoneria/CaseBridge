import Link from "next/link";

const CARD = "rounded-2xl border border-surface-border bg-white p-5 shadow-card";

export function StatCard({
  label,
  value,
  accent = false,
  href,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  href?: string;
}) {
  const content = (
    <>
      <p className="text-sm text-navy-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${accent ? "text-accent-600" : "text-navy-900"}`}>{value}</p>
    </>
  );

  if (!href) return <div className={CARD}>{content}</div>;

  return (
    <Link
      href={href}
      className={`group relative block ${CARD} transition hover:border-accent-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400`}
    >
      {content}
      <span
        aria-hidden="true"
        className="absolute right-4 top-4 text-accent-500 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        →
      </span>
    </Link>
  );
}
