import { LawyerCaseDetail } from "@/features/lawyer-pages";
export default async function Page({params}:{params:Promise<{id:string}>}){ const {id}=await params; return <LawyerCaseDetail id={id}/>; }
