import { AppShell } from "@/components/AppShell";
import { CourtroomSessionView } from "@/components/CourtroomSessionView";

export default function CourtroomSessionPage({ params }: { params: { id: string } }) {
  return (
    <AppShell>
      <CourtroomSessionView sessionId={params.id} />
    </AppShell>
  );
}
