"use client";

import { Button } from "@/components/ui/Button";

export default function RoomLeaderboardError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="space-y-4 rounded-xl border border-red-200 bg-red-50 p-6">
      <div>
        <h2 className="text-lg font-semibold text-red-700">排行榜加载失败</h2>
        <p className="mt-1 text-sm text-red-600">{error.message}</p>
      </div>
      <Button variant="danger" onClick={reset}>
        重试
      </Button>
    </div>
  );
}
