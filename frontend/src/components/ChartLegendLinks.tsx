import Link from "next/link";

export interface LegendLinkItem {
  key: string;
  label: string;
  value: string | number;
  href: string;
  color?: string;
}

/** SVG chart marks are not keyboard-focusable; this legend gives every mark an accessible link twin. */
export function ChartLegendLinks({ items, ariaLabel }: { items: LegendLinkItem[]; ariaLabel: string }) {
  return (
    <ul aria-label={ariaLabel} className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {items.map((item) => (
        <li key={item.key}>
          <Link
            href={item.href}
            className="inline-flex items-center gap-1.5 rounded text-navy-600 hover:text-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
          >
            {item.color && <i aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />}
            {item.label} · {item.value}
          </Link>
        </li>
      ))}
    </ul>
  );
}
