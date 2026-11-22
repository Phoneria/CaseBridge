# Implementation plan
React/Next mevcut WorkspaceHeader içine WorkspaceGuide ekle. ModalFrame mevcut odak/Escape/Tab döngüsünü yeniden kullan. Yeni lib/workspaceGuide.ts yalnız statik Türkçe konular ve saf rol/yol eşleştirmesi taşır; backend, API veya depolama değişmez. Path + search tab bağlamı açılışta seçilir. Rol önceliği: restricted > platform > bureau admin/lawyer. Header action grubu dar alanda sağa hizalanır. Son kullanıcı düzeltmesi: WorkspaceHeader içindeki AiNavigation kullanımı kaldırılır, WorkspaceGuide önceki AI girişinin yerine kullanıcı menüsünden önce gelir. AiNavigation bileşeni ve sidebar AI araçları değişmez.

Constitution Check: VI header AI zorunluluğuna son açık kullanıcı talimatıyla dar istisna spec.md içinde kaydedildi; diğer I–VII koşulları uygun; büro izolasyonu/anahtar akışı/AI doğruluk sınırı korunur, sentetik kontroller, v. formatı, main üzerinden korumalı PR. Yayın kapsam dışıdır.

Phases: kaynak araştırması → statik sözleşme/içerik → erişilebilir panel/header → hedefli bileşen + gerçek tarayıcı → build/type/spec kabul kapısı → PR/Projects In Review.
Data contracts: data-model.md#featurecontract. No new dependencies, remote services or persistent data.

22 Kasım kullanıcı düzeltmesi: WorkspaceHeader içindeki AiNavigation çağrısını kaldır; aynı konuma WorkspaceGuide koy, ardından UserMenu kalsın. Sidebar ve AI araç rotaları değişmez. Constitution VI header AI ilkesi, daha yeni açık kullanıcı isteğiyle bu kapsamda geçersizdir; diğer erişim ve odak sınırları korunur. Henüz yayımlanmamış PR v.0.24 içinde revize edilir.
