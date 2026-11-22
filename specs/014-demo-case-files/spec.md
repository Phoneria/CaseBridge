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

- **FR-008**: Her katalog dosyası ilk görüşmeden belgeli sonuca kadar en az beş aşama ve elli anlamlı düğüm sunar. Katalogda tanımlanan dosyalarda her koşullu geçişin ve o noktaya ulaşmanın varsayımsal yüzdesi görünür. Renkli yollar fare, klavye ve dokunmayla izlenebilir.
- **FR-009**: Dosyalarda taraflar, tarihli işlemler, görevler ve okunabilir tam genişlikte evrak gösterilir. Gösterim bürosunun ekip, müvekkil, finans ve grafik gereksinimleri todo.md içindeki onaylı listeye uyar.
- **FR-010**: Büro yöneticisi OpenAI veya Claude API anahtarını kaydeder, ayrı test ve açık etkinleştirmeyle kendi bürosuna bağlar. Sağlayıcı yetkisi gerektiren hesap bağlantıları gizli değer kabul etmez.

## Success Criteria

20 dosyanın tamamında kronoloji, içerik ve gezinme kontrolleri geçer. Her evrak türünün kapsam tablosunda en az bir açılabilir örneği vardır. Tekrar yükleme, temizleme ve bürolar arası erişim testleri geçer.

- **FR-011**: Ayarlar'da yönetici kaydedilmiş ve etkinleştirilmiş OpenAI veya Claude bağlantısını tekrar anahtar girmeden açıkça seçebilir. Seçim yalnızca kendi bürosuna uygulanır. Test başarısızsa çalışan bağlantı ve bekleyen aday korunur.

- **FR-012**: Dava ekranındaki ve ana menüdeki olasılık ağacının ölçeği değiştirilebilir. Seçili düğüm, yüzdeler ve belge bağlantıları korunur.

- **FR-013**: Her iki ağaçta tekerlek ve izleme dörtgeni işaretçi çevresinde ölçekler. Tüm dosyalarda olası adımlarda koşullu ve birikimli senaryo yüzdeleri görünür. Kapanışta doğrulanmış geçmiş kalıcı renk ve metin ile ayırt edilir.

- **FR-014**: Açılışta kök görünür alanın dikey merkezindedir. Her dava ağacı en az 20 düğüm sunar. Eksik koşullu oranlara dosya ve dala özgü kararlı rastgele sunum payları verilir. Kardeş payları yüzde 100 eder. Kaynak oranları ve gerçek dosya geçmişi ayrı tutulur.

- **FR-015**: Oklar, düğüm kartları, metin görünümü ve sonraki adım bağlantıları hedefe kökten ulaşma olasılığını gösterir. Seçili düğümün ayrıntısında son koşullu geçiş ayrıca etiketlenir. Kayıtlı geçmişte varsayımsal oran icat edilmez.

- **FR-016**: Her dava ağacı 20–100 düğüm içerir. Bu aralık FR-008’deki eski katalog alt sınırının yerini alır. Her yaprak dosyanın talebine ve izlenen dalın bulgusuna bağlı gerekçeli karardır. Tüm yapraklar aynı son sütunda görünür. Varsayımsal dal ve kayıtlı kapanış ayrı gösterilir.

- **FR-017**: Kayıtlı analizde tarafların uzlaşması senaryosu varsa anlaşmanın doğrulandığı dal sulh veya uzlaştırmaya uygun sonuçla biter. Anlaşma sağlanmayan dalda esas uyuşmazlık değerlendirilir.

- **FR-018**: Yirmi katalog dosyasının her birinde deliller birlikte incelendiğinde ve itiraz değerlendirildiğinde ayrı dallar açılır. Ek kararın hangi dosya belgesine ve varsayımsal bulguya dayandığı görülebilir. Dosyanın gerektirdiği yerde alternatif bir yol da dallanabilir. FR-016 sınırı, kayıtlı kapanış ve kökten ulaşma hesabı korunur.
