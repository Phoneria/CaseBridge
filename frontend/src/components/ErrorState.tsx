export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-start gap-1 rounded-xl border border-red-100 bg-red-50 px-4 py-4 text-sm text-red-700">
      <span className="font-medium">Bir sorun oluştu</span>
      <span>{message}</span>
    </div>
  );
}
