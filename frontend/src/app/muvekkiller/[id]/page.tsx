import { AppShell } from "@/components/AppShell";
import { ClientDetailView } from "@/components/ClientDetailView";

export default function ClientDetailPage({ params }: { params: { id: string } }) {
  return (
    <AppShell>
      <ClientDetailView clientId={params.id} />
    </AppShell>
  );
}
