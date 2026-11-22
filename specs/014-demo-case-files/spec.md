# Dava dosyası örnek paketi

İncelemeye sunulan kapsam ve 20 senaryo [planda](plan.md) yer alır.

## User Scenarios

Avukat seçtiği örneği ilk görüşmeden kapanışa kadar inceler. Raporda bir itirazı değerlendirirken dayanak eki açar. Büro yöneticisi örnek paketi kendi bürosuna yükler ve daha sonra kaldırabilir.

### Functional Requirements

- **FR-001**: Paket tam 10 ceza ve 10 hukuk dosyası içerir.
- **FR-002**: Her dosya kendine özgü olay, kronoloji ve belgeli kapanış içerir.
- **FR-003**: İki evrak listesi kendi dava gruplarında tam kapsanır. Her dosyanın izlediği bütün aşamaların evrakı bulunur.
- **FR-004**: Evrak dizini tam metin önizleme ve PDF indirmeye bağlanır.
- **FR-005**: Ağaçtaki gerçekleşen işlemler ve sonuçlar ilgili dosyanın delillerine bağlanır. Alternatifler açıkça etiketlenir.
- **FR-006**: Büroya özgü yükleme tekrar çalıştırılabilir. Temizlik eski sürüm ve kullanıcı eklerini gözetir.
- **FR-007**: Kurgusal evrak belirgin biçimde işaretlenir. Gerçek emsal kullanılırsa kaynak bağlantısı ayrı tutulur.

- **FR-008**: Her katalog dosyası ilk görüşmeden belgeli sonuca kadar en az beş aşama ve elli anlamlı düğüm sunar. Yalnız katalogda tanımlanan dosyalarda her koşullu geçişin ve o noktaya ulaşmanın varsayımsal yüzdesi görünür. Renkli yollar fare, klavye ve dokunmayla izlenebilir.
- **FR-009**: Dosyalarda taraflar, tarihli işlemler, görevler ve okunabilir tam genişlikte evrak gösterilir. Gösterim bürosunun ekip, müvekkil, finans ve grafik gereksinimleri todo.md içindeki onaylı listeye uyar.
- **FR-010**: Büro yöneticisi OpenAI veya Claude API anahtarını kaydeder, ayrı test ve açık etkinleştirmeyle kendi bürosuna bağlar. Sağlayıcı yetkisi gerektiren hesap bağlantıları gizli değer kabul etmez.

## Success Criteria

20 dosyanın tamamında kronoloji, içerik ve gezinme kontrolleri geçer. Her evrak türünün kapsam tablosunda en az bir açılabilir örneği vardır. Tekrar yükleme, temizleme ve bürolar arası erişim testleri geçer.

- **FR-011**: Ayarlar'da yönetici kaydedilmiş ve etkinleştirilmiş OpenAI veya Claude bağlantısını tekrar anahtar girmeden açıkça seçebilir. Seçim yalnızca kendi bürosuna uygulanır. Test başarısızsa çalışan bağlantı ve bekleyen aday korunur.
