"use client";

export default function RoomsError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-red-200 bg-red-50 p-6">
      <div>
        <h2 className="text-lg font-semibold text-red-700">房间加载失败</h2>
        <p className="mt-1 text-sm text-red-600">{error.message}</p>
      </div>
      <button
        onClick={reset}
        className="app-btn bg-red-500 px-4 py-2 text-white hover:bg-red-600"
      >
        重试
      </button>
    </div>
  );
}
