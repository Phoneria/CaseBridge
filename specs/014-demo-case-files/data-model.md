# Önerilen veri ilişkileri

## FeatureContract

Dosya kataloğunda pakete özgü sabit anahtar, ceza/hukuk grubu, dava alt türü, taraf rolleri, uyuşmazlık, maddi olaylar, kronoloji ve kapanış bulunur. Bunlar ürün veri modeline ilişkin mantıksal ilişkilerdir.

Her evrak kendi dosyasını, türünü, düzenleyen tarafı veya kurumu, tarihi, tam metni, ekleri ve dayandığı kayıtları gösterir. Tekrarlanan celseler ayrı evrak kimliği alır. Kapsam tablosu uygulanmış bir aşama için belge, uygulanmamış bir aşama için gerekçe tutar.

Ağaç düğümü kendi dosyasındaki bir olaya ve bir veya daha fazla evraka bağlanır. Gerçekleşme durumu, kapanış sonucu ve hesaplanmamış olasılık ayrı alanlardır. Büroya kopyalanan örneklerin sahipliği ve sürümü izlenir. Görünen dosya adı silme için tek başına yeterli değildir.
