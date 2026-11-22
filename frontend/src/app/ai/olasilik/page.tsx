import { AiPairNav } from '@/components/ai/AiPairNav';
import { AppShell } from '@/components/AppShell';
import { ScenarioTreeView } from '@/components/lab/ScenarioTreeView';

export default function ScenarioTreePage() {
  return <AppShell><AiPairNav group="maps" /><ScenarioTreeView /></AppShell>;
}
