/** Turkish labels for the metadata-only audit log (backend app/services/audit.py). */
import { CASE_EVENT_TYPE_LABELS, CASE_OUTCOME_LABELS, CASE_STATUS_LABELS, CASE_TYPE_LABELS } from "@/lib/labels";
import type { AuditEventDetails } from "@/types";

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "case.created": "Dava oluşturuldu",
  "case.updated": "Dava güncellendi",
  "case.parties_changed": "Taraflar değişti",
  "case.lawyer_changed": "Sorumlu avukat değişti",
  "case.closed": "Dava kapatıldı",
  "case.decision_recorded": "Dava sonucu eklendi",
  "case.reopened": "Dava yeniden açıldı",
  "case.archived": "Dava arşivlendi",
  "case.unarchived": "Dava arşivden çıkarıldı",
  "case.handover_created": "Devir notu oluşturuldu",
  "case.precedent_linked": "Emsal bağlandı",
  "case.precedent_unlinked": "Emsal bağı kaldırıldı",
  "case_event.created": "Gelişme / not eklendi",
  "case_event.updated": "Gelişme / not düzenlendi",
  "case_event.deleted": "Gelişme / not silindi",
  "document.uploaded": "Belge yüklendi",
  "document.deleted": "Belge silindi",
  "task.created": "Görev oluşturuldu",
  "task.updated": "Görev güncellendi",
  "calendar_event.created": "Takvim kaydı eklendi",
  "calendar_event.updated": "Takvim kaydı düzenlendi",
  "calendar_event.deleted": "Takvim kaydı silindi",
  "hearing.result_recorded": "Duruşma sonucu girildi",
  "client.created": "Müvekkil eklendi",
  "client.updated": "Müvekkil düzenlendi",
  "client.deleted": "Müvekkil silindi",
  "record.created": "Büro kaydı oluşturuldu",
  "record.updated": "Büro kaydı güncellendi",
  "record.trashed": "Büro kaydı çöpe taşındı",
  "record.restored": "Büro kaydı geri yüklendi",
  "ai.case_intake": "AI ile dava girişi",
  "ai.analysis_started": "AI analizi başlatıldı",
  "ai.analysis_retried": "AI analizi yeniden denendi",
  "ai.courtroom_started": "Duruşma simülasyonu başladı",
  "ai.courtroom_move": "Duruşma simülasyonu hamlesi",
  "ai.courtroom_finished": "Duruşma simülasyonu bitti",
  "ai.courtroom_abandoned": "Duruşma simülasyonu bırakıldı",
  "ai.chat_message": "CaseBridge AI mesajı",
  "ai.chat_feedback": "CaseBridge AI geri bildirimi",
  "ai.counter_analysis": "Karşı taraf analizi",
  "ai.trial_beat": "Hukuk laboratuvarı duruşma adımı",
  "ai.trial_guide": "Hukuk laboratuvarı rehberi",
  "ai.trial_ask": "Hukuk laboratuvarı sorusu",
  "ai.sufle_analysis": "Sufle analizi",
};

/** Filter groups for the action select; every action above appears once. */
export const AUDIT_ACTION_GROUPS: { label: string; prefix: string[] }[] = [
  { label: "Dava", prefix: ["case."] },
  { label: "Dava içeriği", prefix: ["case_event.", "document.", "task.", "calendar_event.", "hearing."] },
  { label: "Müvekkil ve büro kayıtları", prefix: ["client.", "record."] },
  { label: "AI kullanımı", prefix: ["ai."] },
];

export const AUDIT_ROLE_LABELS: Record<string, string> = { admin: "Yönetici", lawyer: "Avukat" };

const FIELD_LABELS: Record<string, string> = {
  address: "adres", all_day: "tüm gün", assigned_lawyer_id: "sorumlu avukat", assigned_to: "atanan", assignee_id: "atanan",
  case_id: "dava", case_name: "dava adı", case_type: "dava türü", case_value: "dava değeri", claim: "talep",
  client_name: "müvekkil", client_role: "müvekkil sıfatı", client_type: "müvekkil tipi", court: "mahkeme",
  court_file_number: "esas no", defendant_position: "davalı tutumu", description: "açıklama", due_date: "son tarih",
  duration_minutes: "süre", email: "e-posta", event_date: "tarih", event_type: "tür", facts_summary: "olaylar",
  location: "yer", name: "ad", next_hearing_date: "sonraki duruşma", notes: "notlar", opening_date: "açılış tarihi",
  opposing_party: "karşı taraf", outcome: "sonuç", phone: "telefon", plaintiff_position: "davacı tutumu",
  priority: "öncelik", reminder_days: "hatırlatma", stage: "aşama", starts_at: "başlangıç", status: "durum",
  title: "başlık",
};

const COUNT_LABELS: Record<string, string> = {
  parties: "taraf", clients: "müvekkil", open_days: "gün açık kaldı", size_kb: "KB", filled_fields: "alan dolduruldu",
  moves: "tur", duration_min: "dk",
};

const TRANSITION_LABELS: Record<string, string> = {
  status: "Durum", outcome: "Sonuç", case_type: "Tür", assigned_lawyer_id: "Sorumlu", client_role: "Müvekkil sıfatı",
  event_type: "Tür", task_status: "Görev",
};

const VALUE_LABELS: Record<string, string> = {
  ...CASE_STATUS_LABELS, ...CASE_OUTCOME_LABELS, ...CASE_TYPE_LABELS, ...CASE_EVENT_TYPE_LABELS,
  pending: "Bekliyor", completed: "Tamamlandı",
  plaintiff: "Davacı", defendant: "Davalı", meeting: "Toplantı", client_meeting: "Müvekkil görüşmesi",
};

const FLAG_LABELS: Record<string, Record<string, string>> = {
  source: { form: "form", ai_intake: "AI ile giriş", client_page: "müvekkil sayfası", text: "metinden", file: "dosyadan",
    scenario: "hazır senaryodan", case: "dava bilgisiyle" },
  file_kind: { pdf: "PDF", docx: "Word", txt: "metin", other: "diğer dosya" },
  text_extracted: { yes: "metin okundu", no: "metin okunamadı" },
  linked_to_case: { yes: "davaya bağlı", no: "davasız" },
  client_type: { person: "gerçek kişi", company: "şirket" },
  feedback: { up: "beğendi", down: "beğenmedi", cleared: "geri aldı" },
  level: { basic: "temel seviye", standard: "standart seviye", deep: "derin seviye" },
  mode: { live: "canlı görüşme", summary: "görüşme özeti" },
  record_kind: { finance: "mali kayıt", time: "zaman kaydı", client: "müvekkil kaydı", communication: "iletişim kaydı",
    lead: "aday kaydı", approval: "onay kaydı", deadline: "süre takibi", checklist: "kontrol listesi", leave: "izin kaydı",
    publication: "müvekkil paylaşımı", support: "destek kaydı" },
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

/** `nameOf` turns a user id into a name when the panel knows it. */
export function describeAuditDetails(details: AuditEventDetails, nameOf: (id: string) => string | null): string[] {
  const value = (field: string, raw: string | null): string => {
    if (raw === null) return "—";
    if (field === "assigned_lawyer_id") return nameOf(raw) ?? "başka kullanıcı";
    return VALUE_LABELS[raw] ?? raw;
  };
  const parts: string[] = [];
  for (const [field, [before, after]] of Object.entries(details.transitions ?? {})) {
    const label = TRANSITION_LABELS[field] ?? field;
    parts.push(before === null ? `${label}: ${value(field, after)}` : `${label}: ${value(field, before)} → ${value(field, after)}`);
  }
  if (details.fields?.length) parts.push(`Değişen: ${details.fields.map((f) => FIELD_LABELS[f] ?? f).join(", ")}`);
  for (const [name, count] of Object.entries(details.counts ?? {})) parts.push(`${count} ${COUNT_LABELS[name] ?? name}`);
  for (const [name, flag] of Object.entries(details.flags ?? {})) parts.push(FLAG_LABELS[name]?.[flag] ?? flag);
  return parts;
}

/** Backend times are naive UTC ending in Z; shown in the browser's time zone. */
export function auditTimeLabel(occurredAt: string): string {
  const date = new Date(occurredAt);
  if (Number.isNaN(date.getTime())) return occurredAt;
  return date.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
