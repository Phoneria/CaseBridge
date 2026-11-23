import { AI_ROUTES } from '@/lib/ai';

export const AI_PAIRS = {
  hearing: [
    { label: 'Canlı Duruşma', href: AI_ROUTES.courtroom },
    { label: 'Karşı Taraf Analizi', href: AI_ROUTES.counter },
  ],
  maps: [
    { label: 'Olasılık Ağacı', href: AI_ROUTES.scenarios },
    { label: 'Bilgi Haritası', href: AI_ROUTES.map },
  ],
} as const;

export const AI_NAVIGATION = [
  { label: 'Anonimleştirme', href: AI_ROUTES.anonymize },
  { label: 'Sufle', href: AI_ROUTES.sufle },
  { label: 'Canlı Duruşma ve Karşı Taraf Analizi', href: AI_ROUTES.courtroom },
  { label: 'Hukuk Asistanı', href: AI_ROUTES.chat },
  { label: 'Olasılık Ağacı ve Bilgi Haritası', href: AI_ROUTES.scenarios },
] as const;

export function aiLinkActive(pathname: string, href: string): boolean {
  if (href === AI_ROUTES.hub) return pathname === href;
  const routes = Object.values(AI_PAIRS).find(pair => pair[0].href === href);
  return (routes ?? [{ href }]).some(route => pathname === route.href || pathname.startsWith(route.href + '/'));
}
