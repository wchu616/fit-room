'use client';

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { RoomRow } from "@/lib/rooms";

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
  hour12: false,
});

function formatDate(value: string | null | undefined) {
  if (!value) return "未知时间";
  try {
    return dateFormatter.format(new Date(value));
  } catch {
    return value;
  }
}

type RoomHeaderProps = {
  room: RoomRow;
};

export function RoomHeader({ room }: RoomHeaderProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(text: string, setState: (next: boolean) => void) {
    try {
      await navigator.clipboard.writeText(text);
      setState(true);
      setTimeout(() => setState(false), 2000);
    } catch {
      setState(false);
    }
  }

  return (
    <div className="rounded-xl border border-black/10 bg-white/80 p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{room.name}</h1>
            <Badge variant="info">房间码：{room.code}</Badge>
          </div>
          <p className="text-sm text-black/60">创建于 {formatDate(room.created_at)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handleCopy(room.code, setCopied)}
          >
            {copied ? "已复制房间码" : "复制房间码"}
          </Button>
          <Button size="sm" asChild>
            <Link href={`/rooms/${room.id}/leaderboard`}>查看排行榜</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
