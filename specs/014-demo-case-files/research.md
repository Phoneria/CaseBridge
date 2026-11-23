# Tasarım kararları

Mevcut örnek yükleme akışı backend/app/db/demo_template.py içinde dava, gelişme ve belge kayıtları oluşturuyor. Yeni set için kalıcı örnek kimliği ve sürümle tanınan bir katalog kullanılacak. Tam metin ve PDF aynı kaynaktan üretilecek. Hazır bir gerçek dosya koleksiyonunu içe aktarmak, tutarlı bir olay zinciri ve kurgusal içerik koşullarını karşılamıyor.

Mevcut dava türü listesinde ceza ayrı bir seçenek olarak tanımlı değil. Uygulamada ceza kategorisi için veri modeli, API, form ve filtre uyumluluğu birlikte kontrol edilecek. Geçmiş hukuk dosyalarının özgün kategorileri korunacak.

Mevcut senaryo ağacı dava belgelerini ve gelişmeleri kaynak olarak kullanıyor. POC için belirli düğüm ve belge arasındaki bağ açıkça tanımlanacak. Çok evraklı bir dosyada, sınırlı sayıda kaynak gösteren genel bir özet bütün kanıt bağlantılarını sağlayamayabilir.

Kurgusal bireysel başvuru örneklerinin form ve ekleri hazırlanırken resmî başvuru kaynakları esas alınacak. [AYM](https://www.anayasa.gov.tr/tr/bireysel-basvuru/) · [AİHM](https://www.echr.coe.int/apply-to-the-court)
