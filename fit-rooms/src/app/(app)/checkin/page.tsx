"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

interface UserRoom {
  id: string;
  name: string;
}

interface TodayStatus {
  taken_at: string;
  photo_url: string | null;
}

interface HistoryItem {
  id: string;
  for_date: string;
  taken_at: string | null;
  photo_url: string | null;
}

interface RoomsApiSuccess {
  rooms: Array<{ id: string; name: string }>;
}

function isRoomsApiSuccess(payload: unknown): payload is RoomsApiSuccess {
  if (typeof payload !== "object" || payload === null) return false;
  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.rooms)) return false;
  return record.rooms.every((room) => {
    if (typeof room !== "object" || room === null) return false;
    const r = room as Record<string, unknown>;
    return typeof r.id === "string" && typeof r.name === "string";
  });
}

function formatTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString();
}

export default function CheckinPage() {
  const [rooms, setRooms] = useState<UserRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [todayStatus, setTodayStatus] = useState<TodayStatus | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const canSubmit = useMemo(() => !!file && !!selectedRoomId && !submitting, [file, selectedRoomId, submitting]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const res = await fetch("/api/me/rooms", { cache: "no-store" });
        if (!res.ok) throw new Error("加载房间失败");
        const data: unknown = await res.json();
        if (!isRoomsApiSuccess(data)) throw new Error("加载房间失败");
        const list: UserRoom[] = data.rooms.map((room) => ({ id: room.id, name: room.name }));
        if (!mounted) return;
        setRooms(list);
        if (list.length > 0) {
          setSelectedRoomId((prev) => prev || list[0].id);
        }
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "加载房间失败");
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const refreshStatusAndHistory = useCallback(
    async (roomId: string) => {
      setLoadingStatus(true);
      setLoadingHistory(true);
      setError(null);
      try {
        const [statusRes, historyRes] = await Promise.all([
          fetch(`/api/checkins/today?roomId=${roomId}`, { cache: "no-store" }),
          fetch(`/api/checkins?roomId=${roomId}&limit=7`, { cache: "no-store" }),
        ]);

        if (!statusRes.ok) {
          throw new Error((await statusRes.json().catch(() => ({})))?.error ?? "获取当日状态失败");
        }
        const statusPayload = await statusRes.json();
        setTodayStatus(statusPayload.checkin ?? null);

        if (!historyRes.ok) {
          throw new Error((await historyRes.json().catch(() => ({})))?.error ?? "获取打卡记录失败");
        }
        const historyPayload = await historyRes.json();
        setHistory(Array.isArray(historyPayload.checkins) ? historyPayload.checkins : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "获取打卡信息失败");
      } finally {
        setLoadingStatus(false);
        setLoadingHistory(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!selectedRoomId) {
      setTodayStatus(null);
      setHistory([]);
      return;
    }
    void refreshStatusAndHistory(selectedRoomId);
  }, [selectedRoomId, refreshStatusAndHistory]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
    setPreview(null);
    setSuccessMessage(null);
    if (!nextFile) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(nextFile);
  }

  async function handleSubmit() {
    if (!file || !selectedRoomId) return;
    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const form = new FormData();
      form.set("roomId", selectedRoomId);
      form.set("file", file);
      const res = await fetch("/api/checkins", {
        method: "POST",
        body: form,
      });
      const body = (await res.json().catch(() => ({}))) as { forDate?: string; takenAt?: string; error?: string };
      if (res.status === 201 && body.forDate && body.takenAt) {
        setSuccessMessage(`打卡成功：${body.forDate}（${new Date(body.takenAt).toLocaleString()}）`);
        setFile(null);
        setPreview(null);
        await refreshStatusAndHistory(selectedRoomId);
      } else if (res.status === 409) {
        setError(body?.error || "当日已打卡");
      } else if (res.status === 401) {
        setError("未登录，请重新登录");
      } else if (res.status === 403) {
        setError("仅房间成员可打卡");
      } else {
        setError(body?.error || "打卡失败");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "打卡失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>今日打卡</CardTitle>
          <CardDescription>选择房间，上传或拍照后提交。每个房间每天只能打卡一次。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg bg-black/5 p-3 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant={todayStatus ? "success" : "default"}>
                {loadingStatus ? "状态加载中..." : todayStatus ? "今日已完成" : "今日未完成"}
              </Badge>
              {todayStatus ? <span>完成于 {formatTime(todayStatus.taken_at)}</span> : null}
            </div>
            <Button variant="secondary" size="sm" onClick={() => selectedRoomId && refreshStatusAndHistory(selectedRoomId)} disabled={!selectedRoomId || loadingStatus || loadingHistory}>
              刷新
            </Button>
          </div>

          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="w-full md:w-1/2">
              <label className="block text-sm text-black/60">打卡房间</label>
              <select
                className="mt-1 w-full rounded-md border border-black/20 bg-white p-2 text-sm focus:border-primary-500 focus:outline-none"
                value={selectedRoomId}
                onChange={(e) => setSelectedRoomId(e.target.value)}
                disabled={rooms.length === 0 || submitting}
              >
                {rooms.length === 0 ? (
                  <option value="">暂无房间，请先创建或加入房间</option>
                ) : (
                  rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <label className="flex h-44 w-full cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-black/20 bg-black/5 text-sm text-black/60 transition hover:border-primary-500 md:w-1/2">
              <span>{file ? "重新选择照片" : "点击上传照片或拖拽到此"}</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} disabled={submitting} />
            </label>
          </div>

          <div className="relative h-44 w-full overflow-hidden rounded-xl bg-black/5">
            {preview ? (
              <Image src={preview} alt="预览" fill className="object-cover" />
            ) : todayStatus?.photo_url ? (
              <Image src={todayStatus.photo_url} alt="今日打卡" fill className="object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-black/40">预览将在此显示</div>
            )}
          </div>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          ) : null}
          {successMessage ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{successMessage}</div>
          ) : null}

          <div className="flex items-center gap-3">
            <Button disabled={!canSubmit} onClick={handleSubmit}>
              {submitting ? "上传中..." : "提交打卡"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setPreview(null);
                setFile(null);
              }}
              disabled={submitting || !file}
            >
              清除
            </Button>
          </div>
        </CardContent>
      </Card>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">近期记录</h2>
          <Badge variant="info">最近 7 天</Badge>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {loadingHistory ? (
            Array.from({ length: 3 }).map((_, index) => (
              <Card key={index} padded>
                <CardHeader>
                  <CardTitle>加载中</CardTitle>
                  <CardDescription>请稍候...</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex h-40 items-center justify-center rounded-lg bg-black/5 text-sm text-black/40">加载中</div>
                </CardContent>
              </Card>
            ))
          ) : history.length === 0 ? (
            <Card padded>
              <CardHeader>
                <CardTitle>暂无记录</CardTitle>
                <CardDescription>完成打卡后将显示最近 7 天记录</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex h-40 items-center justify-center rounded-lg bg-black/5 text-sm text-black/40">暂无数据</div>
              </CardContent>
            </Card>
          ) : (
            history.map((item) => (
              <Card key={item.id} padded>
                <CardHeader>
                  <CardTitle>{item.for_date}</CardTitle>
                  <CardDescription>
                    {item.taken_at ? `完成于 ${formatTime(item.taken_at)}` : "未完成"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {item.photo_url ? (
                    <div className="relative h-40 overflow-hidden rounded-lg">
                      <Image src={item.photo_url} alt={item.for_date} fill className="object-cover" />
                    </div>
                  ) : (
                    <div className="flex h-40 items-center justify-center rounded-lg bg-black/5 text-sm text-black/40">未上传照片</div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
