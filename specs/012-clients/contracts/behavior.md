# HTTP/UI contract

Tüm uçlar kimlik doğrulaması ister ve oturumdaki büroyla sınırlıdır.

- GET /clients?q=&limit=&offset= → ClientListItem[]; q ad anahtarında normalleştirilmiş, telefon/e-postada büyük-küçük harf duyarsız arar; ad anahtarına göre sıralı; limit varsayılan 50, 1–200.
- POST /clients → 201 Client. Kırpılmış ad 1–255 zorunlu; boş e-posta None, dolu e-posta biçim kontrolünden geçer; telefon ≤50; hata 422.
- GET /clients/{id} → ClientDetailOut; davalar önce açık, sonra sonraki duruşma (boşlar sonda), sonra açılış tarihi (yeniden eskiye).
- PATCH /clients/{id} → Client; kısmi; ad null olamaz; ad değişince bağlı taraflar ve davaların client_name değeri aynı işlemde, arşivlilerde de yeniden yazılır.
- DELETE /clients/{id} → 204; yönetici olmayan 403; bağlı taraf varsa 409 "Bu müvekkilin davaları var; silinemez."
- Başka büronun veya var olmayan müvekkil: GET/PATCH/DELETE 404.
- Dava yazımı: CasePartyIn.client_id; başka büroda/yoksa 422 "Seçilen müvekkil bulunamadı." ve hiçbir şey yazılmaz. is_client=true ve client_id yoksa bul-yoksa-aç; is_client=false ise client_id None. CasePartyOut.client_id. GET /cases?client_id= emsal olmayan bağlı davalar.

UI: /muvekkiller liste (gecikmeli arama, 50'şer sayfa, boş/yükleme/hata, Yeni müvekkil formu → detay); /muvekkiller/[id] detay (iletişim, sayılar, davalar, yerinde düzenleme, yalnız yöneticiye Sil, davası varsa pasif, yeni dava bağlantısı); dava formunda combobox müvekkil seçici (≤10 öneri, yeni ekleme, klavye, Esc çevreleyen diyaloğa ulaşmaz, hata alana bağlı), seçilmeden kayıt yok; /davalar/yeni?muvekkil=<id> ilk satırı seçili açar; dava sayfasında müvekkil adı müvekkil sayfasına bağlantıdır.
