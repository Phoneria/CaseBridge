import { AI_ROUTES } from '@/lib/ai';

export const AI_NAVIGATION = [
  { label: 'Genel bakış', href: AI_ROUTES.hub },
  { label: 'Sufle', href: AI_ROUTES.sufle },
  { label: 'Dosya Analizi', href: AI_ROUTES.analysis },
  { label: 'Canlı Duruşma', href: AI_ROUTES.courtroom },
  { label: 'Hukuk Asistanı', href: AI_ROUTES.chat },
  { label: 'Karşı Taraf Analizi', href: AI_ROUTES.counter },
  { label: 'Yönetilen Duruşma', href: AI_ROUTES.directed },
  { label: 'Bilgi Haritası', href: AI_ROUTES.map },
  { label: 'Olasılık Ağacı', href: AI_ROUTES.scenarios },
] as const;

export function aiLinkActive(pathname: string, href: string): boolean {
  return href === AI_ROUTES.hub ? pathname === href : pathname === href || pathname.startsWith(href + '/');
}
