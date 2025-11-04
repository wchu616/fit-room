import { createSupabaseServiceRoleClient } from "@/lib/supabase";
import { Database } from "@/lib/types/database";

export type LeaderboardSnapshot = {
  roomId: string;
  snapshotDate: string;
  ranking: LeaderboardEntry[];
  generatedAt: string | null;
};

export type LeaderboardEntry = {
  team_id: string;
  team_name: string;
  member_count: number;
  total_points: number;
  points_last7_days: number;
  last_score_date: string | null;
};

type SupabaseClient = ReturnType<typeof createSupabaseServiceRoleClient>;

type LeaderboardsRow = Database["public"]["Tables"]["leaderboards"]["Row"];

type RoomMemberRow = Database["public"]["Tables"]["room_members"]["Row"];

function computeDefaultSnapshotDate(now: Date) {
  const shanghaiDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  shanghaiDate.setDate(shanghaiDate.getDate() - 1);
  return toISODate(shanghaiDate);
}

function toISODate(date: Date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())).toISOString().slice(0, 10);
}

async function assertRoomMembership(client: SupabaseClient, roomId: string, userId: string) {
  const { data, error } = await client
    .from("room_members")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle<{ id: RoomMemberRow["id"] }>();

  if (error) {
    throw new Error("查询房间成员失败");
  }

  if (!data) {
    throw new Error("仅房间成员可查看排行榜");
  }
}

export async function getLeaderboardSnapshot({
  roomId,
  userId,
  date,
}: {
  roomId: string;
  userId: string;
  date?: string | null;
}): Promise<LeaderboardSnapshot> {
  const supabase = createSupabaseServiceRoleClient();

  await assertRoomMembership(supabase, roomId, userId);

  let snapshotDate: string;
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error("date 参数格式应为 YYYY-MM-DD");
    }
    snapshotDate = date;
  } else {
    snapshotDate = computeDefaultSnapshotDate(new Date());
  }

  const { data, error } = await supabase
    .from("leaderboards")
    .select("room_id,snapshot_date,ranking,created_at")
    .eq("room_id", roomId)
    .eq("snapshot_date", snapshotDate)
    .maybeSingle<Pick<LeaderboardsRow, "room_id" | "snapshot_date" | "ranking" | "created_at">>();

  if (error) {
    throw new Error("查询排行榜失败");
  }

  if (!data) {
    throw new Error("指定日期暂无排行榜快照");
  }

  const rankingValue = Array.isArray(data.ranking) ? data.ranking : [];

  return {
    roomId: data.room_id,
    snapshotDate: data.snapshot_date,
    ranking: rankingValue as LeaderboardEntry[],
    generatedAt: data.created_at,
  };
}
