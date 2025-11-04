"use client";

export default function CheckinError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-blue-200 bg-blue-50 p-6">
      <div>
        <h2 className="text-lg font-semibold text-blue-700">打卡加载失败</h2>
        <p className="mt-1 text-sm text-blue-600">{error.message}</p>
      </div>
      <button
        onClick={reset}
        className="app-btn bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
      >
        重试
      </button>
    </div>
  );
}
