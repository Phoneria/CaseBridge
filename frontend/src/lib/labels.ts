import type { CaseEventType } from "@/types";

export const CASE_TYPE_LABELS: Record<string, string> = {
  is_hukuku: "İş Hukuku",
  ticaret_hukuku: "Ticaret Hukuku",
  sozlesme: "Sözleşme",
  kira: "Kira",
  icra: "İcra",
  diger: "Diğer",
};

export const CASE_STATUS_LABELS: Record<string, string> = {
  devam_eden: "Devam Eden",
  durusma_bekleyen: "Duruşma Bekleyen",
  karar_bekleyen: "Karar Bekleyen",
  kapali: "Kapalı",
};

export const CASE_OUTCOME_LABELS: Record<string, string> = {
  ongoing: "Devam ediyor",
  won: "Kazanıldı",
  lost: "Kaybedildi",
  settled: "Sulh",
};

export const SIMULATION_STATUS_LABELS: Record<string, string> = {
  pending: "Bekliyor",
  running: "Çalışıyor",
  completed: "Tamamlandı",
  failed: "Başarısız",
};

export function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("tr-TR");
}

export const CASE_EVENT_TYPE_LABELS: Record<CaseEventType, string> = {
  filing: "Dava açılışı / dilekçe",
  submission: "Beyan / cevap",
  expert_report: "Bilirkişi raporu",
  legal_update: "Mevzuat / içtihat gelişmesi",
  other: "Diğer",
  hearing: "Duruşma",
  note: "Not",
};

/** Types offered in the Gelişmeler form. Notes come from the Notlar tab; hearings from the calendar. */
export const TIMELINE_FORM_TYPES: CaseEventType[] = ["filing", "submission", "expert_report", "legal_update", "other"];
