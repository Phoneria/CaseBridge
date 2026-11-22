# Data model
## FeatureContract
- Topic.id: benzersiz, sabit, boş olmayan string.
- Topic.route: mevcut yetkili uygulama rotası; dış URL yok.
- Topic.tab: yalnız /buro için kaynak TABS anahtarı, diğerlerinde yok.
- Topic.steps: en az iki Türkçe adım; her biri başlık, açıklama ve kontrol ipucu taşır.
- GuideState.topicId: yalnız filtrelenmiş konulardan biri.
- GuideState.step: sıfır tabanlı ve seçili steps sınırları içinde; konu değişiminde 0.
- GuideState.open: boolean; kapatma ve bağlam değişimi paneli kaldırır. State yalnız React belleğinde.
No server schema, no private data, no storage or new API.
