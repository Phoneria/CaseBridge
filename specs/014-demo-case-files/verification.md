# Dosya paketi doğrulaması

Kullanıcı 22 Kasım 2026 tarihinde 10 ceza ve 10 hukuk dosyasından oluşan planı onayladı. Kurgusal kayıtlar avukatla yapılan bağımsız bir içerik incelemesinden geçmedi.

Yerel entegrasyon testi örnekleri yönetici olarak yükledi, ikinci yüklemede eklenen kayıt sayısının sıfır olduğunu gördü, her dosyanın kapanışını ve belge bağlantılarını denetledi. Her davadan bir karar PDF’i indirildi ve başka bürodan aynı belgeye erişim reddedildi. Kullanıcı belgesi eklenmiş dosya temizlikte korundu. Ayarlar ve ağaç bileşenlerinde 22 test geçti. Son katalog 20 dava için 478 PDF içeriyor.

## Canlı v.0.28

v.0.28 yayına alındı. GitHub doğrulamasında 1117 sunucu ve 773 arayüz testi geçti. Ana daldaki yayımlanan commit c52d2952963a973f902e6d384b25d4cabf563a0f. Genel sürüm bildirimi, sağlık yanıtı, çalışan kod ve yayımlanan ön yüz varlıkları doğrulandı. İzole önceki → yeni → önceki sürüm provası geçti.

Canlı arayüzden yapılan yükleme 20 dava ve 478 evrak bildirdi. Hukuk dosyasında karar ağacından banka dekontunun tam metnine geçildi. Ceza dosyasında KYOK itiraz kararı önizlendi ve indirilen PDF’nin metni doğrulandı.

[GitHub kontrolleri](https://github.com/Phoneria/CaseBridge/actions/runs/45025843927) · [Yayın kaydı](https://github.com/Phoneria/CaseBridge/issues/69)

## v.0.29 yayın adayı

Yerel entegrasyon 20 dosyanın her birinde en az 50 düğüm, kapanışa kadar en az beş aşama, yol yüzdeleri ve belge bağlantılarını sınadı. Chromium ile 57 düğümlü dosyada fareyle üzerine gelme, düğüm seçme, iki yüzde ve dayanak belgesi sekmesine geçiş doğrulandı. Ön yüz testleri 773/773 geçti.

## Kayıtlı sağlayıcı seçimi

Sentetik anahtarlarla OpenAI → Claude → OpenAI geçişleri, bekleyen adayın korunması ve farklı büro ile avukat erişiminin reddi doğrulandı. 21 sunucu anahtar testi, 4 arayüz testi ve TypeScript kontrolü geçti. Kontroller gerçek kullanıcı anahtarı veya kişisel abonelik dosyası içermedi.

## Olasılık ağacı ölçeği

Dokuz ağaç bileşen testi ve TypeScript denetimi geçti. Chromium’da dava sekmesinden ve ana menüdeki ağaçtan aynı dosya açıldı. Bir düğümün ölçülen genişliği %75 ve %125 ayarlarıyla eşleşti. Her iki girişte de düğüm seçili kaldı ve dayanak bağlantısı doğru belge sekmesini açtı.

FR-013: 11 ağaç bileşen testi geçti. Chromium ile dava sekmesinde ve AI menüsünde gerçek tekerlek girdisiyle yüzde 100 → 125 → 100, işaretçinin altında sabit düğüm, gerçekleşen yol etiketi ve ilgili evraka geçiş doğrulandı. Ayrı bir kapalı dosya testinde celse ve kayıp sonucu, iki alternatiften ayrı kaldı.

FR-014: Yerelde 778 arayüz testi, TypeScript denetimi ve Spec Kit doğrulaması geçti. Chromium ölçümünde her iki girişte kökün merkezden dikey sapması 0 pikseldi. Açık dosyanın 22 düğümü ve 18 farklı geçiş yüzdesi vardı. Yeniden yüklemede oranlar birebir eşleşti.
