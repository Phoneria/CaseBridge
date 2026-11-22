# Implementation plan
React/Next mevcut WorkspaceHeader içine WorkspaceGuide ekle. ModalFrame mevcut odak/Escape/Tab döngüsünü yeniden kullan. Yeni lib/workspaceGuide.ts yalnız statik Türkçe konular ve saf rol/yol eşleştirmesi taşır; backend, API veya depolama değişmez. Path + search tab bağlamı açılışta seçilir. Rol önceliği: restricted > platform > bureau admin/lawyer. Header action grubu dar alanda sağa hizalanır.

Constitution Check: I–VII uygun; büro izolasyonu/anahtar akışı/AI doğruluk sınırı korunur, sentetik kontroller, v. formatı, main üzerinden korumalı PR. Yayın kapsam dışıdır.

Phases: kaynak araştırması → statik sözleşme/içerik → erişilebilir panel/header → hedefli bileşen + gerçek tarayıcı → build/type/spec kabul kapısı → PR/Projects In Review.
Data contracts: data-model.md#featurecontract. No new dependencies, remote services or persistent data.
