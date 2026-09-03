import { AppShell } from "@/components/AppShell";
import { CaseDetailView } from "@/components/CaseDetailView";

export default function CaseDetailPage({ params }: { params: { id: string } }) {
  return (
    <AppShell>
      <CaseDetailView caseId={params.id} />
    </AppShell>
  );
}
