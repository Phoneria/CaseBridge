import { redirect } from 'next/navigation';
import { caseDetailHref } from '@/lib/filters';

export default function LegacyCaseTool({ searchParams }: { searchParams: { dava?: string; onizle?: string } }) {
  const caseId = searchParams.dava || searchParams.onizle;
  redirect(typeof caseId === 'string' && caseId ? caseDetailHref(encodeURIComponent(caseId), 'ai') + '&arac=yonetmen' : '/davalar');
}
