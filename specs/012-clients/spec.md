# Feature Specification: Müvekkiller tablosu ve müvekkil ekranı

**Branch**: feature/clients | **Created**: 2026-11-16 | **Status**: Uygulandı; kullanıcı incelemesi ve yayın bekleniyor

Kaynak tasarım: [2026-11-16-clients-design.md](../../docs/superpowers/specs/2026-11-16-clients-design.md). Uygulama planı: [2026-11-16-clients.md](../../docs/superpowers/plans/2026-11-16-clients.md). İş, 2026-11-22'de benimsenen Spec Kit kapısından önce tasarlandı ve uygulandı. Bu kayıt aynı kapsamı gereksinimlere ve kabul testlerine bağlar, kapsamı genişletmez.

## User Scenarios & Testing

### User Story 1 - Avukat bir müvekkilin bütün davalarını tek yerde görür (P1)
Bugün müvekkil yalnızca taraf üzerindeki `is_client` işaretiyle ve davadaki `client_name` metniyle tutuluyor; aynı müvekkilin davaları birbirine bağlı değil.
**Acceptance**: Müvekkiller listesinden bir müvekkil açılınca iletişim bilgileri, özet sayılar ve davaları (önce açık davalar) görünür; satıra tıklayınca dava açılır.

### User Story 2 - Dava açarken müvekkil listeden seçilir ya da aynı yerden eklenir (P1)
**Acceptance**: Müvekkil işaretli taraf satırında arama kutusu çıkar; öneriden seçim yapılır ya da yazılan adla yeni müvekkil eklenir. Müvekkil seçilmeden dava kaydedilemez. Müvekkil sayfasındaki "Bu müvekkil için yeni dava" formu bu müvekkil seçili açar.

### User Story 3 - Mevcut veriler kayıpsız bağlanır (P1)
**Acceptance**: Geçişten sonra büro içinde aynı normalleştirilmiş ada sahip müvekkil tarafları tek kayda bağlıdır; emsal kararlar bağlanmaz; geri alma veri kaybetmez.

### User Story 4 - Müvekkil bilgileri güvenle yönetilir (P2)
**Acceptance**: Ad değişikliği bağlı taraflara ve davalardaki `client_name` alanına (arşivliler dahil) yansır. Yalnızca büro yöneticisi, yalnızca davası olmayan müvekkili silebilir. Başka büronun müvekkiline hiçbir yoldan erişilemez.

### Edge Cases
- Aynı ada sahip iki farklı kişi aynı büronun müvekkili olabilir; ad anahtarı benzersiz değildir.
- Emsal kararlar (`is_precedent = true`) hiçbir müvekkile bağlanmaz ve sayımlara girmez; emsal olarak yeniden içe aktarılan büro davası bağlantısını kaybeder.
- Başka büronun veya var olmayan `client_id` ile dava kaydı 422 alır ve hiçbir şey yazılmaz.
- Hızlı ekleme başarısız olursa satırda mesaj gösterilir, yazılan ad korunur.
- Çevrimdışı (`alembic upgrade --sql`) SQL üretiminde mevcut satırlar okunamadığı için bağlama adımı yapılmaz; üretilen SQL bunu yorum satırıyla belirtir.

## Requirements
### Functional Requirements
- **FR-001**: Büroya ait bir `clients` tablosu ad/unvan, tür (kişi/şirket), telefon, e-posta, adres ve not tutar; TC kimlik no ve vergi no tutulmaz. Bağlantı `case_parties.client_id` üzerinden kurulur. Emsal olmayan davalarda `is_client = true` olan tarafın `client_id` değeri dolu, `is_client = false` olanınki boştur; bağlı tarafın adı müvekkilin adının kopyasıdır.
- **FR-002**: Müvekkil ad anahtarı boşlukları kırpar ve teke indirir, Türkçe kurala göre küçültür (`I` → `ı`, `İ` → `i`). Migration bu fonksiyonun kendi kopyasını kullanır.
- **FR-003**: Tek bir Alembic migration'ı tabloyu ve sütunu ekler; her büroda emsal olmayan davalardaki müvekkil taraflarını ad anahtarına göre tek kayıtta birleştirir (en sık yazım, eşitlikte en eski tarafın yazımı), bağlı taraf adlarını ve yazımı değişen davaların `client_name` değerini yeniden türetir. Geri alma veri kaybetmez. Main ile birleşince migration zinciri tek head ile biter. Çevrimdışı SQL üretiminde bağlama adımı yapılmaz ve bu, üretilen SQL'de belirtilir.
- **FR-004**: `/clients` API'si oturumdaki büroyla sınırlıdır: ad, telefon ve e-postada arama, ad anahtarına göre sıralama, sayfa başına varsayılan 50 / en çok 200 kayıt, dava ve açık dava sayıları; ekleme ve kısmi güncellemede ad (1–255) ve e-posta doğrulaması; detayda özet sayılar ve davalar (önce açık, sonra sonraki duruşma, sonra açılış tarihi). Başka büronun müvekkili her uçta 404 döner.
- **FR-005**: Ad değişikliği aynı işlemde bağlı tarafların adını ve ilgili davaların `client_name` değerini, arşivli davalarda da, yeniden yazar. Silme yalnızca büro yöneticisine açıktır (diğerleri 403); bağlı tarafı olan müvekkil silinemez (409 "Bu müvekkilin davaları var; silinemez.").
- **FR-006**: Dava API'si taraf yazarken `client_id` kabul eder: aynı büroda bulunmazsa 422 "Seçilen müvekkil bulunamadı." döner; bulunursa taraf müvekkil olarak ve müvekkilin adıyla yazılır. `client_id` gönderilmeyen müvekkil taraf ve yalnızca `client_name` ile açılan dava "bul, yoksa aç" ile bağlanır; müvekkil olmayan taraf `client_id` tutmaz. Taraf yanıtı `client_id` içerir; `GET /cases?client_id=` bu müvekkile bağlı davaları getirir.
- **FR-007**: Emsal kararlar müvekkile bağlanmaz; liste sayıları, detay sayıları, dava listesi ve `client_id` filtresi emsalleri saymaz.
- **FR-008**: Demo verisi, şablon ve içe aktarma tarafları "bul, yoksa aç" ile bağlar; demo müvekkillerin iletişim bilgileri doldurulur, kullanıcının değiştirdiği bilgiler korunur. Demo büro temizliği, büro silinmeden önce o büronun müvekkillerini kaldırır. Müvekkil işlemleri loglara yalnızca müvekkil, büro ve kullanıcı kimlikleriyle yazılır; ad ve iletişim bilgisi loglanmaz.
- **FR-009**: Kenar çubuğunda "Davalar"ın altında **Müvekkiller** (`/muvekkiller`) bulunur. Liste ekranı yazmayı bıraktıktan sonra arar, tür/iletişim/dava sayılarını gösterir, 50'şer kayıtla sayfalar, boş/yükleme/hata durumlarını gösterir; **Yeni müvekkil** formu kaydedince müvekkilin sayfasını açar, hata olursa formu sunucu mesajıyla açık tutar.
- **FR-010**: Müvekkil sayfası iletişim kartını (`tel:`/`mailto:`), özet sayıları ve davaları gösterir; aynı formla yerinde düzenlenir; Sil düğmesi yalnızca yöneticiye görünür ve davası olan müvekkilde pasiftir. "Bu müvekkil için yeni dava" `/davalar/yeni?muvekkil=<id>` açar. Bulunamayan müvekkilde sunucunun mesajı gösterilir.
- **FR-011**: Dava formunda müvekkil işaretli satır `ClientPicker` kullanır: yazdıkça en çok 10 öneri, her zaman "yeni müvekkil ekle" seçeneği, klavye (ok tuşları, Enter, Esc) ve `combobox` erişilebilirliği, seçili müvekkil için değiştirilebilir ve müvekkil sayfasına bağlanan etiket. AI'nın doldurduğu müvekkil adı aramaya yazılı ve öneriler açık gelir. İşaret kaldırılınca bağlantı temizlenir, ad düz metin kalır. Müvekkil seçilmeden kayıt engellenir ("Müvekkili listeden seçin veya yeni ekleyin."); yalnızca müvekkil satırları `client_id` gönderir. Dava sayfasında müvekkil adları müvekkil sayfasına bağlıdır.
- **FR-012**: Uygulama davranışı değiştiği için uygulama sürümü artırılır ve `v.` biçimi korunur (main'in v.0.47 sürümünden sonra v.0.48).

## Success Criteria
- **SC-001**: Bir müvekkilin bütün (emsal olmayan) davaları ve özet sayıları tek sayfadan okunur.
- **SC-002**: Başka büronun müvekkiline okuma, güncelleme, silme ve dava bağlama denemelerinin hepsi reddedilir (404/422) ve veri yazılmaz.
- **SC-003**: Geçiş, eski biçimdeki verilerde beklenen birleşmeleri yapar, emsalleri dışarıda bırakır ve geri alma sonrası taraf adları yerinde kalır.
- **SC-004**: Müvekkil seçilmemiş bir müvekkil satırıyla dava kaydedilemez.

## Assumptions
Kapsam dışı: müvekkil birleştirme, genel aramada müvekkiller, müvekkile özel belge veya not sekmesi. Büroda herkes tüm davaları gördüğü için müvekkil ekleme/düzenleme büronun her kullanıcısına açıktır. Yeni anahtar, kimlik bilgisi veya müşteri teslimi değişikliği yoktur. Yayın öncesinde pilot veritabanının yedeği alınır.
