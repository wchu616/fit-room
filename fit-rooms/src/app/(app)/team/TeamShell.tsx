'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import type { RoomWithJoinedAt } from "@/lib/rooms";
import type { TeamMemberInfo, TeamWithMembers } from "@/lib/teams";

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
  hour12: false,
});

function formatDate(value: string | null) {
  if (!value) return "未知时间";
  try {
    return dateFormatter.format(new Date(value));
  } catch {
    return value;
  }
}

const POLL_INTERVAL_MS = 30_000;

type TeamShellProps = {
  rooms: RoomWithJoinedAt[];
  initialRoomId: string | null;
  initialTeams: TeamWithMembers[];
};

export function TeamShell({ rooms, initialRoomId, initialTeams }: TeamShellProps) {
  const [selectedRoomId, setSelectedRoomId] = useState(initialRoomId ?? "");
  const [teams, setTeams] = useState<TeamWithMembers[]>(initialTeams);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [pendingJoinId, setPendingJoinId] = useState<string | null>(null);
  const [pendingLeaveId, setPendingLeaveId] = useState<string | null>(null);

  const initialRoomRef = useRef(initialRoomId ?? "");
  const initialTeamsRef = useRef(initialTeams);
  const hasUsedInitialTeams = useRef(false);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const hasRooms = rooms.length > 0;

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId]
  );

  const fetchTeams = useCallback(async (roomId: string, showLoading = true) => {
    if (!roomId) {
      setTeams([]);
      return;
    }

    if (showLoading) {
      setIsFetching(true);
    }
    setGlobalError(null);

    try {
      const response = await fetch(`/api/teams?roomId=${roomId}`);
      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error ?? "获取队伍失败");
      }

      setTeams(Array.isArray(data.teams) ? data.teams : []);
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "获取队伍失败");
      setTeams([]);
    } finally {
      if (showLoading) {
        setIsFetching(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!selectedRoomId) {
      setTeams([]);
      return;
    }

    if (!hasUsedInitialTeams.current && selectedRoomId === initialRoomRef.current) {
      setTeams(initialTeamsRef.current);
      hasUsedInitialTeams.current = true;
      return;
    }

    fetchTeams(selectedRoomId);
  }, [fetchTeams, selectedRoomId]);

  useEffect(() => {
    if (!hasRooms) {
      setSelectedRoomId("");
    } else if (!selectedRoomId) {
      setSelectedRoomId(rooms[0]?.id ?? "");
    }
  }, [hasRooms, rooms, selectedRoomId]);

  useEffect(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
    }

    if (!selectedRoomId) {
      return;
    }

    pollTimerRef.current = setInterval(() => {
      void fetchTeams(selectedRoomId, false);
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, [fetchTeams, selectedRoomId]);

  async function handleCreateTeam(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedRoomId) {
      setCreateError("请选择房间");
      return;
    }

    if (createName.trim().length < 2) {
      setCreateError("队伍名称至少 2 个字符");
      return;
    }

    setCreateError(null);
    setCreatePending(true);

    try {
      const response = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: selectedRoomId, name: createName.trim() }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error ?? "创建队伍失败");
      }

      setCreateOpen(false);
      setCreateName("");
      await fetchTeams(selectedRoomId);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "创建队伍失败");
    } finally {
      setCreatePending(false);
    }
  }

  async function handleJoinTeam(teamId: string) {
    setPendingJoinId(teamId);
    setGlobalError(null);

    try {
      const response = await fetch("/api/teams/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error ?? "加入队伍失败");
      }

      await fetchTeams(selectedRoomId);
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "加入队伍失败");
    } finally {
      setPendingJoinId(null);
    }
  }

  async function handleLeaveTeam(teamId: string) {
    setPendingLeaveId(teamId);
    setGlobalError(null);

    try {
      const response = await fetch("/api/teams/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error ?? "退出队伍失败");
      }

      await fetchTeams(selectedRoomId);
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "退出队伍失败");
    } finally {
      setPendingLeaveId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">我的小队</h1>
          <p className="text-sm text-black/60">管理你在房间中的队伍，邀请成员协作完成打卡。</p>
        </div>
        <div className="flex items-center gap-3">
          {hasRooms ? (
            <select
              className="rounded-md border border-black/10 px-3 py-2 text-sm"
              value={selectedRoomId}
              onChange={(event) => setSelectedRoomId(event.target.value)}
            >
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
          ) : null}
          <Button onClick={() => setCreateOpen(true)} disabled={!hasRooms}>
            创建队伍
          </Button>
        </div>
      </div>

      {globalError ? <p className="text-sm text-red-600">{globalError}</p> : null}

      {!hasRooms ? (
        <Card padded>
          <CardHeader>
            <CardTitle>尚未加入任何房间</CardTitle>
            <CardDescription>加入或创建房间后即可创建小队，与队友共同打卡。</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card padded>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center justify-between gap-3">
              <span>{selectedRoom?.name ?? "未选择房间"}</span>
              <Badge variant="info">队伍数：{teams.length}</Badge>
            </CardTitle>
            <CardDescription>每支队伍限制 2-3 人，全员打卡可获得额外积分。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isFetching ? (
              <p className="text-sm text-black/60">加载中...</p>
            ) : teams.length === 0 ? (
              <p className="text-sm text-black/60">当前房间暂无队伍，快来创建第一支小队吧。</p>
            ) : (
              <div className="space-y-4">
                {teams.map((team) => (
                  <div
                    key={team.id}
                    className="rounded-lg border border-black/10 bg-white/80 p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-semibold">{team.name}</span>
                          <Badge variant="info">成员 {team.memberCount}/3</Badge>
                          <Badge variant={team.completedCount === team.memberCount ? "success" : "default"}>
                            今日完成 {team.completedCount}/{team.memberCount}
                          </Badge>
                        </div>
                        <p className="text-xs text-black/50">创建于 {formatDate(team.created_at)}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {team.isMember ? (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => handleLeaveTeam(team.id)}
                            disabled={pendingLeaveId === team.id}
                          >
                            {pendingLeaveId === team.id ? "处理中..." : "退出队伍"}
                          </Button>
                        ) : team.memberCount >= 3 ? (
                          <Badge variant="warning">队伍已满</Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleJoinTeam(team.id)}
                            disabled={pendingJoinId === team.id}
                          >
                            {pendingJoinId === team.id ? "处理中..." : "加入队伍"}
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      {team.members.map((member: TeamMemberInfo) => (
                        <div
                          key={member.user_id}
                          className="rounded-md border border-black/10 bg-white px-3 py-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium">{member.display_name ?? member.username}</p>
                            <Badge variant={member.hasCheckedInToday ? "success" : "default"}>
                              {member.hasCheckedInToday ? "已完成" : "未完成"}
                            </Badge>
                          </div>
                          <p className="text-xs text-black/50">加入于 {formatDate(member.joined_at)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {createOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold">创建队伍</h2>
            <p className="mt-1 text-sm text-black/60">为当前房间创建一支新的小队。</p>
            <form className="mt-4 space-y-3" onSubmit={handleCreateTeam}>
              <Input
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder="队伍名称"
                maxLength={50}
                error={createError ?? undefined}
                disabled={createPending}
                autoFocus
              />
              <div className="flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setCreateOpen(false);
                    setCreateName("");
                    setCreateError(null);
                  }}
                  disabled={createPending}
                >
                  取消
                </Button>
                <Button type="submit" disabled={createPending}>
                  {createPending ? "创建中..." : "创建"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
