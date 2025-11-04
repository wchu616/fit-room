'use client';

import { useCallback, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import type { LeaderboardSnapshot } from "@/lib/leaderboards";

type LeaderboardMeta = {
  usedDate: string;
  defaultedDate: boolean;
  note?: string;
};

type LeaderboardClientState = {
  snapshot: LeaderboardSnapshot | null;
  meta: LeaderboardMeta | null;
  error: string | null;
};

type RoomLeaderboardClientProps = {
  roomId: string;
  roomName: string;
  initialInputDate: string;
  initialState: LeaderboardClientState;
  userTeamId: string | null;
};

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
  hour12: false,
});

const dayFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  try {
    return dayFormatter.format(new Date(value));
  } catch {
    return value;
  }
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  try {
    return dateFormatter.format(new Date(value));
  } catch {
    return value;
  }
}

export function RoomLeaderboardClient({
  roomId,
  roomName,
  initialInputDate,
  initialState,
  userTeamId,
}: RoomLeaderboardClientProps) {
  const [inputDate, setInputDate] = useState(initialInputDate);
  const [state, setState] = useState<LeaderboardClientState>(initialState);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

  const appliedDate = state.meta?.usedDate ?? "";
  const showDefaultBadge = state.meta?.defaultedDate ?? false;
  const note = state.meta?.note;
  const snapshot = state.snapshot;
  const error = state.error;
  const ranking = snapshot?.ranking ?? [];

  const handleFetch = useCallback(
    async (dateValue: string) => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      try {
        const params = new URLSearchParams({ roomId });
        if (dateValue) {
          params.set("date", dateValue);
        }
        const response = await fetch(`/api/leaderboards?${params.toString()}`, {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));

        if (requestId !== requestIdRef.current) {
          return;
        }

        if (!response.ok) {
          setState({
            snapshot: null,
            meta:
              payload.meta ?? {
                usedDate: dateValue || "",
                defaultedDate: !dateValue,
              },
            error: payload.error ?? "获取排行榜失败",
          });
          return;
        }

        setState({
          snapshot: payload.snapshot ?? null,
          meta:
            payload.meta ?? {
              usedDate: dateValue || "",
              defaultedDate: !dateValue,
            },
          error: null,
        });
      } catch (err) {
        if (requestId !== requestIdRef.current) {
          return;
        }
        setState({
          snapshot: null,
          meta: {
            usedDate: dateValue || "",
            defaultedDate: !dateValue,
          },
          error: err instanceof Error ? err.message : "获取排行榜失败",
        });
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [roomId]
  );

  const handleDateChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value;
      setInputDate(next);
      void handleFetch(next);
    },
    [handleFetch]
  );

  const handleReset = useCallback(() => {
    setInputDate("");
    void handleFetch("");
  }, [handleFetch]);

  const generatedAtLabel = useMemo(() => formatDateTime(snapshot?.generatedAt), [snapshot?.generatedAt]);

  return (
    <Card padded>
      <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle>{roomName} · 排行榜</CardTitle>
          <CardDescription>
            快照日期：{appliedDate ? formatDate(appliedDate) : "未指定（默认前一自然日）"}
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-black/60">
            <span className="mr-2 text-black">选择日期</span>
            <input
              type="date"
              value={inputDate}
              onChange={handleDateChange}
              className="rounded-md border border-black/20 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
            />
          </label>
          <Button variant="secondary" onClick={handleReset} disabled={loading && inputDate === ""}>
            使用默认日期
          </Button>
          {loading ? <Badge variant="info">加载中...</Badge> : null}
          {showDefaultBadge ? <Badge variant="info">默认 UTC+8 前一自然日</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {note ? <p className="text-xs text-black/50">{note}</p> : null}
        {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

        {ranking.length === 0 ? (
          <div className="rounded-md border border-black/10 bg-black/5 p-6 text-sm text-black/60">
            该日期暂无排行榜快照。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-black/50">
                  <th className="py-2 pr-4">排名</th>
                  <th className="py-2 pr-4">小队</th>
                  <th className="py-2 pr-4">成员</th>
                  <th className="py-2 pr-4">总积分</th>
                  <th className="py-2 pr-4">近 7 天</th>
                  <th className="py-2 pr-4">最近得分日</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((entry, index) => {
                  const isUserTeam = userTeamId ? entry.team_id === userTeamId : false;
                  return (
                    <tr
                      key={`${entry.team_id}-${entry.team_name}`}
                      className={cn(
                        "border-t border-black/5",
                        isUserTeam ? "bg-primary-50" : "bg-white"
                      )}
                    >
                      <td className="py-2 pr-4 font-medium text-black">#{index + 1}</td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-black/80">{entry.team_name}</span>
                          {isUserTeam ? <Badge variant="success">我的队伍</Badge> : null}
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-black/70">{entry.member_count} 人</td>
                      <td className="py-2 pr-4 font-semibold text-black">{entry.total_points}</td>
                      <td className="py-2 pr-4 text-black/70">{entry.points_last7_days}</td>
                      <td className="py-2 pr-4 text-black/60">{formatDate(entry.last_score_date)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 text-xs text-black/50">
          <span>生成时间：{generatedAtLabel}</span>
          <span>数据来源：`team_scores` 快照</span>
        </div>
      </CardContent>
    </Card>
  );
}
