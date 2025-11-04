'use client';

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { RoomRow, RoomMemberRow } from "@/lib/rooms";

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

type RoomMember = RoomMemberRow & {
  users: {
    id: string;
    username: string;
    display_name: string | null;
  } | null;
};

type MemberListProps = {
  room: RoomRow;
  members: RoomMember[];
  currentUserId: string;
};

export function MemberList({ room, members, currentUserId }: MemberListProps) {
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isOwner = room.owner_id === currentUserId;

  async function handleRemoveMember(userId: string) {
    setPendingUserId(userId);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/rooms/${room.id}/members/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error ?? "移除成员失败");
      }

      window.location.reload();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "移除成员失败");
    } finally {
      setPendingUserId(null);
    }
  }

  return (
    <div className="rounded-xl border border-black/10 bg-white/80 p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">房间成员</h2>
          <p className="text-sm text-black/60">总人数：{members.length}</p>
        </div>
        <Badge variant="info">房主：{room.owner_id}</Badge>
      </div>

      {errorMessage ? <p className="mt-3 text-sm text-red-600">{errorMessage}</p> : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {members.map((member) => {
          const displayName = member.users?.display_name ?? member.users?.username ?? "未知用户";
          const isCurrentUser = member.user_id === currentUserId;
          const isMemberOwner = member.user_id === room.owner_id;

          return (
            <div key={member.id} className="rounded-lg border border-black/10 bg-white px-4 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">{displayName}</p>
                  <p className="text-xs text-black/50">加入于 {formatDate(member.joined_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {isMemberOwner ? <Badge variant="success">房主</Badge> : null}
                  {isCurrentUser ? <Badge variant="default">你</Badge> : null}
                  {isOwner && !isMemberOwner ? (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => handleRemoveMember(member.user_id)}
                      disabled={pendingUserId === member.user_id}
                    >
                      {pendingUserId === member.user_id ? "处理中..." : "移除"}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
