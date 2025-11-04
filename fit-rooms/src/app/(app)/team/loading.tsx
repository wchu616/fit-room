export default function TeamLoading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-40 animate-pulse rounded bg-black/5" />
      <div className="h-28 animate-pulse rounded-xl bg-black/5" />
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-xl bg-black/5" />
        ))}
      </div>
    </div>
  );
}
