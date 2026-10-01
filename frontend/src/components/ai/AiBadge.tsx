import { AiMark } from "@/components/ai/AiMark";

export function AiBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-semibold text-accent-700 ring-1 ring-accent-200">
      <AiMark className="h-3 w-3 text-accent-500" />
      AI
    </span>
  );
}
