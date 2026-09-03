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
  ongoing: "Devam Ediyor",
  won: "Kazanıldı",
  lost: "Kaybedildi",
  settled: "Uzlaşma",
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
