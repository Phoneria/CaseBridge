import { AppShell } from "@/components/AppShell";
import { PlatformView } from "@/components/platform/PlatformView";

export default function PlatformPage() {
  return (
    <AppShell platform>
      <PlatformView />
    </AppShell>
  );
}
