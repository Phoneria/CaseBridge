import { AppShell } from "@/components/AppShell";
import { SimilarCasesView } from "@/components/ai/SimilarCasesView";

export default function SimilarCasesPage({ searchParams }: { searchParams: { dava?: string } }) {
  const caseId = typeof searchParams.dava === "string" && searchParams.dava ? searchParams.dava : undefined;
  return <AppShell><SimilarCasesView initialCaseId={caseId} /></AppShell>;
}
