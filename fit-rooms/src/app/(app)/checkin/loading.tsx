export default function CheckinLoading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-52 animate-pulse rounded bg-black/5" />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-3 h-60 animate-pulse rounded-xl bg-black/5" />
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-48 animate-pulse rounded-xl bg-black/5" />
        ))}
      </div>
    </div>
  );
}
