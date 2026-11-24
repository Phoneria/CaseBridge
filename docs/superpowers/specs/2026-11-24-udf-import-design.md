# UDF (UYAP Doküman Formatı) İçe Aktarma — Tasarım

- **Tarih:** 2026-11-24
- **Dal:** `feature/udf-import` (`main` `1186165` üzerinden)
- **Durum:** Onaylandı
- **Boyut:** Küçük değişiklik

## 1. Amaç

UYAP'tan indirilen evrak `.udf` biçiminde geliyor. CaseBridge bugün yalnızca PDF, DOCX ve TXT kabul ettiği için avukat önce dosyayı çevirmek zorunda kalıyor. Bu iş, belge kabul eden her yerde `.udf` dosyalarını da kabul eder ve dosyanın metnini çıkarır. Böylece Dosya Analizi, Canlı Duruşma, AI ile doldurma ve gizlilik aracı UYAP evrakıyla doğrudan çalışabilir. Bu iş, UYAP entegrasyonunun ilk ve risksiz aşamasıdır (proje notu: `claude/arastirma-uyap-entegrasyonu.md`).

## 2. Kararlar

| Konu | Karar |
|---|---|
| Kapsam | `.udf` şu yerlerde kabul edilir: dava belgeleri paneli, dava kapatılırken eklenen "Karar belgesi", AI ile doldurma (`IntakeFillBox`, `FollowUpFields`), gizlilik aracı ve CLI içe aktarma (`import_cases`). |
| Metnin kaynağı | `content.xml` dosyasındaki `<template><content>` bloğunun CDATA içeriği. Başlık, altbilgi ve tablo hücrelerinin metni de bu bloğun içindedir; `<elements>` yalnızca bu metne konum ve uzunlukla işaret eder. Satır sonları `\n` olarak tekleştirilir. |
| Biçim | Yalnızca düz metin alınır. Kalın yazı, hizalama ve tablo yapısı korunmaz; tablo hücrelerinin metni sırayla gelir. |
| Orijinal dosya | Olduğu gibi saklanır ve indirilir. `.udf` uzantısı korunur, media type `application/octet-stream` olur. `sign.sgn` (e-imza) ve `documentproperties.xml` okunmaz, doğrulanmaz, değiştirilmez. |
| Bağımlılık | Yeni kütüphane eklenmez; Python'un kendi `zipfile` ve `ElementTree` modülleri kullanılır. |
| Kapsam dışı | UDF oluşturma ve dışa aktarma; görüntüleyicide biçimli gösterim; yalnızca görüntü içeren (taranmış) UDF'ler için OCR; e-imza doğrulama; doğrulama kodu gibi üst verilerin okunması; uzun evrakın AI bağlamında 6000 karakterde kesilmesi (ayrı bir iş). |

## 3. Yaklaşımlar

- **A. Kendi küçük okuyucumuz (seçilen):** ZIP'i açar, `content.xml`'i okur, CDATA metnini alır. Gizlilik aracının bugün DOCX için uyguladığı güvenlik sınırlarını aynen kullanır. Yaklaşık bir modül tutarında bir iş ve dışarıya bağımlılık getirmiyor.
- **B. `udf-tools` (PyPI, 0.1.0):** okuma fonksiyonu yazılmamış (`load()` içinde TODO duruyor); ayrıca `lxml` bağımlılığı getiriyor.
- **C. `udfpdf` (npm, 2.0.0):** okumayı doğru yapıyor (metni A ile aynı bloktan alıyor). Ancak Python backend'in yanında ayrı bir Node.js servisi çalıştırmayı gerektiriyor; bu ihtiyaç için fazla.

Kullanıcı seçenek 1'i (yalnızca içe aktarma) seçti ve nasıl yapılacağını bize bıraktı. Mantıklı tek yol A olduğu için onu seçtik.

## 4. Okuyucu

- Tek bir modül hem `text_extraction.extract_text` hem de `privacy/files.extract_document` tarafından kullanılır.
- **Geçerli UDF:** ZIP arşivi olmalı, `content.xml` içermeli ve kök öğesi `template` olmalı.
- **Sınırlar** (gizlilik aracının DOCX kurallarıyla aynı):
  - en fazla 512 öğe;
  - açılmış toplam boyut en fazla 16 MB;
  - şifreli öğe veya yinelenen öğe adı reddedilir;
  - XML içinde `DOCTYPE` reddedilir.
- **Boş metin:** "okunabilir metin yok" olarak ele alınır. Bu durum genellikle taranmış bir UDF demektir.
- **Kayıt (log) kuralı:** hata mesajlarına ve kayıtlara belge içeriği yazılmaz (projedeki mevcut kural).

## 5. Davranış

- **Dava belgesi ve karar belgesi** (`DocumentService.upload`): bugünkü kural geçerli. Yükleme başarılı olur; metin çıkarılamazsa (bozuk ya da taranmış UDF) `extracted_text` `NULL` kalır. Bozuk bir PDF bugün nasıl ele alınıyorsa öyle. *(Bizim kararımız.)*
- **AI ile doldurma:** metin yoksa mevcut 422 "Bu belgeden metin çıkarılamadı…" mesajı döner.
- **Gizlilik aracı:**
  - ZIP içinde `word/document.xml` yoksa ve `content.xml` varsa dosya UDF sayılır ve `format: "udf"` döner.
  - Her UDF için sabit bir uyarı gösterilir: tablolar düz metin olarak alındı, görseller ve biçimlendirme okunmadı.
  - 5 MB ve 30.000 karakter sınırları aynen geçerli.
  - Okuma bugünkü gibi ayrı (izole) işçi süreçte yapılır.
- **CLI içe aktarma:** `.udf` uzantısı tanınır.
- **Yükleme sınırları:** değişmez (genel 10 MB, gizlilik aracı 5 MB).

## 6. Veri

- `DocumentType.UDF = "udf"`.
- Migration: PostgreSQL'de `ALTER TYPE documenttype ADD VALUE IF NOT EXISTS 'udf'`. Downgrade hiçbir şey yapmaz; `fa28b1d90311_criminal_case_type` ile aynı desen.

## 7. Arayüz

- Dosya seçicilerin `accept` listelerine `.udf` eklenir (`CaseDocumentsPanel`, `CaseCloseModal`, `DOCUMENT_EXTENSIONS`).
- Metinler güncellenir:
  - "Belge Yükle (PDF, DOCX, TXT, UDF)";
  - "pdf, docx, txt veya udf";
  - boş liste ipucu;
  - `caseIntake.ts` içindeki desteklenmeyen tür mesajı;
  - gizlilik aracının açıklama ve hata metinleri.
- Türler güncellenir: `DocumentItem.file_type`, `filters.ts` içindeki `DOCUMENT_TYPES` ve `ExtractedPrivacyText.format` listelerine `udf` eklenir.
- Belge listesindeki tür rozeti "UDF" gösterir; bugünkü `doc.file_type` gösterimi değişmeden kullanılır.

## 8. Test

- **Backend birim testleri:** UDF dosyaları testin içinde üretilir. Kapsanacak durumlar:
  - Türkçe karakterler;
  - başlık ve altbilgi;
  - tablo;
  - imzalı dosya (`sign.sgn` var);
  - `\r\n` satır sonları;
  - `content.xml` yok;
  - ZIP değil;
  - kök öğe `template` değil;
  - `DOCTYPE` var;
  - 512'den fazla öğe;
  - açılmış boyut sınırı aşılıyor;
  - boş metin.
- **API testleri:**
  - dava belgesine `.udf` yükleme: tür `udf`, metin çıkarılmış, indirilen bayt orijinalle aynı, `.udf` adı korunmuş;
  - bozuk `.udf` metinsiz kaydediliyor;
  - `case-intake/extract` (başarılı ve 422);
  - `privacy/extract-text` (izole işçi üzerinden);
  - CLI içe aktarma.
- **Migration:** SQLite'ta hiçbir şey yapmadığı; mevcut migration test deseni kullanılır.
- **Frontend:** `accept` listeleri, metinler, belge filtresi, gizlilik aracındaki `udf` biçimi.
- **Gerçek UYAP örnekleri:** sağlanırsa anonimleştirilmiş test verisi (fixture) olarak eklenir.

## 9. Uygulayıcıya kalanlar

- Okuyucu modülünün yeri ve adı.
- Boşluk normalizasyonunun ayrıntısı (sekme karakterleri, art arda boş satırlar).
- Kullanıcıya gösterilecek mesajların son metni.

## 10. Ek (2026-11-24): "Belgeden doldur"da okunan metin

- **İstek:** Yeni dava formundaki "Belgeden doldur" kutusunda yüklenen dosyanın metni, dava kaydedilmeden görülebilsin. Bu ek yalnızca UDF için değil, tüm dosya türleri için geçerli.
- **Seçilen yol (kullanıcı onayladı):** Metin, "Doldur"dan sonra kutunun altında kapalı başlayan, açılıp kapanabilen bir bölümde gösterilir: "Belgeden okunan metin (dosya adı)". Bölümün yüksekliği sınırlı, içi kaydırılabilir ve klavyeyle odaklanılabilir.
- **API:** `/case-intake/extract` yanıtına `source_text` eklenir. Bu alan, AI'ın okuduğu metnin birebir aynısıdır, yani uzun belgelerde ilk `case_intake_max_chars` (30.000) karakter. Belge uzunsa bölümde şu not gösterilir: "Belge uzun olduğu için yalnızca AI'ın okuduğu ilk kısım gösteriliyor." *(Bizim kararımız: tam metni göndermek 10 MB'lık bir belgede yanıtı gereksiz yere büyütür.)*
- **Yapıştırılan metin:** Bölüm gösterilmez, çünkü metin zaten ekranda. *(Bizim kararımız.)*
- **Bölümün kaybolduğu durumlar:** yeni bir dosya seçilince, sekme değiştirilince, yeniden doldurulunca ve "Değiştir" sorusunda "Vazgeç" denince.
- **Kapsam dışı:** "Doldur"dan önce, dosya seçilir seçilmez önizleme (ayrı bir okuma isteği gerektirir); belgenin aslı gibi biçimli gösterim.
