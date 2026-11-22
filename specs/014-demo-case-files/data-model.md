# Önerilen veri ilişkileri

## FeatureContract

Dosya kataloğunda pakete özgü sabit anahtar, ceza/hukuk grubu, dava alt türü, taraf rolleri, uyuşmazlık, maddi olaylar, kronoloji ve kapanış bulunur. Bunlar ürün veri modeline ilişkin mantıksal ilişkilerdir.

Her evrak kendi dosyasını, türünü, düzenleyen tarafı veya kurumu, tarihi, tam metni, ekleri ve dayandığı kayıtları gösterir. Tekrarlanan celseler ayrı evrak kimliği alır. Kapsam tablosu uygulanmış bir aşama için belge, uygulanmamış bir aşama için gerekçe tutar.

Ağaç düğümü kendi dosyasındaki bir olaya ve bir veya daha fazla evraka bağlanır. Gerçekleşme durumu, kapanış sonucu ve hesaplanmamış olasılık ayrı alanlardır. Büroya kopyalanan örneklerin sahipliği ve sürümü izlenir. Görünen dosya adı silme için tek başına yeterli değildir.

Katalogda her dal bir önceki aşamadan geçiş yüzdesi taşır. Kardeşlerin ağırlıkları 100 eder. Kökün ulaşma yüzdesi 100 olup sonraki her adımda önceki yol yüzdesi geçiş yüzdesiyle çarpılır ve 100’e bölünür. Gerçekleşen yol, kurgusal alternatif ve dava evrakı ayrı alanlarda taşınır (FR-008). Uygun taraf ve görev kimlikleri büro ve dosya bazında sabittir (FR-009). Etkin, aday ve önceki gizli değerler ayrı şifreli kayıtlardır (FR-010).

FR-011 kapsamında etkin anahtar büronun varsayılan sağlayıcısını belirler. Her sağlayıcının daha önce etkinleştirilen son anahtarı aynı büro şifresiyle saklanır. Sağlayıcı seçim işlemi bekleyen adayı tüketmez.

FR-013 için görünüm, kaynak yüzdelerine öncelik verir. Sonraki adımı eşit seçme varsayımıyla tamamlanan yüzdeler yalnız bellekte türetilir. Tarihçe dosya kapsamındaki olay, karar tarihi ve sonuç kaydını kullanır.

FR-014 kapsamında temsili paylar ve ek hazırlık düğümleri yalnız görünümde hesaplanır. Büro dosyası ve dal kimlikleri aynı kaldığında paylar sabittir. Ek varsayımlar gerçekleşen yol olarak işaretlenmez.
