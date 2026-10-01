/** The ✦ CaseBridge AI mark. Decorative: meaning comes from adjacent text. */
export function AiMark({ className = "h-4 w-4 text-accent-500", withLabel = false }: { className?: string; withLabel?: boolean }) {
  const icon = (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2c.7 5 2.9 7.3 8 8-5.1.7-7.3 3-8 8-.7-5-2.9-7.3-8-8 5.1-.7 7.3-3 8-8Z" />
      <path d="M19 15c.3 1.9 1.1 2.7 3 3-1.9.3-2.7 1.1-3 3-.3-1.9-1.1-2.7-3-3 1.9-.3 2.7-1.1 3-3Z" opacity="0.7" />
    </svg>
  );
  if (!withLabel) return icon;
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      <span>CaseBridge AI</span>
    </span>
  );
}
