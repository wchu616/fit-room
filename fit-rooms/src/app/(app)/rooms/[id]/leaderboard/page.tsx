import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import { getRoomWithMembers } from "@/lib/rooms";
import { roomIdParamSchema } from "@/lib/validation";
import { getLeaderboardSnapshot } from "@/lib/leaderboards";
import { createSupabaseServiceRoleClient } from "@/lib/supabase";
import { RoomHeader } from "../components/RoomHeader";
import { RoomLeaderboardClient } from "./room-leaderboard-client";

function computeDefaultSnapshotDate(now: Date) {
  const shanghaiDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  shanghaiDate.setDate(shanghaiDate.getDate() - 1);
  return new Date(Date.UTC(shanghaiDate.getFullYear(), shanghaiDate.getMonth(), shanghaiDate.getDate())).toISOString().slice(0, 10);
}

interface RoomLeaderboardPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ date?: string }>;
}

export default async function RoomLeaderboardPage({ params, searchParams }: RoomLeaderboardPageProps) {
  const session = await getServerSession();
  if (!session) {
    redirect("/login?redirect=/rooms");
  }

  const resolvedParams = await params;
  const parsed = roomIdParamSchema.safeParse(resolvedParams);
  if (!parsed.success) {
    notFound();
  }

  const roomId = parsed.data.id;

  try {
    const roomData = await getRoomWithMembers({ roomId, userId: session.user.id });

    const resolvedSearch = searchParams ? await searchParams : undefined;
    const requestedDateRaw = resolvedSearch?.date ?? undefined;
    const trimmedDate = requestedDateRaw?.trim();

    const supabase = createSupabaseServiceRoleClient();
    const { data: membership } = await supabase
      .from("team_members")
      .select("team_id, teams ( name )")
      .eq("user_id", session.user.id)
      .eq("teams.room_id", roomId)
      .maybeSingle<{ team_id: string; teams: { name: string } | { name: string }[] | null }>();

    const userTeamId = membership?.team_id ?? null;

    const initialState = {
      snapshot: null as Awaited<ReturnType<typeof getLeaderboardSnapshot>> | null,
      meta: null as { usedDate: string; defaultedDate: boolean; note?: string } | null,
      error: null as string | null,
    };

    const dateInputProvided = Boolean(trimmedDate && trimmedDate.length > 0);

    try {
      const snapshot = await getLeaderboardSnapshot({ roomId, userId: session.user.id, date: dateInputProvided ? trimmedDate : undefined });
      initialState.snapshot = snapshot;
      initialState.meta = {
        usedDate: snapshot.snapshotDate,
        defaultedDate: !dateInputProvided,
        note: dateInputProvided ? undefined : "未提供 date，默认使用 UTC+8 前一自然日",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "加载排行榜失败";
      initialState.error = message;
      const fallbackDate = dateInputProvided ? trimmedDate! : computeDefaultSnapshotDate(new Date());
      initialState.meta = {
        usedDate: fallbackDate,
        defaultedDate: !dateInputProvided,
        note: !dateInputProvided ? "未提供 date，默认使用 UTC+8 前一自然日" : undefined,
      };
    }

    const initialInputDate = dateInputProvided
      ? trimmedDate!
      : initialState.meta?.defaultedDate
      ? ""
      : initialState.meta?.usedDate ?? "";

    return (
      <div className="space-y-6">
        <RoomHeader room={roomData.room} />
        <RoomLeaderboardClient
          roomId={roomId}
          roomName={roomData.room.name}
          initialInputDate={initialInputDate}
          initialState={initialState}
          userTeamId={userTeamId}
        />
      </div>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "无法获取房间信息";

    if (message.includes("无权访问")) {
      redirect("/rooms");
    }

    if (message.includes("不存在") || message.includes("房间不存在")) {
      notFound();
    }

    throw error;
  }
}
