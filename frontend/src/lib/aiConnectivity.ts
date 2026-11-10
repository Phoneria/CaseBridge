import type { AIConnectivityCheck } from "@/types";

/** Only curated guidance reaches the UI; provider responses and secrets never do. */
export function connectivityMessage(check: AIConnectivityCheck): string {
  if (check.reachable) return "Bağlantı doğrulandı.";
  const detail = check.detail ?? "";
  if (/mock/i.test(detail)) return "Demo modu açık; gerçek AI bağlantısı etkin değil.";
  if (/anahtar.*tanımlı değil/i.test(detail)) return "AI erişim anahtarı eksik. Yönetici sunucu ayarlarını tamamlamalı.";
  if (/geçersiz/i.test(detail)) return "AI erişim anahtarı doğrulanamadı. Yönetici anahtarı kontrol etmeli.";
  if (/yetki|izin/i.test(detail)) return "AI erişim izni yetersiz. Yönetici proje ve model izinlerini kontrol etmeli.";
  if (/429|kota|limit/i.test(detail)) return "AI hizmetinin kullanım sınırına ulaşıldı. Kullanım ve bakiye kontrol edilmeli.";
  if (/model/i.test(detail)) return "Seçilen AI modeli kullanılamıyor. Yönetici model erişimini kontrol etmeli.";
  if (/tanımlı değil/i.test(detail)) return "AI hizmetinin bağlantı ayarları eksik. Yönetici sunucu ayarlarını tamamlamalı.";
  if (/zaman aşımı/i.test(detail)) return "AI hizmeti zamanında yanıt vermedi. Biraz sonra yeniden kontrol edin.";
  return "AI hizmetine ulaşılamadı. Yeniden deneyin; sorun sürerse yöneticinize bildirin.";
}
