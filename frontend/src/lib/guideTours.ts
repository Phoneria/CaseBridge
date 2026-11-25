import type { GuideTopic } from "./workspaceGuide";

type TourStep = { selector: string; title: string; instruction: string };
export const guideTours: Partial<Record<string, TourStep[]>> = {
  admin: [
    { selector: '[aria-label="Yeni dava trend grafiği"]', title: 'Yeni dava trendi', instruction: 'Son altı ayda portföye giren dava sayılarının nasıl değiştiğini görün.' },
    { selector: '[aria-label="Avukat iş yükü bar grafiği"]', title: 'Avukat iş yükü', instruction: 'Aktif ve kapalı dosyaları avukat bazında karşılaştırın.' },
    { selector: 'select[aria-label$="sorumlu avukatı"]', title: 'Sorumlu avukat', instruction: 'Uygun bir dava kartındaki listeden yeni sorumlu seçilebilir. Listede o dosyaya atanabilen avukatlar yer alır.' },
  ],
  tasks: [
    { selector: '[data-guide="new-task"]', title: 'Yeni görev', instruction: 'Dosyayı, atanan kişiyi, önceliği ve son tarihi bu düğmeden seçebilirsiniz.' },
    { selector: 'section[aria-label="İncelemede"] h2', title: 'İncelemede', instruction: 'Kontrol bekleyen kartı bu sütuna taşıyın. Karttaki aşama listesini de kullanabilirsiniz.' },
    { selector: 'section[aria-label="Tamamlandı"] h2', title: 'Tamamlandı', instruction: 'Teslim edilen işler bu sütunda toplanır. Bir kartı buraya taşımak görevi tamamlar.' },
  ],
  cases: [
    { selector: 'select[aria-label="Kategori filtresi"]', title: 'Kategori filtresi', instruction: 'Listede incelemek istediğiniz hukuk alanını seçin.' },
    { selector: 'select[aria-label="Durum filtresi"]', title: 'Durum filtresi', instruction: 'Dosyaları açık veya sonuçlanmış olmasına göre daraltın.' },
    { selector: 'select[aria-label="Sonuç filtresi"]', title: 'Sonuç filtresi', instruction: 'Belirli bir sonuçla kapanan davaları bulun. Dosya adına tıklayarak karar ayrıntısına ulaşabilirsiniz.' },
  ],
  reports: [
    { selector: '[data-guide="preview-cases"]', title: 'Raporu önizleyin', instruction: 'Dava Listesi Raporu kartındaki Önizle düğmesi dışa aktarılacak sütunları ve satırları gösterir.' },
    { selector: '[data-guide="download-cases"]', title: 'CSV olarak indirin', instruction: 'Aynı karttaki bu düğme raporu elektronik tabloda açabileceğiniz bir dosyaya kaydeder.' },
  ],
  account: [
    { selector: '#account-name', title: 'Ad soyad', instruction: 'Burada hesabınızda gösterilen adı düzenleyebilirsiniz. Değişiklik profil formunu kaydettiğinizde uygulanır.' },
    { selector: '#account-department', title: 'Departman', instruction: 'Çalıştığınız birimi bu alana girin.' },
    { selector: '#current-password', title: 'Şifre değişikliği', instruction: 'Şifrenizi değiştirmek istediğinizde önce mevcut şifrenizi, ardından yeni şifrenizi girin.' },
  ],
};

export function topicDestination(topic: GuideTopic) {
  if (topic.id === 'documents' || topic.id === 'precedents') return '/davalar';
  return topic.tab ? `${topic.route}?tab=${topic.tab}` : topic.route;
}
