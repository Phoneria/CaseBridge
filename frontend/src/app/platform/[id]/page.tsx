import { AppShell } from "@/components/AppShell";
import { FirmProfileView } from "@/components/platform/FirmProfileView";

export default function ProfilePage({params}: {params:{id:string}}) { return <AppShell platform><FirmProfileView id={params.id}/></AppShell>; }
