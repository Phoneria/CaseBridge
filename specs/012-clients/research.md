# Research

## Decision — bağlantı taraf üzerinden
`case_parties.client_id`. Bir davada birden çok müvekkil olabilir. Ayrı `client_cases` ara tablosu aynı bilgiyi ikinci kez tutacağı, yalnız adla eşleştirme ise ad değişince kopacağı için reddedildi. `is_client` uyumluluk için yerinde kalır; bağlı tarafın adı müvekkil adının kopyasıdır. Böylece `client_name` okuyan liste, arama, rapor, duruşma, AI bağlamı ve devir raporu değişmeden çalışır.

## Decision — Türkçe ad anahtarı, benzersiz değil
Boşluk kırpma/teke indirme ve Türkçe küçültme (`I`→`ı`, `İ`→`i`). `(law_firm_id, name_key)` indeksi benzersiz değildir; aynı adlı iki kişi ayrı müvekkil olabilir. "Bul, yoksa aç" eşleşmelerde en eski kaydı seçer.

## Decision — emsaller dışarıda
Emsal davaların tarafları "Davacı (anonim)" gibi adlar taşır; geçiş, içe aktarma ve sayımlar bu davaları dışarıda bırakır.

## Decision — main ile birleşmede merge revision
Clients (c8f2a4e6b0d1) ve büro yönetimi (d8e9f0a1b2c3) migration'ları aynı revision'dan (b9d3e7f1a520) ayrıldığı için iki head oluştu. Clients migration'ını yeniden ebeveynlemek, onu da içeren `feature/audit-log` ile ayrışma ve uygulanmış veritabanlarında yanlış "uygulandı" durumu yaratabilirdi. Repodaki a9c3e5f7b1d4 emsaliyle aynı boş merge revision (eeb771ad79be) seçildi. Main'e sonradan gelen ceza dava türü migration'ı (fa28b1d90311) için aynı yolla 0244bf696c5e eklendi.

## Decision — çevrimdışı SQL üretimi
Main'deki SQL üretimi testi `b9d3e7f1a520:head` aralığını çevrimdışı üretir ve bu aralık artık clients migration'ını içerir. Bağlama adımı mevcut satırları okuduğu için çevrimdışı çalışamaz; bu modda atlanır ve üretilen SQL'e bağlamanın yapılmadığını söyleyen bir yorum yazılır. Çevrimiçi yükseltme değişmez.

## Alternatives
Müvekkil birleştirme, genel aramada müvekkil, müvekkile özel belge/not sekmesi ve kimlik/vergi numarası saklama kapsam dışı bırakıldı. Açık malzeme sorusu yoktur.
