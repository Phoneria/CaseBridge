import { EmptyState } from "@/components/EmptyState";

export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-navy-900">{title}</h1>
        <p className="text-sm text-navy-500">{description}</p>
      </div>
      <EmptyState message="Bu özellik yakında CaseBridge'e eklenecek." hint="MVP'nin sonraki sürümünde yer alıyor." />
    </div>
  );
}
