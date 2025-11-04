"use client";

export default function TeamError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-green-200 bg-green-50 p-6">
      <div>
        <h2 className="text-lg font-semibold text-green-800">小队信息加载失败</h2>
        <p className="mt-1 text-sm text-green-700">{error.message}</p>
      </div>
      <button
        onClick={reset}
        className="app-btn bg-green-500 px-4 py-2 text-white hover:bg-green-600"
      >
        重试
      </button>
    </div>
  );
}
