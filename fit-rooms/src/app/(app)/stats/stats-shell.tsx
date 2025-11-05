"use client";

import { ChangeEvent, useCallback, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { RoomWithJoinedAt } from "@/lib/rooms";
import type { RoomStats } from "@/lib/stats";

function formatDate(date: string | null) {
  if (!date) return "-";
  try {
    return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(`${date}T00:00:00Z`));
  } catch {
    return date;
  }
}

function formatShort(date: string) {
  try {
    return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(new Date(`${date}T00:00:00Z`));
  } catch {
    return date;
  }
}

const SCORE_REASON_MAP: Record<string, string> = {
  all_members: "全员完成",
  streak_3plus: "连续奖励",
  single_member: "单人完成",
};

type StatsShellProps = {
  rooms: RoomWithJoinedAt[];
  initialRoomId: string | null;
  initialStats: RoomStats | null;
};

export function StatsShell({ rooms, initialRoomId, initialStats }: StatsShellProps) {
  const [selectedRoomId, setSelectedRoomId] = useState(initialRoomId);
  const [stats, setStats] = useState<RoomStats | null>(initialStats);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasRooms = rooms.length > 0;

  const selectedRoomName = useMemo(() => {
    if (!selectedRoomId) return null;
    return rooms.find((room) => room.id === selectedRoomId)?.name ?? null;
  }, [rooms, selectedRoomId]);

  const fetchStats = useCallback(async (roomId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/stats?roomId=${roomId}`, { cache: "no-store" });
      if (response.status === 401) {
        window.location.href = "/login?redirect=/stats";
        return;
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "获取统计数据失败");
      }
      setStats(payload.stats ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取统计数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRoomChange = useCallback(
    async (event: ChangeEvent<HTMLSelectElement>) => {
      const roomId = event.target.value;
      setSelectedRoomId(roomId || null);
      if (!roomId) {
        setStats(null);
        return;
      }
      await fetchStats(roomId);
    },
    [fetchStats]
  );

  const handleRefresh = useCallback(async () => {
    if (!selectedRoomId) return;
    await fetchStats(selectedRoomId);
  }, [fetchStats, selectedRoomId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">排名面板</h1>
          <p className="text-sm text-black/60">查看房间积分排名，并了解个人与小队的打卡表现。</p>
        </div>
        {hasRooms ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <label className="flex flex-col text-sm text-black/60 sm:flex-row sm:items-center sm:gap-2">
              <span className="font-medium text-black">选择房间</span>
              <select
                className="rounded-md border border-black/20 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
                value={selectedRoomId ?? ""}
                onChange={handleRoomChange}
                disabled={loading}
              >
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </label>
            <Button variant="secondary" onClick={handleRefresh} disabled={loading || !selectedRoomId}>
              {loading ? "刷新中..." : "刷新"}
            </Button>
          </div>
        ) : null}
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {!hasRooms ? (
        <Card padded>
          <CardHeader>
            <CardTitle>暂无房间数据</CardTitle>
            <CardDescription>加入房间后可在此查看个人与队伍的统计表现。</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {stats ? (
        <>
          <Card padded>
            <CardHeader>
              <CardTitle>小队排行榜</CardTitle>
              <CardDescription>按累计积分排序，便于观察整体竞争情况。</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.scoreboard.length > 0 ? (
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
                      {stats.scoreboard.map((entry, index) => (
                        <tr key={entry.teamId} className="border-t border-black/5 text-black/70">
                          <td className="py-2 pr-4 font-medium text-black">#{index + 1}</td>
                          <td className="py-2 pr-4">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-black/80">{entry.teamName}</span>
                              {entry.isUserTeam ? <Badge variant="success">我的队伍</Badge> : null}
                            </div>
                          </td>
                          <td className="py-2 pr-4">{entry.memberCount} 人</td>
                          <td className="py-2 pr-4 font-semibold text-black">{entry.totalPoints}</td>
                          <td className="py-2 pr-4">{entry.pointsLast7Days}</td>
                          <td className="py-2 pr-4 text-black/60">{formatDate(entry.lastScoreDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-md border border-black/10 bg-black/5 p-4 text-sm text-black/60">该房间暂无小队积分记录。</div>
              )}
            </CardContent>
          </Card>

          <Card padded>
            <CardHeader>
              <CardTitle>个人统计</CardTitle>
              <CardDescription>
                {selectedRoomName ? `${selectedRoomName} · ` : ""}累计 {stats.personal.completedDays} / {stats.personal.totalDays} 天完成打卡
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatMetric label="累计完成" value={`${stats.personal.completedDays} 天`} helper={`共 ${stats.personal.totalDays} 天`} />
                <StatMetric
                  label="总完成率"
                  value={`${Math.round(stats.personal.completionRate * 100)}%`}
                  helper={`缺席 ${stats.personal.missedDays} 天`}
                />
                <StatMetric
                  label="最近 7 天完成率"
                  value={`${Math.round(stats.personal.recentCompletionRate * 100)}%`}
                  helper="滚动窗口"
                />
                <StatMetric
                  label="当前连击"
                  value={`${stats.personal.currentStreak} 天`}
                  helper={`历史最佳 ${stats.personal.longestStreak} 天`}
                />
                <StatMetric label="首次记录" value={formatDate(stats.personal.firstTrackedDate)} />
                <StatMetric label="最近打卡" value={formatDate(stats.personal.lastCheckinDate)} />
              </div>

              {stats.personal.history.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-black/70">最近 {stats.personal.history.length} 天记录</h3>
                    {loading ? <Badge variant="info">更新中</Badge> : null}
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-7">
                    {stats.personal.history.map((item) => (
                      <div
                        key={item.date}
                        className={`rounded-lg border p-3 text-xs sm:text-sm ${
                          item.didCheckin ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-600"
                        }`}
                      >
                        <div className="font-medium">{formatShort(item.date)}</div>
                        <div className="mt-1 text-[11px] uppercase tracking-wide">{item.didCheckin ? "已完成" : "未完成"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-black/60">暂无历史记录。</div>
              )}
            </CardContent>
          </Card>

          <Card padded>
            <CardHeader>
              <CardTitle>小队统计</CardTitle>
              <CardDescription>查看积分构成、成员信息与连胜情况。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {stats.team ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatMetric label="所属小队" value={stats.team.teamName} helper={`${stats.team.members.length} 人`} />
                    <StatMetric label="累计积分" value={`${stats.team.totalPoints} 分`} helper={`近 7 天 ${stats.team.pointsLast7Days} 分`} />
                    <StatMetric
                      label="当前连胜"
                      value={`${stats.team.currentStreak?.length ?? 0} 天`}
                      helper={stats.team.currentStreak ? `${formatShort(stats.team.currentStreak.startDate)} - ${formatShort(stats.team.currentStreak.endDate)}` : "暂无"}
                    />
                    <StatMetric
                      label="历史最佳连胜"
                      value={`${stats.team.longestStreak?.length ?? 0} 天`}
                      helper={stats.team.longestStreak ? `${formatShort(stats.team.longestStreak.startDate)} - ${formatShort(stats.team.longestStreak.endDate)}` : "暂无"}
                    />
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div>
                      <h3 className="text-sm font-semibold text-black/70">成员列表</h3>
                      <ul className="mt-2 space-y-2 text-sm">
                        {stats.team.members.map((member) => (
                          <li key={member.userId} className="flex items-center justify-between rounded-md border border-black/10 bg-white px-3 py-2">
                            <span className="font-medium text-black/80">{member.displayName ?? member.username}</span>
                            <span className="text-xs text-black/40">加入于 {formatDate(member.joinedAt)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-black/70">得分构成</h3>
                      {stats.team.reasonBreakdown.length > 0 ? (
                        <ul className="mt-2 space-y-2 text-sm">
                          {stats.team.reasonBreakdown.map((item) => (
                            <li key={item.reason} className="flex items-center justify-between rounded-md border border-black/10 bg-white px-3 py-2">
                              <span>{SCORE_REASON_MAP[item.reason] ?? item.reason}</span>
                              <span className="text-xs text-black/50">
                                {item.totalPoints} 分 · {item.occurrences} 次
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="mt-2 rounded-md border border-black/10 bg-black/5 px-3 py-2 text-xs text-black/60">暂无得分记录。</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-black/70">最近得分事件</h3>
                    {stats.team.history.length > 0 ? (
                      <div className="mt-2 overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs uppercase tracking-wide text-black/50">
                              <th className="py-2 pr-4">日期</th>
                              <th className="py-2 pr-4">积分</th>
                              <th className="py-2 pr-4">原因</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stats.team.history.map((item) => (
                              <tr key={`${item.date}-${item.reason}`} className="border-t border-black/5 text-black/70">
                                <td className="py-2 pr-4">{formatDate(item.date)}</td>
                                <td className="py-2 pr-4 font-medium text-black">+{item.points}</td>
                                <td className="py-2 pr-4 text-black/60">{SCORE_REASON_MAP[item.reason] ?? item.reason}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="mt-2 rounded-md border border-black/10 bg-black/5 px-3 py-2 text-xs text-black/60">近期暂无积分记录。</div>
                    )}
                  </div>
                </>
              ) : (
                <div className="rounded-md border border-black/10 bg-black/5 p-4 text-sm text-black/60">
                  你尚未加入该房间的小队，加入后可查看小队积分与连胜情况。
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

type StatMetricProps = {
  label: string;
  value: string;
  helper?: string;
};

function StatMetric({ label, value, helper }: StatMetricProps) {
  return (
    <div className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-black/50">{label}</div>
      <div className="mt-2 text-lg font-semibold text-black">{value}</div>
      {helper ? <div className="mt-1 text-xs text-black/40">{helper}</div> : null}
    </div>
  );
}
