# Data Model

## FeatureContract

Entity(name, kind: kisi|kurum|deger). Result(text, counts per placeholder kind, leaks list of kinds only, mapping placeholder→original kept in memory and excluded from repr). Placeholders: [KİŞİ-n], [KURUM-n], [TC-KİMLİK-n], [TELEFON-n], [E-POSTA-n], [IBAN-n], [PLAKA-n], [ADRES-n], [DOĞUM-TARİHİ-n]; the same key always yields the same placeholder.
