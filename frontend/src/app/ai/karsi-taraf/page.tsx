import { AppShell } from '@/components/AppShell';
import { HearingWorkspace } from '@/components/ai/HearingWorkspace';

export default function HearingPage() {
  return <AppShell><HearingWorkspace mode="counter" /></AppShell>;
}
