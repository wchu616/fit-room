import { createSupabaseServiceRoleClient } from "@/lib/supabase";
import { createCheckinSignedUrl } from "@/lib/storage";
import { Database } from "@/lib/types/database";

export type CheckinRow = Database["public"]["Tables"]["checkins"]["Row"];
export type CheckinInsert = Database["public"]["Tables"]["checkins"]["Insert"];

type SupabaseClient = ReturnType<typeof createSupabaseServiceRoleClient>;

async function assertRoomMembership(client: SupabaseClient, roomId: string, userId: string) {
  const { data, error } = await client
    .from("room_members")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw new Error("查询房间成员失败");
  }

  if (!data) {
    throw new Error("仅房间成员可执行此操作");
  }
}

export async function createCheckin({
  roomId,
  userId,
  photoPath,
  takenAt,
  forDate,
}: {
  roomId: string;
  userId: string;
  photoPath: string;
  takenAt: string;
  forDate: string;
}) {
  const supabase = createSupabaseServiceRoleClient();

  const payload: CheckinInsert = {
    room_id: roomId,
    user_id: userId,
    photo_url: photoPath,
    taken_at: takenAt,
    for_date: forDate,
  };

  const { data, error } = await supabase
    .from("checkins")
    .insert(payload)
    .select("id, room_id, user_id, photo_url, taken_at, for_date")
    .maybeSingle<CheckinRow>();

  if (error) {
    if (error.code === "23505") {
      throw new Error("当日已打卡");
    }
    throw new Error(error.message ?? "记录打卡失败");
  }

  if (!data) {
    throw new Error("记录打卡失败");
  }

  return data;
}

export async function listUserCheckins({
  roomId,
  userId,
  limit = 7,
}: {
  roomId: string;
  userId: string;
  limit?: number;
}) {
  const supabase = createSupabaseServiceRoleClient();
  await assertRoomMembership(supabase, roomId, userId);

  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 30) : 7;

  const { data, error } = await supabase
    .from("checkins")
    .select("id, room_id, user_id, photo_url, taken_at, for_date")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .order("for_date", { ascending: false })
    .limit(safeLimit);

  if (error) {
    throw new Error("查询打卡记录失败");
  }

  const records = (data ?? []) as CheckinRow[];

  return Promise.all(
    records.map(async (row) => {
      const signedUrl = await createCheckinSignedUrl(row.photo_url ?? "");
      return {
        ...row,
        photo_url: signedUrl ?? row.photo_url,
      };
    })
  );
}

export async function getTodayCheckin({ roomId, userId }: { roomId: string; userId: string }) {
  const supabase = createSupabaseServiceRoleClient();
  await assertRoomMembership(supabase, roomId, userId);

  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("checkins")
    .select("id, room_id, user_id, photo_url, taken_at, for_date")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .eq("for_date", today)
    .maybeSingle<CheckinRow>();

  if (error) {
    throw new Error("查询今日打卡状态失败");
  }

  if (!data) {
    return null;
  }

  const signedUrl = await createCheckinSignedUrl(data.photo_url ?? "");

  return {
    ...data,
    photo_url: signedUrl ?? data.photo_url,
  };
}
