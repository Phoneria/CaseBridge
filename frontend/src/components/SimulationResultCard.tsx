import type { AIAnalysisResult } from "@/types";

function BulletList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-navy-500">{title}</p>
      <ul className="space-y-1 text-sm text-navy-700">
        {items.map((item, index) => (
          <li key={index} className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent-400" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

const CONFIDENCE_LABELS: Record<string, string> = {
  low: "Düşük güven",
  medium: "Orta güven",
  high: "Yüksek güven",
};

export function SimulationResultCard({ result }: { result: AIAnalysisResult }) {
  return (
    <div className="space-y-5 rounded-2xl border border-surface-border bg-white p-6 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-600">
            AI Karar Destek Raporu
          </p>
          <p className="mt-1 text-sm text-navy-700">{result.summary}</p>
        </div>
        <div className="shrink-0 rounded-xl bg-accent-50 px-4 py-3 text-center">
          <p className="text-lg font-semibold text-accent-700">
            AI Değerlendirmesi: %{result.assessment.score}
          </p>
          <p className="text-xs text-accent-600">{CONFIDENCE_LABELS[result.assessment.confidence]}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <BulletList title="Güçlü Noktalar" items={result.strong_points} />
        <BulletList title="Zayıf Noktalar" items={result.weak_points} />
        <BulletList title="Karşı Argümanlar" items={result.opposing_arguments} />
        <BulletList title="Eksik Bilgiler" items={result.missing_information} />
        <BulletList title="Olası Senaryolar" items={result.possible_scenarios} />
        <BulletList title="Sorular" items={result.questions} />
        <BulletList title="Önerilen Aksiyonlar" items={result.recommended_actions} />
      </div>

      <p className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-navy-500">
        {result.ai_disclaimer}
      </p>
    </div>
  );
}
