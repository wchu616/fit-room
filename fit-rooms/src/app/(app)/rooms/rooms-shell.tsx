'use client';

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import type { RoomWithJoinedAt } from "@/lib/rooms";

type RoomsShellProps = {
  initialRooms: RoomWithJoinedAt[];
  currentUserId: string;
};

type ApiRoomsResponse = {
  rooms?: RoomWithJoinedAt[];
  error?: string;
};

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
  hour12: false,
});

function formatDate(value: string) {
  try {
    return dateFormatter.format(new Date(value));
  } catch {
    return value;
  }
}

export function RoomsShell({ initialRooms, currentUserId }: RoomsShellProps) {
  const [rooms, setRooms] = useState<RoomWithJoinedAt[]>(initialRooms);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [createPending, setCreatePending] = useState(false);
  const [joinPending, setJoinPending] = useState(false);
  const [leavingRoomId, setLeavingRoomId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const hasRooms = rooms.length > 0;

  const sortedRooms = useMemo(
    () => [...rooms].sort((a, b) => (a.joined_at < b.joined_at ? 1 : -1)),
    [rooms]
  );

  async function refreshRooms() {
    try {
      setRefreshing(true);
      setGlobalError(null);

      const response = await fetch("/api/rooms");
      const data = (await response.json().catch(() => ({}))) as ApiRoomsResponse;

      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }

      if (!response.ok) {
        throw new Error(data.error ?? "刷新房间列表失败");
      }

      setRooms(Array.isArray(data.rooms) ? data.rooms : []);
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "刷新房间列表失败");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);

    if (createName.trim().length < 2) {
      setCreateError("房间名称至少 2 个字符");
      return;
    }

    try {
      setCreatePending(true);
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName.trim() }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error ?? "创建房间失败");
      }

      setCreateName("");
      setIsCreateOpen(false);
      await refreshRooms();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "创建房间失败");
    } finally {
      setCreatePending(false);
    }
  }

  async function handleJoin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setJoinError(null);

    if (!joinCode.trim()) {
      setJoinError("请输入房间码");
      return;
    }

    try {
      setJoinPending(true);
      const response = await fetch("/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: joinCode.trim().toUpperCase() }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error ?? "加入房间失败");
      }

      setJoinCode("");
      setIsJoinOpen(false);
      await refreshRooms();
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : "加入房间失败");
    } finally {
      setJoinPending(false);
    }
  }

  async function handleLeave(roomId: string) {
    setGlobalError(null);
    setLeavingRoomId(roomId);

    try {
      const response = await fetch("/api/rooms/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error ?? "退出房间失败");
      }

      await refreshRooms();
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "退出房间失败");
    } finally {
      setLeavingRoomId(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">我的房间</h1>
          <p className="text-sm text-black/60">
            管理你参与的房间、分享房间码邀请成员，或加入新的房间。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => setIsCreateOpen(true)}>创建房间</Button>
          <Button variant="secondary" onClick={() => setIsJoinOpen(true)}>
            加入房间
          </Button>
          <Button variant="secondary" onClick={refreshRooms} disabled={refreshing}>
            {refreshing ? "刷新中..." : "刷新"}
          </Button>
        </div>
      </div>

      {globalError ? <p className="text-sm text-red-600">{globalError}</p> : null}

      {hasRooms ? (
        <div className="grid gap-4 md:grid-cols-2">
          {sortedRooms.map((room) => {
            const isOwner = room.owner_id === currentUserId;
            const joinedLabel = formatDate(room.joined_at);

            return (
              <Card key={room.id} padded>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-3">
                    <span className="truncate">{room.name}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant={isOwner ? "success" : "info"}>
                        {isOwner ? "房主" : "成员"}
                      </Badge>
                      <Badge variant="info">房间码 {room.code}</Badge>
                    </div>
                  </CardTitle>
                  <CardDescription>加入时间：{joinedLabel}</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center gap-3">
                  <Button variant="secondary" asChild>
                    <a href={`/rooms/${room.id}`}>房间详情</a>
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => handleLeave(room.id)}
                    disabled={leavingRoomId === room.id}
                  >
                    {leavingRoomId === room.id ? "处理中..." : isOwner ? "删除房间" : "退出房间"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card padded>
          <CardHeader>
            <CardTitle>暂无房间</CardTitle>
            <CardDescription>创建一个新房间或加入已有房间，开始团队健身之旅。</CardDescription>
          </CardHeader>
        </Card>
      )}

      {isCreateOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold">创建新房间</h2>
            <p className="mt-1 text-sm text-black/60">输入房间名称，创建后可分享房间码邀请队友。</p>
            <form className="mt-4 space-y-3" onSubmit={handleCreate}>
              <Input
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder="房间名称"
                maxLength={50}
                error={createError ?? undefined}
                aria-label="房间名称"
                disabled={createPending}
                autoFocus
              />
              <div className="flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={createPending}
                >
                  取消
                </Button>
                <Button type="submit" disabled={createPending}>
                  {createPending ? "创建中..." : "创建房间"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isJoinOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold">加入房间</h2>
            <p className="mt-1 text-sm text-black/60">请输入 6 位房间码加入房间。</p>
            <form className="mt-4 space-y-3" onSubmit={handleJoin}>
              <Input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                placeholder="房间码"
                maxLength={6}
                error={joinError ?? undefined}
                aria-label="房间码"
                disabled={joinPending}
                autoFocus
              />
              <div className="flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsJoinOpen(false)}
                  disabled={joinPending}
                >
                  取消
                </Button>
                <Button type="submit" disabled={joinPending}>
                  {joinPending ? "加入中..." : "加入房间"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
