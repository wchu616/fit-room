"use client";

export default function PlansError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-yellow-200 bg-yellow-50 p-6">
      <div>
        <h2 className="text-lg font-semibold text-yellow-800">计划加载失败</h2>
        <p className="mt-1 text-sm text-yellow-700">{error.message}</p>
      </div>
      <button
        onClick={reset}
        className="app-btn bg-yellow-400 px-4 py-2 text-yellow-900 hover:bg-yellow-500"
      >
        重试
      </button>
    </div>
  );
}
