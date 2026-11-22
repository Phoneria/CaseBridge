import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AiPairNav } from '@/components/ai/AiPairNav';
import AnalysisPage from '@/app/ai/analiz/page';
import DirectedPage from '@/app/ai/yonetmen/page';
import OverviewPage from '@/app/ai/page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/ai/olasilik',
  useSearchParams: () => new URLSearchParams('dava=case-a'),
  redirect: (url: string) => { throw new Error(url); },
}));

it('keeps both map views in the same case and both hearing tools in the selected case', () => {
  const { rerender } = render(<AiPairNav group="maps" />);
  expect(screen.getByRole('link', {name:'Olasılık Ağacı'})).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', {name:'Bilgi Haritası'})).toHaveAttribute('href', '/ai/harita?dava=case-a');
  rerender(<AiPairNav group="hearing" caseId="case-b" />);
  expect(screen.getByRole('link', {name:'Karşı Taraf Analizi'})).toHaveAttribute('href', '/ai/karsi-taraf?dava=case-b');
  expect(screen.getByRole('link', {name:'Canlı Duruşma'})).toHaveAttribute('href', '/ai/durusma?dava=case-b');
});

it('routes legacy AI entries to case selection or the matching case tool', () => {
  expect(() => OverviewPage()).toThrow('/davalar');
  expect(() => AnalysisPage({searchParams:{}})).toThrow(/^\/davalar$/);
  expect(() => DirectedPage({searchParams:{}})).toThrow(/^\/davalar$/);
  expect(() => AnalysisPage({searchParams:{onizle:'c1'}})).toThrow('/davalar/c1?sekme=ai');
  expect(() => DirectedPage({searchParams:{dava:'c2'}})).toThrow('/davalar/c2?sekme=ai&arac=yonetmen');
});
